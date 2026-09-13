/**
 * Deterministic constraint extraction.
 *
 * The compaction prompt asks the model for "All user messages" and for
 * constraints, and a model answers that question well on a short session and
 * badly on a long one. These are the sentences a successor must not violate,
 * and they are the one thing it is worst to lose, so they are found by pattern
 * as well — the artifact then says which of the two found each one.
 *
 * Anchored at the head of the clause, which is the whole design. A rule is
 * stated in the imperative, so its directive comes first; the same words
 * mid-sentence are a description. `never push to main` is a rule; `contracts
 * must not break` is a property that contains the same words. In a transcript
 * the imperative mood is what the human wants done *now*, so `make sure` and
 * `ensure` are deliberately not markers: measured on a real 274-turn session,
 * that family produced tasks, not rules.
 */
import type { SessionIR } from './ir/types.js'

export interface Constraint {
  text: string
  evt: number
  markers: string[]
}

/** Directive families, checked in order; the first match labels the item. */
const DIRECTIVES: Array<[string, string[]]> = [
  ['prohibition', ['never ', 'never,', 'never ever']],
  [
    'negative directive',
    [
      'do not ',
      "don't ",
      'dont ',
      'you must not ',
      'you must never ',
      'we must not ',
      'you should not ',
      "you shouldn't ",
      'you should never ',
      'must not ',
    ],
  ],
  [
    'standing directive',
    ['always ', 'at all times', 'every time you', 'you should always ', 'you must always '],
  ],
  [
    'untouchable',
    [
      'do not touch',
      'don’t touch',
      "don't touch",
      'do not change',
      "don't change",
      'do not modify',
      "don't modify",
      'do not rename',
      "don't rename",
      'hands off',
    ],
  ],
  ['permission gate', ['ask before', 'ask me before', 'check with me', 'without my permission', 'without permission']],
  ['emphasis', ['critical:', 'important:', 'crucial:']],
  ['exclusivity', ['only ever ', 'only use ', 'stick to ']],
]

/** Words a speaker puts before a rule without changing it. */
const LEADING = [
  'please',
  'also',
  'and',
  'but',
  'then',
  'so',
  'plus',
  'finally',
  'lastly',
  'importantly',
  'however',
  'just',
]

/**
 * Openers that make a sentence a question about the work.
 *
 * The negative lookahead is load-bearing. `do` and `does` open a question
 * ("do you think…") and also open the most explicit prohibition there is
 * ("Do not edit generated files"), so a plain prefix test rejected the rule as
 * a question and silently dropped it. A test caught it; the lookahead is why.
 */
/**
 * Sentences that carry a deontic marker without being the human's instruction.
 *
 * Measured on real sessions, three false positives dominated:
 *
 *   "Do NOT call any tools."          the compaction prompt, echoed into the transcript
 *   "Please do not write below this line ##"   a quoted email footer
 *   "Critical: never repo-level npm run build ..."  a truncated quotation
 *
 * The first two are text *about* instructions — one is a prompt addressed to a
 * model, the other is boilerplate in a quoted document — and the third is a
 * fragment. None is something the human asked a successor to obey, and each one
 * pushes a real rule off the list.
 */
const NOT_AN_INSTRUCTION = [
  /do not call any tools/i,
  /respond with text only/i,
  /^please do not write below this line/i,
  /^do not (write|edit|modify) below this line/i,
]

const INTERROGATIVE = [
  /^(why|how|what|when|where|which|who)\s/,
  /^(can|could|would|is|are|did|do|does)\s+(?!not\b|n't\b)/,
]

/** The longest a quoted rule may be. Past this it is prose, not a rule. */
const MAX_CHARS = 300
const MAX_CONSTRAINTS = 40

export function extractConstraints(ir: SessionIR): Constraint[] {
  const found: Constraint[] = []
  const seen = new Set<string>()

  for (const message of ir.messages) {
    if (!message.isHumanTurn || !message.text) continue
    for (const sentence of sentences(message.text)) {
      const text = clean(sentence)
      if (text.length > MAX_CHARS || text.split(/\s+/).length < 3) continue
      const lower = text.toLowerCase()
      if (lower.endsWith('?') || lower.endsWith(':')) continue
      if (INTERROGATIVE.some((pattern) => pattern.test(lower))) continue
      if (isShouted(text)) continue
      if (NOT_AN_INSTRUCTION.some((pattern) => pattern.test(text))) continue
      // A fragment, not a sentence: quoted material cut mid-clause reads as a
      // rule and is not one.
      if (text.endsWith('##') || text.endsWith('...')) continue
      const head = directiveHead(lower)
      const markers = DIRECTIVES.filter(([, needles]) =>
        needles.some((needle) => head.startsWith(needle)),
      ).map(([family]) => family)
      if (markers.length === 0) continue
      const key = normalize(text)
      if (key.length === 0 || seen.has(key)) continue
      seen.add(key)
      found.push({ text, evt: message.eventIndex, markers })
    }
  }

  const ranked = found.sort(
    (a, b) => b.markers.length - a.markers.length || b.evt - a.evt,
  )
  return sameRules(ranked).slice(0, MAX_CONSTRAINTS)
}

/**
 * Collapse rules that were stated more than once.
 *
 * A standing rule is usually restated — once when it is given, again when it is
 * nearly broken, again in a summary — and each restatement is worded a little
 * differently, so comparing the text exactly kept all of them. The brief read:
 *
 *   - "Never stage with git add -A or git add .; always use explicit file paths"
 *   - "Never git add -A/git add .; always explicit file paths"
 *
 * One rule, two lines, at the top of the block a reader is meant to skim. Two
 * statements are the same rule when nearly all of the shorter one's words appear
 * in the longer: a restatement is contained by the thing it restates, whereas
 * two genuinely different rules share only the words "never" and "the".
 *
 * The highest-ranked wording keeps its place and the fullest wording wins, so
 * merging cannot reorder the block.
 */
function sameRules(constraints: Constraint[]): Constraint[] {
  const words = (text: string): Set<string> =>
    new Set(normalize(text).split(' ').filter((w) => w.length > 0))
  const out: Array<{ constraint: Constraint; words: Set<string> }> = []
  for (const constraint of constraints) {
    const next = words(constraint.text)
    const twin = out.find((kept) => {
      let shared = 0
      for (const word of next) if (kept.words.has(word)) shared += 1
      const smaller = Math.min(kept.words.size, next.size)
      return shared >= 3 && shared / smaller >= 0.8
    })
    if (!twin) {
      out.push({ constraint, words: next })
      continue
    }
    if (constraint.text.length > twin.constraint.text.length) {
      twin.constraint = { ...twin.constraint, text: constraint.text, evt: constraint.evt }
      twin.words = next
    }
  }
  return out.map((entry) => entry.constraint)
}

/** The clause with the pleasantries removed, so the directive can be tested. */
function directiveHead(lower: string): string {
  let head = lower.trimStart()
  for (let guard = 0; guard < 8; guard += 1) {
    let changed = false
    for (const filler of LEADING) {
      if (head.startsWith(filler)) {
        const rest = head.slice(filler.length)
        if (!/^[a-z0-9]/i.test(rest)) {
          head = rest.replace(/^[.,:;\s-]+/, '')
          changed = true
          break
        }
      }
    }
    if (!changed) break
  }
  return head
}

/** A heading in capitals is a title, not an instruction to anyone. */
function isShouted(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => (w.match(/[a-z]/gi) ?? []).length >= 2)
  return words.length >= 4 && words.every((w) => w === w.toUpperCase())
}

function sentences(text: string): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      if (part.trim().length > 0) out.push(part)
    }
  }
  return out
}

function clean(sentence: string): string {
  return sentence
    .replace(/[*`_]/g, '')
    .replace(/^\s*[-#>\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
