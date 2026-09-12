/**
 * Mouse support, by hand.
 *
 * Ink does not surface mouse events: a click arrives on stdin as an escape
 * sequence that its key parser discards. Verified by sending a click to an Ink
 * app and watching `useInput` stay silent. So the sequences are enabled here,
 * parsed here, and delivered through a callback.
 *
 * SGR mode (`?1006`) is what makes this tractable: the coordinates are plain
 * decimal and there is no 223-column limit, unlike the original X10 encoding.
 * A press is `ESC [ < b ; x ; y M`, a release ends in `m`.
 */
import type { Writable } from 'node:stream'

const ENABLE = '\u001b[?1000h\u001b[?1006h'
const DISABLE = '\u001b[?1000l\u001b[?1006l'

export type MouseKind = 'click' | 'wheel-up' | 'wheel-down' | 'other'

export interface MouseEvent {
  kind: MouseKind
  /** 1-based column, as the terminal reports it. */
  x: number
  /** 1-based row, as the terminal reports it. */
  y: number
  /** The raw SGR button code, for anything this does not model. */
  button: number
}

/** Turn on click and wheel reporting, and return a function that turns it off. */
export function enableMouse(out: Writable): () => void {
  out.write(ENABLE)
  return () => out.write(DISABLE)
}

/**
 * Pull every mouse event out of a chunk of stdin.
 *
 * Returns the events and the chunk with those sequences removed, so a caller can
 * decide whether anything else is worth passing on. Anything that is not a
 * complete sequence is ignored rather than buffered: a partial escape at the end
 * of a chunk is far more likely to be a keystroke than a click.
 */
export function readMouse(data: string): { events: MouseEvent[]; rest: string } {
  const events: MouseEvent[] = []
  let rest = data
  const pattern = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g
  rest = rest.replace(pattern, (_match, b: string, x: string, y: string, final: string) => {
    if (final === 'm') return '' // releases carry nothing we act on
    const button = Number.parseInt(b, 10)
    const kind: MouseKind =
      (button & 64) !== 0
        ? (button & 1) === 0
          ? 'wheel-up'
          : 'wheel-down'
        : (button & 3) === 0
          ? 'click'
          : 'other'
    events.push({
      kind,
      x: Number.parseInt(x, 10),
      y: Number.parseInt(y, 10),
      button,
    })
    return ''
  })
  return { events, rest }
}
