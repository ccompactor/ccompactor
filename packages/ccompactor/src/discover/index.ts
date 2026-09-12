import { resolve } from 'node:path'
import type { AgentKind, SessionIR, SessionRef } from '../ir/types.js'
import { adapters } from '../adapters/index.js'
import { parseReference, UsageError } from './reference.js'

export interface DiscoverOptions {
  project?: string
  anyProject?: boolean
  agents?: AgentKind[]
}

/** Every session every adapter can see, newest first. */
export async function listSessions(options: DiscoverOptions = {}): Promise<SessionRef[]> {
  const chosen = adapters().filter((a) => !options.agents || options.agents.includes(a.kind))
  const all: SessionRef[] = []
  for (const adapter of chosen) {
    if (!adapter.available()) continue
    const refs = await adapter.list({
      ...(options.project ? { project: options.project } : {}),
      ...(options.anyProject ? { anyProject: options.anyProject } : {}),
    })
    all.push(...refs)
  }
  return all.sort((a, b) => b.mtime - a.mtime)
}

/**
 * Turn a reference into exactly one session, or explain why it is not exactly
 * one. A prefix that matches several sessions is a question for the human, not
 * something to guess at — the wrong session means a handoff for the wrong work.
 */
export async function resolveSession(
  reference: string,
  options: DiscoverOptions = {},
): Promise<SessionRef> {
  const parsed = parseReference(reference)

  if (parsed.path) {
    return {
      agent: parsed.agent ?? 'generic',
      id: parsed.selector,
      path: parsed.path,
      mtime: Date.now(),
    }
  }

  const candidates = (await listSessions(options)).filter(
    (ref) => !parsed.agent || ref.agent === parsed.agent,
  )
  if (candidates.length === 0) {
    throw new UsageError(
      `no sessions found${parsed.agent ? ` for ${parsed.agent}` : ''}. Run \`ccompactor doctor\`.`,
    )
  }

  if (parsed.selector === 'last') return candidates[0]!

  const exact = candidates.find((ref) => ref.id === parsed.selector)
  if (exact) return exact

  const matches = candidates.filter((ref) => ref.id.startsWith(parsed.selector))
  if (matches.length === 0) {
    throw new UsageError(`no session matches \`${parsed.selector}\``)
  }
  if (matches.length > 1) {
    throw new AmbiguousError(parsed.selector, matches)
  }
  return matches[0]!
}

export class AmbiguousError extends Error {
  readonly exitCode = 3
  constructor(
    readonly reference: string,
    readonly candidates: SessionRef[],
  ) {
    super(`\`${reference}\` matched ${candidates.length} sessions`)
  }
}

/** Read a resolved session into the canonical IR. */
export async function readSession(
  ref: SessionRef,
  options: { includeSidechains?: boolean; light?: boolean } = {},
): Promise<SessionIR> {
  const adapter = adapters().find((a) => a.kind === ref.agent)
  if (!adapter) {
    throw new UsageError(`no adapter for agent \`${ref.agent}\``)
  }
  return adapter.read(ref, options)
}

/**
 * Subsequence scoring, highest first.
 *
 * A dependency-free fuzzy matcher: every character of the query must appear in
 * order, and consecutive matches and matches at word boundaries score higher.
 * It is enough to find a session by a fragment of its first message, which is
 * the only search anyone actually performs here.
 */
export function fuzzyScore(query: string, target: string): number {
  if (query.length === 0) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let score = 0
  let cursor = 0
  let streak = 0
  for (const char of q) {
    const found = t.indexOf(char, cursor)
    if (found === -1) return 0
    streak = found === cursor ? streak + 1 : 0
    score += 1 + streak
    // A match right after a separator is the start of a word, which is what
    // someone typing an abbreviation means.
    if (found === 0 || /[\s/_.:-]/.test(t[found - 1] ?? '')) score += 2
    cursor = found + 1
  }
  return score
}

/** Search sessions by anything cheaply knowable, without parsing them fully. */
export async function findSessions(
  query: string,
  options: DiscoverOptions = {},
): Promise<Array<{ ref: SessionRef; score: number; snippet?: string }>> {
  const refs = await listSessions(options)
  const hits: Array<{ ref: SessionRef; score: number; snippet?: string }> = []
  for (const ref of refs) {
    const haystack = [ref.id, ref.title ?? '', ref.projectPath ?? '', ref.path].join(' ')
    let score = fuzzyScore(query, haystack)
    // The first human turn is the session's real title far more often than
    // anything the provider recorded, so it is worth a header read.
    if (score === 0 && ref.bytes !== undefined && ref.bytes < 64 * 1024 * 1024) {
      const snippet = await firstHumanTurn(ref)
      if (snippet) {
        const snippetScore = fuzzyScore(query, snippet)
        if (snippetScore > 0) {
          hits.push({ ref, score: snippetScore, snippet })
          continue
        }
      }
    }
    if (score > 0) hits.push({ ref, score })
  }
  return hits.sort((a, b) => b.score - a.score || b.ref.mtime - a.ref.mtime)
}

async function firstHumanTurn(ref: SessionRef): Promise<string | undefined> {
  const { createReadStream } = await import('node:fs')
  const { createInterface } = await import('node:readline')
  const stream = createReadStream(ref.path, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      try {
        const raw = JSON.parse(line) as {
          type?: string
          isMeta?: boolean
          message?: { content?: unknown }
        }
        if (raw.type !== 'user' || raw.isMeta) continue
        const text = plainText(raw.message?.content)
        if (text && text.trim().length > 0) return text.slice(0, 400)
      } catch {
        continue
      }
    }
  } finally {
    rl.close()
    stream.close()
  }
  return undefined
}

function plainText(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      const b = block as Record<string, unknown>
      if (b['type'] === 'text' && typeof b['text'] === 'string') return b['text']
    }
  }
  return undefined
}

export { parseReference, UsageError } from './reference.js'
