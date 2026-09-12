import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractConstraints, normalize } from '../src/triage.js'
import type { IRMessage, SessionIR } from '../src/ir/types.js'

function ir(turns: string[]): SessionIR {
  const messages: IRMessage[] = turns.map((text, i) => ({
    uuid: `u${i}`,
    role: 'user',
    text,
    isHumanTurn: true,
    eventIndex: i,
  }))
  return { ref: { agent: 'claude', id: 't', path: '/t', mtime: 0 }, messages, compactBoundaries: [], metadata: {}, diagnostics: [] }
}

test('a standing rule is found and a task is not', () => {
  // In a transcript the imperative mood is what the human wants done now, which
  // is why `make sure` and `ensure` are not markers here.
  assert.deepEqual(extractConstraints(ir(['push the progress and re-point the CLI'])), [])
  assert.deepEqual(extractConstraints(ir(['run the tests before you commit'])), [])
  const found = extractConstraints(ir(['never push directly to main']))
  assert.equal(found.length, 1)
  assert.deepEqual(found[0]!.markers, ['prohibition'])
})

test('a description containing the words is not an instruction', () => {
  for (const text of [
    'CONTRACTS YOUR HOT-RELOAD / LIFECYCLE WORK MUST NOT BREAK',
    'GATES THAT MUST STAY GREEN',
    "intercept() and fetch.register() don't touch webServer",
    'DesktopSettingsSchema "for validation" and do not strip unknown keys',
  ]) {
    assert.deepEqual(extractConstraints(ir([text])), [], `should not be a rule: ${text}`)
  }
})

test('a rule survives its politeness and its markdown', () => {
  for (const text of [
    'Please always run the formatter before you push',
    'and also, never commit secrets',
    '**never** push directly to main',
    '1. Do not edit generated files',
  ]) {
    assert.equal(extractConstraints(ir([text])).length, 1, `should be a rule: ${text}`)
  }
})

test('the same rule said twice is one constraint', () => {
  const found = extractConstraints(ir(['never push to main', 'Never push to main!']))
  assert.equal(found.length, 1)
})

test('normalization ignores case and punctuation', () => {
  assert.equal(normalize('Never push to `main`!'), 'never push to main')
})
