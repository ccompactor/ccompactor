/**
 * Claude Code session adapter.
 *
 * The store is `~/.claude/projects/<slugified-cwd>/<session-uuid>.jsonl`, one
 * JSON object per line. Two properties of that format decide this adapter's
 * shape:
 *
 * 1. **It is a tree, not a log.** Every record carries `uuid` and `parentUuid`.
 *    When a session is rewound or a message is edited, the file keeps the
 *    abandoned branch. Replaying the file in line order would hand a successor
 *    work the human explicitly walked away from, so the active branch is
 *    resolved by walking parent pointers back from the newest record.
 *
 * 2. **The provider compacts its own context.** A `summary` record, or a user
 *    turn that is the provider's continuation preamble, marks a boundary.
 *    Everything before it was already summarised once; re-summarising a summary
 *    is how meaning is lost, so the boundary is recorded and honoured downstream.
 */

import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { AgentKind, Diagnostic, IRMessage, SessionIR, SessionRef } from '../ir/types.js'
import type { Adapter, ListOptions, ReadOptions } from './types.js'
import { lines } from './types.js'

/** A record as it appears on disk, loosely typed: unknown fields are ignored. */
interface RawRecord {
  type?: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  sessionId?: string
  cwd?: string
  gitBranch?: string
  version?: string
  isMeta?: boolean
  isSidechain?: boolean
  summary?: string
  leafUuid?: string
  message?: {
    role?: string
    model?: string
    content?: unknown
  }
  toolUseResult?: unknown
}

export function claudeStore(): string {
  return process.env['CLAUDE_ROOT'] ?? join(homedir(), '.claude', 'projects')
}

/**
 * Claude Code encodes the project directory into the store path by replacing
 * every non-alphanumeric character with `-`. It is not reversible — two
 * different paths can produce the same slug — which is why the cwd recorded
 * inside the transcript is preferred wherever it exists.
 */
export function slugifyProject(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '-')
}

export class ClaudeAdapter implements Adapter {
  kind: AgentKind = 'claude'
  label = 'Claude Code'

  store(): string {
    return claudeStore()
  }

  available(): boolean {
    return existsSync(this.store())
  }

  async list(options: ListOptions): Promise<SessionRef[]> {
    const root = this.store()
    const wanted = options.project ? slugifyProject(resolve(options.project)) : undefined
    const dirs = options.project && !options.anyProject ? [wanted!] : await safeReaddir(root)
    const refs: SessionRef[] = []
    for (const dir of dirs) {
      const dirPath = join(root, dir)
      for (const entry of await safeReaddir(dirPath)) {
        if (!entry.endsWith('.jsonl')) continue
        const path = join(dirPath, entry)
        const info = await stat(path).catch(() => null)
        if (!info || !info.isFile()) continue
        if (options.maxBytes !== undefined && info.size > options.maxBytes) continue
        refs.push({
          agent: 'claude',
          id: basename(entry, '.jsonl'),
          path,
          projectPath: join(root, dir),
          mtime: info.mtimeMs,
          bytes: info.size,
        })
      }
    }
    return refs.sort((a, b) => b.mtime - a.mtime)
  }

  async read(ref: SessionRef, options: ReadOptions = {}): Promise<SessionIR> {
    const diagnostics: Diagnostic[] = []

    // Pass one keeps only the four fields branch resolution needs. Parsing the
    // whole record and holding it — which is what the first version did — means
    // keeping every event of a 268 MB transcript in memory at once, and reading
    // a couple of those to fill in a table exhausted the heap.
    const spine: Array<{ index: number; uuid?: string; parentUuid?: string | null; type?: string }> = []
    for await (const line of lines(ref.path)) {
      try {
        const raw = JSON.parse(line.text) as RawRecord
        spine.push({
          index: line.n - 1,
          ...(raw.uuid ? { uuid: raw.uuid } : {}),
          ...(raw.parentUuid !== undefined ? { parentUuid: raw.parentUuid } : {}),
          ...(raw.type ? { type: raw.type } : {}),
        })
      } catch (error) {
        diagnostics.push({ line: line.n, message: `unparseable: ${(error as Error).message}` })
      }
    }

    const onBranch = resolveActiveBranch(spine, diagnostics)
    const wanted = new Set(onBranch)

    // Pass two parses only the records that survived, and drops the original
    // object unless something downstream will actually read it.
    const messages: IRMessage[] = []
    const compactBoundaries: number[] = []
    const metadata: Record<string, unknown> = {}
    for await (const line of lines(ref.path)) {
      const index = line.n - 1
      if (!wanted.has(index)) continue
      let raw: RawRecord
      try {
        raw = JSON.parse(line.text) as RawRecord
      } catch {
        continue
      }

      if (raw.cwd && metadata['cwd'] === undefined) metadata['cwd'] = raw.cwd
      if (raw.gitBranch && metadata['branch'] === undefined) metadata['branch'] = raw.gitBranch
      if (raw.version && metadata['version'] === undefined) metadata['version'] = raw.version
      if (raw.message?.model && metadata['model'] === undefined) metadata['model'] = raw.message.model
      if (raw.isSidechain && !options.includeSidechains) continue

      if (raw.type === 'summary') {
        compactBoundaries.push(index)
        messages.push({
          uuid: raw.uuid ?? `evt-${index}`,
          role: 'attachment',
          text: raw.summary ?? '',
          eventIndex: index,
          ...(options.light ? {} : { raw }),
        })
        continue
      }

      const message = toMessage(raw, index)
      if (!message) continue
      if (options.light) delete (message as { raw?: unknown }).raw
      messages.push(message)
      if (isCompactionPreamble(message)) compactBoundaries.push(index)
    }

    return { ref, messages, compactBoundaries, metadata, diagnostics }
  }
}

/**
 * The records that make up the session, in order.
 *
 * Three facts about this format decide the algorithm, and getting any of them
 * wrong silently changes what the successor is told:
 *
 * 1. **It is a tree.** `uuid` / `parentUuid` let a rewind or an edit leave the
 *    abandoned branch in the file. Replaying in line order would hand a
 *    successor work the human explicitly walked away from.
 *
 * 2. **A compaction starts a new root.** Measured on a real 103,757-event
 *    session, walking parents from the last record reached 1,770 records and 7
 *    user turns — the walk stopped at the boundary and discarded every earlier
 *    turn, which are the record of what the human actually asked for.
 *
 * 3. **The roots cannot be recognised by looking at them.** The boundary record
 *    in that session was `type: system`, and 39,754 records carry a null parent
 *    without starting anything. Classifying roots by type made it worse.
 *
 * So there is no classification: walk the newest record's parent chain; when the
 * walk stops, take the record immediately *before* the oldest one it reached and
 * walk that chain; repeat. Each pass recovers the tip of one earlier segment.
 */
function resolveActiveBranch(
  spine: Array<{ index: number; uuid?: string; parentUuid?: string | null; type?: string }>,
  diagnostics: Diagnostic[],
): number[] {
  if (spine.length === 0) return []
  const byUuid = new Map<string, number>()
  const byIndex = new Map<number, number>()
  for (const [position, record] of spine.entries()) {
    if (record.uuid) byUuid.set(record.uuid, position)
    byIndex.set(record.index, position)
  }

  const kept = new Set<number>()
  let cursor = spine.length - 1
  while (cursor >= 0) {
    const chain: number[] = []
    const guard = new Set<string>()
    let position: number | undefined = cursor
    while (position !== undefined) {
      const record = spine[position]!
      if (chain.includes(record.index)) break
      chain.push(record.index)
      const parentUuid = record.parentUuid
      if (!parentUuid) break
      if (guard.has(parentUuid)) {
        diagnostics.push({ line: record.index + 1, message: 'parentUuid cycle; walk stopped' })
        break
      }
      guard.add(parentUuid)
      position = byUuid.get(parentUuid)
    }
    for (const index of chain) kept.add(index)

    const oldest = Math.min(...chain)
    const before = byIndex.get(oldest - 1)
    if (before === undefined) break
    diagnostics.push({
      line: 0,
      message: `continuation at record ${oldest + 1}: recovered ${chain.length} record(s) before it and continued`,
    })
    cursor = before
  }

  const off = spine.length - kept.size
  if (off > 0) {
    diagnostics.push({
      line: 0,
      message: `${off} record(s) are not on any active branch (rewound or edited) and were skipped`,
    })
  }
  return [...kept].sort((a, b) => a - b)
}

function isCompactionPreamble(message: IRMessage): boolean {
  if (message.role !== 'user' || !message.text) return false
  return message.text.includes('This session is being continued from a previous conversation')
}

function toMessage(raw: RawRecord, index: number): IRMessage | undefined {
  const uuid = raw.uuid ?? `evt-${index}`
  const base = {
    uuid,
    ...(raw.parentUuid ? { parentUuid: raw.parentUuid } : {}),
    ...(raw.timestamp ? { timestamp: raw.timestamp } : {}),
    eventIndex: index,
    raw,
  }

  if (raw.type === 'assistant') {
    const content = raw.message?.content
    const text = textOf(content)
    const tool = firstToolUse(content)
    if (tool) {
      return {
        ...base,
        role: 'assistant',
        text: text || undefined,
        toolName: tool.name,
        toolUseId: tool.id,
        toolInput: tool.input,
      }
    }
    return { ...base, role: 'assistant', text: text || undefined }
  }

  if (raw.type === 'user') {
    const content = raw.message?.content
    const result = firstToolResult(content)
    if (result) {
      return {
        ...base,
        role: 'tool',
        toolUseId: result.toolUseId,
        toolResult: result.content,
        isError: result.isError,
        text: typeof result.content === 'string' ? result.content : undefined,
      }
    }
    const text = typeof content === 'string' ? content : textOf(content)
    const meta = raw.isMeta === true || isHarnessNoise(text)
    return {
      ...base,
      role: 'user',
      text: text || undefined,
      isMeta: meta,
      // The whole point of the flag: intent is what the human typed, and only that.
      isHumanTurn: !meta && text.trim().length > 0,
    }
  }

  if (raw.type === 'system') {
    return { ...base, role: 'system', text: textOf(raw.message?.content) || undefined, isMeta: true }
  }

  return undefined
}

/** Harness-injected user turns. Present in the file, never typed by a person. */
function isHarnessNoise(text: string): boolean {
  const trimmed = text.trimStart()
  return (
    trimmed.startsWith('<command-name>') ||
    trimmed.startsWith('<command-message>') ||
    trimmed.startsWith('<local-command') ||
    trimmed.startsWith('<system-reminder') ||
    trimmed.includes('<system-reminder>') ||
    trimmed.startsWith('[Request interrupted')
  )
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'text' && typeof b['text'] === 'string') parts.push(b['text'])
    if (b['type'] === 'thinking' && typeof b['thinking'] === 'string') parts.push(b['thinking'])
  }
  return parts.join('\n\n')
}

function firstToolUse(
  content: unknown,
): { name?: string; id?: string; input?: unknown } | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'tool_use') {
      return {
        name: typeof b['name'] === 'string' ? b['name'] : undefined,
        id: typeof b['id'] === 'string' ? b['id'] : undefined,
        input: b['input'],
      }
    }
  }
  return undefined
}

function firstToolResult(
  content: unknown,
): { toolUseId?: string; content: unknown; isError?: boolean } | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'tool_result') {
      return {
        toolUseId: typeof b['tool_use_id'] === 'string' ? b['tool_use_id'] : undefined,
        content: b['content'],
        isError: b['is_error'] === true,
      }
    }
  }
  return undefined
}
async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}
