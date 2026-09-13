/**
 * `[evt a–b]` → the events behind it.
 *
 * The pointer is the artifact's only claim-checking mechanism, so it has to mean
 * exactly one thing: the events in that inclusive range, in source order — and
 * it has to **resolve**. Both properties were wrong in the first version, and
 * the second one cost 50 points of retrieval accuracy against the same
 * benchmark on the same questions before it was found.
 *
 * The IR is a filtered view: an adapter keeps the events it can turn into
 * messages and drops the rest, so `evt 13063` existed in the transcript and not
 * in the IR, and a reader that asked for it was told the event did not exist. A
 * pointer the artifact printed could not be followed. Anything missing from the
 * IR is now read back off the transcript itself, so every index in a range
 * resolves whether or not the IR kept it.
 *
 * Ranges are delivered in exact, non-overlapping pages rather than one unbounded
 * dump, and every page says how to reach the next one.
 */
import { lines } from '../adapters/types.js'
import type { SessionIR } from '../ir/types.js'

export interface Page {
  index: number
  tokens: number
}

export interface ExpandOptions {
  context?: number
  page?: Page
}

export interface ExpandedRange {
  /** The range the pointer named. */
  from: number
  to: number
  /** The range actually covered, after `--context`. */
  start: number
  end: number
  /** Present when the caller asked for a page. */
  page?: { index: number; of: number; first: number; last: number }
  /** One rendered line per event, in order. */
  events: string[]
  tokens: number
}

/**
 * Resolve pointers to the events behind them.
 *
 * Returns structure rather than text so `--json` can carry the events: it used
 * to hand `null` to the JSON emitter, because the only thing this produced was a
 * rendered string. A script asking for a pointer's events got nothing at all.
 */
export async function expandRange(
  ir: SessionIR,
  ranges: Array<[number, number]>,
  options: ExpandOptions = {},
): Promise<ExpandedRange[]> {
  const context = options.context ?? 0
  const out: ExpandedRange[] = []

  for (const [from, to] of ranges) {
    const start = Math.max(0, from - context)
    const end = to + context

    const byIndex = new Map<number, string>()
    for (const message of ir.messages) {
      if (message.eventIndex < start || message.eventIndex > end) continue
      byIndex.set(message.eventIndex, renderEvent(message))
    }

    // Whatever the IR did not keep comes off the transcript. One pass, stopping
    // as soon as the range is covered, so a range near the start does not read
    // the whole file.
    const missing = new Set<number>()
    for (let i = start; i <= end; i += 1) if (!byIndex.has(i)) missing.add(i)
    if (missing.size > 0) {
      const path = ir.ref.path
      try {
        for await (const line of lines(path)) {
          const index = line.n - 1
          if (index > end) break
          if (!missing.has(index)) continue
          missing.delete(index)
          byIndex.set(index, renderRawLine(index, line.text))
          if (missing.size === 0) break
        }
      } catch {
        // An unreadable transcript still yields what the IR had.
      }
    }

    const ordered = [...byIndex.entries()].sort((a, b) => a[0] - b[0])
    const rendered = ordered.map(([, text]) => text)
    const tokens = rendered.reduce((n, t) => n + Math.ceil(t.length / 4), 0)

    if (rendered.length === 0 || !options.page) {
      out.push({ from, to, start, end, events: rendered, tokens })
      continue
    }

    const pages = paginate(rendered, options.page.tokens)
    const index = Math.min(Math.max(1, options.page.index), pages.length)
    const slice = pages[index - 1]!
    out.push({
      from,
      to,
      start,
      end,
      page: {
        index,
        of: pages.length,
        first: firstIndex(slice) ?? start,
        last: lastIndex(slice) ?? end,
      },
      events: slice,
      tokens: slice.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
    })
  }

  return out
}

/** The same thing as text, which is what a person reads. */
export async function expand(
  ir: SessionIR,
  ranges: Array<[number, number]>,
  options: ExpandOptions = {},
): Promise<string> {
  return (await expandRange(ir, ranges, options)).map(renderRange).join('\n')
}

function renderRange(range: ExpandedRange): string {
  if (range.events.length === 0) {
    return `=== evt ${range.start}–${range.end} ===\n(no events in this range)\n`
  }
  if (!range.page) {
    return `=== evt ${range.start}–${range.end} ===\n${range.events.join('\n')}\n`
  }
  const lines = [
    `=== evt ${range.start}–${range.end} · page ${range.page.index}/${range.page.of} · evt ${range.page.first}–${range.page.last} · ${range.tokens} token(s) ===`,
    range.events.join('\n'),
  ]
  if (range.page.of > 1) {
    const next = range.page.index === range.page.of ? 1 : range.page.index + 1
    lines.push(
      `\n--- page ${range.page.index} of ${range.page.of}; page ${next} is \`ccompactor expand <ref> ${range.from}..${range.to} --page ${next}\` ---`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

function firstIndex(lines: string[]): number | undefined {
  return indexOf(lines[0])
}

function lastIndex(lines: string[]): number | undefined {
  return indexOf(lines.at(-1))
}

function indexOf(line: string | undefined): number | undefined {
  const match = line ? /^evt (\d+)/.exec(line) : null
  return match ? Number.parseInt(match[1]!, 10) : undefined
}

/** Consecutive, non-overlapping pages. A single oversized line is its own page. */
export function paginate(rendered: string[], tokens: number): string[][] {
  const pages: string[][] = []
  let current: string[] = []
  let used = 0
  for (const line of rendered) {
    const cost = Math.ceil(line.length / 4)
    if (current.length > 0 && used + cost > tokens) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(line)
    used += cost
  }
  if (current.length > 0) pages.push(current)
  return pages.length > 0 ? pages : [[]]
}

function renderEvent(message: SessionIR['messages'][number]): string {
  const role = message.isHumanTurn ? 'user' : message.role
  const tag = message.toolName ? `${role}·${message.toolName}` : role
  const body = message.text ?? (message.toolInput ? JSON.stringify(message.toolInput) : '')
  return `evt ${message.eventIndex} [${tag}] ${body.replace(/\s+/g, ' ').slice(0, 2_000)}`
}

/**
 * A line the IR did not keep, shown compactly.
 *
 * Returning the JSON verbatim was the obvious thing and it is wrong twice over:
 * a Claude transcript's unkept lines are mostly hook bookkeeping — dozens of
 * `hook_success` records per tool call, each several hundred tokens of the same
 * shell bootstrap — and handing those to a reader as the answer to "what
 * happened at evt 13063" buries the one line that mattered under noise that
 * means nothing. They are named and dropped instead. Everything else is reduced
 * to its shape: a type, and whatever short field identifies it.
 */
const SILENT = new Set([
  'hook_success',
  'hook_error',
  'async_hook_response',
  'total_tokens_reminder',
  'file-history-snapshot',
  'queued_command',
  'hook_progress',
])

function renderRawLine(index: number, text: string): string {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return `evt ${index} [raw] ${text.replace(/\s+/g, ' ').slice(0, 400)}`
  }

  const attachment = raw['attachment']
  if (typeof attachment === 'object' && attachment !== null) {
    const kind = String((attachment as Record<string, unknown>)['type'] ?? 'attachment')
    if (SILENT.has(kind)) {
      // Named, not silent: the event exists and the reader can see it was
      // bookkeeping rather than wonder why the index is missing.
      return `evt ${index} [${kind}] (no content)`
    }
    return `evt ${index} [${kind}] ${compact(attachment, 400)}`
  }

  const type = String(raw['type'] ?? 'unknown')
  const body =
    typeof raw['content'] === 'string'
      ? raw['content']
      : typeof raw['summary'] === 'string'
        ? raw['summary']
        : compact(raw, 400)
  return `evt ${index} [${type}] ${body.replace(/\s+/g, ' ').slice(0, 600)}`
}

/** The short fields of an object, with the bookkeeping stripped out. */
function compact(value: unknown, max: number): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').slice(0, max)
  if (typeof value !== 'object' || value === null) return String(value)
  const interesting = ['text', 'stdout', 'stderr', 'content', 'message', 'command', 'name', 'prompt']
  const parts: string[] = []
  for (const key of interesting) {
    const field = (value as Record<string, unknown>)[key]
    if (typeof field === 'string' && field.trim().length > 0) {
      parts.push(field.replace(/\s+/g, ' ').slice(0, 200))
    }
  }
  return (parts.join(' · ') || JSON.stringify(value)).slice(0, max)
}

/** Parse the `4122..4381`, `4122..=4381` and `4122` forms an artifact prints. */
export function parseRange(text: string): [number, number] {
  const trimmed = text.trim()
  const match = /^(\d+)\s*\.\.\s*=?\s*(\d+)$/.exec(trimmed)
  if (match) {
    const from = Number.parseInt(match[1]!, 10)
    const to = Number.parseInt(match[2]!, 10)
    if (to < from) throw new Error(`range \`${text}\` runs backwards`)
    return [from, to]
  }
  if (/^\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10)
    return [value, value]
  }
  throw new Error(`\`${text}\` is not a range (expected \`4122..4381\` or \`4122\`)`)
}
