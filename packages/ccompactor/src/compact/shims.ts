/**
 * Local shims for the host application the vendored modules came from.
 *
 * The vendored modules import a compile-time feature flag and a few structural
 * types from the surrounding application. These stand in for those, so the
 * modules lift without dragging in a REPL, a bootstrap sequence, or a Bun-only
 * bundler API. Nothing here is derived from upstream.
 */

/** Stand-in for Bun's `feature()` compile-time flags. */
export function feature(name: string): boolean {
  const enabled = process.env['CCOMPACTOR_FEATURES'] ?? ''
  return enabled.split(',').map((f) => f.trim()).includes(name)
}

/** Structural stand-ins for the host's message types. */
export interface Message {
  uuid?: string
  type?: string
  /** Deliberately permissive: foreign code reads fields we do not model. */
  message?: any
  role?: string
  content?: unknown
  isMeta?: boolean
  isSidechain?: boolean
  [key: string]: any
}

/** The directions the upstream partial compact prompt distinguishes. */
export type PartialCompactDirection = 'up' | 'down' | 'from' | 'up_to'
