/**
 * The canonical internal representation.
 *
 * Every adapter normalises a provider's transcript into these types, and every
 * later stage reads only these types. That is what makes a Codex session and a
 * Claude session the same problem downstream — and it is the only reason adding
 * an agent is a file rather than a fork.
 *
 * Spec: docs/SPEC.md §5.
 */

export type AgentKind =
  | 'claude'
  | 'openclaude'
  | 'codex'
  | 'pi'
  | 'opencode'
  | 'deepseek'
  | 'generic'

/** A session as discovered, before it is parsed. Cheap to produce. */
export interface SessionRef {
  agent: AgentKind
  /** Native id: a uuid for Claude, a rollout id for Codex, a filename stem for Pi. */
  id: string
  /** Absolute path to the transcript on disk. */
  path: string
  /** The project the session belongs to, when the store encodes one. */
  projectPath?: string
  /** Modification time in epoch milliseconds. */
  mtime: number
  /** Human label, when the format carries one. */
  title?: string
  /** Cheap size estimate, from stat or a head parse. */
  bytes?: number
  eventCount?: number
  approxTokens?: number
  /** Session files that belong to this session but are not the main transcript. */
  siblings?: string[]
}

export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'attachment'

/** One normalised event. `eventIndex` is the provenance handle. */
export interface IRMessage {
  /** Provider uuid when the format has one; otherwise synthesised from index. */
  uuid: string
  parentUuid?: string
  role: Role
  timestamp?: string
  text?: string
  toolName?: string
  toolUseId?: string
  /** The tool's arguments. The ledgers are built from these, not from prose. */
  toolInput?: unknown
  toolResult?: unknown
  /** Harness-injected rather than typed by the human. Never treated as intent. */
  isMeta?: boolean
  /** True when the human actually typed this. The only source of user intent. */
  isHumanTurn?: boolean
  /** Provider said this event failed. */
  isError?: boolean
  /** The original parsed record, for `expand` and for provenance. */
  raw?: unknown
  /** Stable index in the source transcript. Never reassigned. */
  eventIndex: number
}

export interface SessionIR {
  ref: SessionRef
  messages: IRMessage[]
  /** Event indices where the provider compacted. Everything before one is already summarised. */
  compactBoundaries: number[]
  /** Provider-reported facts worth carrying: cwd, branch, model, versions. */
  metadata: Record<string, unknown>
  /** Malformed lines, so a bad adapter is diagnosable rather than silent. */
  diagnostics: Diagnostic[]
}

export interface Diagnostic {
  line: number
  message: string
}

/** `evt 12` or `evt 12–19`. The artifact's only pointer syntax. */
export function evtLabel(from: number, to?: number): string {
  const end = to ?? from
  return from === end ? `evt ${from}` : `evt ${from}–${end}`
}

/**
 * The transcript content after the last compact boundary, plus everything when
 * there is none. A provider compaction already summarised what came before, so
 * re-reading it means summarising a summary.
 */
export function afterLastBoundary(ir: SessionIR): IRMessage[] {
  const last = ir.compactBoundaries.at(-1)
  if (last === undefined) return ir.messages
  return ir.messages.filter((m) => m.eventIndex >= last)
}

/** Events the human actually typed. Intent lives here and nowhere else. */
export function humanTurns(ir: SessionIR): IRMessage[] {
  return ir.messages.filter((m) => m.isHumanTurn && !m.isMeta)
}

/** Cwd recorded by the provider, if any. */
export function sessionCwd(ir: SessionIR): string | undefined {
  const cwd = ir.metadata['cwd']
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}
