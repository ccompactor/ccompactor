/**
 * The frame: top bar, sidebar, content, bottom bar.
 *
 * Geometry lives here rather than in the component because a click has to map
 * back to what was drawn, and that mapping is arithmetic. The TUI grew a
 * clickable bar earlier and the first version of it hit-tested the wrong row;
 * everything positional goes through this file so there is one place to be
 * wrong in.
 *
 * ```
 * row 1            │ ccompactor │ all  claude 353  codex 194 │ out: .ccompactor │
 * row 2 ┌ Menu     │ <content header>                                        │
 * row 3 │ Sessions │                                                         │
 * ...   │ …        │                                                         │
 * row N └──────────┴─────────────────────────────────────────────────────────┘
 * row N+1  NAV ←→ pane  ↑↓ move  ⏎ select  / filter  esc back   ACT e extract …
 * ```
 */

/** Columns the sidebar occupies, including its separator. */
export const SIDEBAR_WIDTH = 22

/** Terminal rows, 1-based, that a click is measured against. */
export const ROW_TOP = 1
export const ROW_MENU_HEADER = 2
export const SIDEBAR_TOP = 3

/** What the sidebar can show. Each maps to a real command. */
export type Page =
  | 'sessions'
  | 'artifacts'
  | 'doctor'
  | 'skill'
  | 'update'
  | 'settings'
  | 'exit'

export interface MenuItem {
  id: Page
  label: string
  /** One line, shown beside the label when the sidebar is wide enough. */
  hint: string
}

/**
 * The sidebar, in order.
 *
 * Every entry is something `ccompactor` can actually do from the command line —
 * the sidebar is an index of the tool, not a decoration. `Sessions` is first
 * because finding a session is what people open this for.
 */
export const MENU: MenuItem[] = [
  { id: 'sessions', label: 'Sessions', hint: 'every agent store' },
  { id: 'artifacts', label: 'Artifacts', hint: 'verify what was written' },
  { id: 'doctor', label: 'Doctor', hint: 'stores, backends, installs' },
  { id: 'skill', label: 'Skill', hint: 'teach other agents' },
  { id: 'update', label: 'Update', hint: 'newest release' },
  { id: 'settings', label: 'Settings', hint: 'where things go' },
  { id: 'exit', label: 'Exit', hint: 'leave' },
]

export function menuIndex(page: Page): number {
  const index = MENU.findIndex((item) => item.id === page)
  return index === -1 ? 0 : index
}

/** One clickable cell of a bar. */
export interface Cell {
  id: string
  text: string
  /** 0-based columns, inclusive. */
  start: number
  end: number
}

export function measure(cells: string[]): number {
  return cells.reduce((n, c) => n + c.length, 0) + Math.max(0, cells.length - 1)
}

/**
 * Lay cells out on one row and remember where each one landed.
 *
 * The rendering and the hit-testing both read this result rather than each
 * computing its own idea of the columns.
 */
export function layoutCells(
  cells: Array<{ id: string; text: string }>,
  columns: number,
): Cell[] {
  let chosen = cells
  if (measure(chosen.map((c) => c.text)) > columns) {
    chosen = chosen.slice()
    while (chosen.length > 1 && measure(chosen.map((c) => c.text)) > columns) chosen.pop()
  }
  const spans: Cell[] = []
  let at = 0
  chosen.forEach((cell, i) => {
    if (i > 0) at += 1
    spans.push({ id: cell.id, text: cell.text, start: at, end: at + cell.text.length - 1 })
    at += cell.text.length
  })
  return spans
}

/** Is a 1-based terminal column inside a cell? */
export function inCell(cell: Cell, x: number): boolean {
  return x - 1 >= cell.start && x - 1 <= cell.end
}

/** One entry of the top bar's agent tabs. */
export interface AgentTab {
  /** `all`, or the agent kind. */
  id: string
  count: number
}

/**
 * The agent tabs.
 *
 * This is the top bar's whole job: which agents were detected on this machine,
 * and how many sessions each has. `all` is first so clearing a filter is one
 * click from anywhere.
 */
export function tabCells(agents: Array<[string, number]>, active: string | undefined, columns: number): Cell[] {
  const total = agents.reduce((n, [, count]) => n + count, 0)
  const cells = [
    { id: 'agent:all', text: ` all ${total} ` },
    ...agents.map(([agent, count]) => ({ id: `agent:${agent}`, text: ` ${agent} ${count} ` })),
  ]
  void active
  return layoutCells(cells, columns)
}

/** A laid-out bottom bar: one row of cells, with the groups tagged. */
export interface BottomBar {
  /** The terminal row the bar is drawn on, so a click can be placed. */
  row: number
  /** Every cell of the row, in draw order, with absolute columns. */
  cells: Cell[]
  navWidth: number
}

/**
 * The bottom bar, split the way the reference splits it: keys that move you
 * around on the left, keys that do something on the right.
 *
 * The split is the point. One flat list of shortcuts does not tell a reader
 * which of them are navigation and which will write a file.
 *
 * The row is laid out as a single sequence so the cells carry absolute columns —
 * the right-hand group is pushed over with a spacer cell rather than positioned
 * with a margin, because a margin is not something a click can be measured
 * against.
 */
export function bottomBar(
  navButtons: Array<{ key: string; label: string; id: string }>,
  actButtons: Array<{ key: string; label: string; id: string }>,
  columns: number,
  rows: number,
): BottomBar {
  const nav = [
    { id: 'navlabel', text: ' NAV ' },
    ...navButtons.map((b) => ({ id: `nav:${b.id}`, text: ` ${b.key} ${b.label} ` })),
  ]
  const act = [
    { id: 'actlabel', text: ' ACT ' },
    ...actButtons.map((b) => ({ id: `act:${b.id}`, text: ` ${b.key} ${b.label} ` })),
  ]
  let navWidth = measure(nav.map((c) => c.text))
  let actWidth = measure(act.map((c) => c.text))
  let shownNav = nav
  let shownAct = act

  /** The action group with its keys and no captions. */
  const keyOnly = (): Array<{ id: string; text: string }> => [
    act[0]!,
    ...actButtons.map((b) => ({ id: `act:${b.id}`, text: ` ${b.key} ` })),
  ]

  // A narrow terminal gives up captions before it gives up buttons. Dropping an
  // action entirely is the one outcome worth avoiding: a key with no label is
  // still a key, and it is still on the bar to be clicked.
  if (columns > 0 && navWidth + actWidth + 1 > columns) {
    shownAct = keyOnly()
    actWidth = measure(shownAct.map((c) => c.text))
  }
  // Then navigation gives way, because the actions are the half a reader cannot
  // guess.
  while (columns > 0 && navWidth + actWidth + 1 > columns && shownNav.length > 1) {
    shownNav = shownNav.slice(0, -1)
    navWidth = measure(shownNav.map((c) => c.text))
  }
  while (columns > 0 && navWidth + actWidth + 1 > columns && shownAct.length > 1) {
    shownAct = shownAct.slice(0, -1)
    actWidth = measure(shownAct.map((c) => c.text))
  }
  // Two joins: one between the nav group and the spacer, one between the spacer
  // and the action group. Budgeting only the cells left the row two columns too
  // wide, so `layoutCells` trimmed from the end and silently dropped the last
  // action button off a 120-column terminal.
  const pad = Math.max(1, columns - navWidth - actWidth - 2)
  const cells = layoutCells(
    [...shownNav, { id: 'spacer', text: ' '.repeat(pad) }, ...shownAct],
    Math.max(columns, navWidth + actWidth + 1),
  )
  return { row: rows, cells, navWidth }
}

/** The rows the content pane may draw on. */
export function contentRows(rows: number): number {
  // Everything between the top bar and the bottom bar, minus the content header.
  return Math.max(1, rows - ROW_TOP - 1 - 1)
}

/** Where the content pane starts, in columns. */
export function contentLeft(): number {
  return SIDEBAR_WIDTH + 1
}
