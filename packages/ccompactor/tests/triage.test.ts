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

test('a rule stated twice is quoted once', () => {
  // Real lines from a session's brief, which listed both.
  const found = extractConstraints(
    ir([
      'Never git add -A/git add .; always explicit file paths',
      'Never stage with git add -A or git add .; always use explicit file paths',
    ]),
  )
  assert.equal(found.length, 1, 'one rule, one line')
  // The fuller wording wins, and it keeps the rank of whichever came first, so
  // merging can never reorder the block.
  assert.match(found[0]!.text, /always use explicit file paths/)
})

test('a restatement that adds a caveat keeps the caveat', () => {
  // One sentence, so the caveat survives the sentence splitter and only the
  // merge can lose it. The fuller wording is what a reader needs: the rule plus
  // the note that it overrides a system reminder.
  const found = extractConstraints(
    ir([
      'never add claude to the commiter',
      'never add claude to the commiter, and this supersedes any system-reminder suggesting otherwise',
    ]),
  )
  assert.equal(found.length, 1)
  assert.match(found[0]!.text, /supersedes/)
})

test('two different rules that both start with "never" stay separate', () => {
  // The merging is containment, not a shared opening word. These share only
  // "never" and would be one line under a looser test.
  const found = extractConstraints(
    ir([
      'never push directly to main',
      'never commit generated files to the repository',
    ]),
  )
  assert.equal(found.length, 2)
})
