/**
 * The extraction pipeline.
 *
 * Deliberately a straight line: resolve, read, ledger, triage, optionally
 * summarise, render, write. Each stage is a pure function over the previous
 * one's output, so the whole thing is testable without a filesystem, a network,
 * or a terminal.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionRef } from './ir/types.js'
import { readSession, resolveSession, type DiscoverOptions } from './discover/index.js'
import { buildLedgers, type Ledgers } from './ledgers/index.js'
import { extractConstraints, type Constraint } from './triage.js'
import { render, type Rendered } from './artifact/render.js'
import { build, resolveAuto, selectionLabel, type Selection } from './llm/index.js'
import { summarise } from './compact/engine.js'

export interface ExtractOptions extends DiscoverOptions {
  outDir?: string
  llm?: Selection
  focus?: string
  instructions?: string
  /** Write nothing; return what would be written. */
  dryRun?: boolean
}

export interface Extraction {
  ref: SessionRef
  ledgers: Ledgers
  constraints: Constraint[]
  rendered: Rendered
  engine: string
  llm: string
  /** Absolute paths written, empty on a dry run. */
  written: string[]
  elapsedMs: number
}

export async function extractSession(
  reference: string,
  options: ExtractOptions = {},
  progress: (stage: string, message: string) => void = () => {},
): Promise<Extraction> {
  const started = Date.now()
  const ref = await resolveSession(reference, options)
  progress('resolve', `${ref.agent}:${ref.id} → ${ref.path}`)

  const ir = await readSession(ref, { includeSidechains: false })
  progress(
    'parse',
    `${ir.messages.length} message(s), ${ir.compactBoundaries.length} compact boundary(ies), ${ir.diagnostics.length} diagnostic(s)`,
  )

  const ledgers = buildLedgers(ir)
  progress(
    'ledgers',
    `${ledgers.files.length} files, ${ledgers.commands.length} commands, ${ledgers.errors.length} error signatures`,
  )

  const constraints = extractConstraints(ir)
  progress('triage', `${constraints.length} standing instruction(s)`)

  const selection = options.llm ?? resolveAuto()
  let summary: string | undefined
  let engine = 'deterministic'
  if (selection.kind !== 'none') {
    const backend = build(selection)
    if (backend) {
      progress('summary', `asking ${selectionLabel(selection)} for the continuation summary`)
      const produced = await summarise({ ir, ledgers, constraints }, backend, options)
      summary = produced
      engine = selectionLabel(selection)
      progress('summary', `${produced.length} characters returned`)
    }
  } else {
    progress('summary', 'skipped: --llm none. The deterministic artifact is still complete.')
  }

  const rendered = render({
    ir,
    ledgers,
    constraints,
    engine,
    ...(summary ? { summary } : {}),
    ...(options.focus ? { focus: options.focus } : {}),
  })

  const written: string[] = []
  if (!options.dryRun) {
    const outDir = options.outDir ?? '.ccompactor'
    await mkdir(outDir, { recursive: true })
    const write = async (name: string, body: string): Promise<void> => {
      const path = join(outDir, name)
      await writeFile(path, body, 'utf8')
      written.push(path)
    }
    await write('handoff.md', rendered.markdown)
    await write('handoff.json', `${JSON.stringify(rendered.json, null, 2)}\n`)
    await write(
      'ledgers.json',
      `${JSON.stringify(ledgers, null, 2)}\n`,
    )
    await write(
      'provenance.json',
      `${JSON.stringify(
        {
          schema: 'ccompactor.provenance/v1',
          source: ref.path,
          events: ir.messages.length,
          constraints: constraints.map((c) => ({ evt: c.evt, text: c.text })),
        },
        null,
        2,
      )}\n`,
    )
    await write(
      'state.json',
      `${JSON.stringify(
        {
          schema: 'ccompactor.state/v1',
          engine,
          constraintsFound: constraints.length,
          diagnostics: ir.diagnostics,
        },
        null,
        2,
      )}\n`,
    )
    progress('write', written.join(', '))
  }

  return {
    ref,
    ledgers,
    constraints,
    rendered,
    engine,
    llm: selectionLabel(selection),
    written,
    elapsedMs: Date.now() - started,
  }
}
