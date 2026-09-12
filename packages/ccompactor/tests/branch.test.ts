/**
 * Branch resolution is the one place where a small mistake silently discards
 * most of a session, so it gets the regression tests.
 *
 * The bug these encode: the first implementation walked `parentUuid` from the
 * newest record and stopped at the compaction boundary, because Claude Code
 * starts a fresh parent chain there. On a real 103,757-event session that
 * returned 853 events and 7 user turns instead of 25,000 and 339 — an artifact
 * that looked complete and described one afternoon of a ten-day session.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeAdapter } from '../src/adapters/claude.js'

async function transcript(records: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ccompactor-'))
  const path = join(dir, 'session.jsonl')
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return path
}

function user(uuid: string, parentUuid: string | null, text: string) {
  return { type: 'user', uuid, parentUuid, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: text } }
}
function assistant(uuid: string, parentUuid: string | null, text: string) {
  return { type: 'assistant', uuid, parentUuid, message: { role: 'assistant', content: [{ type: 'text', text }] } }
}

async function read(path: string) {
  const adapter = new ClaudeAdapter()
  return adapter.read({ agent: 'claude', id: 'test', path, mtime: 0 })
}

test('a compaction boundary does not discard everything before it', async () => {
  // Segment one, then a null-parent boundary, then segment two — the shape the
  // provider writes when it compacts its own context.
  const path = await transcript([
    user('u1', null, 'first ask'),
    assistant('a1', 'u1', 'working'),
    user('u2', 'a1', 'second ask'),
    { type: 'system', uuid: 's1', parentUuid: null, message: { role: 'system', content: 'compacted' } },
    user('u3', null, 'This session is being continued from a previous conversation'),
    assistant('a3', 'u3', 'resuming'),
    user('u4', 'a3', 'third ask'),
  ])
  const ir = await read(path)
  const turns = ir.messages.filter((m) => m.isHumanTurn).map((m) => m.text)
  assert.deepEqual(turns, [
    'first ask',
    'second ask',
    'This session is being continued from a previous conversation',
    'third ask',
  ])
})

test('an abandoned branch stays out of the handoff', async () => {
  // The human rewinds to a1 and takes a different path. Work done on the
  // abandoned path must not reach a successor as though it were the plan.
  const path = await transcript([
    user('u1', null, 'do the thing'),
    assistant('a1', 'u1', 'starting'),
    user('u2', 'a1', 'ABANDONED path'),
    assistant('a2', 'u2', 'abandoned work'),
    user('u3', 'a1', 'the path actually taken'),
    assistant('a3', 'u3', 'real work'),
  ])
  const ir = await read(path)
  const texts = ir.messages.map((m) => m.text ?? '').join('|')
  assert.ok(texts.includes('the path actually taken'))
  assert.ok(!texts.includes('ABANDONED'), `abandoned branch leaked: ${texts}`)
  assert.ok(!texts.includes('abandoned work'))
})

test('a malformed final line is a diagnostic, not a lost session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccompactor-'))
  const path = join(dir, 'session.jsonl')
  await writeFile(
    path,
    `${JSON.stringify(user('u1', null, 'hello'))}\n{"broken":\n`,
    'utf8',
  )
  const ir = await read(path)
  assert.equal(ir.messages.filter((m) => m.isHumanTurn).length, 1)
  assert.equal(ir.diagnostics.length, 1)
})

test('harness-injected user turns are not treated as intent', async () => {
  const path = await transcript([
    { type: 'user', uuid: 'u1', parentUuid: null, message: { role: 'user', content: '<command-name>/compact</command-name>' } },
    user('u2', 'u1', 'the actual ask'),
  ])
  const ir = await read(path)
  const turns = ir.messages.filter((m) => m.isHumanTurn)
  assert.equal(turns.length, 1)
  assert.equal(turns[0]!.text, 'the actual ask')
})
