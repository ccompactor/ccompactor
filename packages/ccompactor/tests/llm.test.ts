import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSelection, selectionLabel } from '../src/llm/index.js'

test('the api: prefix the spec mandates is stripped before the model is read', () => {
  // Splitting on `/` first made the provider `api:compat`, so every run failed
  // with a message naming the prefix it had just failed to strip.
  process.env['CCOMPACTOR_BASE_URL'] = 'https://example.test'
  const selection = parseSelection('api:compat/deepseek-v4-flash')
  assert.equal(selection.kind, 'compat')
  assert.equal((selection as { model: string }).model, 'deepseek-v4-flash')
  assert.equal(selectionLabel(selection), 'api:compat/deepseek-v4-flash')
})

test('the other forms parse and reject clearly', () => {
  assert.equal(parseSelection('none').kind, 'none')
  assert.equal(parseSelection('api:anthropic').kind, 'anthropic')
  assert.equal(parseSelection('api:openai/gpt-4.1-mini').kind, 'openai')
  assert.throws(() => parseSelection('api:nonsense'), /unknown --llm provider/)
})
