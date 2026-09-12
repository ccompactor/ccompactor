/**
 * `[evt a–b]` → the events behind it.
 *
 * The pointer is the artifact's only claim-checking mechanism, so this has to
 * mean exactly one thing: the events in that inclusive range, in source order.
 * A range is delivered in exact, non-overlapping pages rather than one
 * unbounded dump, and every page says how to reach the next one — a window that
 * has already shown you events 1–200 owes you a way to reach 201.
 */
import type { SessionIR } from '../ir/types.js'

export interface Page {
  index: number
  tokens: number
}

export interface ExpandOptions {
  context?: number
  page?: Page
}

export function expand(
  ir: SessionIR,
  ranges: Array<[number, number]>,
  options: ExpandOptions = {},
): string {
  const out: string[] = []
  const context = options.context ?? 0
  for (const [from, to] of ranges) {
    const start = Math.max(0, from - context)
    const end = to + context
    const selected = ir.messages.filter((m) => m.eventIndex >= start && m.eventIndex <= end)
    if (selected.length === 0) {
      out.push(`=== evt ${start}–${end} ===\n(no events in this range)\n`)
      continue
    }
    if (!options.page) {
      out.push(`=== evt ${start}–${end} ===\n${selected.map(renderEvent).join('\n')}\n`)
      continue
    }
    const pages = paginate(selected, options.page.tokens)
    const index = Math.min(Math.max(1, options.page.index), pages.length)
    const slice = pages[index - 1]!
    out.push(
      `=== evt ${start}–${end} · page ${index}/${pages.length} · evt ${slice[0]!.eventIndex}–${slice.at(-1)!.eventIndex} · ${slice.reduce((n, m) => n + Math.ceil((m.text?.length ?? 0) / 4), 0)} token(s) ===`,
    )
    out.push(slice.map(renderEvent).join('\n'))
    if (pages.length > 1) {
      const next = index === pages.length ? 1 : index + 1
      out.push(`\n--- page ${index} of ${pages.length}; page ${next} is \`ccompactor expand <ref> ${from}..${to} --page ${next}\` ---`)
    }
    out.push('')
  }
  return out.join('\n')
}

/** Consecutive, non-overlapping pages. A single oversized event is its own page. */
export function paginate(
  messages: SessionIR['messages'],
  tokens: number,
): Array<SessionIR['messages']> {
  const pages: Array<SessionIR['messages']> = []
  let current: SessionIR['messages'] = []
  let used = 0
  for (const message of messages) {
    const cost = Math.ceil((message.text?.length ?? 0) / 4)
    if (current.length > 0 && used + cost > tokens) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(message)
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
