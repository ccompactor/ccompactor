import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeConflicts, shadowedBy, versionConflicts } from '../src/install.js'
import type { Installation } from '../src/install.js'

const at = (path: string, version: string, current = false): Installation => ({
  path,
  realPath: path,
  version,
  current,
})

test('a copy with something ahead of it on PATH is shadowed', () => {
  // The observed failure: a pnpm global shim earlier on PATH than the npm one,
  // so a release could be installed and still not take effect. Nothing in the
  // tool mentioned the second copy.
  const all = [at('/home/u/.local/bin/ccompactor', '0.1.12'), at('/usr/bin/ccompactor', '0.1.13', true)]
  assert.equal(shadowedBy(all)?.path, '/home/u/.local/bin/ccompactor')
})

test('the first copy on PATH is not shadowed by anything', () => {
  const all = [at('/home/u/.local/bin/ccompactor', '0.1.13', true), at('/usr/bin/ccompactor', '0.1.12')]
  assert.equal(shadowedBy(all), undefined)
})

test('only copies that disagree are reported as conflicting', () => {
  const all = [
    at('/a/ccompactor', '0.1.12'),
    at('/b/ccompactor', '0.1.13', true),
    at('/c/ccompactor', '0.1.13'),
  ]
  assert.deepEqual(
    versionConflicts(all).map((e) => e.path),
    ['/a/ccompactor'],
  )
  // Two copies at the same version are not a problem worth reporting as one.
  assert.deepEqual(
    versionConflicts([at('/a/ccompactor', '0.1.13'), at('/b/ccompactor', '0.1.13', true)]),
    [],
  )
})

test('a single install produces no noise at all', () => {
  // Most machines have one copy. `doctor` must not grow a warning section for
  // them, and `update` must not start printing advice about a problem that does
  // not exist.
  assert.deepEqual(describeConflicts([at('/usr/bin/ccompactor', '0.1.13', true)], '0.1.13'), [])
  assert.deepEqual(describeConflicts([], '0.1.13'), [])
})

test('the conflict report names the copy that actually runs', () => {
  const lines = describeConflicts(
    [at('/home/u/.local/bin/ccompactor', '0.1.12'), at('/usr/bin/ccompactor', '0.1.13', true)],
    '0.1.13',
  )
  const text = lines.join('\n')
  assert.match(text, /more than one ccompactor is installed/)
  assert.match(text, /\/usr\/bin\/ccompactor — 0\.1\.13 {3}<- this one/)
  assert.match(text, /runs whichever comes first on PATH, which is \/home\/u\/\.local\/bin\/ccompactor/)
  assert.match(text, /Updating one copy does not update the others/)
})

test('a copy that will not answer is listed rather than dropped', () => {
  // Silence would read as "there is only one install", which is the opposite of
  // what the report exists to say.
  const lines = describeConflicts([at('/a/ccompactor', '0.1.12'), at('/b/ccompactor', '', true)], '')
  assert.match(lines.join('\n'), /\/b\/ccompactor — did not answer/)
})

test('a global-install shim resolves to the entry point it runs', async () => {
  // npm and pnpm do not symlink. They write a shell script that execs node with
  // the real entry point, and record that path in a `cmd-shim-target=` comment.
  // Resolving the shim to itself meant the running copy matched nothing on PATH,
  // so the "this one" marker never appeared for the commonest install there is.
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const { installations } = await import('../src/install.js')

  const dir = mkdtempSync(path.join(tmpdir(), 'ccompactor-shim-'))
  const original = process.env['PATH']
  try {
    const entry = path.join(dir, 'cli.js')
    writeFileSync(entry, '#!/usr/bin/env node\nconsole.log("9.9.9")\n')
    const shim = path.join(dir, 'ccompactor')
    writeFileSync(
      shim,
      `#!/bin/sh\n# cmd-shim-target=${entry}\nexec node "${entry}" "$@"\n`,
    )
    chmodSync(shim, 0o755)

    process.env['PATH'] = dir
    const found = installations()
    const ours = found.find((e) => e.path === shim)
    assert.ok(ours, 'the shim is found on PATH')
    // Compared through realpath because macOS resolves /var to /private/var, so
    // the shim's recorded path and the resolved one differ by a prefix.
    const { realpathSync } = await import('node:fs')
    assert.equal(
      ours!.realPath,
      realpathSync(entry),
      'and resolves to what it execs, not to itself',
    )
  } finally {
    if (original === undefined) delete process.env['PATH']
    else process.env['PATH'] = original
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a directory with no ccompactor contributes nothing', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const { installations } = await import('../src/install.js')
  const dir = mkdtempSync(path.join(tmpdir(), 'ccompactor-empty-'))
  const original = process.env['PATH']
  try {
    process.env['PATH'] = dir
    assert.deepEqual(installations(), [])
  } finally {
    if (original === undefined) delete process.env['PATH']
    else process.env['PATH'] = original
    rmSync(dir, { recursive: true, force: true })
  }
})
