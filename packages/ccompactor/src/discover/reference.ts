import { basename } from 'node:path'
import type { AgentKind } from '../ir/types.js'

export interface ParsedReference {
  /** Undefined when the reference did not name an agent. */
  agent?: AgentKind
  /** A session id, an id prefix, or `last`. */
  selector: string
  /** Set when the reference was a filesystem path rather than a store lookup. */
  path?: string
}

const KNOWN: AgentKind[] = ['claude', 'openclaude', 'codex', 'pi', 'opencode', 'deepseek', 'generic']

/**
 * Parse a session reference.
 *
 * Accepts `claude:7c1e8f82`, `codex:last`, a bare `last`, and a path to a
 * transcript on disk. A path is accepted because the answer to "which session"
 * is often "this file", and refusing it would make the tool unusable in a
 * script that already knows the path.
 */
export function parseReference(text: string): ParsedReference {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new UsageError('empty session reference')

  if (trimmed.includes('/') || trimmed.endsWith('.jsonl') || trimmed.endsWith('.jsonl.zst')) {
    return { agent: inferFromPath(trimmed), selector: basename(trimmed).replace(/\.jsonl(\.zst)?$/, ''), path: trimmed }
  }

  const colon = trimmed.indexOf(':')
  if (colon === -1) {
    return { selector: trimmed }
  }
  const head = trimmed.slice(0, colon)
  const rest = trimmed.slice(colon + 1)
  if (!(KNOWN as string[]).includes(head)) {
    throw new UsageError(
      `unknown agent \`${head}\` (expected one of ${KNOWN.join(', ')})`,
    )
  }
  if (rest.length === 0) throw new UsageError(`\`${trimmed}\` names an agent but no session`)
  return { agent: head as AgentKind, selector: rest }
}

/** A path in a Claude store is a Claude session; anything else is a guess. */
function inferFromPath(path: string): AgentKind | undefined {
  if (path.includes('/.claude/')) return 'claude'
  if (path.includes('/.codex/')) return 'codex'
  if (path.includes('/.pi/')) return 'pi'
  return undefined
}

export class UsageError extends Error {
  readonly exitCode = 2
}
