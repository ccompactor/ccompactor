/** Running the benchmark: build each arm's context, ask, score, report. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionIR } from '../ir/types.js'
import type { Ledgers } from '../ledgers/index.js'
import { readSession, resolveSession, type DiscoverOptions } from '../discover/index.js'
import { render } from '../artifact/render.js'
import { extractConstraints } from '../triage.js'
import { build, resolveAuto, selectionLabel, type Backend, type Selection } from '../llm/index.js'
import { expand } from '../artifact/expand.js'
import {
  ARMS,
  answeredBy,
  questions,
  requestedRange,
  score,
  DEFAULT_BENCH,
  type Arm,
  type BenchOptions,
  type Question,
  type Trial,
} from './index.js'

export interface BenchRun {
  backend: string
  questions: number
  trials: Trial[]
  scores: ReturnType<typeof score>
}

export async function runBench(
  references: string[],
  options: {
    llm?: Selection
    arms?: Arm[]
    bench?: Partial<BenchOptions>
    outDir?: string
    discover?: DiscoverOptions
    /**
     * Use this file as the artifact instead of rendering one.
     *
     * The point is comparison. Two tools can be measured on the same session and
     * the same questions, and the only way to tell whether a difference is the
     * artifact or the harness is to hold one of them fixed.
     */
    artifactOverride?: string
    /**
     * Use exactly these questions instead of deriving them.
     *
     * Two tools can be pointed at the same session and the same questions, but
     * each derives its own from its own event model — so they end up asking
     * different things at different difficulties, and comparing the scores
     * compares the questions. Reading a shared file is the only way the two
     * numbers mean the same thing.
     */
    questions?: Question[]
  } = {},
  progress: (message: string) => void = () => {},
): Promise<BenchRun> {
  const arms = options.arms ?? ARMS
  const bench = { ...DEFAULT_BENCH, ...options.bench }
  const selection = options.llm ?? resolveAuto()
  const backend = build(selection)
  if (!backend) {
    throw new Error(
      'the benchmark needs a backend that can read the context: pass --llm api:<provider>. Without one there is no successor agent and nothing to measure.',
    )
  }

  if (options.questions) {
    // A shared question set describes one session; expand against that one.
    references = references.slice(0, 1)
  }

  const trials: Trial[] = []
  const perSession: unknown[] = []

  for (const reference of references) {
    const ref = await resolveSession(reference, options.discover ?? {})
    const ir = await readSession(ref)
    const ledgers = (await import('../ledgers/index.js')).buildLedgers(ir)
    const constraints = extractConstraints(ir)
    const artifact = options.artifactOverride
      ? await (await import('node:fs/promises')).readFile(options.artifactOverride, 'utf8')
      : render({ ir, ledgers, constraints, engine: 'deterministic' }).markdown
    const tail = tailOf(ir)
    const asked = options.questions ?? questions(ir, ledgers, bench)
    if (asked.length === 0) {
      progress(`${reference}: no checkable questions could be derived; skipping`)
      continue
    }
    progress(`${reference}: ${asked.length} question(s) × ${arms.length} arm(s)`)

    const sessionTrials: Trial[] = []
    for (const arm of arms) {
      for (const question of asked) {
        sessionTrials.push(
          await trial(backend, arm, question, artifact, tail, ir, ledgers, bench),
        )
      }
    }
    trials.push(...sessionTrials)
    const sessionScores = score(sessionTrials)
    perSession.push({
      session: `${ref.agent}:${ref.id}`,
      questions: asked.length,
      arms: summarize(sessionScores),
    })
  }

  const scores = score(trials)
  if (options.outDir) {
    await mkdir(options.outDir, { recursive: true })
    const report = {
      schema: 'ccompactor.bench/v1',
      backend: selectionLabel(selection),
      artifact: options.artifactOverride ?? 'ccompactor (rendered)',
      settings: bench,
      arms,
      questions: trials.length / Math.max(1, arms.length),
      arms_scores: summarize(scores),
      sessions: perSession,
      trials,
    }
    await writeFile(join(options.outDir, 'bench.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await writeFile(join(options.outDir, 'bench.md'), renderTable(scores, trials, selectionLabel(selection)), 'utf8')
  }

  return { backend: selectionLabel(selection), questions: trials.length / Math.max(1, arms.length), trials, scores }
}

async function trial(
  backend: Backend,
  arm: Arm,
  question: { prompt: string; key: string; class: string; id: string },
  artifact: string,
  tail: string,
  ir: SessionIR,
  ledgers: Ledgers,
  bench: BenchOptions,
): Promise<Trial> {
  const context = arm === 'none' ? '' : arm === 'tail' ? tail : artifact
  let conversation = ''
  let tokens = 0
  let expansions = 0
  let answer = ''

  for (let round = 0; round <= bench.expansions; round += 1) {
    const user =
      arm === 'none'
        ? `QUESTION: ${question.prompt}`
        : `${round === 0 ? `# CONTEXT\n\n${context}\n\n` : ''}${conversation}\nQUESTION: ${question.prompt}`
    tokens += Math.ceil(user.length / 4)
    try {
      const response = await backend.complete({ system: systemFor(arm), user, maxTokens: 400 })
      answer = response.text
    } catch (error) {
      conversation += `\n(backend error: ${(error as Error).message})\n`
      break
    }
    if (arm !== 'retrieval' || expansions >= bench.expansions) break
    const range = requestedRange(answer)
    if (!range) break
    expansions += 1
    const events = await expand(ir, [range])
    tokens += Math.ceil(events.length / 4)
    conversation += `\nYou asked for evt ${range[0]}..${range[1]}:\n${events}\n`
  }

  return {
    question: question.id,
    class: question.class as Trial['class'],
    arm,
    correct: answeredBy(question as never, answer),
    tokens,
    expansions,
    answer,
  }
}

/**
 * The retrieval arm's prompt has to carry three things the plain one does not:
 * that the context is a handoff artifact, the *condition* under which to ask
 * for more, and the fact that asking more than once is allowed.
 *
 * The first version stated only the mechanism. A model told "answer from the
 * context, do not guess — also, you may ask for events" has no reason to
 * prefer asking over saying NOT FOUND, and it said NOT FOUND: this arm fired 2
 * expansions across 18 questions where the reference implementation, given the
 * same questions and the same model, fired 8.
 */
function systemFor(arm: Arm): string {
  if (arm === 'retrieval') {
    return (
      'You are taking over a coding task from another agent. You are given a handoff artifact. ' +
      'Answer the question from it. If the artifact does not contain the answer, you may ask for ' +
      'the raw events by replying with a single line `EXPAND <start>..<end>`; you will be given ' +
      'those events and asked again. You may do that a few times. Otherwise answer in one short ' +
      'sentence, and say NOT FOUND if the context does not contain it.'
    )
  }
  return 'You are taking over a coding task from another agent. Answer the question using only the context you are given. Answer in one short sentence, and say NOT FOUND if the context does not contain the answer. Do not guess.'
}

/**
 * The recency window: the newest events that fit a fixed token budget.
 *
 * Budgeted, not proportional. The first version took the last tenth of the
 * messages, which on a 25,000-message session is 1,955,968 tokens — a "tail"
 * larger than most context windows, scoring zero because the context was
 * swamped rather than because the strategy is bad. An arm that loses for the
 * wrong reason measures nothing, and this is the arm the published evidence
 * says should be competitive (arXiv:2508.21433), so it has to be a fair one.
 */
const TAIL_TOKENS = 12_000

function tailOf(ir: SessionIR): string {
  const lines: string[] = []
  let spent = 0
  for (const message of [...ir.messages].reverse()) {
    const line = `evt ${message.eventIndex} ${message.role}: ${(message.text ?? '').slice(0, 600)}`
    const cost = Math.ceil(line.length / 4)
    if (spent + cost > TAIL_TOKENS) break
    spent += cost
    lines.push(line)
  }
  return lines.reverse().join('\n')
}

function summarize(scores: ReturnType<typeof score>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const arm of ARMS) {
    const s = scores[arm]
    if (!s) continue
    out[arm] = {
      asked: s.asked,
      correct: s.correct,
      accuracy: s.asked > 0 ? s.correct / s.asked : 0,
      tokens: s.tokens,
      tokensPerCorrect: s.correct > 0 ? Math.round(s.tokens / s.correct) : null,
      expansions: s.expansions,
      byClass: s.byClass,
    }
  }
  return out
}

export function renderTable(
  scores: ReturnType<typeof score>,
  trials: Trial[],
  backend: string,
): string {
  const lines: string[] = []
  lines.push('ccompactor handoff benchmark (ccompactor.bench/v1)')
  lines.push('')
  lines.push(`successor: ${backend}`)
  lines.push(`questions: ${Math.max(...Object.values(scores).map((s) => s.asked), 0)}`)
  lines.push('')
  lines.push(`${'arm'.padEnd(20)}${'correct'.padStart(9)}${'acc'.padStart(7)}${'tokens'.padStart(10)}${'tok/correct'.padStart(13)}`)
  for (const arm of ARMS) {
    const s = scores[arm]
    if (!s) continue
    const acc = s.asked > 0 ? `${Math.round((s.correct / s.asked) * 100)}%` : '—'
    const tpc = s.correct > 0 ? String(Math.round(s.tokens / s.correct)) : '—'
    lines.push(`${arm.padEnd(20)}${`${s.correct}/${s.asked}`.padStart(9)}${acc.padStart(7)}${String(s.tokens).padStart(10)}${tpc.padStart(13)}`)
  }
  lines.push('')
  lines.push(`${'by class'.padEnd(20)}${'brief'.padStart(9)}${'deep'.padStart(9)}${'recent'.padStart(9)}`)
  for (const arm of ARMS) {
    const s = scores[arm]
    if (!s) continue
    const cells = (['brief', 'deep', 'recent'] as const).map((cls) => {
      const slot = s.byClass[cls]
      return (slot ? `${slot[1]}/${slot[0]}` : '—').padStart(9)
    })
    lines.push(`${arm.padEnd(20)}${cells.join('')}`)
  }
  const expansions = Object.values(scores).reduce((n, s) => n + s.expansions, 0)
  if (expansions > 0) lines.push(`\nthe retrieval arm asked for more transcript ${expansions} time(s)`)
  lines.push(
    '\nThis measures whether a fresh agent can answer questions about the session from each context. It does not measure whether it resolves an issue.',
  )
  void trials
  return `${lines.join('\n')}\n`
}
