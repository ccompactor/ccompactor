import type { AgentKind } from '../ir/types.js'
import type { Adapter } from './types.js'
import { ClaudeAdapter } from './claude.js'

/**
 * The adapter registry.
 *
 * Adding an agent means adding one file here and nothing else — every later
 * stage reads the canonical IR, not a provider format. Adapters whose store is
 * absent are still listed, so `doctor` can say what it looked for and did not
 * find rather than silently omitting a provider.
 */
export function adapters(): Adapter[] {
  return [new ClaudeAdapter()]
}

export function adapterFor(kind: AgentKind): Adapter | undefined {
  return adapters().find((a) => a.kind === kind)
}

export { ClaudeAdapter }
export type { Adapter, ListOptions, ReadOptions } from './types.js'
