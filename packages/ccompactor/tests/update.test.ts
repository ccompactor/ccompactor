import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { assetName, isNewer, verifyChecksum, extract, replaceSelf } from '../src/update/index.js'

test('asset names match the ones the release workflow builds', () => {
  assert.equal(assetName('darwin', 'arm64'), 'ccompactor-darwin-arm64.tar.gz')
  assert.equal(assetName('darwin', 'x64'), 'ccompactor-darwin-x64.tar.gz')
  assert.equal(assetName('linux', 'x64'), 'ccompactor-linux-x64.tar.gz')
  assert.equal(assetName('linux', 'arm64'), 'ccompactor-linux-arm64.tar.gz')
  // The release matrix calls them "windows" and zips them; nothing else is close.
  assert.equal(assetName('win32', 'x64'), 'ccompactor-windows-x64.zip')
  assert.equal(assetName('win32', 'arm64'), 'ccompactor-windows-arm64.zip')
  // A platform with no published build must say so rather than guess a name.
  assert.equal(assetName('freebsd', 'x64'), undefined)
  assert.equal(assetName('darwin', 'ia32'), undefined)
})

test('isNewer orders versions, including the ones a tag would lose a zero on', () => {
  assert.equal(isNewer('0.1.8', '0.1.7'), true)
  assert.equal(isNewer('0.1.7', '0.1.8'), false)
  assert.equal(isNewer('0.1.7', '0.1.7'), false)
  assert.equal(isNewer('0.2.0', '0.10.0'), false)
  assert.equal(isNewer('0.10.0', '0.9.9'), true)
  assert.equal(isNewer('1.0.0', '0.99.99'), true)
  assert.equal(isNewer('0.1.8-rc.1', '0.1.7'), true)
})

const sumsFor = (name: string, body: Buffer) =>
  `${createHash('sha256').update(body).digest('hex')}  ${name}\n`

test('a checksum from the release is checked, and a mismatch stops the update', () => {
  const archive = Buffer.from('pretend this is a tarball')
  const name = 'ccompactor-darwin-arm64.tar.gz'

  assert.equal(verifyChecksum(archive, sumsFor(name, archive), name), 'verified')

  // Any other archive under this name is discarded rather than executed.
  assert.throws(
    () => verifyChecksum(Buffer.from('something else'), sumsFor(name, archive), name),
    /checksum mismatch/,
  )
})

test('a release that published no checksum says so instead of failing', () => {
  // Releases up to 0.1.7 have no SHA256SUMS. Refusing them would strand the
  // users who most need to update, so the absence is reported, not raised.
  const archive = Buffer.from('an older release')
  const name = 'ccompactor-linux-x64.tar.gz'
  assert.equal(verifyChecksum(archive, '', name), 'unpublished')
  assert.equal(verifyChecksum(archive, 'abc  some-other-file.tar.gz\n', name), 'unpublished')
})

test('extract and replaceSelf move a real archive into place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccompactor-update-test-'))
  try {
    // Build the same shape the release ships: a binary and a VERSION file.
    const stage = path.join(dir, 'stage')
    fs.mkdirSync(stage)
    const binary = path.join(stage, 'ccompactor-darwin-arm64')
    fs.writeFileSync(binary, '#!/bin/sh\necho updated\n')
    fs.chmodSync(binary, 0o755)
    fs.writeFileSync(path.join(stage, 'VERSION'), '9.9.9\n')
    const tarball = path.join(dir, 'ccompactor-darwin-arm64.tar.gz')
    execFileSync('tar', ['-czf', tarball, '-C', stage, 'ccompactor-darwin-arm64', 'VERSION'])

    const unpacked = path.join(dir, 'unpacked')
    fs.mkdirSync(unpacked)
    extract(tarball, unpacked)
    const found = fs.readdirSync(unpacked).find((n) => n.startsWith('ccompactor-'))
    assert.equal(found, 'ccompactor-darwin-arm64')

    const target = path.join(dir, 'ccompactor')
    fs.writeFileSync(target, 'old binary')
    replaceSelf(target, fs.readFileSync(path.join(unpacked, found!)))
    assert.equal(fs.readFileSync(target, 'utf8'), '#!/bin/sh\necho updated\n')
    // Staged files must not be left behind next to the binary.
    assert.deepEqual(
      fs.readdirSync(dir).filter((n) => n.startsWith('.ccompactor-new-')),
      [],
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
