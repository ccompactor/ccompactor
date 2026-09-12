/**
 * Token estimation.
 *
 * Four bytes per token, the same approximation sctxx uses and for the same
 * reason: every budget in the tool is an order-of-magnitude decision, and a
 * tokeniser dependency costs more than it improves that. It is stated as an
 * estimate everywhere it is shown, never as a measurement.
 */

const BYTES_PER_TOKEN = 4

export function approxTokens(text: string): number {
  return Math.ceil(text.length / BYTES_PER_TOKEN)
}

export function approxBytes(tokens: number): number {
  return tokens * BYTES_PER_TOKEN
}

/** Middle-truncate to a token budget, keeping a head and a tail. */
export function truncateMiddle(text: string, maxTokens: number, marker = ' … '): string {
  const max = approxBytes(maxTokens)
  if (text.length <= max) return text
  if (max <= marker.length + 2) return marker.trim()
  const left = Math.floor((max - marker.length) / 2)
  const right = max - marker.length - left
  return text.slice(0, left) + marker + text.slice(text.length - right)
}

/** Hard-wrap a long line so a terminal can show a path without it vanishing. */
export function wrapHard(text: string, width: number): string[] {
  if (width <= 0) return [text]
  const out: string[] = []
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width))
  return out.length > 0 ? out : ['']
}
