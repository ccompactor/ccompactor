/**
 * Codex CLI session adapter.
 *
 * The store is `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, one
 * JSON object per line, each `{timestamp, type, payload}`.
 *
 * Two properties differ from Claude's format and both matter:
 *
 * 1. **The line order is the order.** Codex records a rollout, and a rollback
 *    rewrites history by appending rather than by branching, so there is no
 *    `parentUuid` to walk. Rollbacks are handled by the `compacted` and
 *    `turn_aborted` markers instead.
 *
 * 2. **The user's words live in two places.** `event_msg` carries the human's
 *    message; `response_item` carries the same turn as a model-input item. Only
 *    the first is intent — reading both double-counts every request.
 */
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import type { AgentKind, Diagnostic, IRMessage, SessionIR, SessionRef } from '../ir/types.js'
import type { Adapter, ListOptions, ReadOptions } from './types.js'
import { readLines } from './types.js'

export function codexStore(): string {
  return process.env['CODEX_HOME'] ? join(process.env['CODEX_HOME'], 'sessions') : join(homedir(), '.codex', 'sessions')
}

interface RawRecord {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

export class CodexAdapter implements Adapter {
  kind: AgentKind = 'codex'
  label = 'Codex CLI'

  store(): string {
    return codexStore()
  }

  available(): boolean {
    return existsSync(this.store())
  }

  async list(options: ListOptions): Promise<SessionRef[]> {
    const root = this.store()
    const files = await walkJsonl(root, options.maxBytes)
    const refs: SessionRef[] = []
    for (const { path, mtime, bytes } of files) {
      const name = basename(path).replace(/\.jsonl(\.zst)?$/, '')
      // `rollout-2026-01-01T00-00-00-<uuid>`: the uuid is the id, the rest is
      // the timestamp the provider already encodes in the filename.
      const id = name.replace(/^rollout-/, '')
      refs.push({ agent: 'codex', id, path, mtime, bytes })
    }
    return refs.sort((a, b) => b.mtime - a.mtime)
  }

  async read(ref: SessionRef, _options: ReadOptions = {}): Promise<SessionIR> {
    const lines = await readLines(ref.path)
    const diagnostics: Diagnostic[] = []
    const messages: IRMessage[] = []
    const compactBoundaries: number[] = []
    const metadata: Record<string, unknown> = {}
    const seenUserText = new Set<string>()

    for (const [index, line] of lines.entries()) {
      let raw: RawRecord
      try {
        raw = JSON.parse(line) as RawRecord
      } catch (error) {
        diagnostics.push({ line: index + 1, message: `unparseable: ${(error as Error).message}` })
        continue
      }
      const payload = raw.payload ?? {}

      if (raw.type === 'session_meta') {
        for (const key of ['cwd', 'id', 'cli_version', 'originator']) {
          if (payload[key] !== undefined) metadata[key] = payload[key]
        }
        const git = payload['git']
        if (typeof git === 'object' && git !== null) {
          const branch = (git as Record<string, unknown>)['branch']
          if (typeof branch === 'string') metadata['branch'] = branch
        }
        continue
      }

      if (raw.type === 'compacted') {
        compactBoundaries.push(index)
        messages.push({
          uuid: `evt-${index}`,
          role: 'attachment',
          text: typeof payload['message'] === 'string' ? payload['message'] : 'compacted',
          eventIndex: index,
          raw,
        })
        continue
      }

      if (raw.type === 'event_msg') {
        const kind = payload['type']
        if (kind === 'user_message') {
          const text = typeof payload['message'] === 'string' ? payload['message'] : ''
          if (text.trim().length === 0) continue
          // The same turn reappears as a `response_item` message below; the
          // human said it once.
          seenUserText.add(text.trim())
          messages.push({
            uuid: `evt-${index}`,
            role: 'user',
            text,
            isHumanTurn: true,
            eventIndex: index,
            raw,
          })
        }
        continue
      }

      if (raw.type === 'turn_context') {
        const cwd = payload['cwd']
        if (typeof cwd === 'string' && metadata['cwd'] === undefined) metadata['cwd'] = cwd
        continue
      }

      if (raw.type !== 'response_item') continue
      const kind = payload['type']

      if (kind === 'message') {
        const role = typeof payload['role'] === 'string' ? payload['role'] : 'assistant'
        const text = contentText(payload['content'])
        if (text.trim().length === 0) continue
        if (role === 'user') {
          if (seenUserText.has(text.trim())) continue
          seenUserText.add(text.trim())
          messages.push({
            uuid: `evt-${index}`,
            role: 'user',
            text,
            isHumanTurn: true,
            eventIndex: index,
            raw,
          })
        } else {
          messages.push({ uuid: `evt-${index}`, role: 'assistant', text, eventIndex: index, raw })
        }
        continue
      }

      if (kind === 'function_call') {
        messages.push({
          uuid: `evt-${index}`,
          role: 'assistant',
          toolName: typeof payload['name'] === 'string' ? payload['name'] : undefined,
          toolUseId: typeof payload['call_id'] === 'string' ? payload['call_id'] : undefined,
          toolInput: parseArguments(payload['arguments']),
          eventIndex: index,
          raw,
        })
        continue
      }

      if (kind === 'function_call_output') {
        messages.push({
          uuid: `evt-${index}`,
          role: 'tool',
          toolUseId: typeof payload['call_id'] === 'string' ? payload['call_id'] : undefined,
          toolResult: payload['output'],
          text: typeof payload['output'] === 'string' ? payload['output'] : undefined,
          eventIndex: index,
          raw,
        })
      }
    }

    return { ref, messages, compactBoundaries, metadata, diagnostics }
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    for (const key of ['text', 'input_text', 'output_text']) {
      if (typeof b[key] === 'string') parts.push(b[key] as string)
    }
  }
  return parts.join('\n\n')
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

async function walkJsonl(
  root: string,
  maxBytes: number | undefined,
): Promise<Array<{ path: string; mtime: number; bytes: number }>> {
  const out: Array<{ path: string; mtime: number; bytes: number }> = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }
      if (!entry.name.endsWith('.jsonl')) continue
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) continue
      if (maxBytes !== undefined && info.size > maxBytes) continue
      out.push({ path, mtime: info.mtimeMs, bytes: info.size })
    }
  }
  return out
}
