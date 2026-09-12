import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEME, hazard, sizeLabel, width } from '../src/tui/theme.js'

test('the palette is the website palette', () => {
  assert.equal(THEME.yellow, '#FFD400')
  assert.equal(THEME.onYellow, '#0B0B0B')
})

test('a hazard stripe alternates and fills the width', () => {
  const stripe = hazard(60)
  assert.equal(stripe.length, width(60) - 2)
  assert.equal(stripe[0]!.ch, '▰')
  assert.equal(stripe[1]!.ch, '▱')
  assert.equal(stripe[1]!.dim, true, 'every other block is dim')
})

test('sizes read at a glance', () => {
  assert.equal(sizeLabel(512), '512 B')
  assert.equal(sizeLabel(2048), '2 KB')
  assert.equal(sizeLabel(259_800_000), '247.8 MB')
  assert.equal(sizeLabel(undefined), '—')
})
