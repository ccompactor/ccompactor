/**
 * Pi session adapter.
 *
 * The store is `~/.pi/agent/sessions/<slugified-project>/<timestamp>_<id>.jsonl`.
 * Files are v1-v3 and the record types seen in the wild are `session`,
 * `model_change`, `thinking_level_change`, `custom_message` and `message`, with
 * message roles `user`, `assistant` and `toolResult`.
 *
 * `custom_message` is harness-injected context — a plugin feeding the session a
 * block of text — and is recorded as an attachment rather than as a user turn.
 * Treating it as intent would put a news feed into the handoff as something the
 * human asked for.
 *
 * Unknown record types are counted and reported rather than skipped in silence,
 * because a handoff that is quietly missing half a session is worse than one
 * that says which half.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import type { AgentKind, Diagnostic, IRMessage, SessionIR, SessionRef } from '../ir/types.js'
import type { Adapter, ListOptions, ReadOptions } from './types.js'
import { lines } from './types.js'

export function piStore(): string {
  return process.env['PI_HOME']
    ? join(process.env['PI_HOME'], 'agent', 'sessions')
    : join(homedir(), '.pi', 'agent', 'sessions')
}

/** How well a session was understood, so the artifact can say so. */
export interface PiCoverage {
  recognised: number
  unknown: number
}

export class PiAdapter implements Adapter {
  kind: AgentKind = 'pi'
  label = 'Pi'

  store(): string {
    return piStore()
  }

  available(): boolean {
    return existsSync(this.store())
  }

  async list(options: ListOptions): Promise<SessionRef[]> {
    const refs: SessionRef[] = []
    const root = this.store()
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
        if (options.maxBytes !== undefined && info.size > options.maxBytes) continue
        refs.push({
          agent: 'pi',
          id: entry.name.replace(/\.jsonl$/, ''),
          path,
          projectPath: dir,
          mtime: info.mtimeMs,
          bytes: info.size,
        })
      }
    }
    return refs.sort((a, b) => b.mtime - a.mtime)
  }

  async read(ref: SessionRef, options: ReadOptions = {}): Promise<SessionIR> {
    const diagnostics: Diagnostic[] = []
    const messages: IRMessage[] = []
    const compactBoundaries: number[] = []
    const metadata: Record<string, unknown> = {}
    let unknown = 0

    for await (const { n, text: line } of lines(ref.path)) {
      const index = n - 1
      let raw: Record<string, unknown>
      try {
        raw = JSON.parse(line) as Record<string, unknown>
      } catch (error) {
        diagnostics.push({ line: index + 1, message: `unparseable: ${(error as Error).message}` })
        continue
      }
      const type = typeof raw['type'] === 'string' ? raw['type'] : ''
      const id = typeof raw['id'] === 'string' ? raw['id'] : `evt-${index}`
      const parentId = typeof raw['parentId'] === 'string' ? raw['parentId'] : undefined

      if (type === 'session') {
        for (const key of ['cwd', 'id', 'version']) {
          if (raw[key] !== undefined) metadata[key] = raw[key]
        }
        continue
      }
      if (type === 'model_change') {
        if (typeof raw['modelId'] === 'string') metadata['model'] = raw['modelId']
        if (typeof raw['provider'] === 'string') metadata['provider'] = raw['provider']
        continue
      }
      if (type === 'custom_message') {
        // Harness-injected, never typed by the human.
        messages.push({
          uuid: id,
          ...(parentId ? { parentUuid: parentId } : {}),
          role: 'attachment',
          text: typeof raw['content'] === 'string' ? raw['content'] : '',
          isMeta: true,
          eventIndex: index,
          raw,
        })
        continue
      }
      if (type === 'compaction' || type === 'summary') {
        compactBoundaries.push(index)
        continue
      }
      if (type !== 'message') {
        unknown += 1
        continue
      }

      const message = (raw['message'] ?? {}) as Record<string, unknown>
      const role = typeof message['role'] === 'string' ? message['role'] : ''
      const text = contentText(message['content'])
      const base = {
        uuid: id,
        ...(parentId ? { parentUuid: parentId } : {}),
        ...(typeof raw['timestamp'] === 'string' ? { timestamp: raw['timestamp'] } : {}),
        eventIndex: index,
        raw,
      }

      if (role === 'user') {
        if (text.trim().length === 0) continue
        messages.push({ ...base, role: 'user', text, isHumanTurn: true })
        continue
      }
      if (role === 'assistant') {
        const toolCall = firstToolCall(message['content'])
        messages.push({
          ...base,
          role: 'assistant',
          text: text || undefined,
          ...(toolCall?.name ? { toolName: toolCall.name } : {}),
          ...(toolCall?.id ? { toolUseId: toolCall.id } : {}),
          ...(toolCall?.args !== undefined ? { toolInput: toolCall.args } : {}),
        })
        continue
      }
      if (role === 'toolResult' || role === 'tool') {
        messages.push({
          ...base,
          role: 'tool',
          ...(typeof message['toolCallId'] === 'string' ? { toolUseId: message['toolCallId'] } : {}),
          ...(typeof message['toolName'] === 'string' ? { toolName: message['toolName'] } : {}),
          text,
          toolResult: message['content'],
          isError: message['isError'] === true,
        })
        continue
      }
      unknown += 1
    }

    metadata['piUnknownRecords'] = unknown
    if (unknown > 0) {
      diagnostics.push({
        line: 0,
        message: `${unknown} record(s) matched no known Pi shape and were skipped`,
      })
    }

    if (options.light) {
      for (const message of messages) delete (message as { raw?: unknown }).raw
    }

    return { ref, messages, compactBoundaries, metadata, diagnostics }
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (typeof b['text'] === 'string') parts.push(b['text'])
    if (b['type'] === 'toolCall' && typeof b['name'] === 'string') parts.push('')
  }
  return parts.join('\n\n')
}

function firstToolCall(content: unknown): { name?: string; id?: string; args?: unknown } | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'toolCall' || b['type'] === 'tool_use') {
      return {
        ...(typeof b['name'] === 'string' ? { name: b['name'] } : {}),
        ...(typeof b['id'] === 'string' ? { id: b['id'] } : {}),
        ...(b['arguments'] !== undefined ? { args: b['arguments'] } : {}),
        ...(b['input'] !== undefined ? { args: b['input'] } : {}),
      }
    }
  }
  return undefined
}
