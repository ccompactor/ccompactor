/**
 * The interactive browser.
 *
 * Three screens, because there are three questions: *which session* (browse),
 * *is this the one* (quick look), and *what do I do with it* (actions). The
 * first version had one screen and answered none of them — it listed sessions,
 * and pressing `h` did nothing at all unless you had already extracted, which
 * is the wrong order for anyone who does not yet know what they want.
 *
 * The rules it follows:
 *
 * - **The session id is never truncated.** It is the one column a reader may
 *   need to copy, and a truncated id is a useless one.
 * - **Nothing is silent.** Every operation that can take longer than a blink
 *   shows the stage it is in, because on a 260 MB transcript a frozen screen and
 *   a working one look identical.
 * - **The actions are named, not remembered.** Choosing a session shows what can
 *   be done to it, with the destination written out.
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listSessions, fuzzyScore } from '../discover/index.js'
import { extractSession } from '../extract.js'
import { plan, installed, type Target } from '../handoff/index.js'
import { readSession } from '../discover/index.js'
import { listSessions as allSessions } from '../discover/index.js'
import type { SessionRef } from '../ir/types.js'
import { THEME, hazard, sizeLabel, width } from './theme.js'
import { enableMouse, readMouse, type MouseEvent } from './mouse.js'
import { describe, loadDetails, type SessionDetails } from './details.js'

type Screen = 'browse' | 'preview' | 'actions' | 'target' | 'running' | 'done'

/** The terminal row the first session row occupies. Fixed, so a click maps. */
const LIST_TOP = 4

/**
 * How large a transcript may be before the table stops reading it in the
 * background. Above this the row shows a size and a date, and the rest arrives
 * when the reader lands on it.
 */
const PREFILL_MAX_BYTES = 32 * 1024 * 1024

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

export function App({ outDir, anyProject, onDone }: Props): React.ReactElement {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 100
  const rows = stdout?.rows ?? 30

  const [sessions, setSessions] = useState<SessionRef[]>([])
  const [loading, setLoading] = useState('scanning agent stores …')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [agentsOff, setAgentsOff] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [offset, setOffset] = useState(0)
  const [screen, setScreen] = useState<Screen>('browse')
  // One cache for every session whose metadata has been read, and one for the
  // row being looked at. The window is prefilled in the background so the
  // MSGS/TURNS/CWD columns fill in as the reader browses rather than sitting
  // empty until they land on a row.
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

  const visibleRows = Math.max(3, rows - LIST_TOP - 3)
  const selected = filtered[cursor]

  // Keep the cursor on screen without a scroll library.
  useEffect(() => {
    setOffset((current) => {
      if (cursor < current) return cursor
      if (cursor >= current + visibleRows) return cursor - visibleRows + 1
      return current
    })
  }, [cursor, visibleRows])

  // ---- details, loaded for whatever is under the cursor ----------------
  //
  // Debounced, because holding an arrow key should not queue twenty parses of a
  // 260 MB file.
  // ---- prefill the window -------------------------------------------------
  //
  // Bounded on purpose: only what is on screen, three at a time, and never a
  // file already in the cache. Filling all 720 would mean parsing hundreds of
  // megabytes for rows nobody has looked at.
  useEffect(() => {
    const window = filtered.slice(offset, offset + visibleRows)
    // Big transcripts are left alone here and read only when the reader lands on
    // one. Parsing a 268 MB session to fill in a column of file sizes is not a
    // trade worth making, and doing thirty of them at once is what killed the
    // process.
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
          // A session that cannot be read is a row with no metadata, not a
          // failed run. The real error is still available through `extract`.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filtered, offset, visibleRows, cache])

  // Whatever is under the cursor is always read, however large, one at a time.
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
    const hasLlm = Boolean(process.env['CCOMPAT_API_KEY'] ?? process.env['CCOMPACTOR_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'] ?? process.env['OPENAI_API_KEY'])
    return [
      // These two read as synonyms — "hand off" and "launch" both suggest the
      // agent starts. They differ in who starts it, so the labels say that.
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
        id: 'extract',
        label: 'Extract handoff — deterministic, no model',
        detail: `brief + ledgers + retrieval index → ${outDir}/handoff.md`,
      },
      {
        id: 'extract-llm',
        label: 'Extract handoff — with a model-written summary',
        detail: hasLlm ? `adds L1 via the configured backend → ${outDir}/handoff.md` : 'no API key found; set CCOMPACTOR_API_KEY and CCOMPACTOR_BASE_URL',
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
      setScreen('running')
      const onProgress = (stage: string, message: string): void => {
        setProgress((current) => [...current.slice(-8), `${stage}: ${message}`])
      }
      try {
        if (actionId === 'verify') {
          const { verify } = await import('../artifact/verify.js')
          const report = await verify(outDir)
          setResults([
            `${report.constraintsQuoted} quote(s) checked, ${report.missingQuotes.length} missing`,
            `${report.filesClaimed} file(s) claimed, ${report.missingFiles.length} gone`,
          ])
          setScreen('done')
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
        setResults([
          `${result.rendered.tokens} tokens in ${result.elapsedMs} ms`,
          ...result.written,
        ])
        if (actionId === 'handoff' || actionId === 'handoff-run') {
          const chosen = target ?? targets[0]
          if (!chosen) {
            setError('no launchable agent found on PATH')
            setScreen('done')
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
        setScreen('done')
      } catch (caught) {
        setError((caught as Error).message)
        setScreen('done')
      } finally {
        busy.current = false
      }
    },
    [selected, outDir, targets, exit, onDone],
  )

  const openActions = useCallback(() => {
    setActionIndex(0)
    setScreen('actions')
  }, [])

  const openPreview = useCallback(() => {
    setPreviewScroll(0)
    setScreen('preview')
  }, [])

  // ---- mouse --------------------------------------------------------------

  useEffect(() => {
    const stop = enableMouse(process.stdout)
    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const { events } = readMouse(text)
      for (const event of events) handleMouse(event)
    }
    process.stdin.on('data', onData)
    return () => {
      process.stdin.off('data', onData)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, cursor, offset, filtered.length, previewScroll, cache])

  function handleMouse(event: MouseEvent): void {
    if (screen === 'browse') {
      if (event.kind === 'wheel-up') {
        setCursor((c) => Math.max(0, c - 3))
        return
      }
      if (event.kind === 'wheel-down') {
        setCursor((c) => Math.min(filtered.length - 1, c + 3))
        return
      }
      if (event.kind === 'click') {
        const row = event.y - LIST_TOP + offset
        if (row >= 0 && row < filtered.length) {
          setCursor(row)
          openPreview()
        }
      }
      return
    }
    if (screen === 'preview') {
      if (event.kind === 'wheel-up') setPreviewScroll((s) => Math.max(0, s - 3))
      if (event.kind === 'wheel-down') setPreviewScroll((s) => s + 3)
    }
  }

  // ---- keys ---------------------------------------------------------------

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
      onDone(0)
      return
    }

    if (screen === 'running') return

    if (screen === 'done') {
      if (key.return || key.escape || input === 'q') {
        setScreen('browse')
      }
      return
    }

    if (screen === 'actions') {
      if (key.upArrow) setActionIndex((i) => Math.max(0, i - 1))
      if (key.downArrow) setActionIndex((i) => Math.min(actions.length - 1, i + 1))
      if (key.escape) setScreen('browse')
      if (key.return) {
        const action = actions[actionIndex]
        if (!action) return
        if (action.id === 'handoff' || action.id === 'handoff-run') {
          setTargetIndex(0)
          setScreen('target')
          return
        }
        void run(action.id)
      }
      return
    }

    if (screen === 'target') {
      if (key.upArrow) setTargetIndex((i) => Math.max(0, i - 1))
      if (key.downArrow) setTargetIndex((i) => Math.min(targets.length - 1, i + 1))
      if (key.escape) setScreen('actions')
      if (key.return) {
        const action = actions[actionIndex]
        const target = targets[targetIndex]
        if (action && target) void run(action.id, target)
      }
      return
    }

    if (screen === 'preview') {
      if (key.escape || input === 'q') {
        setScreen('browse')
        return
      }
      const lines = selected ? (cache.get(`${selected.agent}:${selected.id}`)?.preview.length ?? 0) : 0
      if (key.upArrow) setPreviewScroll((s) => Math.max(0, s - 1))
      if (key.downArrow) setPreviewScroll((s) => Math.min(Math.max(0, lines - 1), s + 1))
      if (input === 'a' || input === 'h' || key.return) openActions()
      return
    }

    // browse
    if (searching) {
      if (key.return || key.escape) setSearching(false)
      else if (key.backspace || key.delete) setQuery((q) => q.slice(0, -1))
      else if (input && !key.ctrl && !key.meta) {
        setQuery((q) => q + input)
        setCursor(0)
      }
      return
    }

    if (input === 'q') {
      exit()
      onDone(0)
      return
    }
    if (input === '/') {
      setSearching(true)
      setQuery('')
      return
    }
    if (input === 'c') {
      setAgentFilter('claude')
      return
    }
    if (input === 'x') {
      setAgentFilter('codex')
      return
    }
    if (input === 'p') {
      setAgentFilter('pi')
      return
    }
    // `a` used to clear the agent filter here and open actions in the preview
    // pane, so the hint line was lying on one of the two screens. One key, one
    // meaning: `a` is actions everywhere, and `0` is the whole list.
    if (input === '0') {
      setAgentsOff(new Set())
      setCursor(0)
      return
    }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
    if (key.downArrow) setCursor((c) => Math.min(filtered.length - 1, c + 1))
    if (key.return || input === ' ') openPreview()
    if (input === 'a' || input === 'e' || input === 'h') openActions()
  })

  function setAgentFilter(agent: string): void {
    const known = agents.map(([name]) => name)
    setAgentsOff(new Set(known.filter((name) => name !== agent)))
    setCursor(0)
  }

  // ---- render -------------------------------------------------------------

  if (loading) return <Text color={THEME.yellow}>{loading}</Text>

  const layout = layoutFor(columns, filtered.length > 0 ? filtered : sessions)

  const chips = (
    <Box>
      <Text bold backgroundColor={THEME.yellow} color={THEME.onYellow}>
        {' ccompactor '}
      </Text>
      <Text color={THEME.muted}>
        {'  '}
        {filtered.length} of {sessions.length}
        {'  '}
      </Text>
      {agents.map(([agent, count]) => {
        const off = agentsOff.has(agent)
        return (
          <Text
            key={agent}
            {...(off
              ? { color: THEME.muted }
              : { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true })}
          >
            {` ${agent} ${count} `}
          </Text>
        )
      })}
      <Text color={THEME.muted}>{agentsOff.size > 0 ? '  press 0 for all' : ''}</Text>
    </Box>
  )

  const hints =
    screen === 'browse'
      ? 'c/x/p filter agent · 0 all · / search · ↑↓ wheel · enter or click quick look · a actions · q quit'
      : screen === 'preview'
        ? '↑↓ or wheel scroll · a actions · esc back'
        : screen === 'actions'
          ? '↑↓ choose · enter run · esc back'
          : screen === 'target'
            ? '↑↓ choose the agent to continue in · enter fork · esc back'
            : ''

  return (
    <Box flexDirection="column">
      <Box>
        {hazard(columns).map((cell, i) => (
          <Text key={i} color={cell.dim ? THEME.stripeDim : THEME.yellow}>
            {cell.ch}
          </Text>
        ))}
      </Box>
      {chips}
      {screen === 'browse' && (
        <>
          <Columns layout={layout} width={columns} />
          <Box flexDirection="column">
            {filtered.slice(offset, offset + visibleRows).map((ref, i) => {
              const index = offset + i
              const active = index === cursor
              const meta = cache.get(`${ref.agent}:${ref.id}`)
              return (
                <Row key={ref.path} ref_={ref} active={active} layout={layout} details={meta} />
              )
            })}
          </Box>
        </>
      )}

      {screen === 'preview' && selected && (
        <Preview
          ref_={selected}
          details={cache.get(`${selected.agent}:${selected.id}`)}
          scroll={previewScroll}
          height={visibleRows + 2}
          width={columns}
        />
      )}

      {screen === 'actions' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={THEME.yellowInk}>
            What do you want to do with {selected?.agent}:{selected?.id.slice(0, 8)}?
          </Text>
          {actions.map((action, i) => (
            <Text
              key={action.id}
              {...(i === actionIndex
                ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
                : {})}
            >
              {i === actionIndex ? '❯ ' : '  '}
              {action.label}
              <Text color={i === actionIndex ? THEME.onYellow : THEME.muted}>
                {'  '}
                {action.detail}
              </Text>
            </Text>
          ))}
        </Box>
      )}

      {screen === 'target' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={THEME.yellowInk}>
            Continue this session in which agent?
          </Text>
          {targets.length === 0 && <Text color={THEME.muted}>none found on PATH</Text>}
          {targets.map((target, i) => (
            <Text
              key={target}
              {...(i === targetIndex
                ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
                : {})}
            >
              {i === targetIndex ? '❯ ' : '  '}
              {target}
            </Text>
          ))}
        </Box>
      )}

      {screen === 'running' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={THEME.yellowInk}>
            working on {selected?.agent}:{selected?.id.slice(0, 8)} … {elapsedLabel()}
          </Text>
          {progress.slice(-6).map((line, i) => (
            <Text key={i} color={THEME.muted}>
              {'  '}
              {line}
            </Text>
          ))}
        </Box>
      )}

      {screen === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          {error ? (
            <Text color="#FF6B6B">error: {error}</Text>
          ) : (
            <Text bold color={THEME.yellowInk}>
              done
            </Text>
          )}
          {results.map((line, i) => (
            <Text key={i} color={THEME.muted}>
              {'  '}
              {line}
            </Text>
          ))}
          {lastArtifact && (
            <Text color={THEME.muted}>
              {'  '}read it: {lastArtifact}
            </Text>
          )}
          <Text color={THEME.muted}>press enter to go back</Text>
        </Box>
      )}

      {status.length > 0 && <Text color={THEME.yellowInk}>{status}</Text>}
      {searching && screen === 'browse' && (
        <Box>
          <Text bold color={THEME.yellow}>
            search:{' '}
          </Text>
          <Text>{query}</Text>
          <Text color={THEME.yellowInk}>▏</Text>
        </Box>
      )}
      {screen !== 'done' && screen !== 'running' && hints.length > 0 && (
        <Text color={THEME.muted}>{hints}</Text>
      )}
    </Box>
  )

  function elapsedLabel(): string {
    return ''
  }
}

/**
 * How much of a row fits.
 *
 * Session ids are not one width: Claude's is a 36-character uuid, Pi's is a
 * timestamp and a uuid glued together, 62 characters. Padding to a constant made
 * every Pi row shove the columns after it out of line. So the id column is as
 * wide as the ids actually present, and when even that does not fit, columns are
 * dropped in order of how little they are missed.
 */
interface Layout {
  id: number
  meta: boolean
  size: boolean
  cwd: boolean
}

function layoutFor(columns: number, sessions: SessionRef[]): Layout {
  const longest = sessions.reduce((n, ref) => Math.max(n, ref.id.length), 0)
  const id = Math.min(Math.max(longest, 36), 64)
  const fixed = 2 + 8 + id + 10 + 18
  return {
    id,
    meta: columns - fixed >= 14,
    size: columns - fixed >= 10,
    cwd: columns - fixed - (columns - fixed >= 14 ? 14 : 0) >= 42,
  }
}

function Columns({ layout, width: columns }: { layout: Layout; width: number }): React.ReactElement {
  return (
    <Text color={THEME.muted} bold>
      {'  '}
      {'AGENT'.padEnd(8)}
      {'SESSION ID'.padEnd(layout.id)}
      {layout.meta ? 'MSGS'.padStart(7) + 'TURNS'.padStart(7) : ''}
      {layout.size ? 'SIZE'.padStart(10) : ''}
      {'MODIFIED'.padStart(18)}
      {layout.cwd ? `  ${'CWD'}` : ''}
      {columns < 0 ? '' : ''}
    </Text>
  )
}

function Row({
  ref_,
  active,
  layout,
  details,
}: {
  ref_: SessionRef
  active: boolean
  layout: Layout
  details: SessionDetails | undefined
}): React.ReactElement {
  const cwd = details?.cwd ?? ''
  const shortCwd = cwd.length > 44 ? `…${cwd.slice(-42)}` : cwd
  const style = active ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true } : {}
  return (
    <Text {...style}>
      {active ? '❯ ' : '  '}
      {ref_.agent.padEnd(8)}
      {/* Never truncated: it is the one field a reader may need to copy. A
          longer id simply pushes the rest along for that row. */}
      {ref_.id.padEnd(layout.id)}
      {layout.meta
        ? `${details ? String(details.messages) : '·'}`.padStart(7) +
          `${details ? String(details.userTurns) : '·'}`.padStart(7)
        : ''}
      {layout.size ? sizeLabel(ref_.bytes).padStart(10) : ''}
      {new Date(ref_.mtime).toISOString().slice(0, 16).replace('T', ' ').padStart(18)}
      {layout.cwd ? `  ${shortCwd}` : ''}
    </Text>
  )
}

function Preview({
  ref_,
  details,
  scroll,
  height,
  width: columns,
}: {
  ref_: SessionRef
  details: SessionDetails | undefined
  scroll: number
  height: number
  width: number
}): React.ReactElement {
  if (!details) {
    return (
      <Box marginTop={1}>
        <Text color={THEME.yellow}>reading {ref_.id} …</Text>
      </Box>
    )
  }
  const lines = details.preview
  const shown = lines.slice(Math.max(0, lines.length - height - scroll + 1), lines.length - scroll)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={THEME.muted}>
        {ref_.agent}:{ref_.id}
        {'  '}
        {details.messages} msg · {details.userTurns} user turns · {details.toolCalls} tool calls ·{' '}
        {details.tokens} tokens · {details.compactBoundaries} compaction(s)
      </Text>
      {details.cwd && <Text color={THEME.muted}>cwd: {details.cwd}</Text>}
      {details.branch && (
        <Text color={THEME.muted}>
          branch: {details.branch}
          {details.model ? ` · model: ${details.model}` : ''}
          {details.first ? ` · ${details.first.slice(0, 16).replace('T', ' ')} → ${details.last?.slice(0, 16).replace('T', ' ')}` : ''}
        </Text>
      )}
      <Text color={THEME.yellowInk}>
        {'─'.repeat(Math.max(10, Math.min(columns - 2, 100)))}
      </Text>
      {shown.map((line, i) => (
        <Text key={`${line.evt}-${i}`} wrap="truncate">
          <Text
            color={line.role === 'user' ? THEME.yellow : THEME.muted}
            bold={line.role === 'user'}
          >
            {line.role === 'user' ? 'user  ' : line.role === 'agent' ? 'agent ' : 'tool  '}
          </Text>
          <Text>{line.text.slice(0, Math.max(20, columns - 10))}</Text>
        </Text>
      ))}
      {lines.length === 0 && <Text color={THEME.muted}>no user or agent turns in this session</Text>}
    </Box>
  )
}
