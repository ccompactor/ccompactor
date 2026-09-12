import type { AgentKind, SessionIR, SessionRef } from '../ir/types.js'

export interface ListOptions {
  /** Restrict to sessions belonging to this project directory. */
  project?: string
  /** Ignore the project filter and search every store. */
  anyProject?: boolean
  /** Skip sessions whose transcript is larger than this, in bytes. */
  maxBytes?: number
}

export interface Adapter {
  kind: AgentKind
  label: string
  /** Where this adapter looks. Shown by `doctor`. */
  store(): string
  /** True when the store exists on this machine. */
  available(): boolean
  list(options: ListOptions): Promise<SessionRef[]>
  read(ref: SessionRef, options?: ReadOptions): Promise<SessionIR>
}

export interface ReadOptions {
  /** Include subagent transcripts. Off by default: they are not this session. */
  includeSidechains?: boolean
  /**
   * Start after the provider's last compaction boundary. Off by default: the
   * turns before a boundary are the record of what the human asked for, and the
   * boundary is where the provider stopped *reading*, not where the work began.
   */
  sinceCompact?: boolean
}

/** Shared by adapters: read a file, tolerate a bad line, count the bad ones. */
export async function readLines(path: string): Promise<string[]> {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(path, 'utf8')
  return text.split('\n').filter((line) => line.trim().length > 0)
}
