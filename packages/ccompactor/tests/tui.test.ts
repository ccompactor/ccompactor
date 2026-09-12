/**
 * The pieces of the TUI that can be tested without a terminal.
 *
 * The screens themselves need a pty, and were checked by driving one. What is
 * testable here is the arithmetic that was wrong: the column layout, the mouse
 * parser, and the palette.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readMouse, enableMouse } from '../src/tui/mouse.js'
import { hazard, sizeLabel, THEME, width } from '../src/tui/theme.js'

test('a click and a wheel are both read out of one chunk', () => {
  const { events } = readMouse('\u001b[<0;12;5M\u001b[<64;12;5M\u001b[<65;12;5M')
  assert.equal(events.length, 3)
  assert.equal(events[0]!.kind, 'click')
  assert.equal(events[0]!.x, 12)
  assert.equal(events[0]!.y, 5)
  assert.equal(events[1]!.kind, 'wheel-up')
  assert.equal(events[2]!.kind, 'wheel-down')
})

test('a release carries nothing and keystrokes are left alone', () => {
  assert.equal(readMouse('\u001b[<0;3;4m').events.length, 0)
  assert.equal(readMouse('plain keystrokes').events.length, 0)
  const { rest } = readMouse('a\u001b[<0;1;2Mb')
  assert.equal(rest, 'ab', 'the sequence is removed and the rest survives')
})

test('the palette is the website palette', () => {
  assert.equal(THEME.yellow, '#FFD400')
  assert.equal(THEME.onYellow, '#0B0B0B')
})

test('a hazard stripe alternates and fills the width', () => {
  const stripe = hazard(60)
  assert.equal(stripe.length, width(60) - 2)
  assert.equal(stripe[0]!.ch, '▰')
  assert.equal(stripe[1]!.dim, true)
})

test('sizes read at a glance', () => {
  assert.equal(sizeLabel(512), '512 B')
  assert.equal(sizeLabel(2048), '2 KB')
  assert.equal(sizeLabel(259_800_000), '247.8 MB')
  assert.equal(sizeLabel(undefined), '—')
})

test('mouse reporting is switched on and off around the run', () => {
  const written: string[] = []
  const out = { write: (chunk: string) => { written.push(chunk); return true } } as never
  const stop = enableMouse(out)
  stop()
  assert.ok(written[0]!.includes('?1000h'), 'enabled')
  assert.ok(written[1]!.includes('?1000l'), 'disabled again')
})
