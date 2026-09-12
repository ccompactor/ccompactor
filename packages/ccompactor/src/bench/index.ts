/**
 * The handoff benchmark, ported from sctxx so the two tools' numbers are
 * comparable rather than merely both large.
 *
 * Built the same way, and for the same reason: the survey behind sctxx found no
 * published result measuring what either tool does, and the closest work
 * (Handoff Debt, arXiv:2606.02875) has no arm in which the successor can ask for
 * the part of the transcript it needs. That arm is the hypothesis, so it is an
 * arm here:
 *
 *   none       nothing but the question — a win over nothing is not a win
 *   tail       the recency window, the strategy the published evidence favours
 *   artifact   the rendered handoff
 *   retrieval  the artifact, plus `EXPAND a..b` answered with real events
 *
 * Questions come from the session's own events, not from the artifact, so a
 * question can be asked that the artifact cannot answer. Answers are checked by
 * substring against a key taken verbatim from the transcript; no model decides
 * who is right.
 */
import type { Ledgers } from '../ledgers/index.js'
import type { IRMessage, SessionIR } from '../ir/types.js'

export type Arm = 'none' | 'tail' | 'artifact' | 'retrieval'
export const ARMS: Arm[] = ['none', 'tail', 'artifact', 'retrieval']

export type Class = 'brief' | 'deep' | 'recent'

export interface Question {
  id: string
  class: Class
  prompt: string
  /** A string a correct answer must contain, verbatim from the transcript. */
  key: string
  evt: number
}

export interface Trial {
  question: string
  class: Class
  arm: Arm
  correct: boolean
  tokens: number
  expansions: number
  answer: string
}

export interface ArmScore {
  asked: number
  correct: number
  tokens: number
  expansions: number
  byClass: Record<string, [number, number]>
}

export interface BenchOptions {
  brief: number
  deep: number
  recent: number
  expansions: number
}

export const DEFAULT_BENCH: BenchOptions = { brief: 6, deep: 8, recent: 4, expansions: 3 }

export function questions(ir: SessionIR, ledgers: Ledgers, options: BenchOptions): Question[] {
  const out: Question[] = []

  const first = ledgers.userTurns[0]
  if (first) {
    out.push({
      id: 'brief-goal',
      class: 'brief',
      prompt: 'What did the user originally ask for? Quote a distinctive phrase.',
      key: first.text.split(/\s+/).slice(0, 8).join(' '),
      evt: first.evt,
    })
  }
  const busiest = ledgers.files.filter((f) => f.edits > 0).sort((a, b) => b.edits - a.edits)[0]
  if (busiest) {
    out.push({
      id: 'brief-busiest-file',
      class: 'brief',
      prompt: 'Which file did the session edit the most times?',
      key: busiest.path,
      evt: busiest.lastEvt,
    })
  }
  const commit = ledgers.commits.at(-1)
  if (commit) {
    out.push({
      id: 'brief-last-commit',
      class: 'brief',
      prompt: 'What was the newest commit made during the session?',
      key: commit.subject,
      evt: commit.evt,
    })
  }
  const error = ledgers.errors[0]
  if (error) {
    out.push({
      id: 'brief-unresolved',
      class: 'brief',
      prompt: 'Name an error the session kept hitting.',
      key: error.signature,
      evt: error.evt,
    })
  }
  out.push({
    id: 'brief-user-turns',
    class: 'brief',
    prompt: 'How many times did the user speak in this session? Answer with the number.',
    key: String(ledgers.counts.userTurns),
    evt: 0,
  })

  // Deep: sampled from events that can actually be asked about, spread over the
  // first 85% so no recency tail can reach them. Filtering first and sampling
  // second is what makes the requested count the count that is asked.
  //
  // Preference order matters. A tool result is a poor question source: its
  // distinctive token is a long path buried past any reasonable truncation, so
  // asking about it measures truncation rather than the context. The first run
  // drew most questions from tool results and the tail arm scored zero on every
  // class — including recent — which is the arm the published evidence says
  // should be competitive. Prose first, artifacts only to fill the quota.
  const speakable = ir.messages.filter((m) => isHumanTurn(m) || isAssistantText(m))
  const askable = speakable.length >= options.deep + options.recent
    ? speakable
    : ir.messages.filter((m) => keyFor(m) !== undefined)
  const usable = Math.floor((askable.length * 85) / 100)
  if (usable >= options.deep && options.deep > 0) {
    const stride = Math.floor(usable / options.deep)
    for (let n = 0; n < options.deep; n += 1) {
      const message = askable[n * stride + Math.floor(stride / 2)]
      if (!message) continue
      const key = keyFor(message)
      if (!key) continue
      out.push({
        id: `deep-${n}`,
        class: 'deep',
        prompt: `At event ${message.eventIndex}: what was ${describe(message)}? Quote a distinctive path or identifier.`,
        key,
        evt: message.eventIndex,
      })
    }
  }

  for (const [n, message] of askable.slice(-options.recent).reverse().entries()) {
    const key = keyFor(message)
    if (!key) continue
    out.push({
      id: `recent-${n}`,
      class: 'recent',
      prompt: `Most recently: what was ${describe(message)}? Quote a distinctive phrase.`,
      key,
      evt: message.eventIndex,
    })
  }

  return out
}

function isHumanTurn(message: IRMessage): boolean {
  return message.isHumanTurn === true && Boolean(message.text && message.text.trim().length > 0)
}

function isAssistantText(message: IRMessage): boolean {
  return message.role === 'assistant' && !message.toolName && Boolean(message.text && message.text.trim().length > 4)
}

function describe(message: IRMessage): string {
  if (message.isHumanTurn) return 'the user asking for'
  if (message.toolName) return `the ${message.toolName} call doing`
  if (message.role === 'tool') return 'the tool returning'
  return 'the agent saying'
}

/**
 * The key a question is scored against.
 *
 * A distinctive single token, not a phrase: whole phrases do not survive
 * paraphrase, and the first run of sctxx's version of this benchmark keyed on a
 * tool name followed by its argument and scored zero on correct answers that
 * described the call instead of reciting it.
 */
export function keyFor(message: IRMessage): string | undefined {
  const text = [message.text ?? '', message.toolInput ? JSON.stringify(message.toolInput) : ''].join(' ')
  // A request is keyed on its own words, because the human's phrasing is what a
  // correct answer quotes back.
  //
  // An *answer* is not. Keying assistant text on its first eight words looked
  // reasonable and was wrong: a correct answer paraphrases, so the score
  // measures phrasing rather than retrieval. Measured against sctxx on the same
  // session — same questions derived the same way, same backend — the deep
  // class scored 22% here and 78% there, and this line was why. An assistant
  // turn is keyed on a distinctive path or identifier instead, which a correct
  // answer contains verbatim if it knows the answer at all.
  if (isHumanTurn(message) && message.text) {
    const words = message.text.split(/\s+/).filter((w) => w.length > 0)
    if (words.length >= 4) return words.slice(0, 8).join(' ')
  }
  let best: { rank: number; token: string } | undefined
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^A-Za-z0-9/._-]+|[^A-Za-z0-9/._-]+$/g, '')
    if (token.length < 8) continue
    const letters = token.replace(/[^A-Za-z]/g, '').length
    const rank = token.includes('/') && token.includes('.') ? 0 : token.includes('/') ? 1 : letters >= 6 ? 3 : 9
    if (rank === 9) continue
    if (!best || rank < best.rank || (rank === best.rank && token.length > best.token.length)) {
      best = { rank, token }
    }
  }
  return best?.token
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9/.]+/g, ' ').trim()
}

export function answeredBy(question: Question, answer: string): boolean {
  const key = normalize(question.key)
  return key.length > 0 && normalize(answer).includes(key)
}

/** A range a successor asked for, parsed out of its reply. */
export function requestedRange(reply: string): [number, number] | undefined {
  for (const line of reply.split('\n')) {
    const match = /^\s*EXPAND\s+(\d+)\s*\.\.\s*=?\s*(\d+)\s*$/.exec(line)
    if (match) return [Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10)]
  }
  return undefined
}

export function score(trials: Trial[]): Record<string, ArmScore> {
  const scores: Record<string, ArmScore> = {}
  for (const trial of trials) {
    const entry = (scores[trial.arm] ??= { asked: 0, correct: 0, tokens: 0, expansions: 0, byClass: {} })
    entry.asked += 1
    entry.tokens += trial.tokens
    entry.expansions += trial.expansions
    if (trial.correct) entry.correct += 1
    const slot = (entry.byClass[trial.class] ??= [0, 0])
    slot[0] += 1
    if (trial.correct) slot[1] += 1
  }
  return scores
}
