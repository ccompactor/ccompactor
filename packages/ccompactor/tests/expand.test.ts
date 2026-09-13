import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expand, expandRange, parseRange } from '../src/artifact/expand.js'
import type { IRMessage, SessionIR } from '../src/ir/types.js'

function ir(messages: Array<Partial<IRMessage>>): SessionIR {
  return {
    ref: { agent: 'claude', id: 't', path: '/does/not/exist.jsonl', mtime: 0 },
    messages: messages.map((m, i) => ({
      uuid: `u${i}`,
      role: 'user',
      text: `message ${i}`,
      isHumanTurn: false,
      eventIndex: i,
      ...m,
    })) as IRMessage[],
    compactBoundaries: [],
    metadata: {},
    diagnostics: [],
  }
}

test('a range resolves to the events behind it', async () => {
  const ranges = await expandRange(ir([{}, {}, {}, {}, {}]), [[1, 3]])
  assert.equal(ranges.length, 1)
  const range = ranges[0]!
  assert.equal(range.from, 1)
  assert.equal(range.to, 3)
  assert.equal(range.events.length, 3, 'evt 1, 2 and 3')
  assert.ok(range.tokens > 0)
})

test('--context widens the range that is actually covered', async () => {
  const ranges = await expandRange(ir([{}, {}, {}, {}, {}]), [[2, 2]], { context: 1 })
  assert.equal(ranges[0]!.from, 2, 'the pointer is what was asked for')
  assert.equal(ranges[0]!.start, 1, 'the coverage is what was returned')
  assert.equal(ranges[0]!.end, 3)
  assert.equal(ranges[0]!.events.length, 3)
})

test('the structure carries the events, so --json is not null', async () => {
  // `ccompactor --json expand` printed `null` until this existed: the expansion
  // produced a rendered string and nothing else, so there was no value to emit.
  const ranges = await expandRange(ir([{}, {}, {}]), [[0, 2]])
  assert.ok(Array.isArray(ranges[0]!.events))
  assert.match(ranges[0]!.events[0]!, /^evt 0 /)
  // And the text form renders from the same structure, so they cannot disagree.
  const text = await expand(ir([{}, {}, {}]), [[0, 2]])
  for (const event of ranges[0]!.events) assert.ok(text.includes(event))
})

test('a page is reported so a caller knows there are more', async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ text: `line ${i} ${'x'.repeat(400)}` }))
  const ranges = await expandRange(ir(many), [[0, 39]], { page: { index: 2, tokens: 1000 } })
  const page = ranges[0]!.page
  assert.ok(page, 'the caller asked for a page, so it gets one')
  assert.equal(page!.index, 2)
  assert.ok(page!.of! > 2, 'the range needs more than two pages')
  assert.ok(ranges[0]!.events.length > 0)
})

test('a range with nothing in it says so rather than lying', async () => {
  const ranges = await expandRange(ir([{}]), [[500, 505]])
  assert.deepEqual(ranges[0]!.events, [])
  const text = await expand(ir([{}]), [[500, 505]])
  assert.match(text, /no events in this range/)
})

test('parseRange reads the pointer shapes an artifact writes', () => {
  assert.deepEqual(parseRange('4122..4381'), [4122, 4381])
  assert.deepEqual(parseRange('10..10'), [10, 10])
})
