#!/usr/bin/env node
// Refuse to publish a package that still contains vendored upstream code.
//
// The compaction core is vendored from openclaude for behavioural parity while
// the clean-room implementation is written. That code is derived from
// Anthropic's proprietary Claude Code CLI -- openclaude's own LICENSE says it
// has no authorization to distribute it -- so this package must never go to a
// registry while it is present. "Replace later" is only a plan if something
// makes the later mandatory; this is that something.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// Both places, because only one of them is what ships. The source directory is
// where the code is written; `dist/` is what `files` puts in the tarball, and a
// guard that checks only the first would happily publish the second.
const locations = [
  { dir: join(root, 'src', 'compact', 'vendor'), ext: '.ts' },
  { dir: join(root, 'dist', 'compact', 'vendor'), ext: '.js' },
]

const found = []
for (const { dir, ext } of locations) {
  const manifest = join(dir, 'MANIFEST.json')
  const declared = existsSync(manifest)
    ? JSON.parse(readFileSync(manifest, 'utf8')).modules
        .map((f) => f.replace(/\.ts$/, ext))
        .filter((f) => f.endsWith(ext))
    : existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(ext))
      : []
  for (const file of declared) found.push(join(dir, file).replace(`${root}/`, ''))
}

if (found.length > 0) {
  const files = found
  if (files.length > 0) {
    console.error(`
ccompactor: refusing to publish.

  ${files.length} vendored file(s) are still present and would ship:
    ${files.join('\n    ')}

  That code is derived from Anthropic's proprietary Claude Code CLI via
  openclaude, whose LICENSE states it has no authorization to distribute it.

  The engine in src/compact/engine.ts is the clean-room implementation and is
  what actually runs. Delete the vendored files before publishing. See NOTICE.
`)
    process.exit(1)
  }
}

console.log('ccompactor: no vendored upstream code present; safe to publish.')
