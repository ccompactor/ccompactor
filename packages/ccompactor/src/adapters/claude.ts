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
import { readLines } from './types.js'

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
    const lines = await readLines(ref.path)
    const diagnostics: Diagnostic[] = []
    const records: Array<{ index: number; raw: RawRecord }> = []

    for (const [index, line] of lines.entries()) {
      try {
        records.push({ index, raw: JSON.parse(line) as RawRecord })
      } catch (error) {
        // One bad line is a diagnostic, never a failed session. A truncated
        // final line is common when a session is read while it is being written.
        diagnostics.push({
          line: index + 1,
          message: `unparseable: ${(error as Error).message}`,
        })
      }
    }

    const byUuid = new Map<string, { index: number; raw: RawRecord }>()
    for (const record of records) {
      if (record.raw.uuid) byUuid.set(record.raw.uuid, record)
    }

    const onBranch = resolveActiveBranch(records, byUuid, diagnostics)
    const compactBoundaries: number[] = []
    const messages: IRMessage[] = []
    const metadata: Record<string, unknown> = {}

    for (const { index, raw } of onBranch) {
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
          raw,
        })
        continue
      }

      const message = toMessage(raw, index)
      if (!message) continue
      messages.push(message)
      if (isCompactionPreamble(message)) compactBoundaries.push(index)
    }

    if (typeof metadata['cwd'] !== 'string') {
      // Fall back to the slug only when the transcript recorded no cwd, and say
      // so: the slug is lossy.
      metadata['cwdGuessedFromSlug'] = ref.projectPath ? basename(ref.projectPath) : undefined
    }

    metadata['keptPreBoundary'] = compactBoundaries.length > 0 && options.sinceCompact !== true

    return {
      ref,
      messages,
      compactBoundaries,
      metadata,
      diagnostics,
    }
  }
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

/**
 * The records that make up the session, in source order.
 *
 * Three facts about this format decide the algorithm, and getting any of them
 * wrong silently changes what the successor is told:
 *
 * 1. **It is a tree.** `uuid` / `parentUuid` let a rewind or an edit leave the
 *    abandoned branch in the file. Replaying in line order would hand a
 *    successor work the human explicitly walked away from, so the live branch is
 *    resolved by walking parent pointers back from the newest record.
 *
 * 2. **A compaction starts a new root.** `/compact` writes a summary and
 *    continues with records whose `parentUuid` is null; the chain genuinely does
 *    not cross that boundary. Measured on a real 103,757-event session, walking
 *    parents from the last record reached 1,770 records and 7 user turns — the
 *    walk stopped at the boundary and discarded every earlier turn, which are
 *    the record of what the human actually asked for.
 *
 * 3. **The roots cannot be recognised by looking at them.** In that session the
 *    boundary record was `type: system`, and 39,754 records carry a null parent
 *    without starting anything. Classifying roots by type was the first attempt
 *    and it silently dropped the session back to 853 events.
 *
 * So there is no classification: walk the newest record's parent chain; when the
 * walk stops, take the record immediately *before* the oldest one it reached and
 * walk that chain; repeat. Each pass recovers the tip of one earlier segment.
 * Branch resolution is preserved wherever a rewind happened, history survives
 * every boundary, and a malformed file terminates because the cursor strictly
 * decreases. `--since-compact` keeps the first pass only.
 */
function resolveActiveBranch(
  records: Array<{ index: number; raw: RawRecord }>,
  byUuid: Map<string, { index: number; raw: RawRecord }>,
  diagnostics: Diagnostic[],
): Array<{ index: number; raw: RawRecord }> {
  if (records.length === 0) return []
  const byIndex = new Map(records.map((r) => [r.index, r]))
  const kept = new Map<number, { index: number; raw: RawRecord }>()
  let failedWalks = 0
  let cursor: { index: number; raw: RawRecord } | undefined = records[records.length - 1]

  while (cursor) {
    const chain = new Map<number, { index: number; raw: RawRecord }>()
    const guard = new Set<string>()
    let node: { index: number; raw: RawRecord } | undefined = cursor
    while (node) {
      if (chain.has(node.index)) break
      chain.set(node.index, node)
      const parentUuid: string | null | undefined = node.raw.parentUuid
      if (!parentUuid) break
      // A cycle would hang the process on a corrupt file.
      if (guard.has(parentUuid)) {
        diagnostics.push({ line: node.index + 1, message: 'parentUuid cycle; walk stopped' })
        break
      }
      guard.add(parentUuid)
      const parent = byUuid.get(parentUuid)
      if (!parent) {
        // A dangling parent is common when a session is read mid-write or when
        // the provider rewrote the head. Keep what was found and say so.
        failedWalks += 1
        break
      }
      node = parent
    }
    for (const record of chain.values()) kept.set(record.index, record)

    const oldest = Math.min(...chain.keys())
    const previous = byIndex.get(oldest - 1)
    if (!previous || oldest === 0) break
    diagnostics.push({
      line: 0,
      message: `continuation at record ${oldest + 1}: recovered ${chain.size} record(s) before it and continued`,
    })
    cursor = previous
  }

  const off = records.length - kept.size
  if (off > 0) {
    diagnostics.push({
      line: 0,
      message: `${off} record(s) are not on any active branch (rewound or edited) and were skipped`,
    })
  }
  if (failedWalks > 0) {
    diagnostics.push({
      line: 0,
      message: `${failedWalks} parent pointer(s) were dangling; ${kept.size} record(s) kept`,
    })
  }
  return [...kept.values()].sort((a, b) => a.index - b.index)
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}
