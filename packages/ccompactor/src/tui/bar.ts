/**
 * The clickable top bar.
 *
 * Kept out of `App.tsx` so the arithmetic can be tested without a terminal: the
 * bug this replaces was a click landing on a button one row below the one it was
 * drawn on, and that is a column calculation, not a rendering question.
 */

/** One clickable cell of the top bar. */
export interface BarButton {
  id: string
  /** The key that does the same thing, shown so the shortcut is learned. */
  key: string
  label: string
  run: () => void
}

/** Where a cell landed on a row, in 0-based columns. */
export interface Span {
  id: string
  text: string
  start: number
  end: number
}

export function measure(cells: string[]): number {
  return cells.reduce((n, c) => n + c.length, 0) + cells.length - 1
}

/**
 * Lay cells out on one row and remember where each one landed.
 *
 * The rendering and the hit-testing both read this result rather than each
 * computing its own idea of the columns: a button drawn in one place and
 * clicked in another is worse than no button at all.
 */
export function layoutCells(
  cells: Array<{ id: string; text: string }>,
  columns: number,
): Span[] {
  let chosen = cells
  if (measure(chosen.map((c) => c.text)) > columns) {
    // Drop whole cells off the end rather than let Ink wrap them onto a row the
    // mouse is not measuring. The keyboard still reaches what is dropped.
    chosen = chosen.slice()
    while (chosen.length > 1 && measure(chosen.map((c) => c.text)) > columns) chosen.pop()
  }
  const spans: Span[] = []
  let at = 0
  chosen.forEach((cell, i) => {
    if (i > 0) at += 1
    spans.push({ id: cell.id, text: cell.text, start: at, end: at + cell.text.length - 1 })
    at += cell.text.length
  })
  return spans
}

/**
 * The action bar's cells.
 *
 * A narrow terminal loses the caption before it loses the button: `[a actions]`
 * becomes `[a]`, which is still a target you can hit, just a less explanatory
 * one. Only when even that overflows does a button drop off the end.
 */
export function barCells(buttons: BarButton[], columns: number): Span[] {
  const full = buttons.map((b) => ({ id: b.id, text: `[${b.key} ${b.label}]` }))
  const short = buttons.map((b) => ({ id: b.id, text: `[${b.key}]` }))
  return layoutCells(measure(full.map((c) => c.text)) <= columns ? full : short, columns)
}

/** Is a 1-based terminal column inside a span? */
export function inSpan(span: Span, x: number): boolean {
  return x - 1 >= span.start && x - 1 <= span.end
}
