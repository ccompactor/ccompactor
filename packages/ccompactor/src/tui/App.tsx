/**
 * `ccompactor --tui`
 *
 * A frame with a top bar, a sidebar, a content pane and a bottom bar, and
 * modals over the top of it. The screens that need a decision are modals rather
 * than pages, so the thing you were looking at stays where it was.
 *
 * Nothing here is reachable only by a key. Every cell of the top bar, the
 * sidebar and the bottom bar is clickable, and the bottom bar prints the key on
 * the button so the shortcut is learned by using it.
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listSessions, fuzzyScore } from '../discover/index.js'
import { extractSession } from '../extract.js'
import { plan, installed, type Target } from '../handoff/index.js'
import { loadDetails, type SessionDetails } from './details.js'
import type { SessionRef } from '../ir/types.js'
import { THEME, sizeLabel } from './theme.js'
import { enableMouse, readMouse, type MouseEvent } from './mouse.js'
import {
  MENU,
  ROW_TOP,
  SIDEBAR_TOP,
  SIDEBAR_WIDTH,
  bottomBar,
  inCell,
  layoutCells,
  menuIndex,
  tabCells,
  type Cell,
  type Page,
} from './frame.js'

/** A dialog drawn over the frame. */
type Modal =
  | { kind: 'preview' }
  | { kind: 'actions' }
  | { kind: 'target' }
  | { kind: 'running' }
  | { kind: 'result' }
  | { kind: 'help' }
  | { kind: 'report'; title: string; lines: string[] }

interface Action {
  id: string
  label: string
  detail: string
}

interface Props {
  outDir: string
  anyProject: boolean
  onDone: (code: number) => void
}

/**
 * How large a transcript may be before the table stops reading it in the
 * background. Above this the row shows a size and a date, and the rest arrives
 * when the reader lands on it.
 */
const PREFILL_MAX_BYTES = 32 * 1024 * 1024

export function App({ outDir, anyProject, onDone }: Props): React.ReactElement {
  const { exit } = useApp()
  const { stdout } = useStdout()
  // Not `?? 100`: a pty with no window size reports 0, and 0 is not nullish, so
  // every layout decision saw a zero-width terminal and collapsed to nothing.
  const rawColumns = stdout?.columns
  const columns = rawColumns !== undefined && rawColumns >= 40 ? rawColumns : 100
  const rawRows = stdout?.rows
  const rows = rawRows !== undefined && rawRows >= 12 ? rawRows : 30

  const [sessions, setSessions] = useState<SessionRef[]>([])
  const [loading, setLoading] = useState('scanning agent stores …')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [agentsOff, setAgentsOff] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<Page>('sessions')
  const [menuCursor, setMenuCursor] = useState(0)
  const [focus, setFocus] = useState<'menu' | 'content'>('content')
  const [modal, setModal] = useState<Modal | undefined>()
  const [cache, setCache] = useState<Map<string, SessionDetails>>(new Map())
  const [previewScroll, setPreviewScroll] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [targetIndex, setTargetIndex] = useState(0)
  const [targets, setTargets] = useState<Target[]>([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<string[]>([])
  const [results, setResults] = useState<string[]>([])
  const [lastArtifact, setLastArtifact] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [report, setReport] = useState<{ title: string; lines: string[] } | undefined>()
  const [artifacts, setArtifacts] = useState<Array<{ name: string; size: number }>>([])
  const busy = useRef(false)

  // ---- loading ------------------------------------------------------------

  useEffect(() => {
    void (async () => {
      const found = await listSessions({ anyProject })
      setSessions(found)
      setTargets(installed())
      setLoading('')
    })()
  }, [anyProject])

  const agents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ref of sessions) counts.set(ref.agent, (counts.get(ref.agent) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [sessions])

  const filtered = useMemo(() => {
    let out = sessions.filter((ref) => !agentsOff.has(ref.agent))
    if (query.trim().length > 0) {
      out = out
        .map((ref) => ({ ref, score: fuzzyScore(query, `${ref.agent} ${ref.id} ${ref.path}`) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((hit) => hit.ref)
    }
    return out
  }, [sessions, query, agentsOff])

  // Rows the content pane may draw on, minus what the pane itself spends.
  const bodyHeight = Math.max(4, rows - 2)
  const contentHeight = Math.max(2, bodyHeight - 3)
  const visibleRows = Math.max(2, contentHeight - 2)
  const selected = filtered[cursor]

  useEffect(() => {
    setOffset((current) => {
      if (cursor < current) return cursor
      if (cursor >= current + visibleRows) return cursor - visibleRows + 1
      return current
    })
  }, [cursor, visibleRows])

  // ---- details, loaded for whatever is under the cursor --------------------

  useEffect(() => {
    const window = filtered.slice(offset, offset + visibleRows)
    const wanted = window.filter(
      (ref) => !cache.has(`${ref.agent}:${ref.id}`) && (ref.bytes ?? 0) < PREFILL_MAX_BYTES,
    )
    if (wanted.length === 0) return
    let cancelled = false
    void (async () => {
      for (const ref of wanted) {
        if (cancelled) return
        try {
          const loaded = await loadDetails(ref, 1)
          if (cancelled) return
          setCache((current) => {
            const next = new Map(current)
            next.set(`${ref.agent}:${ref.id}`, loaded)
            return next
          })
        } catch {
          // A session that cannot be read is a row with no metadata.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filtered, offset, visibleRows, cache])

  useEffect(() => {
    if (!selected) return
    const key = `${selected.agent}:${selected.id}`
    if (cache.has(key)) return
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadDetails(selected, 40)
        if (cancelled) return
        setCache((current) => {
          const next = new Map(current)
          next.set(key, loaded)
          return next
        })
      } catch {
        // As above: a row with no metadata.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected, cache])

  // ---- actions ------------------------------------------------------------

  const actions: Action[] = useMemo(() => {
    const hasLlm = Boolean(
      process.env['CCOMPACTOR_API_KEY'] ??
        process.env['ANTHROPIC_API_KEY'] ??
        process.env['OPENAI_API_KEY'],
    )
    return [
      {
        id: 'extract',
        label: 'Extract handoff — deterministic, no model',
        detail: `brief + ledgers + retrieval index → ${outDir}/handoff.md`,
      },
      {
        id: 'extract-llm',
        label: 'Extract handoff — with a model-written summary',
        detail: hasLlm
          ? `adds L1 via the configured backend → ${outDir}/handoff.md`
          : 'no API key found; set CCOMPACTOR_API_KEY and CCOMPACTOR_BASE_URL',
      },
      {
        id: 'narrate',
        label: 'Narrate — write L1 from the artifact',
        detail: hasLlm
          ? `reads ${outDir}/handoff.md, not the transcript; ~5k tokens`
          : 'needs a model; and an artifact to narrate',
      },
      {
        id: 'transcript',
        label: 'Readable transcript — what was said, in order',
        detail: `user and agent turns only → ${outDir}/transcript.md`,
      },
      {
        id: 'transcript-full',
        label: 'Readable transcript — including tool calls',
        detail: `adds every tool call and its output → ${outDir}/transcript.md`,
      },
      {
        id: 'handoff',
        label: 'Hand off — print the command for the next agent',
        detail: 'fork this session into a new one and show the command; you run it yourself',
      },
      {
        id: 'handoff-run',
        label: 'Hand off — and start the next agent here',
        detail: 'the same command, run for you in this terminal',
      },
      {
        id: 'verify',
        label: 'Verify the artifact already in this directory',
        detail: `re-check quotes and file paths against the transcript → ${outDir}`,
      },
    ]
  }, [outDir])

  const run = useCallback(
    async (actionId: string, target?: Target) => {
      if (!selected || busy.current) return
      busy.current = true
      setError(undefined)
      setResults([])
      setProgress([])
      setModal({ kind: 'running' })
      const onProgress = (stage: string, message: string): void => {
        setProgress((current) => [...current.slice(-8), `${stage}: ${message}`])
      }
      try {
        if (actionId === 'verify') {
          const { verify } = await import('../artifact/verify.js')
          const r = await verify(outDir)
          setResults([
            `${r.constraintsQuoted} quote(s) checked, ${r.missingQuotes.length} missing`,
            `${r.filesClaimed} file(s) claimed, ${r.filesChecked} looked for, ${r.missingFiles.length} gone`,
          ])
          setModal({ kind: 'result' })
          return
        }
        if (actionId === 'narrate') {
          const { narrate, writeNarrative, requireArtifact } = await import('../compact/narrate.js')
          const { resolveAuto, build } = await import('../llm/index.js')
          await requireArtifact(outDir)
          const backend = build(resolveAuto())
          if (!backend) throw new Error('narrate needs a model; set CCOMPACTOR_API_KEY and CCOMPACTOR_BASE_URL')
          onProgress('narrate', `reading ${outDir}/handoff.md`)
          const result = await narrate(outDir, backend)
          await writeNarrative(outDir, result.narrative)
          setLastArtifact(`${outDir}/handoff.md`)
          setResults([
            `${result.artifactTokens} input token(s)`,
            `written into ${outDir}/handoff.md`,
          ])
          setModal({ kind: 'result' })
          return
        }
        const format = actionId.startsWith('transcript') ? 'transcript' : 'handoff'
        const result = await extractSession(
          `${selected.agent}:${selected.id}`,
          {
            outDir,
            format,
            full: actionId === 'transcript-full',
            llm:
              actionId === 'extract-llm'
                ? (await import('../llm/index.js')).resolveAuto()
                : { kind: 'none' },
            anyProject: true,
          },
          onProgress,
        )
        const artifact = result.written[0] ?? `${outDir}/handoff.md`
        setLastArtifact(artifact)
        setResults([`${result.rendered.tokens} tokens in ${result.elapsedMs} ms`, ...result.written])
        if (actionId === 'handoff' || actionId === 'handoff-run') {
          const chosen = target ?? targets[0]
          if (!chosen) {
            setError('no launchable agent found on PATH')
            setModal({ kind: 'result' })
            return
          }
          const launch = plan(chosen, artifact, process.cwd())
          setResults((current) => [...current, `→ ${launch.display}`])
          if (actionId === 'handoff-run') {
            exit()
            const { spawnSync } = await import('node:child_process')
            const child = spawnSync(launch.program, launch.argv, { stdio: 'inherit' })
            onDone(child.status ?? 0)
            return
          }
        }
        setModal({ kind: 'result' })
      } catch (caught) {
        setError((caught as Error).message)
        setModal({ kind: 'result' })
      } finally {
        busy.current = false
      }
    },
    [selected, outDir, targets, exit, onDone],
  )

  const runSelectedAction = useCallback((): void => {
    const action = actions[actionIndex]
    if (!action) return
    if (action.id === 'handoff' || action.id === 'handoff-run') {
      setTargetIndex(0)
      setModal({ kind: 'target' })
      return
    }
    void run(action.id)
  }, [actions, actionIndex, run])

  const runSelectedTarget = useCallback((): void => {
    const action = actions[actionIndex]
    const target = targets[targetIndex]
    if (action && target) void run(action.id, target)
  }, [actions, actionIndex, targetIndex, targets, run])

  const openActions = useCallback(() => {
    setActionIndex(0)
    setModal({ kind: 'actions' })
  }, [])

  const openPreview = useCallback(() => {
    setPreviewScroll(0)
    setModal({ kind: 'preview' })
  }, [])

  // ---- pages --------------------------------------------------------------

  const loadArtifacts = useCallback(async () => {
    const { readdir, stat } = await import('node:fs/promises')
    const { join } = await import('node:path')
    try {
      const names = await readdir(outDir)
      const entries = await Promise.all(
        names.map(async (name) => ({
          name,
          size: (await stat(join(outDir, name))).size,
        })),
      )
      setArtifacts(entries.sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setArtifacts([])
    }
  }, [outDir])

  const showReport = useCallback(async (title: string, build: () => Promise<string[]>) => {
    setModal({ kind: 'report', title, lines: ['working …'] })
    try {
      setModal({ kind: 'report', title, lines: await build() })
    } catch (caught) {
      setModal({ kind: 'report', title, lines: [`error: ${(caught as Error).message}`] })
    }
  }, [])

  const doctorLines = useCallback(async (): Promise<string[]> => {
    const { adapters } = await import('../adapters/index.js')
    const { resolveAuto, selectionLabel } = await import('../llm/index.js')
    const { installations } = await import('../install.js')
    const out: string[] = []
    for (const adapter of adapters()) {
      const available = adapter.available()
      const count = available ? (await adapter.list({ anyProject: true })).length : 0
      out.push(
        `${available ? '✓' : '·'} ${adapter.kind.padEnd(10)} ${adapter.store()}  ${available ? `${count} session(s)` : 'not found'}`,
      )
    }
    out.push('')
    out.push('backends')
    const auto = resolveAuto()
    const key = (name: string) => (process.env[name] ? 'set' : 'not set')
    out.push(`  none              always available`)
    out.push(`  auto              resolves to ${selectionLabel(auto)}`)
    out.push(`  api:anthropic     ANTHROPIC_API_KEY ${key('ANTHROPIC_API_KEY')}`)
    out.push(`  api:openai        OPENAI_API_KEY ${key('OPENAI_API_KEY')}`)
    out.push(
      `  api:compat/<m>    CCOMPACTOR_BASE_URL ${key('CCOMPACTOR_BASE_URL')}, CCOMPACTOR_API_KEY ${key('CCOMPACTOR_API_KEY')}`,
    )
    out.push('')
    out.push('installs on PATH')
    for (const entry of installations()) {
      out.push(
        `  ${entry.version ?? 'did not answer'}  ${entry.path}${entry.current ? '   <- this one' : ''}`,
      )
    }
    return out
  }, [])

  // ---- the frame ----------------------------------------------------------

  // The top bar is three blocks: the brand and the agent tabs on the left, the
  // destination on the right, and whatever space is between them. The left block
  // is laid out through `layoutCells` so the tab columns are real, and the pad is
  // then whatever is left — computed from the laid-out width rather than from the
  // sum of the strings, which is off by one per join and pushed the right-hand
  // block off the end of the row.
  const rightText = `out: ${outDir}${anyProject ? '' : ' · this project'}`
  const leftCells: Array<{ id: string; text: string }> = [
    { id: 'brand', text: ' ccompactor ' },
    { id: 'gap', text: '  ' },
    ...tabCells(agents, undefined, columns).map((cell) => ({ id: cell.id, text: cell.text })),
  ]
  const topSpans = layoutCells(leftCells, columns)
  const leftWidth = topSpans.length === 0 ? 0 : topSpans[topSpans.length - 1]!.end + 1
  // Three blocks means two joins, and the pad has to leave room for both. One
  // short and the row is a column too wide, which Ink wraps onto a second line
  // and the frame scrolls.
  let right = rightText
  let pad = columns - leftWidth - right.length - 2
  if (pad < 1) {
    // The destination is the first thing to go: it is context, not a control.
    right = ''
    pad = columns - leftWidth - 1
  }
  if (pad < 0) pad = 0

  /** Bottom-bar buttons for the current page. */
  /** Bottom-bar buttons for the current page. */
  const navButtons = [
    {
      id: 'pane',
      key: '←→',
      label: 'pane',
      run: () => setFocus((f) => (f === 'menu' ? 'content' : 'menu')),
    },
    { id: 'up', key: '↑↓', label: 'move', run: () => move(1) },
    { id: 'select', key: '⏎', label: 'select', run: () => activate() },
    { id: 'filter', key: '/', label: 'filter', run: () => beginSearch() },
    { id: 'back', key: 'esc', label: 'back', run: () => back() },
    { id: 'help', key: '?', label: 'help', run: () => setModal({ kind: 'help' }) },
  ]
  const actButtons: Array<{ id: string; key: string; label: string; run: () => void }> =
    page === 'sessions'
      ? [
          { id: 'look', key: 'v', label: 'look', run: openPreview },
          { id: 'actions', key: 'a', label: 'actions', run: openActions },
        ]
      : page === 'artifacts'
        ? [
            { id: 'verify', key: 'V', label: 'verify', run: () => void run('verify') },
            { id: 'reload', key: 'r', label: 'reload', run: () => void loadArtifacts() },
          ]
        : page === 'skill'
          ? [
              { id: 'install', key: 'i', label: 'install', run: () => void doSkill('install') },
              { id: 'uninstall', key: 'u', label: 'uninstall', run: () => void doSkill('uninstall') },
              { id: 'path', key: 'p', label: 'path', run: () => void doSkill('path') },
            ]
          : page === 'update'
            ? [
                { id: 'check', key: 'c', label: 'check', run: () => void doUpdate(true) },
                { id: 'apply', key: 'U', label: 'update', run: () => void doUpdate(false) },
              ]
            : []
  const bar = bottomBar(
    navButtons.map((b) => ({ id: b.id, key: b.key, label: b.label })),
    actButtons.map((b) => ({ id: b.id, key: b.key, label: b.label })),
    columns,
    rows,
  )
  const barButtons = [...navButtons, ...actButtons]

  const menuSpans = layoutCells(
    MENU.map((item) => ({ id: `menu:${item.id}`, text: ` ${item.label} ` })),
    SIDEBAR_WIDTH - 2,
  )

  function move(delta: number): void {
    if (modal) {
      if (modal.kind === 'actions') {
        setActionIndex((i) => Math.min(actions.length - 1, Math.max(0, i + delta)))
      } else if (modal.kind === 'target') {
        setTargetIndex((i) => Math.min(targets.length - 1, Math.max(0, i + delta)))
      }
      return
    }
    if (focus === 'menu') {
      setMenuCursor((i) => Math.min(MENU.length - 1, Math.max(0, i + delta)))
      return
    }
    if (page === 'sessions') {
      setCursor((c) => Math.min(filtered.length - 1, Math.max(0, c + delta)))
    }
  }

  function openPage(next: Page): void {
    if (next === 'exit') {
      exit()
      onDone(0)
      return
    }
    setPage(next)
    setFocus('content')
    setMenuCursor(menuIndex(next))
    if (next === 'artifacts') void loadArtifacts()
    if (next === 'doctor') void showReport('Doctor', doctorLines)
  }

  function activate(): void {
    if (modal) {
      if (modal.kind === 'actions') return runSelectedAction()
      if (modal.kind === 'target') return runSelectedTarget()
      if (modal.kind === 'report' || modal.kind === 'result' || modal.kind === 'help') {
        return setModal(undefined)
      }
      return
    }
    if (focus === 'menu') return openPage(MENU[menuCursor]?.id ?? 'sessions')
    if (page === 'sessions') return openPreview()
    if (page === 'artifacts') void run('verify')
  }

  function beginSearch(): void {
    if (page !== 'sessions') return
    setSearching(true)
    setQuery('')
  }

  function back(): void {
    if (modal) return setModal(undefined)
    if (searching) return setSearching(false)
    if (focus === 'content') return setFocus('menu')
    setFocus('content')
  }

  async function doSkill(action: 'install' | 'uninstall' | 'path'): Promise<void> {
    await showReport(`Skill · ${action}`, async () => {
      const { install, uninstall, skillTargets, payloadDir } = await import('../skill/index.js')
      if (action === 'install') return await install()
      if (action === 'uninstall') return await uninstall()
      return [
        `payload: ${payloadDir()}`,
        ...skillTargets().map((t) => `target: ${t.dir}`),
      ]
    })
  }

  async function doUpdate(check: boolean): Promise<void> {
    await showReport(`Update${check ? ' · check' : ''}`, async () => {
      const { update } = await import('../update/index.js')
      const result = await update({ check })
      return [
        `${result.current} → ${result.latest}  (${result.kind})`,
        result.location,
        '',
        ...result.message.split('\n'),
      ]
    })
  }

  function setAgentFilter(agent: string): void {
    const known = agents.map(([name]) => name)
    setAgentsOff(new Set(known.filter((name) => name !== agent)))
    setCursor(0)
  }

  // ---- mouse --------------------------------------------------------------

  function handleMouse(event: MouseEvent): void {
    // A modal owns the pointer while it is open. This has to come first: written
    // the other way round, the early return narrowed `modal` to `undefined` and
    // the wheel could never reach the quick look it was scrolling.
    if (modal) {
      if (event.kind === 'wheel-up' || event.kind === 'wheel-down') {
        const delta = event.kind === 'wheel-up' ? -3 : 3
        if (modal.kind === 'preview') {
          setPreviewScroll((s) => Math.max(0, s + delta))
        } else if (modal.kind === 'actions') {
          setActionIndex((i) => Math.min(actions.length - 1, Math.max(0, i + (delta > 0 ? 1 : -1))))
        } else if (modal.kind === 'target') {
          setTargetIndex((i) => Math.min(targets.length - 1, Math.max(0, i + (delta > 0 ? 1 : -1))))
        }
        return
      }
      if (event.kind === 'click' && (modal.kind === 'actions' || modal.kind === 'target')) {
        const itemTop = modalItemTop(modalContent().lines.length)
        // Action dialogs put a detail line under every label, so the clickable
        // stride is two rows, not one.
        const raw = event.y - itemTop
        const row = modal.kind === 'actions' ? Math.floor(raw / 2) : raw
        const count = modal.kind === 'actions' ? actions.length : targets.length
        if (row < 0 || row >= count) return
        if (modal.kind === 'actions') {
          setActionIndex(row)
          const action = actions[row]
          if (!action) return
          if (action.id === 'handoff' || action.id === 'handoff-run') {
            setTargetIndex(0)
            setModal({ kind: 'target' })
            return
          }
          void run(action.id)
        } else {
          setTargetIndex(row)
          const target = targets[row]
          const action = actions[actionIndex]
          if (action && target) void run(action.id, target)
        }
      }
      return
    }

    if (event.kind === 'click') {
      const barCell = bar.cells.find((c) => inCell(c, event.x))
      if (event.y === bar.row && barCell) {
        const button = barButtons.find((b) => b.id === barCell.id.replace(/^(nav|act):/, ''))
        if (button) button.run()
        return
      }
      if (event.y === ROW_TOP) {
        const cell = topSpans.find((c) => inCell(c, event.x))
        if (cell?.id === 'agent:all') {
          setAgentsOff(new Set())
          setCursor(0)
          return
        }
        if (cell?.id.startsWith('agent:')) {
          setAgentFilter(cell.id.slice('agent:'.length))
        }
        return
      }
      // The sidebar.
      if (event.x <= SIDEBAR_WIDTH) {
        const row = event.y - SIDEBAR_TOP
        const item = MENU[row]
        if (item) {
          setMenuCursor(row)
          openPage(item.id)
        }
        return
      }
      if (page === 'sessions') {
        const row = event.y - SIDEBAR_TOP + 1 + offset
        if (row >= 0 && row < filtered.length) {
          setCursor(row)
          setFocus('content')
          openPreview()
        }
      }
      return
    }

    if (event.kind === 'wheel-up' || event.kind === 'wheel-down') {
      const delta = event.kind === 'wheel-up' ? -3 : 3
      if (page === 'sessions') setCursor((c) => Math.min(filtered.length - 1, Math.max(0, c + delta)))
    }
  }

  const mouseRef = useRef(handleMouse)
  mouseRef.current = handleMouse
  useEffect(() => {
    const stop = enableMouse(process.stdout)
    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      for (const event of readMouse(text).events) mouseRef.current(event)
    }
    process.stdin.on('data', onData)
    return () => {
      process.stdin.off('data', onData)
      stop()
    }
  }, [])

  // ---- keys ---------------------------------------------------------------

  useInput((input, key) => {
    // Mouse sequences arrive on the same stream and Ink's key parser hands the
    // unrecognised remainder through as typed text, so a click while the search
    // box is open spelled `[<0;3;3M` into the query.
    if (/\u001b?\[<\d+;\d+;\d+[Mm]/.test(input)) return

    if (key.ctrl && input === 'c') {
      exit()
      onDone(0)
      return
    }

    if (modal?.kind === 'running') return

    // A dialog owns the keyboard while it is open.
    //
    // Tab and the agent shortcuts used to reach the frame behind it: `tab` moved
    // focus behind the dialog, so the Enter that was meant to open a page closed
    // the dialog instead, and `c`/`x`/`p` filtered a list nobody could see.
    if (modal) {
      if (key.upArrow || key.downArrow) return move(key.upArrow ? -1 : 1)
      // `esc` closes; `enter` confirms. Sending `esc` through `activate()` closed
      // only the dialogs that happen to be dismissible by Enter, so the quick
      // look and the action list stopped responding to it.
      if (key.escape) return setModal(undefined)
      if (key.return) return activate()
      return
    }

    if (searching) {
      if (key.return || key.escape) setSearching(false)
      else if (key.backspace || key.delete) setQuery((q) => q.slice(0, -1))
      else if (input && !key.ctrl && !key.meta) {
        setQuery((q) => q + input)
        setCursor(0)
      }
      return
    }

    if (key.leftArrow || key.rightArrow || key.tab) {
      setFocus((f) => (f === 'menu' ? 'content' : 'menu'))
      return
    }
    if (key.upArrow) return move(-1)
    if (key.downArrow) return move(1)
    if (key.escape) return back()
    if (key.return) return activate()

    if (input === '?') return setModal({ kind: 'help' })
    if (input === 'q' && !modal) {
      exit()
      onDone(0)
      return
    }
    if (input === '/') return beginSearch()
    if (input === '0') {
      setAgentsOff(new Set())
      setCursor(0)
      return
    }
    if (input === 'c') return setAgentFilter('claude')
    if (input === 'x') return setAgentFilter('codex')
    if (input === 'p') return setAgentFilter('pi')

    // The bottom bar is the single definition of what a key does: the key
    // handler looks the key up in the same list the buttons are drawn from, so
    // a shortcut cannot do one thing while its button does another.
    const act = actButtons.find((b) => b.key === input)
    if (act) act.run()
  })

  // ---- render -------------------------------------------------------------

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text bold backgroundColor={THEME.yellow} color={THEME.onYellow}>
          {' ccompactor '}
        </Text>
        <Text color={THEME.yellowInk}>{loading}</Text>
      </Box>
    )
  }

  const menuWidth = SIDEBAR_WIDTH - 2
  const menu = (
    <Box
      flexDirection="column"
      width={SIDEBAR_WIDTH}
      borderStyle="round"
      borderColor={focus === 'menu' ? THEME.yellow : THEME.stripeDim}
    >
      {MENU.map((item, i) => {
        const active = page === item.id
        const cursorHere = focus === 'menu' && menuCursor === i
        return (
          <Text
            key={item.id}
            {...(active
              ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
              : { color: THEME.muted })}
          >
            {/* The same marker the content rows use, with the same space after
                it, so a focused row reads the same wherever it is. */}
            {cursorHere ? '❯ ' : '  '}
            {item.label.padEnd(menuWidth - 2)}
          </Text>
        )
      })}
    </Box>
  )

  const contentWidth = Math.max(20, columns - SIDEBAR_WIDTH - 1)
  const content = (
    <Box
      flexDirection="column"
      width={contentWidth}
      borderStyle="round"
      borderColor={focus === 'content' ? THEME.yellow : THEME.stripeDim}
    >
      {contentBody()}
    </Box>
  )

  function contentBody(): React.ReactNode {
    if (page === 'sessions') return sessionsPage()
    if (page === 'artifacts') {
      return (
        <>
          <Text color={THEME.muted} bold>
            {' '}
            {artifacts.length === 0 ? `nothing in ${outDir}` : `${outDir} — ${artifacts.length} file(s)`}{' '}
          </Text>
          {artifacts.map((file) => (
            <Text key={file.name} color={THEME.muted}>
              {'  '}
              {file.name.padEnd(24)}
              {sizeLabel(file.size).padStart(10)}
            </Text>
          ))}
          <Text color={THEME.muted}>
            {' '}
            V verifies the artifact against the transcript; r reloads this list{' '}
          </Text>
        </>
      )
    }
    if (page === 'settings') {
      return (
        <>
          <Text color={THEME.muted} bold>
            {' '}Where things are written{' '}
          </Text>
          <Text>
            {'  '}output directory {'  '}
            <Text color={THEME.yellowInk}>{outDir}</Text>
          </Text>
          <Text>
            {'  '}session scope {'   '}
            <Text color={THEME.yellowInk}>{anyProject ? 'every project' : 'this project only'}</Text>
          </Text>
          <Text>
            {'  '}working directory{' '}
            <Text color={THEME.yellowInk}>{process.cwd()}</Text>
          </Text>
          <Text color={THEME.muted}>
            {' '}
            Change these with --out and --project on the command line.{' '}
          </Text>
        </>
      )
    }
    if (page === 'skill') {
      return (
        <>
          <Text color={THEME.muted} bold>
            {' '}Teach other agents to use ccompactor{' '}
          </Text>
          <Text color={THEME.muted}>
            {' '}
            With the skill installed, another agent knows to run ccompactor and read
          </Text>
          <Text color={THEME.muted}>
            {' '}
            the handoff before touching a codebase.
          </Text>
          <Text> </Text>
          <Text>
            {'  '}i install{'    '}u uninstall{'    '}p where it goes
          </Text>
        </>
      )
    }
    if (page === 'update') {
      return (
        <>
          <Text color={THEME.muted} bold>
            {' '}Stay on the newest release{' '}
          </Text>
          <Text color={THEME.muted}>
            {' '}
            Update re-runs the npm install for a global install, downloads and
          </Text>
          <Text color={THEME.muted}>
            {' '}
            verifies the archive for a standalone binary, and refuses to touch a
          </Text>
          <Text color={THEME.muted}> source checkout.</Text>
          <Text> </Text>
          <Text>
            {'  '}c check for a newer release{'    '}U take it
          </Text>
        </>
      )
    }
    if (page === 'doctor') {
      return (
        <>
          <Text color={THEME.muted} bold>
            {' '}Doctor{' '}
          </Text>
          <Text color={THEME.muted}> reading the stores, the backends and the installs … </Text>
        </>
      )
    }
    return (
      <>
        <Text color={THEME.muted} bold>
          {' '}
          {MENU[menuIndex(page)]?.label ?? page}{' '}
        </Text>
        <Text color={THEME.muted}> press enter or click the menu to load this page </Text>
      </>
    )
  }

  function sessionsPage(): React.ReactNode {
    // One width, used by the header and every row. An agent id is 36 characters
    // and a codex id is 60, so a fixed column either wastes the difference or
    // lets the long ones run into the date.
    const idWidth = Math.max(12, Math.min(38, contentWidth - 34))
    return (
      <>
        <Text color={THEME.muted} bold>
          {' '}
          {searching ? `search: ${query}▏` : `${filtered.length} of ${sessions.length} session(s)`}
          {agentsOff.size > 0 && !searching ? '  ·  filtered' : ''}{' '}
        </Text>
        <Text color={THEME.muted}>
          {' '}
          {'AGENT'.padEnd(8)}
          {'SESSION ID'.padEnd(idWidth + 2)}
          {'MODIFIED'}
        </Text>
        {filtered.slice(offset, offset + visibleRows).map((ref, i) => {
          const index = offset + i
          const active = index === cursor && focus === 'content'
          const details = cache.get(`${ref.agent}:${ref.id}`)
          return (
            <Text
              key={ref.path}
              {...(active ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true } : {})}
            >
              {active ? '❯ ' : '  '}
              {ref.agent.padEnd(8)}
              {/* Cut from the left when it does not fit, because a codex id is
                  `<timestamp>_<uuid>` and the date column already carries the
                  timestamp. The full id is one click away in the quick look. */}
              {(ref.id.length > idWidth ? `…${ref.id.slice(-(idWidth - 1))}` : ref.id).padEnd(idWidth)}
              {'  '}
              {new Date(ref.mtime).toISOString().slice(0, 16).replace('T', ' ')}
              {details && contentWidth > 74 ? `  ${details.messages} msg` : ''}
            </Text>
          )
        })}
        {filtered.length === 0 && (
          <Text color={THEME.muted}> nothing matches. Press esc to clear, or / to search again. </Text>
        )}
      </>
    )
  }

  /**
   * What a dialog contains.
   *
   * One function, used by the drawing *and* by the click mapping, so the row a
   * dialog item is painted on is the row it answers on. Written as two places
   * this is the bug the clickable bar already had once.
   */
  function modalContent(): { title: string; lines: React.ReactNode[]; hints: string; actionable: number } {
    const width = Math.max(40, Math.min(columns - 8, 96))
    const inner = width - 6
    const lines: React.ReactNode[] = []
    let title = ''
    let hints = 'esc or ⏎ close'
    let actionable = 0

    if (!modal) return { title, lines, hints, actionable }

    if (modal.kind === 'help') {
      title = 'Keys'
      lines.push(
        <Text key="h1" color={THEME.muted}>
          {'  '}←→ or tab move between the menu and the content
        </Text>,
        <Text key="h2" color={THEME.muted}>
          {'  '}↑↓ move within the focused pane
        </Text>,
        <Text key="h3" color={THEME.muted}>
          {'  '}⏎ select · / filter · esc back · ? help · q quit
        </Text>,
        <Text key="h4" color={THEME.muted}>
          {'  '}Every cell of the top, side and bottom bars is clickable,
        </Text>,
        <Text key="h5" color={THEME.muted}>
          {'  '}and the mouse wheel scrolls the list and the quick look.
        </Text>,
      )
    } else if (modal.kind === 'actions') {
      title = `What to do with ${selected?.agent}:${selected?.id.slice(0, 8)}`
      hints = '↑↓ choose · ⏎ run · esc close · click an item to run it'
      actions.forEach((action, i) => {
        const active = i === actionIndex
        lines.push(
          <Text
            key={action.id}
            {...(active ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true } : {})}
          >
            {active ? '❯ ' : '  '}
            {action.label}
          </Text>,
        )
        lines.push(
          <Text key={`${action.id}-d`} color={THEME.muted}>
            {'    '}
            {action.detail.slice(0, inner - 4)}
          </Text>,
        )
      })
      actionable = actions.length
    } else if (modal.kind === 'target') {
      title = 'Continue this session in which agent?'
      hints = '↑↓ choose · ⏎ continue · esc back'
      if (targets.length === 0) {
        lines.push(
          <Text key="none" color={THEME.muted}>
            {'  '}none found on PATH
          </Text>,
        )
      }
      targets.forEach((target, i) => {
        const active = i === targetIndex
        lines.push(
          <Text
            key={target}
            {...(active ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true } : {})}
          >
            {active ? '❯ ' : '  '}
            {target}
          </Text>,
        )
      })
      actionable = targets.length
    } else if (modal.kind === 'running') {
      title = `working on ${selected?.agent}:${selected?.id.slice(0, 8)} …`
      hints = 'this closes itself when the work is done'
      for (const line of progress.slice(-8)) {
        lines.push(
          <Text key={line} color={THEME.muted}>
            {'  '}
            {line.slice(0, inner)}
          </Text>,
        )
      }
      if (progress.length === 0) {
        lines.push(
          <Text key="start" color={THEME.muted}>
            {'  '}starting …
          </Text>,
        )
      }
    } else if (modal.kind === 'result') {
      title = error ? 'Something went wrong' : 'Done'
      if (error) {
        lines.push(
          <Text key="err" color="#FF6B6B">
            {'  '}
            {error.slice(0, inner)}
          </Text>,
        )
      }
      results.forEach((line, i) =>
        lines.push(
          <Text key={i} color={THEME.muted}>
            {'  '}
            {line.slice(0, inner)}
          </Text>,
        ),
      )
      if (lastArtifact) {
        lines.push(
          <Text key="art" color={THEME.muted}>
            {'  '}read it: {lastArtifact}
          </Text>,
        )
      }
    } else if (modal.kind === 'report') {
      title = modal.title
      for (const line of modal.lines) {
        lines.push(
          <Text key={line} color={THEME.muted}>
            {'  '}
            {line.slice(0, inner)}
          </Text>,
        )
      }
    } else if (modal.kind === 'preview') {
      const details = selected ? cache.get(`${selected.agent}:${selected.id}`) : undefined
      title = selected ? `${selected.agent}:${selected.id}` : 'quick look'
      hints = 'wheel or ↑↓ scroll · a actions · esc close'
      if (!details) {
        lines.push(
          <Text key="l" color={THEME.yellow}>
            {'  '}reading …
          </Text>,
        )
      } else {
        lines.push(
          <Text key="m" color={THEME.muted}>
            {'  '}
            {details.messages} msg · {details.userTurns} user turns · {details.toolCalls} tool calls ·{' '}
            {details.tokens} tokens · {details.compactBoundaries} compaction(s)
          </Text>,
        )
        if (details.cwd) {
          lines.push(
            <Text key="c" color={THEME.muted}>
              {'  '}cwd: {details.cwd.slice(0, inner)}
            </Text>,
          )
        }
        const room = Math.max(2, bodyHeight - 8)
        const all = details.preview
        const shown = all.slice(Math.max(0, all.length - room - previewScroll), all.length - previewScroll)
        shown.forEach((line, i) =>
          lines.push(
            <Text key={`${line.evt}-${i}`}>
              <Text color={line.role === 'user' ? THEME.yellow : THEME.muted} bold={line.role === 'user'}>
                {line.role === 'user' ? '  user  ' : line.role === 'agent' ? '  agent ' : '  tool  '}
              </Text>
              <Text>{line.text.slice(0, inner - 8)}</Text>
            </Text>,
          ),
        )
      }
    }
    return { title, lines, hints, actionable }
  }

  /**
   * The row the first clickable line of a dialog lands on.
   *
   * Derived from the same numbers the drawing uses rather than guessed: top bar
   * (1) + the padding above the box + the border + the title.
   */
  function modalItemTop(lineCount: number): number {
    const box = lineCount + 4
    const padTop = Math.max(0, Math.floor((bodyHeight - box) / 2))
    return padTop + 4
  }

  /** A dialog, centred in the body. The frame stays visible around it. */
  function modalBox(): React.ReactNode {
    const { title, lines, hints } = modalContent()
    const width = Math.max(40, Math.min(columns - 8, 96))
    const room = Math.max(3, bodyHeight - 6)
    const shown = lines.slice(0, room)
    const box = shown.length + 4
    const padTop = Math.max(0, Math.floor((bodyHeight - box) / 2))
    const padLeft = Math.max(0, Math.floor((columns - width) / 2))
    return (
      <Box flexDirection="column" height={bodyHeight}>
        {Array.from({ length: padTop }, (_, i) => (
          <Text key={`pad${i}`}> </Text>
        ))}
        <Box
          marginLeft={padLeft}
          flexDirection="column"
          width={Math.min(width, columns - padLeft)}
          borderStyle="double"
          borderColor={THEME.yellow}
        >
          <Text bold backgroundColor={THEME.yellow} color={THEME.onYellow}>
            {` ${title} `.slice(0, width - 2).padEnd(width - 2)}
          </Text>
          {shown}
          <Text color={THEME.muted}>{` ${hints}`.slice(0, width - 2).padEnd(width - 2)}</Text>
        </Box>
      </Box>
    )
  }

  return (
    // One row short of the terminal. A frame exactly `rows` tall is written with
    // a trailing newline, which scrolls the top bar off the screen.
    <Box flexDirection="column" height={Math.max(6, rows - 1)}>
      {/* top bar */}
      <Box>
        {topSpans.map((cell, i) => {
          const isTab = cell.id.startsWith('agent:')
          const agent = cell.id.slice('agent:'.length)
          const on = agent === 'all' ? agentsOff.size === 0 : !agentsOff.has(agent)
          const separator = i > 0 ? ' ' : ''
          if (cell.id === 'brand') {
            return (
              <Text key={cell.id} bold backgroundColor={THEME.yellow} color={THEME.onYellow}>
                {cell.text}
              </Text>
            )
          }
          return (
            <Text
              key={`${cell.id}-${i}`}
              {...(isTab && on
                ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
                : { color: THEME.muted })}
            >
              {separator + cell.text}
            </Text>
          )
        })}
        {pad > 0 && <Text color={THEME.muted}>{' '.repeat(pad)}</Text>}
        {right.length > 0 && (
          <Text color={THEME.muted}>{` ${right.slice(0, Math.max(0, columns - leftWidth - pad - 1))}`}</Text>
        )}
      </Box>

      {/* body — a dialog replaces the panes rather than being appended after
          them, because a frame taller than the terminal scrolls and Ink's diff
          then corrupts what it repaints. */}
      {modal ? (
        modalBox()
      ) : (
        <Box height={bodyHeight}>
          {menu}
          {content}
        </Box>
      )}

      {/* bottom bar */}
      <Box>
        {bar.cells.map((cell, i) => {
          const isLabel = cell.id === 'navlabel' || cell.id === 'actlabel'
          return (
            <Text
              key={`${cell.id}-${i}`}
              {...(isLabel
                ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
                : { color: THEME.muted })}
            >
              {(i > 0 && !isLabel ? '' : '') + cell.text}
            </Text>
          )
        })}
      </Box>

      {status.length > 0 && <Text color={THEME.yellowInk}>{status}</Text>}
    </Box>
  )
}
