/**
 * The deterministic artifact is a contract: for a fixed transcript it must be
 * byte-identical run to run, or `verify` cannot mean anything and a diff of two
 * artifacts cannot be trusted. This is the smallest test that fails if any of
 * the ordering, sorting or rendering stops being stable.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClaudeAdapter } from '../src/adapters/claude.js'
import { buildLedgers } from '../src/ledgers/index.js'
import { extractConstraints } from '../src/triage.js'
import { render } from '../src/artifact/render.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, '..', '..', 'tests', 'fixtures', 'claude-basic.jsonl')

async function build(): Promise<string> {
  const adapter = new ClaudeAdapter()
  const ir = await adapter.read({ agent: 'claude', id: 'fixture-1', path: fixture, mtime: 0 })
  const ledgers = buildLedgers(ir)
  const constraints = extractConstraints(ir)
  return render({ ir, ledgers, constraints, engine: 'deterministic' }).markdown
}

test('the deterministic artifact is stable and carries the facts', async () => {
  const first = await build()
  const second = await build()
  assert.equal(first, second, 'a deterministic artifact changed between two runs')

  // The things a handoff exists to carry.
  assert.ok(first.includes('Implement the manifest loader'), 'no goal')
  assert.ok(first.includes('Never auto-install extensions'), 'no constraint')
  assert.ok(first.includes('registry.ts'), 'no file ledger')
  assert.ok(first.includes('Expected 5 trust tiers'), 'no error ledger')
  assert.ok(first.includes('evt '), 'no provenance pointer')
})

test('the rendered artifact never contains a secret', async () => {
  const adapter = new ClaudeAdapter()
  const { mkdtemp, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(join(tmpdir(), 'ccompactor-golden-'))
  const path = join(dir, 'secret.jsonl')
  const raw = await readFile(fixture, 'utf8')
  await writeFile(
    path,
    `${raw}\n${JSON.stringify({
      type: 'user',
      uuid: 'u9',
      parentUuid: 'r3',
      message: { role: 'user', content: 'here is the key sk-ant-api03-abcdefghijklmnopqrstuvwxyz do not lose it' },
    })}\n`,
    'utf8',
  )
  const ir = await adapter.read({ agent: 'claude', id: 'x', path, mtime: 0 })
  const rendered = render({
    ir,
    ledgers: buildLedgers(ir),
    constraints: extractConstraints(ir),
    engine: 'deterministic',
  }).markdown
  const { redact } = await import('../src/redact.js')
  assert.ok(!redact(rendered).text.includes('sk-ant-api03'), 'a key reached the artifact')
})
