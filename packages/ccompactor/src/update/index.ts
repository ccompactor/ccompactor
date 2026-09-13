/**
 * `ccompactor update` — replace this install with the newest release.
 *
 * The hard part is not downloading; it is knowing what kind of install this is
 * and refusing to touch the ones that must not be touched. A checkout that was
 * linked with `npm run link` looks exactly like an npm install from the inside,
 * and overwriting it would silently delete someone's work. So the install kind
 * is detected first and a source checkout is never written to.
 */
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { VERSION } from '../version.js'

const REPO = 'ccompactor/ccompactor'
const NPM_PACKAGE = 'ccompactor'

export type InstallKind = 'binary' | 'npm-global' | 'npm-local' | 'source' | 'unknown'

export interface Install {
  kind: InstallKind
  /** Where the running code lives, for the message the user reads. */
  location: string
  /** Present when `kind` is `binary`. */
  asset?: string
}

export interface UpdateResult {
  current: string
  latest: string
  kind: InstallKind
  location: string
  /** False when already current, or when only checking. */
  changed: boolean
  message: string
}

/** The archive name the release workflow produces for one platform and arch. */
export function assetName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') return undefined
  if (arch !== 'x64' && arch !== 'arm64') return undefined
  const os_ = platform === 'win32' ? 'windows' : platform
  return `ccompactor-${os_}-${arch}${platform === 'win32' ? '.zip' : '.tar.gz'}`
}

/**
 * A bun-compiled executable runs its own source out of a virtual filesystem, so
 * `argv[1]` is not a path on disk. That is the only reliable difference between
 * the standalone binary and `node dist/cli.js`, which reports a real path under
 * the checkout with the same `process.versions.bun` absent entirely.
 */
function isCompiledBinary(): boolean {
  if (!process.versions['bun']) return false
  return /[$~]bun/i.test(process.argv[1] ?? '')
}

/** The nearest enclosing git work tree, or undefined outside one. */
function gitRoot(from: string): string | undefined {
  let dir = from
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Where the npm global root is, or undefined when npm cannot be reached. */
function npmGlobalRoot(): string | undefined {
  try {
    return execFileSync(npmCommand(), ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

/** npm is a shell script on POSIX and a `.cmd` on Windows. */
export function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function detectInstall(): Install {
  if (isCompiledBinary()) {
    const location = process.execPath
    const asset = assetName()
    return asset ? { kind: 'binary', location, asset } : { kind: 'unknown', location }
  }
  let here: string
  try {
    here = fileURLToPath(import.meta.url)
  } catch {
    return { kind: 'unknown', location: process.argv[1] ?? '' }
  }
  const marker = `${path.sep}node_modules${path.sep}${NPM_PACKAGE}${path.sep}`
  const index = here.indexOf(marker)
  if (index === -1) {
    // A checkout is a package inside a repository, and the package directory is
    // not the thing `git pull` wants. `packages/ccompactor` sits two levels
    // below the root here, which is not true of every layout, so the root is
    // found rather than counted.
    const packageDir = path.resolve(here, '../../..')
    return { kind: 'source', location: gitRoot(packageDir) ?? packageDir }
  }
  const root = npmGlobalRoot()
  const packageDir = here.slice(0, index + marker.length - 1)
  const kind: InstallKind =
    root && packageDir.startsWith(path.resolve(root)) ? 'npm-global' : 'npm-local'
  return { kind, location: packageDir }
}

/** The release tag for the newest non-draft, non-prerelease release. */
export async function latestVersion(fetchImpl = fetch): Promise<string> {
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `ccompactor/${VERSION}` },
  })
  if (!response.ok) {
    throw new Error(
      `could not reach the release list (${response.status}). ` +
        `Check https://github.com/${REPO}/releases or npm view ${NPM_PACKAGE} version`,
    )
  }
  const body = (await response.json()) as { tag_name?: string }
  const tag = body.tag_name?.replace(/^v/, '')
  if (!tag) throw new Error('the latest release has no tag')
  return tag
}

/**
 * Compare two dotted versions.
 *
 * Deliberately not a semver dependency: the releases here are `x.y.z` and a
 * full parser would be more code than the comparison it replaces.
 */
export function isNewer(candidate: string, current: string): boolean {
  const part = (v: string) => v.split('-')[0]!.split('.').map((n) => Number(n) || 0)
  const a = part(candidate)
  const b = part(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

async function download(url: string, fetchImpl = fetch): Promise<Buffer> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': `ccompactor/${VERSION}` },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Check a download against the release's own `SHA256SUMS`.
 *
 * This catches a truncated or corrupted archive, which is the failure that
 * matters when the result is unpacked and executed in place of this binary. It
 * is not a defence against a compromised release — the sums come from the same
 * place as the archive — and it is reported as such rather than oversold.
 *
 * Releases up to 0.1.7 published no sums. Refusing those would strand exactly
 * the users who most need to update, so an absent sum is reported and the
 * update continues; a *wrong* sum always stops it.
 */
export function verifyChecksum(
  archive: Buffer,
  sums: string,
  asset: string,
): 'verified' | 'unpublished' {
  const line = sums
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.endsWith(asset) || l.endsWith(`/${asset}`) || l.endsWith(`*${asset}`))
  if (!line) return 'unpublished'
  const expected = line.split(/\s+/)[0]!.toLowerCase()
  const actual = createHash('sha256').update(archive).digest('hex')
  if (expected !== actual) {
    throw new Error(
      `checksum mismatch for ${asset} — the download was discarded.\n` +
        `  expected ${expected}\n  got      ${actual}`,
    )
  }
  return 'verified'
}

/**
 * Unpack with the system `tar`.
 *
 * Node has no tar, and both BSD tar (macOS, Windows 10+) and GNU tar read
 * `.tar.gz`; Windows archives are `.zip` and are read by bsdtar for the same
 * reason. A dependency for one extraction is not worth the install weight.
 */
export function extract(archive: string, into: string): void {
  const zip = archive.endsWith('.zip')
  const args = zip ? ['-xf', archive, '-C', into] : ['-xzf', archive, '-C', into]
  execFileSync('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * Put `next` in place of the running executable.
 *
 * The replacement is written beside the target and renamed over it, so a
 * failure part-way leaves the original untouched rather than a half-written
 * binary. Windows will not overwrite a running image, but it will rename one,
 * so the live binary is moved aside first.
 */
export function replaceSelf(target: string, next: Buffer): void {
  const dir = path.dirname(target)
  const staged = path.join(dir, `.ccompactor-new-${process.pid}`)
  fs.writeFileSync(staged, next)
  if (process.platform !== 'win32') fs.chmodSync(staged, 0o755)
  try {
    fs.renameSync(staged, target)
    return
  } catch (error) {
    // Renaming over a running executable fails on Windows and can fail on a
    // filesystem that does not allow it. Moving the old one out of the way is
    // the documented workaround, and it is also the safer order: the new binary
    // is already on disk before the old one is displaced.
    if (fs.existsSync(target)) {
      const aside = `${target}.old-${Date.now()}`
      try {
        fs.renameSync(target, aside)
        fs.renameSync(staged, target)
        return
      } catch {
        fs.rmSync(staged, { force: true })
        throw error
      }
    }
    fs.rmSync(staged, { force: true })
    throw error
  }
}

export interface UpdateOptions {
  check?: boolean
  fetchImpl?: typeof fetch
  /** Report what would happen without writing anything. */
  dryRun?: boolean
}

/** Bring this install up to the newest release, or say why it will not. */
export async function update(options: UpdateOptions = {}): Promise<UpdateResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const install = detectInstall()
  const base = {
    current: VERSION,
    kind: install.kind,
    location: install.location,
  }

  if (install.kind === 'source') {
    return {
      ...base,
      latest: VERSION,
      changed: false,
      message:
        `This is a source checkout (${install.location}), not an installed copy, and updating it ` +
        'would discard local work.\nUpdate it the way you got it:\n' +
        `  git -C ${install.location} pull && npm install && npm run build`,
    }
  }
  if (install.kind === 'unknown') {
    return {
      ...base,
      latest: VERSION,
      changed: false,
      message: `Cannot tell how this copy of ccompactor was installed (${install.location}).`,
    }
  }

  const latest = await latestVersion(fetchImpl)
  if (!isNewer(latest, VERSION)) {
    return {
      ...base,
      latest,
      changed: false,
      message: `ccompactor ${VERSION} is the newest release.`,
    }
  }
  const lead = `ccompactor ${VERSION} → ${latest}`

  if (options.check) {
    return { ...base, latest, changed: false, message: `${lead} available.` }
  }
  if (options.dryRun) {
    return { ...base, latest, changed: false, message: `${lead} — would update ${install.location}` }
  }

  if (install.kind === 'npm-local') {
    return {
      ...base,
      latest,
      changed: false,
      message:
        `${lead} available, but this copy came from a project's node_modules (${install.location}).\n` +
        `Update it in that project: npm install ${NPM_PACKAGE}@${latest}`,
    }
  }

  if (install.kind === 'npm-global') {
    execFileSync(npmCommand(), ['install', '--global', `${NPM_PACKAGE}@${latest}`], {
      stdio: 'inherit',
    })
    return { ...base, latest, changed: true, message: `${lead} — installed via npm.` }
  }

  // A standalone binary: fetch the archive for this platform, check it, unpack
  // it and take the place of the running executable.
  const asset = install.asset!
  const url = `https://github.com/${REPO}/releases/download/v${latest}/${asset}`
  const [archive, sums] = await Promise.all([
    download(url, fetchImpl),
    download(`https://github.com/${REPO}/releases/download/v${latest}/SHA256SUMS`, fetchImpl).then(
      (b) => b.toString('utf8'),
      () => '',
    ),
  ])
  const checked = verifyChecksum(archive, sums, asset)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccompactor-update-'))
  try {
    const file = path.join(tmp, asset)
    fs.writeFileSync(file, archive)
    extract(file, tmp)
    // The archive holds the binary and a VERSION file, both named after the
    // release rather than after the name the user may have given it.
    const unpacked = fs.readdirSync(tmp).find((name) => name.startsWith('ccompactor-'))
    if (!unpacked) throw new Error(`${asset} did not contain a ccompactor binary`)
    replaceSelf(process.execPath, fs.readFileSync(path.join(tmp, unpacked)))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return {
    ...base,
    latest,
    changed: true,
    message:
      `${lead} — replaced ${install.location}.` +
      (checked === 'verified'
        ? ' Checksum verified.'
        : '\nNote: release 0.1.7 and earlier publish no checksum, so this download was not verified.'),
  }
}
