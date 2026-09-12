/**
 * Launching a target agent with the handoff preloaded.
 *
 * The mechanism is an instruction plus a file path, never an injection into
 * another tool's database. Flags here were verified against installed versions
 * rather than assumed, because a wrong flag is a spawn that silently drops the
 * context — the one failure this command exists to prevent.
 *
 * Verified: claude 2.1.268 `--append-system-prompt-file`, pi 0.85.1
 * `--append-system-prompt`. Codex has no equivalent, so it gets a pointer and
 * the instruction to read it first.
 */
import { resolve } from 'node:path'
import * as childProcess from 'node:child_process'

export type Target = 'claude' | 'openclaude' | 'codex' | 'pi' | 'generic'

export interface Launch {
  target: Target
  program: string
  argv: string[]
  /** What to tell the human when the target cannot take a file directly. */
  note?: string
  display: string
}

export function plan(target: Target, artifactPath: string, cwd: string): Launch {
  const path = resolve(artifactPath)
  const instruction = `Read ${path} first. It is a handoff from an earlier session on this project; build on that work rather than re-deriving it, and treat its "Hard constraints" as binding.`

  switch (target) {
    case 'claude':
    case 'openclaude':
      return {
        target,
        program: target === 'claude' ? 'claude' : 'openclaude',
        argv: ['--append-system-prompt-file', path],
        display: `${target} --append-system-prompt-file ${path}`,
      }
    case 'pi':
      return {
        target,
        program: 'pi',
        argv: ['--append-system-prompt', path],
        display: `pi --append-system-prompt ${path}`,
      }
    case 'codex':
      return {
        target,
        program: 'codex',
        argv: [instruction],
        note: 'codex has no --append-system-prompt; it is given the instruction as its opening prompt',
        display: `codex "${instruction}"`,
      }
    default:
      return {
        target: 'generic',
        program: '',
        argv: [],
        note: instruction,
        display: instruction,
      }
  }
}

/** Which targets actually exist on this machine. */
export function installed(): Target[] {
  const { execFileSync } = childProcess
  const found: Target[] = []
  for (const target of ['claude', 'codex', 'pi'] as const) {
    try {
      execFileSync('which', [target], { stdio: 'ignore' })
      found.push(target)
    } catch {
      continue
    }
  }
  return found
}
