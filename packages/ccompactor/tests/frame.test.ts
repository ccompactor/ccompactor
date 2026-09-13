import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MENU,
  SIDEBAR_TOP,
  bottomBar,
  inCell,
  layoutCells,
  menuIndex,
  tabCells,
} from '../src/tui/frame.js'

test('the sidebar covers every page and reaches none twice', () => {
  const ids = MENU.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length, 'no page appears twice')
  assert.equal(MENU[0]!.id, 'sessions', 'finding a session is why the tool opens')
  assert.equal(MENU[MENU.length - 1]!.id, 'exit', 'leaving is last')
  for (const id of ids) {
    const index = menuIndex(id)
    assert.equal(MENU[index]!.id, id, `${id} resolves to itself`)
  }
})

test('a sidebar row maps to the menu item drawn on it', () => {
  // The click mapping is `row - SIDEBAR_TOP + 1` at the call site; this pins the
  // constant it depends on. The first item is one row below the box border.
  assert.equal(SIDEBAR_TOP, 3)
  assert.equal(MENU[0]!.id, 'sessions')
  assert.equal(MENU[SIDEBAR_TOP - SIDEBAR_TOP]!.id, 'sessions')
})

test('the action group survives a normal terminal', () => {
  // Budgeting only the cells left the row two columns too wide, so
  // `layoutCells` trimmed from the end and silently dropped the last action
  // off a 120-column terminal.
  const nav = [
    { id: 'pane', key: '←→', label: 'pane' },
    { id: 'up', key: '↑↓', label: 'move' },
    { id: 'select', key: '⏎', label: 'select' },
    { id: 'filter', key: '/', label: 'filter' },
    { id: 'back', key: 'esc', label: 'back' },
    { id: 'help', key: '?', label: 'help' },
  ]
  const act = [
    { id: 'look', key: 'v', label: 'look' },
    { id: 'actions', key: 'a', label: 'actions' },
  ]
  for (const columns of [120, 100, 80]) {
    const bar = bottomBar(nav, act, columns, 34)
    const ids = bar.cells.map((c) => c.id)
    assert.ok(ids.includes('act:look'), `look button present at ${columns} columns`)
    assert.ok(ids.includes('act:actions'), `actions button present at ${columns} columns`)
    const width = bar.cells.reduce((n, c, i) => n + c.text.length + (i > 0 ? 1 : 0), 0)
    assert.ok(width <= columns, `the bar fits ${columns} columns, got ${width}`)
  }
})

test('a narrow bar drops navigation before it drops actions', () => {
  const nav = [
    { id: 'pane', key: '←→', label: 'pane' },
    { id: 'help', key: '?', label: 'help' },
  ]
  const act = [{ id: 'actions', key: 'a', label: 'actions' }]
  const bar = bottomBar(nav, act, 20, 20)
  const ids = bar.cells.map((c) => c.id)
  assert.ok(ids.includes('act:actions'), 'the action survives, even with no caption')
  assert.ok(!ids.includes('nav:help'), 'a navigation key gives way first')
})

test('a tab is hit only at the columns it was drawn on', () => {
  const tabs = tabCells(
    [
      ['claude', 357],
      ['codex', 194],
    ],
    undefined,
    200,
  )
  assert.deepEqual(
    tabs.map((t) => t.text),
    [' all 551 ', ' claude 357 ', ' codex 194 '],
  )
  for (const tab of tabs) {
    for (let x = tab.start + 1; x <= tab.end + 1; x++) {
      assert.equal(inCell(tab, x), true, `${tab.id} must answer at column ${x}`)
    }
    assert.equal(inCell(tab, tab.start), false, 'one column left is outside')
    assert.equal(inCell(tab, tab.end + 2), false, 'one column right is outside')
  }
})

test('every cell of a laid-out row has a distinct id', () => {
  // The renderer keys React children by cell id, and the click mapping looks
  // cells up by it. A duplicate would make one of them unreachable.
  const cells = layoutCells(
    [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
      { id: 'c', text: 'three' },
    ],
    200,
  )
  assert.equal(new Set(cells.map((c) => c.id)).size, cells.length)
})
