/**
 * Drive the real TUI through a pty, from a test.
 *
 * Node has no pty, so this shells out to `pty-bridge.py`, which allocates one,
 * sets its window size and forwards stdin to it. That makes the tests exercise
 * the program a user runs — the same entry point, the same raw-mode input, the
 * same mouse escape sequences — rather than a mock of it.
 *
 * `script(1)` would be the obvious choice and does not work: on macOS it refuses
 * to start unless its own stdin is already a terminal, which is the one thing a
 * test cannot provide.
 *
 * The screen is not reconstructed. Ink writes diffs with cursor movement, and
 * turning that back into a grid needs a terminal emulator; asserting on the
 * stream of text instead is both simpler and harder to fool, because a pattern
 * only matches once the program has actually written it. `waitFor` consumes what
 * it matched, so each step looks only at output produced after the last one.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
/** dist-test/tests/helpers -> dist-test/tests -> the package */
const PACKAGE = join(here, '..', '..', '..')
/**
 * The CLI that `npm test` just compiled.
 *
 * Not `dist/cli.js`: CI runs the tests without building `dist/`, so pointing
 * there failed twenty-three tests with "cannot find module" on a machine where
 * every one of them would have passed.
 */
export const CLI = join(PACKAGE, 'dist-test', 'src', 'cli.js')
export { PACKAGE as PACKAGE_FOR_PROBE }

// The bridge is Python, so it is not part of the TypeScript build. Resolved
// against the package rather than this file, which lives in `dist-test`.
const BRIDGE = join(PACKAGE, 'tests', 'helpers', 'pty-bridge.py')

/**
 * The environment for the program under test, without the CI markers.
 *
 * Ink suppresses its live output when it believes it is running in CI — it
 * writes only `<Static>` content and returns, so a TUI on a real pty produces
 * nothing but whatever the program writes to stderr directly. That assumption
 * does not hold here: this harness hands the program a genuine terminal, which
 * is exactly what Ink is declining to write to.
 *
 * `is-in-ci` checks the presence of these two and nothing else.
 */
export function childEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  delete env['CI']
  delete env['CONTINUOUS_INTEGRATION']
  return env
}

function python(): string {
  return process.env['PYTHON'] ?? 'python3'
}

/** The pty is the thing being tested, and Windows has no `fork`. */
export const canDrive = process.platform === 'darwin' || process.platform === 'linux'

/** Is there an interpreter to allocate the pty with, and a program to run? */
export function hasBridge(): boolean {
  if (!canDrive) return false
  if (!existsSync(CLI)) return false
  try {
    return spawnSync(python(), ['-c', 'import pty'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

const ESCAPES = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007]*\u0007/g

export interface FixtureStore {
  root: string
  cwd: string
  env: NodeJS.ProcessEnv
  cleanup: () => void
}

/**
 * A store with known contents, so a test asserts on numbers that cannot change.
 *
 * Sessions are copied from `tests/fixtures` rather than invented, so the TUI is
 * reading the same shape of transcript the adapters are tested against.
 */
export function fixtureStore(sessions = 3): FixtureStore {
  const root = mkdtempSync(join(tmpdir(), 'ccompactor-tui-'))
  const store = join(root, 'claude')
  const project = join(root, 'project')
  mkdirSync(store, { recursive: true })
  mkdirSync(project, { recursive: true })
  const dir = join(store, '-fixture-project')
  mkdirSync(dir, { recursive: true })
  const source = readFileSync(join(PACKAGE, 'tests', 'fixtures', 'claude-basic.jsonl'), 'utf8')
  for (let i = 1; i <= sessions; i += 1) {
    // Each session gets a distinct id and cwd, so the rows can be told apart and
    // a filter can be seen to have worked.
    writeFileSync(
      join(dir, `fixture-${i}.jsonl`),
      source.replaceAll('fixture-1', `fixture-${i}`).replaceAll('/repo', project),
    )
  }
  return {
    root,
    cwd: project,
    env: {
      CLAUDE_ROOT: store,
      CODEX_HOME: join(root, 'no-codex'),
      PI_HOME: join(root, 'no-pi'),
      PATH: process.env['PATH'] ?? '',
      HOME: root,
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

export class Tui {
  private child: ChildProcessWithoutNullStreams
  private buffer = ''
  private errors = ''
  private spawnError: string | undefined
  private exited = false
  private exitCode: number | undefined
  readonly columns: number
  readonly rows: number
  private readonly argv: string[]

  constructor(
    argv: string[],
    options: { env?: NodeJS.ProcessEnv; cwd?: string; columns?: number; rows?: number } = {},
  ) {
    const columns = options.columns ?? 100
    const rows = options.rows ?? 30
    const file = python()
    const args = [BRIDGE, String(columns), String(rows), ...argv]
    this.columns = columns
    this.rows = rows
    this.argv = [file, ...args]
    this.child = spawn(file, args, {
      cwd: options.cwd,
      env: childEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so `close` can take the bridge *and* the program
      // it is driving. Killing only the bridge left the TUI running: twenty of
      // them accumulating was enough to make later tests time out.
      detached: true,
    }) as ChildProcessWithoutNullStreams
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
    })
    this.child.stderr.on('data', (chunk: Buffer) => {
      // Kept apart from the program's own output: when the bridge itself fails
      // to start, this is the only place the reason appears.
      this.errors += chunk.toString('utf8')
      this.buffer += chunk.toString('utf8')
    })
    this.child.on('error', (error) => {
      this.spawnError = error.message
      this.exited = true
    })
    this.child.on('exit', (code) => {
      this.exited = true
      this.exitCode = code ?? 0
    })
  }

  /** Everything written since the last `waitFor`, with escapes removed. */
  text(): string {
    return this.buffer.replace(ESCAPES, '')
  }

  /** Send bytes as if typed. Mouse events are SGR sequences. */
  send(keys: string): void {
    try {
      this.child.stdin.write(keys)
    } catch {
      // A closed pty means the program exited; the test's wait will say so.
    }
  }

  /**
   * Press keys one at a time, with a pause between them.
   *
   * Two keys written together arrive as one chunk, and `esc` followed by
   * anything is an Alt sequence as far as a terminal parser is concerned — so
   * `esc` then `a` closes a dialog and then does nothing with the `a`. A person
   * cannot type that fast; a test should not either.
   */
  async press(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.send(key)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  /** Click at a 1-based cell, press and release, the way a terminal reports it. */
  async click(x: number, y: number): Promise<void> {
    this.send(`\u001b[<0;${x};${y}M\u001b[<0;${x};${y}m`)
  }

  async wheel(down: boolean, x = 20, y = 12, times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) this.send(`\u001b[<${down ? 65 : 64};${x};${y}M`)
  }

  /**
   * Wait until the output matches, then consume up to and including the match.
   *
   * Consuming is what makes the assertions mean "this happened next" rather than
   * "this has ever been on screen".
   */
  async waitFor(pattern: RegExp, timeoutMs = 12000): Promise<string> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const text = this.text()
      const match = pattern.exec(text)
      if (match) {
        this.buffer = this.buffer.slice(match.index + match[0].length)
        return text.slice(0, match.index + match[0].length)
      }
      if (this.exited) {
        throw new Error(
          `the TUI exited (code ${this.exitCode}) before ${pattern} appeared.\n` +
            `${this.diagnosis()}\nLast output:\n${this.tail()}`,
        )
      }
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${pattern}.\n${this.diagnosis()}\nLast output:\n${this.tail()}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }

  /** Assert that the output does *not* contain something within a short window. */
  async expectAbsent(pattern: RegExp, windowMs = 600): Promise<void> {
    const deadline = Date.now() + windowMs
    while (Date.now() < deadline) {
      if (pattern.test(this.text())) throw new Error(`unexpected ${pattern} on screen`)
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  }

  /** Everything known about a child that is not talking. */
  diagnosis(): string {
    const bits = [
      `argv: ${this.argv.join(' ')}`,
      `child pid ${this.child.pid ?? '?'}, running: ${!this.exited}`,
      `bytes received: ${this.buffer.length}`,
      `raw head: ${JSON.stringify(this.buffer.slice(0, 240))}`,
      `stderr: ${this.errors.trim() || '(none)'}`,
      this.spawnError ? `spawn error: ${this.spawnError}` : '',
    ]
    return bits.filter(Boolean).join('\n')
  }

  tail(lines = 24): string {
    return this.text().split('\n').slice(-lines).join('\n')
  }

  get running(): boolean {
    return !this.exited
  }

  async close(): Promise<void> {
    if (this.exited) return
    // Ctrl-C first, so the program runs its own cleanup and restores the
    // terminal; the group kill is the backstop.
    this.send('\u0003')
    const deadline = Date.now() + 1500
    while (!this.exited && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    this.killGroup()
    this.exited = true
  }

  private killGroup(): void {
    try {
      if (this.child.pid !== undefined) process.kill(-this.child.pid, 'SIGKILL')
    } catch {
      // Already gone, or no group to signal.
    }
    try {
      this.child.kill('SIGKILL')
    } catch {
      // As above.
    }
  }

  /** Resolve when the program exits, or reject after `timeoutMs`. */
  async waitForExit(timeoutMs = 4000): Promise<number> {
    const deadline = Date.now() + timeoutMs
    while (!this.exited && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    if (!this.exited) throw new Error('the TUI did not exit')
    return this.exitCode ?? 0
  }
}
