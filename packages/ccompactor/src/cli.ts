#!/usr/bin/env node
/**
 * The `ccompactor` command.
 *
 * stdout carries the payload and nothing else; progress, warnings and
 * diagnostics go to stderr. That split is what makes the tool scriptable, and
 * what lets an agent pipe `--json` into a parser without also getting a log.
 */
import { Command } from 'commander'
import { VERSION } from './version.js'
import { adapters } from './adapters/index.js'
import { listSessions, findSessions, resolveSession } from './discover/index.js'
import { AmbiguousError, UsageError } from './discover/index.js'
import { approxTokens } from './ir/tokens.js'
import type { SessionRef } from './ir/types.js'

const program = new Command()

program
  .name('ccompactor')
  .description(
    'Extract any coding agent session into a compact, verified, provenance-linked handoff any other agent can continue from.',
  )
  .version(VERSION)
  .option('--json', 'machine-readable output on stdout')
  .option('--quiet', 'suppress progress and diagnostics on stderr')
  .option('--tui', 'open the interactive browser')
  .option(
    '--out <dir>',
    'output directory, for every command that writes one (default: .ccompactor)',
    '.ccompactor',
  )
  .showHelpAfterError()

function note(message: string): void {
  if (!program.opts()['quiet']) process.stderr.write(`${message}\n`)
}

function emit(value: unknown, text: string): void {
  if (program.opts()['json']) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  else process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
}

program
  .command('doctor')
  .description('Report the agent stores and LLM backends found on this machine.')
  .action(async () => {
    const rows = adapters().map((adapter) => ({
      agent: adapter.kind,
      label: adapter.label,
      store: adapter.store(),
      available: adapter.available(),
    }))
    const backends = await backendRows()
    if (program.opts()['json']) {
      emit({ schema: 'ccompactor.doctor/v1', adapters: rows, backends }, '')
      return
    }
    const lines = table(
      ['ADAPTER', 'STORE', 'STATUS'],
      rows.map((row) => [row.agent, row.store, row.available ? 'found' : 'not found']),
    ).split('\n')
    const counts = await Promise.all(
      adapters().map(async (a) =>
        a.available() ? (await a.list({ anyProject: true })).length : 0,
      ),
    )
    lines.push('')
    lines.push(
      adapters()
        .map((a, i) => `${a.kind}: ${counts[i] ?? 0} session(s)`)
        .join('   '),
    )
    lines.push('')
    // `doctor` promises the backends as well as the stores, and the backend is
    // the half a developer has to choose before `extract` will summarise
    // anything: `--llm none` always works, everything else needs a key.
    lines.push(...table(['BACKEND', 'STATUS'], backends.map((b) => [b.backend, b.status])).split('\n'))
    emit(null, lines.join('\n'))
  })

program
  .command('list')
  .description('List sessions found in the agents\u2019 stores, newest first.')
  .option('--agent <kind>', 'restrict to one agent')
  .option('--project <path>', 'sessions belonging to this project', process.cwd())
  .option('--any-project', 'ignore the project filter')
  .option('--limit <n>', 'show at most this many', (v) => Number.parseInt(v, 10), 40)
  .action(async (opts) => {
    const refs = await listSessions({
      project: opts.project,
      anyProject: opts.anyProject === true,
      ...(opts.agent ? { agents: [opts.agent] } : {}),
    })
    const shown = refs.slice(0, opts.limit)
    if (program.opts()['json']) {
      emit({ schema: 'ccompactor.list/v1', sessions: shown, total: refs.length }, '')
      return
    }
    emit(null, renderTable(shown, refs.length))
  })

program
  .command('find <query>')
  .description('Find sessions by id, project, or the first thing the human asked for.')
  .option('--agent <kind>', 'restrict to one agent')
  .option('--project <path>', 'sessions belonging to this project', process.cwd())
  .option('--any-project', 'ignore the project filter')
  .option('--limit <n>', 'show at most this many', (v) => Number.parseInt(v, 10), 20)
  .action(async (query: string, opts) => {
    const hits = await findSessions(query, {
      project: opts.project,
      anyProject: opts.anyProject === true,
      ...(opts.agent ? { agents: [opts.agent] } : {}),
    })
    const shown = hits.slice(0, opts.limit)
    if (program.opts()['json']) {
      emit({ schema: 'ccompactor.find/v1', query, matches: shown }, '')
      return
    }
    if (shown.length === 0) {
      note(`no session matches \`${query}\``)
      emit(null, '')
      return
    }
    emit(null, renderTable(shown.map((h) => h.ref), hits.length))
  })

program
  .command('resolve <reference>')
  .description('Resolve a session reference and print what it points at.')
  .option('--any-project', 'ignore the project filter')
  .action(async (reference: string, opts) => {
    const ref = await resolveSession(reference, { anyProject: opts.anyProject === true })
    emit({ schema: 'ccompactor.resolve/v1', session: ref }, `${ref.agent}:${ref.id}\n${ref.path}`)
  })

program
  .command('extract <reference>')
  .description('Produce a handoff artifact from a session. The main command.')
  .option('--llm <mode>', 'none | auto | api:anthropic | api:openai | api:compat/<model>', 'auto')
  .option('--format <kind>', 'handoff (default) or transcript', 'handoff')
  .option('--full', 'with --format transcript, include tool calls and output')
  .option('--focus <text>', 'bias the summary toward this')
  .option('--instructions <text>', 'extra instructions for the summary')
  .option('--dry-run', 'plan the run without writing anything')
  .option('--any-project', 'ignore the project filter')
  .action(async (reference: string, opts) => {
    const { extractSession } = await import('./extract.js')
    const { parseSelection, resolveAuto } = await import('./llm/index.js')
    const selection = opts.llm === 'auto' ? resolveAuto() : parseSelection(opts.llm)
    const result = await extractSession(
      reference,
      {
        outDir: program.opts()['out'] ?? '.ccompactor',
        llm: selection,
        ...(opts.focus ? { focus: opts.focus } : {}),
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
        dryRun: opts.dryRun === true,
        anyProject: opts.anyProject === true,
        format: opts.format === 'transcript' ? 'transcript' : 'handoff',
        full: opts.full === true,
      },
      note,
    )
    if (program.opts()['json']) {
      emit({ schema: 'ccompactor.extract/v1', ...result.rendered.json, written: result.written }, '')
      return
    }
    note(
      `${result.rendered.tokens} token artifact in ${result.elapsedMs} ms via ${result.llm}` +
        (opts.dryRun ? ' (dry run, nothing written)' : ''),
    )
    emit(null, result.written[0] ?? result.rendered.markdown)
  })

program
  .command('expand <reference> <ranges...>')
  .description('Print the events behind an `[evt a-b]` pointer.')
  .option('--context <n>', 'extra events on each side', (v) => Number.parseInt(v, 10), 0)
  .option('--max-payload <tokens>', 'token ceiling per page', (v) => Number.parseInt(v, 10), 4000)
  .option('--page <n>', 'which page to print, 1-based', (v) => Number.parseInt(v, 10), 1)
  .option('--any-project', 'ignore the project filter')
  .action(async (reference: string, ranges: string[], opts) => {
    const { resolveSession, readSession } = await import('./discover/index.js')
    const { expand, expandRange, parseRange } = await import('./artifact/expand.js')
    const ref = await resolveSession(reference, { anyProject: opts.anyProject === true })
    const ir = await readSession(ref)
    const parsed = ranges.map(parseRange)
    const options = {
      context: opts.context,
      page: { index: opts.page, tokens: opts.maxPayload },
    }
    if (program.opts()['json']) {
      // `expandRange` rather than `expand`: the JSON form carries the events
      // themselves. This used to emit `null`, because the only thing the
      // expansion produced was a rendered string.
      emit(
        {
          schema: 'ccompactor.expand/v1',
          session: { agent: ref.agent, id: ref.id, path: ref.path },
          ranges: await expandRange(ir, parsed, options),
        },
        '',
      )
      return
    }
    emit(null, await expand(ir, parsed, options))
  })

program
  .command('verify <dir>')
  .description('Re-check an artifact: schema, and whether its quotes are in the transcript.')
  .option('--strict', 'exit 7 when a quote cannot be found')
  .action(async (dir: string, opts) => {
    const { verify } = await import('./artifact/verify.js')
    const report = await verify(dir)
    emit({ schema: 'ccompactor.verify/v1', ...report }, JSON.stringify(report, null, 2))
    if (opts.strict && report.missingQuotes.length > 0) process.exitCode = 7
  })

program
  .command('handoff <reference>')
  .description('Launch a target agent with the handoff preloaded.')
  .requiredOption('--to <agent>', 'claude, openclaude, codex, pi, or generic')
  .option('--llm <mode>', 'none | auto | api:<provider>', 'auto')
  .option('--run', 'launch it rather than printing the command')
  .option('--any-project', 'ignore the project filter')
  .action(async (reference: string, opts) => {
    const { extractSession } = await import('./extract.js')
    const { plan, installed } = await import('./handoff/index.js')
    const { parseSelection, resolveAuto } = await import('./llm/index.js')
    const selection = opts.llm === 'auto' ? resolveAuto() : parseSelection(opts.llm)
    const result = await extractSession(
      reference,
      {
        outDir: program.opts()['out'] ?? '.ccompactor',
        llm: selection,
        anyProject: opts.anyProject === true,
      },
      note,
    )
    const artifact = result.written[0] ?? `${program.opts()['out'] ?? '.ccompactor'}/handoff.md`
    const launch = plan(opts.to, artifact, process.cwd())
    if (!opts.run) {
      note(`targets on PATH: ${installed().join(', ') || 'none'}`)
      if (launch.note) note(launch.note)
      emit({ schema: 'ccompactor.handoff/v1', ...launch, artifact }, launch.display)
      return
    }
    if (launch.program === '') {
      process.stderr.write(`error: \`${opts.to}\` cannot be launched; ${launch.note}\n`)
      process.exitCode = 2
      return
    }
    // The terminal is handed over, not shared: the child owns it.
    const { spawnSync } = await import('node:child_process')
    const child = spawnSync(launch.program, launch.argv, { stdio: 'inherit' })
    process.exitCode = child.status ?? 0
  })

program
  .command('update')
  .description('Update ccompactor to the newest release.')
  .option('--check', 'report whether a newer release exists, and stop')
  .option('--dry-run', 'say what would happen without changing anything')
  .action(async (opts: { check?: boolean; dryRun?: boolean }) => {
    const { update } = await import('./update/index.js')
    const result = await update({ check: opts.check, dryRun: opts.dryRun })
    if (program.opts()['json']) {
      emit(
        {
          schema: 'ccompactor.update/v1',
          current: result.current,
          latest: result.latest,
          kind: result.kind,
          location: result.location,
          changed: result.changed,
          message: result.message,
        },
        '',
      )
      return
    }
    emit(null, result.message)
    // `--check` is asked as a question, so "an update is available" is not a
    // failure. Everywhere else a declined update exits non-zero, which is what
    // a script wrapping `ccompactor update` needs to notice.
    if (!result.changed && !opts.check && !opts.dryRun && result.current !== result.latest) {
      process.exitCode = 1
    }
  })

program
  .command('skill <action>')
  .description('Install, uninstall, or locate the Agent Skill.')
  .action(async (action: string) => {
    const { install, uninstall, skillTargets, payloadDir } = await import('./skill/index.js')
    if (action === 'install') {
      const written = await install()
      emit({ schema: 'ccompactor.skill/v1', action, written }, written.join('\n'))
      return
    }
    if (action === 'uninstall') {
      const removed = await uninstall()
      emit({ schema: 'ccompactor.skill/v1', action, removed }, removed.join('\n'))
      return
    }
    if (action === 'path') {
      const rows = [{ payload: payloadDir() }, ...skillTargets()]
      emit({ schema: 'ccompactor.skill/v1', action, rows }, JSON.stringify(rows, null, 2))
      return
    }
    process.stderr.write('error: expected install, uninstall, or path\n')
    process.exitCode = 2
  })

program
  .command('bench <references...>')
  .description('Measure whether a handoff artifact actually hands anything off.')
  .option('--llm <mode>', 'backend that plays the successor agent', 'auto')
  .option('--arms <list>', 'none,tail,artifact,retrieval', 'none,tail,artifact,retrieval')
  .option('--brief <n>', 'questions of this class', (v) => Number.parseInt(v, 10), 6)
  .option('--deep <n>', '', (v) => Number.parseInt(v, 10), 8)
  .option('--recent <n>', '', (v) => Number.parseInt(v, 10), 4)
  .option('--expansions <n>', 'retrieval rounds allowed', (v) => Number.parseInt(v, 10), 3)
  .option('--artifact <file>', 'benchmark this artifact file instead of rendering one')
  .option('--questions <file>', 'ask exactly these questions (from --emit-questions)')
  .option('--emit-questions <file>', 'write the derived questions and stop')
  .option('--show-answers', 'print what the successor answered for each question')
  .option('--any-project', 'ignore the project filter')
  .action(async (references: string[], opts) => {
    const { runBench, renderTable } = await import('./bench/run.js')
    const { questions: deriveQuestions } = await import('./bench/index.js')
    const { parseSelection, resolveAuto } = await import('./llm/index.js')
    const fs = await import('node:fs/promises')

    const benchSettings = {
      brief: opts.brief,
      deep: opts.deep,
      recent: opts.recent,
      expansions: opts.expansions,
    }

    // Emitting needs no model, so it is a separate path rather than a mode of a
    // run that would otherwise spend money to produce a question list.
    if (opts.emitQuestions) {
      const { resolveSession, readSession } = await import('./discover/index.js')
      const { buildLedgers } = await import('./ledgers/index.js')
      const ref = await resolveSession(references[0]!, { anyProject: opts.anyProject === true })
      const ir = await readSession(ref, { light: true })
      const list = deriveQuestions(ir, buildLedgers(ir), benchSettings)
      await fs.writeFile(opts.emitQuestions, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
      note(`${list.length} question(s) written to ${opts.emitQuestions}`)
      process.stdout.write(`${opts.emitQuestions}\n`)
      return
    }

    const shared = opts.questions
      ? (JSON.parse(await fs.readFile(opts.questions, 'utf8')) as never[])
      : undefined
    const selection = opts.llm === 'auto' ? resolveAuto() : parseSelection(opts.llm)
    const result = await runBench(
      references,
      {
        llm: selection,
        arms: opts.arms.split(',').map((a: string) => a.trim()) as never,
        bench: benchSettings,
        ...(shared ? { questions: shared } : {}),
        ...(program.opts()['out'] ? { outDir: program.opts()['out'] } : {}),
        ...(opts.artifact ? { artifactOverride: opts.artifact } : {}),
        discover: { anyProject: opts.anyProject === true },
      },
      note,
    )
    if (program.opts()['json']) {
      emit({ schema: 'ccompactor.bench/v1', backend: result.backend, trials: result.trials }, '')
      return
    }
    process.stdout.write(renderTable(result.scores, result.trials, result.backend))
    if (opts.showAnswers) {
      process.stdout.write('\nanswers\n')
      for (const trial of result.trials) {
        process.stdout.write(
          `\n[${trial.arm}] ${trial.question} (${trial.class}) ${trial.correct ? 'correct' : 'WRONG'} — ${trial.answer.replace(/\s+/g, ' ').slice(0, 300)}\n`,
        )
      }
    }
  })

/**
 * Rows of columns as text, each column as wide as its widest cell.
 *
 * Fixed widths were the source of two bugs: a sixty-character session id
 * overflowed its column, and a store path longer than 41 characters did the
 * same. Measuring the data removes the guess.
 */
function table(head: string[], rows: string[][]): string {
  const width = (i: number) =>
    Math.max(head[i]?.length ?? 0, ...rows.map((r) => r[i]?.length ?? 0))
  return [head, ...rows]
    .map((row) => row.map((cell, i) => cell.padEnd(width(i))).join('   ').replace(/\s+$/, ''))
    .join('\n')
}

/** Which `--llm` modes this machine can actually use right now. */
async function backendRows(): Promise<Array<{ backend: string; status: string }>> {
  const { resolveAuto, selectionLabel } = await import('./llm/index.js')
  const auto = resolveAuto()
  const key = (name: string) => (process.env[name] ? 'set' : 'not set')
  return [
    { backend: 'none', status: 'always available (no model, nothing leaves the machine)' },
    { backend: 'auto', status: `currently resolves to ${selectionLabel(auto)}` },
    { backend: 'api:anthropic', status: `ANTHROPIC_API_KEY ${key('ANTHROPIC_API_KEY')}` },
    { backend: 'api:openai', status: `OPENAI_API_KEY ${key('OPENAI_API_KEY')}` },
    {
      backend: 'api:compat/<model>',
      status: `CCOMPACTOR_BASE_URL ${key('CCOMPACTOR_BASE_URL')}, CCOMPACTOR_API_KEY ${key('CCOMPACTOR_API_KEY')}`,
    },
  ]
}

/**
 * The table `list` and `find` share.
 *
 * Column widths come from the data rather than from a constant, because a codex
 * session id is sixty characters and a Claude one is thirty-six: padding to a
 * fixed 38 let the long ids run straight into the size column, so the table a
 * developer reads first was misaligned for most of what it listed.
 *
 * An id that still does not fit is cut from the *left*. Codex and Pi ids are
 * `<timestamp>_<uuid>` and the timestamp is already in the modified column, so
 * the tail is the half that identifies the session. The untruncated ids are one
 * `--json` away.
 */
function renderTable(refs: SessionRef[], total: number): string {
  if (refs.length === 0) return 'no sessions found. Run `ccompactor doctor`.'
  const rows = refs.map((ref) => [
    ref.agent,
    ref.id,
    sizeLabel(ref.bytes),
    new Date(ref.mtime).toISOString().slice(0, 16).replace('T', ' '),
  ])
  const head = ['AGENT', 'ID', 'SIZE', 'MODIFIED']
  const width = (i: number) =>
    Math.max(head[i]?.length ?? 0, ...rows.map((r) => r[i]?.length ?? 0))
  // Agent, size and modified are short and fixed by their own content; the id
  // takes whatever is left.
  const columns = process.stdout.columns ?? Number(process.env.COLUMNS) ?? 0
  const fixed = width(0) + width(2) + width(3) + 3 * 3
  const idWidth = columns > 0 ? Math.max(24, columns - fixed) : width(1)
  // The header has to agree with the cells, so the id column is measured once.
  const columnWidth = (i: number) => (i === 1 ? Math.min(width(1), idWidth) : width(i))
  const cell = (text: string, i: number) => {
    if (i !== 1 || text.length <= idWidth) return text.padEnd(columnWidth(i))
    return `\u2026${text.slice(-(idWidth - 1))}`.padEnd(columnWidth(i))
  }
  return [head, ...rows]
    .map((row) => row.map(cell).join('   ').replace(/\s+$/, ''))
    .concat(total > refs.length ? [`\n${total - refs.length} more; raise --limit to see them`] : [])
    .join('\n')
}

function sizeLabel(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The value of a `--flag value` or `--flag=value` pair, before commander runs. */
function flagValue(argv: string[], name: string): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === name) return argv[i + 1]
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
  }
  return undefined
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    program.help()
    return 0
  }
  if (argv.includes('--tui')) {
    // Read from argv, not from `program.opts()`: commander has not parsed
    // anything at this point, so every option is undefined and `--out` was
    // silently ignored in favour of the default.
    const { runTui } = await import('./tui/index.js')
    return runTui({
      outDir: flagValue(argv, '--out') ?? '.ccompactor',
      anyProject: flagValue(argv, '--project') === undefined,
    })
  }
  try {
    await program.parseAsync(process.argv)
    // An action's `process.exitCode` is the command's answer: `verify --strict`
    // documents exit 7, and `handoff --run` mirrors the agent it launched.
    // Returning a fixed 0 discarded both, and `process.exit(0)` below made it
    // final.
    return typeof process.exitCode === 'number' ? process.exitCode : 0
  } catch (error) {
    const code = (error as { exitCode?: number }).exitCode ?? 1
    if (error instanceof AmbiguousError) {
      // Candidates go to stdout: the caller asked a question, and this is the
      // answer, not a diagnostic.
      process.stdout.write(
        `${JSON.stringify(
          {
            schema: 'ccompactor.ambiguous/v1',
            reference: error.reference,
            candidates: error.candidates,
          },
          null,
          2,
        )}\n`,
      )
      process.stderr.write(`${error.message}; the candidates are on stdout\n`)
      return code
    }
    if (error instanceof UsageError) {
      process.stderr.write(`error: ${error.message}\n`)
      return code
    }
    process.stderr.write(`error: ${(error as Error).message}\n`)
    return code
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`error: ${(error as Error).stack ?? String(error)}\n`)
    process.exit(1)
  },
)
