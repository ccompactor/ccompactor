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
import { barCells, inSpan, layoutCells } from '../src/tui/bar.js'

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

// ---- the clickable top bar -------------------------------------------------

test('a cell is hit only at the columns it was drawn on', () => {
  const buttons = [
    { id: 'search', key: '/', label: 'search', run: () => {} },
    { id: 'all', key: '0', label: 'all agents', run: () => {} },
    { id: 'open', key: '↵', label: 'quick look', run: () => {} },
  ]
  const spans = barCells(buttons, 200)
  assert.deepEqual(
    spans.map((s) => s.text),
    ['[/ search]', '[0 all agents]', '[↵ quick look]'],
  )
  // `[/ search]` is columns 1-10, the gap is 11, `[0 all agents]` is 12-26.
  assert.equal(inSpan(spans[0]!, 1), true, 'the opening bracket is inside')
  assert.equal(inSpan(spans[0]!, 10), true, 'the closing bracket is inside')
  assert.equal(inSpan(spans[0]!, 11), false, 'the gap between buttons is not')
  assert.equal(inSpan(spans[1]!, 12), true)
  assert.equal(inSpan(spans[1]!, 11), false)
})

test('a click on a chip does not fall through to the button below it', () => {
  // The bug this covers: hit-testing every row's spans and taking the first
  // match sent a click on the `claude` chip at column 38 to `[↵ quick look]`,
  // which covers the same columns one row down, so filtering by agent opened
  // the preview instead. Rows own their spans.
  const chips = layoutCells(
    [
      { id: 'title', text: ' ccompactor ' },
      { id: 'count', text: '  720 of 720  ' },
      { id: 'agent:all', text: ' all ' },
      { id: 'agent:claude', text: ' claude 352 ' },
    ],
    200,
  )
  const bar = barCells(
    [
      { id: 'search', key: '/', label: 'search', run: () => {} },
      { id: 'all', key: '0', label: 'all agents', run: () => {} },
      { id: 'open', key: '↵', label: 'quick look', run: () => {} },
    ],
    200,
  )
  const chip = chips.find((c) => c.id.startsWith('agent:') && inSpan(c, 38))
  const button = bar.find((b) => inSpan(b, 38))
  assert.equal(chip?.id, 'agent:claude', 'column 38 is the claude chip on its own row')
  assert.ok(button, 'and a different button on the bar row — which is why row matters')
})

test('a narrow terminal shortens the buttons before it drops them', () => {
  const buttons = [
    { id: 'search', key: '/', label: 'search', run: () => {} },
    { id: 'all', key: '0', label: 'all agents', run: () => {} },
    { id: 'quit', key: 'q', label: 'quit', run: () => {} },
  ]
  const wide = barCells(buttons, 120)
  assert.deepEqual(wide.map((s) => s.text), ['[/ search]', '[0 all agents]', '[q quit]'])
  // Too narrow for the captions, wide enough for the keys: every action is
  // still a target you can hit.
  const narrow = barCells(buttons, 12)
  assert.deepEqual(narrow.map((s) => s.text), ['[/]', '[0]', '[q]'])
  // Narrower than the keys themselves: drop cells rather than let Ink wrap them
  // onto a row the mouse is not measuring.
  const tiny = barCells(buttons, 6)
  assert.ok(tiny.length < 3)
  assert.equal(tiny[0]!.text, '[/]')
})

test('every button on every screen is a real target', () => {
  // A click is only useful if the thing drawn can be hit at the column it was
  // painted on, for the whole width of it.
  const buttons = [
    { id: 'run', key: '↵', label: 'run this', run: () => {} },
    { id: 'back', key: 'esc', label: 'back to the list', run: () => {} },
  ]
  for (const span of barCells(buttons, 200)) {
    for (let x = span.start + 1; x <= span.end + 1; x++) {
      assert.equal(inSpan(span, x), true, `${span.id} must be hit at column ${x}`)
    }
    assert.equal(inSpan(span, span.start), false, 'one column left of it is outside')
    assert.equal(inSpan(span, span.end + 2), false, 'one column right of it is outside')
  }
})
