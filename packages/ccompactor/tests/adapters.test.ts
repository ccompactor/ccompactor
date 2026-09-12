/**
 * Adapter tests against synthetic transcripts written in each provider's real
 * shape. The shapes were taken from live stores, not from documentation, because
 * the Pi format in particular is not documented and the first attempt at it
 * parsed nothing at all while reporting success.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodexAdapter } from '../src/adapters/codex.js'
import { PiAdapter } from '../src/adapters/pi.js'
import { buildLedgers } from '../src/ledgers/index.js'

async function write(records: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ccompactor-'))
  const path = join(dir, 'session.jsonl')
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return path
}

test('codex: the human message is counted once, not twice', async () => {
  // Codex records the same turn as an `event_msg` and again as a `response_item`
  // message. Reading both double-counts every request in the session.
  const path = await write([
    { type: 'session_meta', payload: { cwd: '/repo', id: 'abc', git: { branch: 'main' } } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'fix the parser' } },
    {
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fix the parser' }] },
    },
    {
      type: 'response_item',
      payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"command":"pnpm test"}' },
    },
    {
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'c1', output: 'exit code 1\nboom' },
    },
  ])
  const ir = await new CodexAdapter().read({ agent: 'codex', id: 'abc', path, mtime: 0 })
  assert.equal(ir.messages.filter((m) => m.isHumanTurn).length, 1)
  assert.equal(ir.metadata['cwd'], '/repo')
  assert.equal(ir.metadata['branch'], 'main')

  const ledgers = buildLedgers(ir)
  assert.equal(ledgers.commands.length, 1)
  assert.equal(ledgers.commands[0]!.command, 'pnpm test')
  assert.equal(ledgers.commands[0]!.failed, true)
})

test('pi: harness-injected context is not intent', async () => {
  const path = await write([
    { type: 'session', version: 3, id: 's1', cwd: '/repo' },
    { type: 'model_change', id: 'm1', parentId: null, provider: 'openai-codex', modelId: 'gpt-5.6' },
    { type: 'custom_message', customType: 'techpulse-session-context', content: 'Fresh TechPulse context: stories[5]' },
    {
      type: 'message',
      id: 'p1',
      parentId: 'm1',
      message: { role: 'user', content: [{ type: 'text', text: 'what changed?' }] },
    },
    {
      type: 'message',
      id: 'p2',
      parentId: 'p1',
      message: {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'read',
        content: [{ type: 'text', text: '---\\nname: using-superpowers' }],
      },
    },
    {
      type: 'message',
      id: 'p3',
      parentId: 'p2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'the parser changed' }] },
    },
  ])
  const ir = await new PiAdapter().read({ agent: 'pi', id: 's1', path, mtime: 0 })
  const turns = ir.messages.filter((m) => m.isHumanTurn)
  assert.equal(turns.length, 1, 'only the typed turn is intent')
  assert.equal(turns[0]!.text, 'what changed?')
  assert.equal(ir.messages.filter((m) => m.role === 'attachment').length, 1)
  assert.equal(ir.metadata['model'], 'gpt-5.6')
  assert.equal(ir.metadata['piUnknownRecords'], 0)
})

test('pi: an unknown record type is counted, not silently dropped', async () => {
  const path = await write([
    { type: 'session', id: 's1', cwd: '/repo' },
    { type: 'something_new', id: 'x1' },
    { type: 'message', id: 'p1', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
  ])
  const ir = await new PiAdapter().read({ agent: 'pi', id: 's1', path, mtime: 0 })
  assert.equal(ir.metadata['piUnknownRecords'], 1)
  assert.ok(ir.diagnostics.some((d) => d.message.includes('no known Pi shape')))
})
