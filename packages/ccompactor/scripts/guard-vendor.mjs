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
const vendor = join(root, 'src', 'compact', 'vendor')

const manifest = join(vendor, 'MANIFEST.json')
const declared = existsSync(manifest)
  ? JSON.parse(readFileSync(manifest, 'utf8')).modules.filter((f) => f.endsWith('.ts'))
  : existsSync(vendor)
    ? readdirSync(vendor).filter((f) => f.endsWith('.ts'))
    : []

if (declared.length > 0) {
  const files = declared
  if (files.length > 0) {
    console.error(`
ccompactor: refusing to publish.

  src/compact/vendor/ still contains ${files.length} vendored file(s):
    ${files.join('\n    ')}

  That code is derived from Anthropic's proprietary Claude Code CLI via
  openclaude, whose LICENSE states it has no authorization to distribute it.

  Replace the vendored engine with the clean-room implementation
  (src/compact/engine.ts) before publishing. See NOTICE.
`)
    process.exit(1)
  }
}

console.log('ccompactor: no vendored upstream code present; safe to publish.')
