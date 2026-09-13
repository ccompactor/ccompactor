import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripNarrative, withNarrative } from '../src/compact/narrate.js'

const ARTIFACT = `---
schema: ccompactor.handoff/v1
---

# Handoff: something

## L0 · Brief

**Goal**: do the thing [evt 10]

## L1 · Continuation summary

> No model ran, so this is not a written summary.

## L2 · Ledgers (deterministic, no model)

### Files touched (3)
`

test('the narrative replaces the L1 stub and nothing else', () => {
  const out = withNarrative(ARTIFACT, 'The session did the thing.')
  assert.match(out, /## L1 · Continuation summary\n\nThe session did the thing\./)
  assert.doesNotMatch(out, /No model ran, so this is not a written summary/)
  // The sections either side survive: a splice that eats the brief or the
  // ledgers would be worse than no narrative.
  assert.match(out, /## L0 · Brief/)
  assert.match(out, /## L2 · Ledgers/)
  assert.match(out, /### Files touched \(3\)/)
  // And it stays idempotent: narrating twice must not stack summaries.
  const twice = withNarrative(out, 'Second narrative.')
  assert.doesNotMatch(twice, /The session did the thing\./)
  assert.match(twice, /Second narrative\./)
  assert.equal(twice.match(/## L1 · Continuation summary/g)?.length, 1)
})

test('an artifact with no L1 block gains one rather than losing the narrative', () => {
  const out = withNarrative('## L0 · Brief\n\nstuff\n', 'A narrative.')
  assert.match(out, /## L1 · Continuation summary\n\nA narrative\./)
  assert.match(out, /## L0 · Brief/)
})

test('an L1 block at the end of the file still gets replaced', () => {
  // `extract --format` variants can end the file on L1; a splice that only
  // looked for the following header would append a second summary instead.
  const out = withNarrative('## L0 · Brief\n\nstuff\n\n## L1 · Continuation summary\n\nold\n', 'new')
  assert.match(out, /new/)
  assert.doesNotMatch(out, /\nold\n/)
  assert.equal(out.match(/## L1 · Continuation summary/g)?.length, 1)
})

test('a previous narrative is not sent back to the narrator', () => {
  // Without this each run would cost more than the last — the input would be
  // the artifact plus the previous narrative — and the model would be reading
  // its own prose instead of the ledgers.
  const narrated = withNarrative(ARTIFACT, 'A LONG PREVIOUS NARRATIVE '.repeat(50))
  const stripped = stripNarrative(narrated)
  assert.doesNotMatch(stripped, /A LONG PREVIOUS NARRATIVE/)
  // The facts either side of it are what the narrator is there to read.
  assert.match(stripped, /## L0 · Brief/)
  assert.match(stripped, /## L2 · Ledgers/)
})

test('stripping is idempotent and leaves an L1 marker behind', () => {
  const once = stripNarrative(withNarrative(ARTIFACT, 'narrative'))
  const twice = stripNarrative(once)
  assert.equal(once, twice)
  assert.match(once, /## L1 · Continuation summary/)
})
