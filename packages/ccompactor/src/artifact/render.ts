/**
 * The handoff artifact.
 *
 * Layered cheapest-first, like sctxx, because a reader should be able to stop
 * as soon as it knows enough: the brief answers "what is this", the items
 * answer "what do I need to know", and the retrieval layer says where the rest
 * lives.
 *
 * Two rules are load-bearing and easy to break:
 *
 * 1. **Every claim carries its provenance.** A pointer is `[evt 12–19]`, and
 *    `ccompactor expand` turns one back into the transcript. An artifact whose
 *    claims cannot be checked is a summary, and a summary is what this tool
 *    exists to replace.
 *
 * 2. **Nothing mandatory is dropped to fit a budget.** The constraints block
 *    summarises itself rather than vanishing, because an artifact that fits its
 *    budget by deleting the section its own preamble calls binding is not
 *    smaller, it is wrong.
 */
import type { Ledgers } from '../ledgers/index.js'
import type { Constraint } from '../triage.js'
import type { SessionIR } from '../ir/types.js'
import { approxTokens, truncateMiddle } from '../ir/tokens.js'
import { VERSION } from '../version.js'

export interface RenderInput {
  ir: SessionIR
  ledgers: Ledgers
  constraints: Constraint[]
  /** The model's continuation summary, when one was produced. */
  summary?: string
  /** Which engine produced the summary, for the header. */
  engine: string
  /** Optional user-supplied focus, echoed so a reader knows the lens. */
  focus?: string
}

export interface Rendered {
  markdown: string
  json: Record<string, unknown>
  tokens: number
}

/**
 * The provider's own continuation preamble is a user turn and is not a request.
 *
 * Showing it as "last user request" tells a reader that the human's most recent
 * wish was to be given a summary of their own session.
 */
const CONTINUATION = /this session is being continued from a previous conversation/i

/** How files that live outside the session's project are reported. */
const OUTSIDE = '(outside the project)'

/** The brief's own ceiling. A brief that does not fit a screen is not a brief. */
const BRIEF_BUDGET = 1_200
/** Tokens the constraints block may spend before it starts counting itself. */
const CONSTRAINT_BUDGET = 700

export function render(input: RenderInput): Rendered {
  const { ir, ledgers, constraints } = input
  const out: string[] = []
  const lines: string[] = []

  out.push(frontMatter(input))
  out.push(`\n# Handoff: ${title(input)}\n`)
  out.push(preamble())

  let brief = ''
  let budget = BRIEF_BUDGET

  brief += `\n## L0 · Brief\n\n`

  if (ledgers.errors.length > 0) {
    // Before anything else: a reader who acts on a stale premise wastes the
    // whole session, and an unresolved failure is the most common stale premise.
    const top = ledgers.errors.slice(0, 3)
    brief += `**Known-broken at the end of the session**\n`
    for (const error of top) {
      brief += `- ${oneLine(error.signature, 160)} (×${error.occurrences}) [evt ${error.evt}]\n`
    }
    brief += '\n'
  }

  const first = ledgers.userTurns[0]
  const last = ledgers.userTurns.filter((t) => !CONTINUATION.test(t.text)).at(-1)
  if (first) {
    brief += `**Goal** (from the first user message, not model-inferred): ${oneLine(first.text, 300)} [evt ${first.evt}]\n\n`
  }

  // Constraints come this early on purpose: they outrank everything except the
  // fact that something is broken, and they are never dropped whole.
  if (constraints.length > 0) {
    brief += renderConstraints(constraints)
  }

  if (ledgers.files.length > 0) {
    const byDir = topDirectories(ledgers, projectRoot(input), 5)
    brief += `**Where the work was**\n`
    for (const [dir, count] of byDir) brief += `- \`${dir}\` — ${count} touch(es)\n`
    brief += '\n'
  }

  if (ledgers.commits.length > 0) {
    brief += `**What it committed** (${ledgers.commits.length} total)\n`
    for (const commit of ledgers.commits.slice(-5).reverse()) {
      brief += `- ${commit.subject} [evt ${commit.evt}]\n`
    }
    brief += '\n'
  }

  if (last && last !== first) {
    brief += `**Last user request**: ${oneLine(last.text, 300)} [evt ${last.evt}]\n\n`
  }

  if (ledgers.commands.length > 0) {
    const recent = ledgers.commands.slice(-3)
    brief += `**Last commands**\n`
    for (const command of recent) {
      brief += `- \`${oneLine(command.command, 120)}\` — ${command.failed ? 'FAILED' : 'ok'} [evt ${command.evt}]\n`
    }
    brief += '\n'
  }

  if (input.focus) brief += `**Focus requested**: ${input.focus}\n\n`

  brief += `**Verify first**\n- \`git status\`\n- \`git log --oneline -5\`\n\n`

  out.push(brief)
  budget -= Math.min(approxTokens(brief), budget)

  // L1 — the items layer, from the model when there is one.
  if (input.summary) {
    out.push(`\n## L1 · Continuation summary\n\n${stripAnalysis(input.summary)}\n`)
  } else {
    out.push(`\n## L1 · Continuation summary\n\n${sessionArc(input)}\n`)
  }

  // L2 — ledgers, the evidence the summary cannot replace.
  out.push(renderLedgers(input))

  // The recency tail was tried here and removed.
  //
  // Carrying the last 12,000 tokens verbatim is what sctxx does, and copying it
  // seemed obviously right: a recency window is the one strategy with an
  // ablation behind it (arXiv:2508.21433). Measured on the same session, same
  // questions and same backend, it made retrieval *worse* — 38% to 27% across
  // three runs — and tripled the tokens. More context is not more answer, and
  // the arm that loses for the wrong reason is worth removing rather than
  // keeping for symmetry.

  // L3 — retrieval, so that everything dropped is still reachable.
  out.push(renderRetrieval(input))

  const markdown = out.join('')
  return {
    markdown,
    json: {
      schema: 'ccompactor.handoff/v1',
      version: VERSION,
      session: {
        agent: ir.ref.agent,
        id: ir.ref.id,
        path: ir.ref.path,
        events: ir.messages.length,
        userTurns: ledgers.counts.userTurns,
        compactBoundaries: ir.compactBoundaries.length,
      },
      engine: input.engine,
      constraints,
      ledgers,
      provenance: { source: ir.ref.path },
    },
    tokens: approxTokens(markdown),
  }
  void lines
}

function frontMatter(input: RenderInput): string {
  const { ir, ledgers } = input
  const cwd = ir.metadata['cwd']
  return `---
schema: ccompactor.handoff/v1
ccompactor: ${VERSION}
source: {agent: ${ir.ref.agent}, session: ${ir.ref.id}, events: ${ir.messages.length}, user_turns: ${ledgers.counts.userTurns}, compact_boundaries: ${ir.compactBoundaries.length}${typeof cwd === 'string' ? `, cwd: ${cwd}` : ''}}
engine: ${input.engine}
llm: ${input.summary ? 'on' : 'none'}
constraints: {found: ${input.constraints.length}}
${ledgers.counts.failedCommands > 0 ? `failures: {at_end: ${ledgers.errors.length}, failed_commands: ${ledgers.counts.failedCommands}}\n` : ''}---
`
}

function preamble(): string {
  return `
> A different coding agent worked on this task in an earlier session. What follows is a
> compressed, provenance-linked record of that session. Use it to build on the work already done
> instead of repeating it — but treat it as a map, not as ground truth. Run the verify-first
> commands before changing anything, treat "Hard constraints" as binding, and expand any
> \`[evt a–b]\` pointer you need with \`ccompactor expand\`.
`
}

/**
 * A short label, not the message.
 *
 * The first user turn is often a page of onboarding. The goal is quoted in full
 * a few lines below, so the title only has to say which task this is.
 */
const TITLE_MAX = 72

function title(input: RenderInput): string {
  const first = input.ledgers.userTurns[0]
  if (!first) return `${input.ir.ref.agent} session ${input.ir.ref.id}`
  const text = oneLine(first.text, 400)
  if (text.length <= TITLE_MAX) return text
  const cut = text.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u2014-]+$/, '')}\u2026`
}

function renderConstraints(constraints: Constraint[]): string {
  let block = `**Hard constraints** (standing instructions, quoted verbatim)\n`
  let spent = approxTokens(block)
  let shown = 0
  for (const constraint of constraints) {
    const line = `- "${oneLine(constraint.text, 240)}" [evt ${constraint.evt}]\n`
    const cost = approxTokens(line)
    if (shown > 0 && spent + cost > CONSTRAINT_BUDGET) break
    spent += cost
    shown += 1
    block += line
  }
  if (shown < constraints.length) {
    block += `- … and ${constraints.length - shown} more\n`
  }
  block += '\n'
  return block
}

function renderLedgers(input: RenderInput): string {
  const { ledgers } = input
  let out = `\n## L2 · Ledgers (deterministic, no model)\n\n`

  if (ledgers.files.length > 0) {
    out += `### Files touched (${ledgers.files.length})\n`
    for (const file of ledgers.files.slice(0, 40)) {
      const parts: string[] = []
      if (file.edits > 0) parts.push(`edit×${file.edits}`)
      if (file.writes > 0) parts.push(`write×${file.writes}`)
      if (file.reads > 0) parts.push(`read×${file.reads}`)
      out += `- \`${file.path}\` — ${parts.join(' ') || 'touched'} [evt ${file.firstEvt}–${file.lastEvt}]\n`
    }
    if (ledgers.files.length > 40) out += `- … and ${ledgers.files.length - 40} more\n`
    out += '\n'
  }

  if (ledgers.commands.length > 0) {
    out += `### Commands (${ledgers.commands.length}, ${ledgers.counts.failedCommands} failed)\n`
    const interesting = [
      ...ledgers.commands.filter((c) => c.failed).slice(-12),
      ...ledgers.commands.slice(-6),
    ]
    const unique = [...new Map(interesting.map((c) => [`${c.evt}:${c.command}`, c])).values()]
    for (const command of unique) {
      out += `- \`${oneLine(command.command, 160)}\` — ${command.failed ? 'FAILED' : 'ok'} [evt ${command.evt}]\n`
      if (command.failed && command.outputHead) {
        out += `  > ${oneLine(command.outputHead, 200)}\n`
      }
    }
    out += '\n'
  }

  if (ledgers.errors.length > 0) {
    out += `### Error signatures (${ledgers.errors.length})\n`
    for (const error of ledgers.errors.slice(0, 12)) {
      out += `- ×${error.occurrences} ${oneLine(error.signature, 200)} [evt ${error.evt}]\n`
    }
    out += '\n'
  }

  if (ledgers.toolUse.length > 0) {
    out += `### What was used\n${ledgers.toolUse
      .slice(0, 8)
      .map((t) => `\`${t.name}\`×${t.count}`)
      .join(' · ')}\n\n`
  }

  return out
}

/**
 * The newest events, verbatim, to a token budget.
 *
 * Verbatim is the point. A summary of the last exchange is exactly the artifact
 * that loses the detail that matters — the error string, the flag, the path —
 * and the recency window is cheap because it needs no model at all.
 */
const TAIL_TOKENS = 12_000
/** Per-event ceiling, so one pasted stack trace cannot spend the whole tail. */
const TAIL_EVENT_TOKENS = 400

function renderTail(input: RenderInput): string {
  const lines: string[] = []
  let spent = 0
  for (const message of [...input.ir.messages].reverse()) {
    const body = (message.text ?? '').replace(/\s+/g, ' ').trim()
    if (body.length === 0) continue
    const truncated = truncateMiddle(body, TAIL_EVENT_TOKENS)
    const role = message.isHumanTurn ? 'user' : message.role
    const tag = message.toolName ? `${role}·${message.toolName}` : role
    const line = `- [evt ${message.eventIndex} ${tag}] ${truncated}`
    const cost = approxTokens(line)
    if (spent + cost > TAIL_TOKENS) break
    spent += cost
    lines.push(line)
  }
  if (lines.length === 0) return ''
  return `\n## L2b · Recency tail (verbatim, ${lines.length} event(s))\n\n${lines.reverse().join('\n')}\n`
}

function renderRetrieval(input: RenderInput): string {
  const { ir, ledgers } = input
  const reference = `${ir.ref.agent}:${ir.ref.id}`
  let out = `\n## L3 · Retrieval\n\nSource: \`${ir.ref.path}\`\n\n`
  out += `Expand any pointer:\n\`\`\`sh\nccompactor expand ${reference} <a>..<b> --context 3\n\`\`\`\n\n`

  // The index is the whole point of this layer.
  //
  // Selection is the cheapest strategy there is, but only for a reader who can
  // look again — and a reader who can look again still needs to know *what* to
  // look for. Without ranges to ask for, the successor guesses, and measured
  // head to head against sctxx on the same sessions that was the entire gap:
  // 38% retrieval accuracy against 69%, with the deep-question class at 26%
  // against 78%. Same arms, same questions, same backend. The only difference
  // was that sctxx's artifact told the successor which ranges existed.
  const episodes = episodesOf(ir)
  const carried = new Set<number>()
  for (const file of ledgers.files.slice(0, 40)) carried.add(file.firstEvt)
  if (episodes.length > 0) {
    const total = episodes.reduce((n, episode) => n + episode.tokens, 0)
    out += `**Not carried verbatim** — ${episodes.length} episode(s), ${total} token(s), all reachable:\n`
    // Sampled across the whole session, never truncated from the front.
    //
    // The first version listed episodes in order and stopped at the budget, so
    // on a 341-episode session the index showed roughly the first twenty — all
    // of them near the start. A question about an event at 45,000 was then not
    // only unanswered but unaddressable: the reader had no range covering it and
    // no way to know one existed. That single mistake was worth 45 points of
    // retrieval accuracy against the same benchmark.
    const budget = 1_400
    const shown = sampleAcross(episodes, budget)
    for (const episode of shown) {
      out += `- evt ${episode.from}–${episode.to} · ${oneLine(episode.headline, 110)} · ${episode.tokens}\n`
    }
    if (shown.length < episodes.length) {
      out += `- (${episodes.length - shown.length} episode(s) between these are not listed; the ranges above are contiguous, so any event index in 0–${episodes.at(-1)!.to} can be asked for directly)\n`
    }
    out += '\n'
  }
  return out
}

/**
 * As many episodes as fit the budget, spread evenly across the session.
 *
 * Evenly, not newest-first and not from the front: the point of the index is
 * coverage of the whole transcript, and the questions worth asking are the ones
 * about the middle. Always includes the first and last.
 */
function sampleAcross(episodes: Episode[], budget: number): Episode[] {
  const costOf = (episode: Episode): number =>
    approxTokens(`- evt ${episode.from}–${episode.to} · ${oneLine(episode.headline, 110)} · ${episode.tokens}\n`)
  const total = episodes.reduce((n, e) => n + costOf(e), 0)
  if (total <= budget) return episodes
  const average = Math.max(1, total / episodes.length)
  const keep = Math.max(4, Math.floor(budget / average))
  const stride = episodes.length / keep
  const out: Episode[] = []
  for (let i = 0; i < keep; i += 1) {
    const episode = episodes[Math.floor(i * stride)]
    if (episode) out.push(episode)
  }
  const last = episodes.at(-1)
  if (last && out.at(-1) !== last) out.push(last)
  return out
}

interface Episode {
  from: number
  to: number
  headline: string
  tokens: number
}

/**
 * The session in chunks a reader can ask for: one per human turn.
 *
 * A human turn is where intent changes, so it is the natural boundary for a
 * range someone would want back — "the part where I asked about the parser" is
 * a request a reader can actually form, and `evt 1200–1450` is how they get it.
 */
/**
 * Is this turn the human asking for something, or the harness talking?
 *
 * A false negative costs a duller headline; a false positive puts the session's
 * own plumbing in the reader's face, so the test is deliberately narrow.
 */
function isRealRequest(text: string): boolean {
  if (CONTINUATION.test(text)) return false
  return !/^\s*<(task-notification|command-name|command-message|local-command)/i.test(text)
}

export function episodesOf(ir: SessionIR): Episode[] {
  const humanTurns = ir.messages.filter((m) => m.isHumanTurn)
  // Boundaries are real requests, not every human turn. A slice is delimited by
  // the turns inside it, so an episode whose first human turn is the provider's
  // continuation preamble has no other turn to fall back to — the only way to
  // stop it being the headline is to stop it being a boundary. A preamble means
  // the session was compacted, not that a new piece of work started.
  const real = humanTurns.filter((m) => m.text && isRealRequest(m.text))
  const boundaries = (real.length > 0 ? real : humanTurns).map((m) => m.eventIndex)
  if (boundaries.length === 0) return []
  const episodes: Episode[] = []
  for (const [index, from] of boundaries.entries()) {
    const next = boundaries[index + 1]
    const to = (next ?? ir.messages.at(-1)?.eventIndex ?? from) - 1
    const slice = ir.messages.filter((m) => m.eventIndex >= from && m.eventIndex <= Math.max(to, from))
    // The first human turn of a stretch is not always the human asking for
    // something: after a provider compaction it is the continuation preamble,
    // and a background task finishing arrives as a `<task-notification>`. Both
    // were being quoted as the headline of the episode, so "where the effort
    // went" listed the two heaviest stretches as prose about the tool's own
    // bookkeeping.
    const headline =
      slice.find((m) => m.isHumanTurn && m.text && isRealRequest(m.text))?.text ??
      slice.find((m) => m.isHumanTurn)?.text ??
      slice[0]?.text ??
      ''
    episodes.push({
      from,
      to: Math.max(to, from),
      headline,
      tokens: slice.reduce((n, m) => n + approxTokens(m.text ?? ''), 0),
    })
  }
  return episodes
}

/** Drop the model's scratchpad; only the summary itself is for the reader. */
export function stripAnalysis(text: string): string {
  const withoutAnalysis = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim()
  const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(withoutAnalysis)
  const body = summary ? summary[1]! : withoutAnalysis
  // Models do not always close the block they were told to open, and a stray
  // `<summary>` with no `<details>` renders as nothing in Markdown.
  return body.replace(/<\/?(?:summary|analysis)>/gi, '').trim()
}

/**
 * The session's shape, without a model.
 *
 * This is not a summary and does not pretend to be one: it cannot say what the
 * work *meant*. What it can say, from the ledgers alone, is where the effort
 * went and how the work moved — which is the half of a handoff a successor
 * needs in order to know which part of a 286-event session to read first.
 *
 * It replaced a paragraph explaining that nothing was here. An artifact whose
 * second section is an apology for itself reads as a broken tool, and the
 * apology was also wrong: the deterministic pass knows a great deal.
 */
function sessionArc(input: RenderInput): string {
  const { ir, ledgers } = input
  const episodes = episodesOf(ir)
  const out: string[] = [
    '> No model ran, so this is not a written summary — it is the session\'s shape, read off the',
    '> ledgers: where the effort went and how the work moved. For prose, `ccompactor narrate <dir>',
    '> --llm api:<provider>` writes one from this artifact, which is a fraction of the cost of',
    '> sending the transcript.',
    '',
  ]

  const counts = ledgers.counts
  out.push(
    `**The session in one line** — ${counts.userTurns} turn(s) from the human, ` +
      `${counts.toolCalls} tool call(s), ${ledgers.files.length} file(s) touched, ` +
      `${ledgers.commits.length} commit(s)` +
      (ir.compactBoundaries.length > 0
        ? `, and the provider compacted its own context ${ir.compactBoundaries.length} time(s)`
        : '') +
      '.',
  )
  out.push('')

  if (episodes.length > 1) {
    // Ranked by tokens rather than by length: the episodes that cost the most
    // context are the ones a successor has to understand first, and they are
    // rarely the last ones.
    const heaviest = [...episodes].sort((a, b) => b.tokens - a.tokens).slice(0, 5)
    out.push('**Where the effort went** (heaviest stretches of work)')
    for (const episode of heaviest) {
      out.push(
        `- ${episode.tokens.toLocaleString('en-US')} tok · evt ${episode.from}–${episode.to} · ` +
          `${oneLine(episode.headline, 150)} [evt ${episode.from}]`,
      )
    }
    out.push('')

    // The arc: fixed samples across the whole session, so a short beginning and
    // a long end are both represented rather than whichever came last.
    const arc = sampleAcross(episodes, 10)
    out.push('**How it moved** (sampled across the session)')
    for (const episode of arc) {
      out.push(`- evt ${episode.from} · ${oneLine(episode.headline, 120)}`)
    }
    out.push('')
  }

  out.push(
    '**What this does not tell you** — why any of it mattered, what was tried and abandoned, or',
    'which decisions were deliberate. The ledgers below carry the evidence those answers are made',
    'of; `L3 · Retrieval` says how to reach any of it.',
  )
  return out.join('\n')
}

/** The directory the session was working in, when the provider recorded one. */
function projectRoot(input: RenderInput): string {
  const cwd = input.ir.metadata['cwd']
  return typeof cwd === 'string' ? cwd.replace(/\/$/, '') : ''
}

/**
 * Where the work was, relative to the project.
 *
 * The first version split the absolute path and took its first two components,
 * which for `/Users/musichen/_projects/acme/app/src/db.ts` is `Users/musichen` —
 * the same answer for every file in every project on the machine, and no answer
 * to the question a reader is asking. Stripping the session's own working
 * directory first is the whole fix, and it turns the same ledger into
 * `app/src`, `app/tests`, `docs`.
 */
function topDirectories(
  ledgers: Ledgers,
  root: string,
  limit: number,
): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const file of ledgers.files) {
    const inside = root.length > 0 && file.path.startsWith(`${root}/`)
    // A file outside the project is not "in Users/musichen": it is outside, and
    // saying so is more useful than inventing a directory for it.
    const parts = inside
      ? file.path.slice(root.length + 1).split('/').filter(Boolean)
      : []
    const weight = file.edits * 3 + file.writes * 3 + file.reads
    if (parts.length <= 1) {
      counts.set(OUTSIDE, (counts.get(OUTSIDE) ?? 0) + weight)
      continue
    }
    const depth = Math.min(2, parts.length - 1)
    const dir = parts.slice(0, depth).join('/')
    counts.set(dir, (counts.get(dir) ?? 0) + weight)
  }
  // A place the reader cannot navigate to does not lead the list, however many
  // touches it has.
  return [...counts.entries()]
    .sort((a, b) => (a[0] === OUTSIDE ? 1 : b[0] === OUTSIDE ? -1 : b[1] - a[1]))
    .slice(0, limit)
}

/** Collapse whitespace and truncate on a word boundary. */
export function oneLine(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return `${single.slice(0, max - 1).replace(/\s\S*$/, '')}…`
}
