/**
 * The TUI palette, matched to the website.
 *
 * Safety yellow on blacktop, the same two colours the site is built from, so
 * the terminal and the browser look like the same product. The yellow is a
 * *surface* and an accent, never a colour for body text: black on `#FFD400` is
 * 13.75:1, and `#FFDD2E` on a dark terminal is 14.7:1, whereas plain `#FFD400`
 * text on white is unreadable.
 *
 * The terminal's own background is left alone. Forcing black would fight a
 * reader's theme, and the selection row carries the brand on its own.
 */
export const THEME = {
  yellow: '#FFD400',
  /** Yellow as text on a dark terminal. */
  yellowInk: '#FFDD2E',
  /** Black, for text sitting on yellow. */
  onYellow: '#0B0B0B',
  /** Blacktop, the site's surface colour. */
  black: '#141412',
  /** Secondary text. */
  muted: '#8A8880',
  /** The dimmer half of a hazard stripe. */
  stripeDim: '#6B6A63',
} as const

/** The width a full-bleed rule should be. */
export function width(columns: number | undefined): number {
  return Math.max(20, Math.min(columns ?? 80, 120))
}

/**
 * A hazard stripe: the site's signature, in a terminal.
 *
 * Alternating filled and hollow blocks read as a warning tape at any width.
 * Ink has no way to draw a background stripe across a line, so the character
 * itself carries the colour.
 */
export function hazard(columns: number | undefined): Array<{ ch: string; dim: boolean }> {
  const total = width(columns) - 2
  return Array.from({ length: total }, (_, i) => ({
    ch: i % 2 === 0 ? '▰' : '▱',
    dim: i % 2 === 1,
  }))
}

/** A file size a human can read at a glance. */
export function sizeLabel(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
