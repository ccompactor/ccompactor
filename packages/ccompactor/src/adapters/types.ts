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
  /**
   * Drop each event's original record.
   *
   * `raw` is what `expand` needs and what makes a message self-describing; it is
   * also most of the memory. A 268 MB transcript becomes tens of thousands of
   * messages each holding its source object, and reading thirty of those at once
   * to fill a table of file sizes exhausts the heap — measured, not theorised.
   * Nothing that only counts or summarises needs it.
   */
  light?: boolean
}

/**
 * Stream a transcript a line at a time.
 *
 * Reading the file whole and splitting was the obvious thing and it does not
 * scale: a 268 MB transcript becomes a 268 MB string plus an array of every
 * line, before a single event is looked at. Two of those at once exhausts the
 * heap. Streaming costs a little more time and a constant amount of memory.
 */
export async function* lines(path: string): AsyncGenerator<{ n: number; text: string }> {
  const { createReadStream } = await import('node:fs')
  const { createInterface } = await import('node:readline')
  const stream = createReadStream(path, { encoding: 'utf8' })
  const reader = createInterface({ input: stream, crlfDelay: Infinity })
  let n = 0
  try {
    for await (const text of reader) {
      n += 1
      if (text.trim().length === 0) continue
      yield { n, text }
    }
  } finally {
    reader.close()
    stream.close()
  }
}

/** How many lines a file has, without holding it in memory. */
export async function countLines(path: string): Promise<number> {
  let n = 0
  for await (const _line of lines(path)) n += 1
  return n
}
