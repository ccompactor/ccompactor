/**
 * Which `ccompactor` will actually run.
 *
 * Finding this the hard way: after a release, `ccompactor --version` reported
 * the previous version while `npm root -g` had the new one installed and its
 * `dist/version.js` said so. The cause was a second global install — a pnpm one
 * — shimmed into an earlier directory on `PATH`, shadowing the npm copy. Both
 * were "installed correctly". Only one of them ran.
 *
 * No updater can fix that from the inside, because the copy being updated is not
 * the copy that runs. What it can do is say so.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

export interface Installation {
  /** The path as it appears on PATH, which is what the shell would run. */
  path: string
  /** Resolved through symlinks and shims, for comparing two entries. */
  realPath: string
  /** What that copy reports, or undefined if it would not answer. */
  version?: string
  /** Is this the copy currently executing? */
  current: boolean
}

/** The names a `ccompactor` executable can have on this platform. */
function candidates(dir: string): string[] {
  const base = path.join(dir, 'ccompactor')
  return process.platform === 'win32' ? [`${base}.cmd`, `${base}.exe`, base] : [base]
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * What a path actually leads to.
 *
 * `realpath` is not enough: an npm or pnpm global install is not a symlink but a
 * generated *shell script* that `exec`s node with the real entry point, and it
 * records that entry point in a `cmd-shim-target=` comment. Resolving the shim
 * to itself meant the running copy never matched any entry on PATH, so the
 * "this one" marker never appeared for the most common install method there is.
 */
function resolveReal(file: string): string {
  try {
    const resolved = fs.realpathSync(file)
    const stat = fs.statSync(resolved)
    // A shim is a small text file; a packaged entry point is not read at all.
    if (stat.isFile() && stat.size < 8 * 1024) {
      const text = fs.readFileSync(resolved, 'utf8')
      const target = /^#\s*cmd-shim-target=(.+)$/m.exec(text)?.[1]?.trim()
      if (target) return resolveReal(target)
    }
    return resolved
  } catch {
    return file
  }
}

function versionOf(file: string): string | undefined {
  try {
    // A short timeout and no shell: this is another copy of this program, and a
    // broken one must not hang the command that is reporting on it.
    const out = execFileSync(file, ['--version'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() || undefined
  } catch {
    return undefined
  }
}

/** Our own entry point, resolved, so the running copy can be recognised. */
function selfPath(): string {
  return resolveReal(process.argv[1] ?? '')
}

/**
 * Every `ccompactor` on `PATH`, in the order the shell would find them.
 *
 * Order is the point: the first entry is the one that runs, and every entry
 * after it is shadowed until the first is removed.
 */
export function installations(): Installation[] {
  const seen = new Set<string>()
  const self = selfPath()
  const found: Installation[] = []
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (dir.length === 0) continue
    for (const candidate of candidates(dir)) {
      if (!isExecutable(candidate)) continue
      const real = resolveReal(candidate)
      if (seen.has(real)) continue
      seen.add(real)
      found.push({
        path: candidate,
        realPath: real,
        version: versionOf(candidate),
        current: real === self,
      })
    }
  }
  return found
}

/**
 * Are we the copy that runs?
 *
 * Returns the entry that beats us, if any. A shim resolves to the same file it
 * runs, so comparing resolved paths identifies the running copy even when it was
 * reached through a symlink.
 */
export function shadowedBy(all: Installation[]): Installation | undefined {
  const me = all.findIndex((entry) => entry.current)
  if (me <= 0) return undefined
  return all[0]
}

/** The entries that disagree with the running copy about what version this is. */
export function versionConflicts(all: Installation[]): Installation[] {
  const mine = all.find((entry) => entry.current)?.version
  if (!mine) return []
  return all.filter((entry) => !entry.current && entry.version && entry.version !== mine)
}

/** What to print when more than one copy is installed. */
export function describeConflicts(all: Installation[], mine: string | undefined): string[] {
  if (all.length <= 1) return []
  const lines = ['', 'more than one ccompactor is installed:']
  for (const entry of all) {
    lines.push(
      // `??` is not enough: an empty version is falsy but not nullish, and the
      // line would read `/usr/bin/ccompactor — ` with nothing after the dash.
      `  ${entry.path} — ${entry.version || 'did not answer'}` +
        (entry.current ? '   <- this one' : ''),
    )
  }
  const conflicts = versionConflicts(all)
  if (conflicts.length > 0 && mine) {
    lines.push(
      '',
      `These disagree. \`ccompactor\` runs whichever comes first on PATH, which is ${all[0]!.path}.`,
      'Updating one copy does not update the others; update or remove each.',
    )
  }
  return lines
}
