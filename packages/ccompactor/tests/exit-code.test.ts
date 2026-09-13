import { strict as assert } from 'node:assert'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))

/**
 * Commands document exit codes — `verify --strict` is specified as exit 7 — and
 * an action sets them with `process.exitCode`. `main()` used to `return 0` and
 * the entry point then called `process.exit(0)`, which discarded the lot, so
 * the codes were documentation rather than behaviour. This runs the real binary
 * because the bug lived in the wiring between the two, not in either half.
 */
test('an exit code set by a command survives the entry point', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccompactor-exit-'))
  try {
    const transcript = path.join(dir, 'session.jsonl')
    fs.writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: 'hello' })}\n`)
    fs.writeFileSync(
      path.join(dir, 'handoff.json'),
      JSON.stringify({
        session: { path: transcript },
        // A quote that is nowhere in the transcript above.
        constraints: [{ text: 'a rule that was never spoken', evt: 1 }],
        ledgers: { files: [] },
      }),
    )

    const strict = spawnSync(process.execPath, [CLI, 'verify', dir, '--strict'], {
      encoding: 'utf8',
    })
    assert.equal(strict.status, 7, `expected exit 7, got ${strict.status}`)

    // Without --strict the same missing quote is reported and not an error.
    const lenient = spawnSync(process.execPath, [CLI, 'verify', dir], { encoding: 'utf8' })
    assert.equal(lenient.status, 0, `expected exit 0, got ${lenient.status}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
