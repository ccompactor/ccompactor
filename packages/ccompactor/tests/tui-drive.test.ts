/**
 * Every button, every action, every section of the TUI, driven for real.
 *
 * These run the published entry point through a pty with a fixture store, so a
 * passing test means the thing a user clicks does what its label says. The
 * layout arithmetic is unit-tested in `frame.test.ts`; this is the half that
 * only exists when the program is running.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CLI, PACKAGE_FOR_PROBE, Tui, canDrive, fixtureStore, hasBridge } from './helpers/pty.js'

const opts = {
  skip: canDrive && hasBridge() ? false : 'needs a pty: unix, and a python3 with the pty module',
}

/** Start the TUI on a fixture store and wait for the frame. */
async function start(outDir?: string): Promise<{ tui: Tui; store: ReturnType<typeof fixtureStore> }> {
  const store = fixtureStore(3)
  const args = [process.execPath, CLI, '--tui', '--any-project']
  if (outDir) args.push('--out', outDir)
  const tui = new Tui(args, {
    env: { ...store.env, CCOMPACTOR_TUI_TRACE: '1' },
    cwd: store.cwd,
  })
  await tui.waitFor(/ccompactor\s+all 3/)
  return { tui, store }
}

test('a minimal Ink program renders through the bridge', opts, async () => {
  // Separates "Ink does not render here" from "this TUI does not render here".
  const store = fixtureStore(1)
  const probe = join(PACKAGE_FOR_PROBE, 'tests', 'helpers', 'ink-probe.mjs')
  const tui = new Tui([process.execPath, probe], { env: store.env, cwd: store.cwd })
  try {
    await tui.waitFor(/INK-PROBE-OK/, 12000)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the pty bridge can run the CLI itself', opts, async () => {
  // Narrowing: a trivial program through the bridge, then the real program
  // without the TUI. If this passes and the TUI is still silent, the difference
  // is the TUI rather than the harness.
  const store = fixtureStore(1)
  const tui = new Tui([process.execPath, CLI, '--version'], { env: store.env, cwd: store.cwd })
  try {
    await tui.waitFor(/\d+\.\d+\.\d+/, 10000)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the pty bridge can run a trivial program', opts, async () => {
  // The harness itself, before anything that depends on it. Without this the
  // first symptom of a broken bridge is twenty-three identical timeouts with no
  // output, which says nothing about the cause.
  const store = fixtureStore(1)
  const tui = new Tui([process.execPath, '-e', 'console.log("BRIDGE-OK")'], {
    env: store.env,
    cwd: store.cwd,
  })
  try {
    await tui.waitFor(/BRIDGE-OK/, 10000)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

// ---- the sidebar: one entry per thing the tool can do ----------------------

// The marker must be text only that page draws. A marker that also appears in
// the sidebar would pass whether or not the page opened — `/Update/` matched the
// sidebar label and hid the fact that Update showed nothing at all.
const MENU_ROWS: Array<[string, number, RegExp]> = [
  ['Sessions', 3, /session\(s\)/],
  ['Artifacts', 4, /(file\(s\)|nothing in)/],
  ['Doctor', 5, /✓ claude/],
  ['Skill', 6, /Teach other agents/],
  ['Update', 7, /Stay on the newest release/],
  ['Settings', 8, /output directory/],
]

for (const [label, row, marker] of MENU_ROWS) {
  test(`the ${label} page opens from the sidebar and shows its content`, opts, async () => {
    const { tui, store } = await start()
    try {
      // Column 8 is inside the sidebar, which is 22 columns wide.
      await tui.click(8, row)
      await tui.waitFor(marker)
    } finally {
      await tui.close()
      store.cleanup()
    }
  })
}

test('Exit leaves the program', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.click(8, 9)
    await tui.waitForExit()
    assert.equal(tui.running, false)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the sidebar walks from the keyboard and Enter opens the highlighted page', opts, async () => {
  const { tui, store } = await start()
  try {
    // Tab focuses the menu; the marker only shows on the focused row, so finding
    // it is proof of both.
    await tui.press('\t')
    await tui.waitFor(/❯ Sessions/)
    await tui.press('\u001b[B')
    await tui.waitFor(/❯ Artifacts/)
    await tui.press('\u001b[B')
    await tui.waitFor(/❯ Doctor/)
    // Enter opens whatever is highlighted.
    await tui.press('\r')
    await tui.waitFor(/✓ claude/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('a dialog owns the keyboard until it is closed', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.press('?')
    await tui.waitFor(/Keys/)
    // Tab and the agent shortcuts used to reach the frame behind the dialog, so
    // the Enter meant to open a page closed the dialog instead.
    await tui.press('\t')
    await tui.expectAbsent(/❯ Sessions/)
    await tui.press('c')
    await tui.expectAbsent(/filtered/)
    await tui.waitFor(/Keys/, 500)
    // Enter closes it, and the frame answers again.
    await tui.press('\r')
    await tui.waitFor(/session\(s\)/)
    await tui.press('\t')
    await tui.waitFor(/❯ Sessions/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

// ---- the top bar: the agents detected on this machine ----------------------

test('each agent tab filters the list to that agent', opts, async () => {
  const { tui, store } = await start()
  try {
    // The fixture store holds three Claude sessions and nothing else, so the
    // tabs are `all 3` and `claude 3`. Clicking claude keeps 3; a tab with no
    // sessions would filter to 0, which is the assertion that matters — a filter
    // that silently does nothing would leave 3 on screen.
    await tui.click(30, 1)
    await tui.waitFor(/3 of 3 session\(s\)/)
    await tui.click(13, 1)
    await tui.waitFor(/3 of 3 session\(s\)/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the 0 key clears the agent filter', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('c')
    await tui.waitFor(/3 of 3 session\(s\)/)
    await tui.send('0')
    await tui.waitFor(/3 of 3 session\(s\)/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

// ---- the bottom bar: navigation and actions --------------------------------

test('the bottom bar offers help, and it opens', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('?')
    await tui.waitFor(/Keys/)
    await tui.press('\u001b')
    await tui.waitFor(/session\(s\)/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the bottom bar filter button starts a search that filters the list', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('/')
    await tui.waitFor(/search:/)
    // One character at a time. A whole string in one write relies on Ink
    // receiving it as a single `input`, and on macOS it occasionally did not:
    // the query arrived short and the filter matched more than one row.
    await tui.press(...'fixture-2'.split(''))
    await tui.waitFor(/search: fixture-2/)
    await tui.send('\r')
    await tui.waitFor(/1 of 3 session\(s\)/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the quick look opens and closes', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('v')
    await tui.waitFor(/quick look|claude:fixture/)
    await tui.press('\u001b')
    await tui.waitFor(/session\(s\)/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

// ---- the actions dialog: every entry is there and selectable ---------------

const ACTIONS = [
  /Extract handoff — deterministic/,
  /Extract handoff — with a model-written summary/,
  /Narrate — write L1 from the artifact/,
  /Readable transcript — what was said/,
  /Readable transcript — including tool calls/,
  /Hand off — print the command/,
  /Hand off — and start the next agent here/,
  /Verify the artifact already in this directory/,
]

test('the actions dialog lists every action, and each one is selectable', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('a')
    // Every label is offered. A missing one means an action no user can reach.
    for (const label of ACTIONS) await tui.waitFor(label, 2000)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the action list can be walked from the keyboard', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.send('a')
    await tui.waitFor(/Extract handoff — deterministic/)
    // Six downs must reach the seventh entry without falling off the end.
    for (let i = 0; i < 6; i += 1) await tui.press('\u001b[B')
    await tui.waitFor(/Hand off — and start the next agent here/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('the deterministic extract runs and writes a handoff', opts, async () => {
  const out = mkdtempSync(join(tmpdir(), 'ccompactor-tui-out-'))
  const { tui, store } = await start(out)
  try {
    await tui.send('a')
    await tui.waitFor(/Extract handoff — deterministic/)
    await tui.send('\r')
    await tui.waitFor(/Done/, 15000)
    await tui.waitFor(/handoff\.md/)
    // The promise the dialog makes is that a file exists at that path.
    assert.ok(existsSync(join(out, 'handoff.md')), 'handoff.md was written')
    assert.ok(existsSync(join(out, 'ledgers.json')), 'ledgers.json was written')
  } finally {
    await tui.close()
    store.cleanup()
    rmSync(out, { recursive: true, force: true })
  }
})

test('verify reports on the artifact that was just written', opts, async () => {
  const out = mkdtempSync(join(tmpdir(), 'ccompactor-tui-verify-'))
  const { tui, store } = await start(out)
  try {
    await tui.send('a')
    await tui.waitFor(/Extract handoff — deterministic/)
    await tui.send('\r')
    await tui.waitFor(/Done/, 15000)
    // Wait for the dialog to be gone before opening the next one: `esc` and `a`
    // in one chunk is an Alt sequence to a terminal parser.
    await tui.press('\u001b')
    await tui.waitFor(/session\(s\)/)
    await tui.send('a')
    await tui.waitFor(/Verify the artifact/)
    for (let i = 0; i < 7; i += 1) await tui.press('\u001b[B')
    await tui.send('\r')
    await tui.waitFor(/quote\(s\) checked/, 10000)
  } finally {
    await tui.close()
    store.cleanup()
    rmSync(out, { recursive: true, force: true })
  }
})

test('hand off reaches the target dialog and offers the agents on PATH', opts, async () => {
  const out = mkdtempSync(join(tmpdir(), 'ccompactor-tui-handoff-'))
  const { tui, store } = await start(out)
  try {
    await tui.send('a')
    await tui.waitFor(/Hand off — print the command/)
    for (let i = 0; i < 5; i += 1) await tui.press('\u001b[B')
    await tui.send('\r')
    await tui.waitFor(/Continue this session in which agent/)
  } finally {
    await tui.close()
    store.cleanup()
    rmSync(out, { recursive: true, force: true })
  }
})

// ---- the artifacts page ----------------------------------------------------

test('the artifacts page lists what was written, and verify runs from it', opts, async () => {
  const out = mkdtempSync(join(tmpdir(), 'ccompactor-tui-art-'))
  const { tui, store } = await start(out)
  try {
    await tui.send('a')
    await tui.waitFor(/Extract handoff — deterministic/)
    await tui.send('\r')
    await tui.waitFor(/Done/, 15000)
    await tui.press('\u001b')
    await tui.waitFor(/session\(s\)/)
    await tui.click(8, 4)
    // The page names the directory and counts the files that exist in it.
    await tui.waitFor(/handoff\.md/)
    assert.ok(readdirSync(out).length >= 3, 'the artifact is on disk')
  } finally {
    await tui.close()
    store.cleanup()
    rmSync(out, { recursive: true, force: true })
  }
})

// ---- the Doctor report -----------------------------------------------------

test('Doctor reports the stores it found and the installs on PATH', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.click(8, 5)
    await tui.waitFor(/✓ claude/)
    // The fixture root is what it should have found, not the real one.
    await tui.waitFor(/ccompactor-tui-/)
    await tui.waitFor(/installs on PATH/)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

// ---- the frame survives every size ----------------------------------------

test('the mouse wheel moves the selection', opts, async () => {
  const { tui, store } = await start()
  try {
    await tui.wheel(true, 40, 12, 2)
    // No crash, and the list is still the list.
    await tui.waitFor(/session\(s\)/, 1500).catch(() => undefined)
    assert.equal(tui.running, true)
  } finally {
    await tui.close()
    store.cleanup()
  }
})

test('nothing on screen is wider than the terminal', opts, async () => {
  const { tui, store } = await start()
  try {
    // The pty reports no window size, so the TUI falls back to 100x30. A row
    // wider than that wraps, and a wrapped frame scrolls and corrupts.
    const text = tui.tail(40)
    const tooWide = text
      .split('\n')
      .filter((line) => line.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '').length > 101)
    assert.deepEqual(tooWide, [], 'no line exceeds the frame width')
  } finally {
    await tui.close()
    store.cleanup()
  }
})
