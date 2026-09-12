/**
 * `ccompactor --tui`
 *
 * The same work as the flags, without having to know them. A session browser
 * that filters, shows what a session is, extracts it, and offers the handoff
 * command — in that order, because that is the order anyone actually works in.
 *
 * It hands the terminal over to the launched agent rather than embedding it:
 * a TUI that keeps the screen while another agent runs in a pty is a TUI that
 * breaks both.
 */
import { Box, Text, render, useApp, useInput, useStdout } from 'ink'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { listSessions, fuzzyScore } from '../discover/index.js'
import { extractSession } from '../extract.js'
import { plan, installed, type Target } from '../handoff/index.js'
import type { SessionRef } from '../ir/types.js'
import { THEME, hazard, sizeLabel, width } from './theme.js'

type Screen = 'browse' | 'detail' | 'handoff'

interface AppProps {
  outDir: string
  anyProject: boolean
  onDone: (code: number) => void
}

function App({ outDir, anyProject, onDone }: AppProps): React.ReactElement {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [rows, setRows] = useState<SessionRef[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [screen, setScreen] = useState<Screen>('browse')
  const [status, setStatus] = useState('')
  const [artifact, setArtifact] = useState<string | undefined>()
  const [targets, setTargets] = useState<Target[]>([])
  const height = Math.max(6, (stdout?.rows ?? 30) - 8)

  useEffect(() => {
    void (async () => {
      setRows(await listSessions({ anyProject }))
      setTargets(installed())
      setLoading(false)
    })()
  }, [anyProject])

  const filtered = useMemo(() => {
    if (query.trim().length === 0) return rows
    return rows
      .map((ref) => ({ ref, score: fuzzyScore(query, `${ref.agent} ${ref.id} ${ref.path}`) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((hit) => hit.ref)
  }, [rows, query])

  const selected = filtered[Math.min(cursor, Math.max(0, filtered.length - 1))]

  const runExtract = useCallback(async () => {
    if (!selected) return
    setStatus(`extracting ${selected.agent}:${selected.id} …`)
    try {
      const result = await extractSession(
        `${selected.agent}:${selected.id}`,
        { outDir, anyProject },
        (stage, message) => setStatus(`${stage}: ${message}`),
      )
      setArtifact(result.written[0] ?? `${outDir}/handoff.md`)
      setStatus(
        `wrote ${result.rendered.tokens} tokens in ${result.elapsedMs} ms (${result.llm}) — h for handoff`,
      )
      setScreen('handoff')
    } catch (error) {
      setStatus(`error: ${(error as Error).message}`)
    }
  }, [selected, outDir, anyProject])

  const launch = useCallback(async () => {
    if (!artifact) return
    const target = targets[0]
    if (!target) {
      setStatus('no launchable agent found on PATH')
      return
    }
    const command = plan(target, artifact, process.cwd())
    // The terminal is handed over rather than shared: the child owns it.
    setStatus(`launching ${command.display}`)
    exit()
    const { spawnSync } = await import('node:child_process')
    const result = spawnSync(command.program, command.argv, { stdio: 'inherit' })
    onDone(result.status ?? 0)
  }, [artifact, targets, exit, onDone])

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
      onDone(0)
      return
    }
    if (searching) {
      if (key.return || key.escape) {
        setSearching(false)
      } else if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
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
    if (key.escape) {
      setScreen('browse')
      return
    }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
    if (key.downArrow) setCursor((c) => Math.min(filtered.length - 1, c + 1))
    if (key.return && selected) setScreen('detail')
    if (input === 'e') void runExtract()
    if (input === 'h' && artifact) setScreen('handoff')
  })

  if (loading) return <Text color={THEME.yellow}>scanning agent stores …</Text>

  const visible = filtered.slice(Math.max(0, cursor - height + 3), Math.max(height - 2, cursor + 1))

  return (
    <Box flexDirection="column">
      <Box>
        {hazard(stdout?.columns).map((cell, i) => (
          <Text key={i} color={cell.dim ? THEME.stripeDim : THEME.yellow}>
            {cell.ch}
          </Text>
        ))}
      </Box>

      <Box>
        <Text bold backgroundColor={THEME.yellow} color={THEME.onYellow}>
          {' ccompactor '}
        </Text>
        <Text color={THEME.muted}>
          {'  '}
          {filtered.length} of {rows.length} session(s)
          {anyProject ? ' · all projects' : ''}
        </Text>
      </Box>

      {searching ? (
        <Box>
          <Text bold color={THEME.yellow}>search: </Text>
          <Text>{query}</Text>
          <Text color={THEME.yellowInk}>▏</Text>
        </Box>
      ) : (
        <Text color={THEME.muted}>
          / search · ↑↓ move · enter detail ·{' '}
          <Text color={THEME.yellowInk}>e</Text> extract ·{' '}
          <Text color={THEME.yellowInk}>h</Text> handoff · q quit
        </Text>
      )}

      <Box flexDirection="column" marginTop={1}>
        {visible.map((ref, index) => {
          const active = filtered[cursor]?.id === ref.id
          return (
            <Text
              key={`${ref.path}:${index}`}
              {...(active
                ? { backgroundColor: THEME.yellow, color: THEME.onYellow, bold: true }
                : {})}
            >
              {active ? '❯ ' : '  '}
              {ref.agent.padEnd(7)}
              {ref.id.slice(0, 36).padEnd(38)}
              {sizeLabel(ref.bytes).padStart(8)}{' '}
              {new Date(ref.mtime).toISOString().slice(0, 16).replace('T', ' ')}
            </Text>
          )
        })}
      </Box>

      {screen !== 'browse' && selected && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={THEME.yellow} paddingX={1}>
          <Text bold color={THEME.yellowInk}>
            {selected.agent}:{selected.id}
          </Text>
          <Text color={THEME.muted}>{selected.path}</Text>
          {screen === 'detail' && (
            <Text>
              {sizeLabel(selected.bytes)} · modified{' '}
              {new Date(selected.mtime).toISOString().slice(0, 19).replace('T', ' ')}
              {'\n'}Press e to extract.
            </Text>
          )}
          {screen === 'handoff' && artifact && (
            <Text>
              artifact: {artifact}
              {'\n'}targets on PATH: {targets.join(', ') || 'none'}
              {'\n'}
              {targets[0] ? plan(targets[0], artifact, process.cwd()).display : ''}
              {'\n'}Press h again or enter to launch.
            </Text>
          )}
        </Box>
      )}

      {status.length > 0 && (
        <Box marginTop={1}>
          <Text color={THEME.yellowInk}>{status}</Text>
        </Box>
      )}
    </Box>
  )
}


export async function runTui(options: { outDir?: string; anyProject?: boolean } = {}): Promise<number> {
  let code = 0
  const app = render(
    <App
      outDir={options.outDir ?? '.ccompactor'}
      anyProject={options.anyProject ?? true}
      onDone={(value: number) => {
        code = value
      }}
    />,
  )
  await app.waitUntilExit()
  return code
}
