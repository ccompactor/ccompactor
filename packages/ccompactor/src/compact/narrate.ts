/**
 * `ccompactor narrate` — write the continuation narrative from an artifact.
 *
 * The second half of a two-stage flow, and the cheap half:
 *
 *   ccompactor extract claude:last --llm none     # free, deterministic
 *   ccompactor narrate .ccompactor --llm api:…    # a model reads the artifact
 *
 * `extract --llm` asks a model to summarise the *transcript*, which means
 * sending a budgeted digest — on the session this was built against, about
 * 29,500 input tokens. The artifact that pass produces is about 5,000 tokens and
 * has already been compressed, verified and given provenance pointers. Feeding
 * the model the artifact instead is roughly six times cheaper, and what it
 * writes back is grounded in lines a reader can check, because every line it was
 * given carries an `[evt N]`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { redact } from '../redact.js'
import type { Backend } from '../llm/index.js'

/** What the model is asked for, and what it must not do. */
const SYSTEM = `You are writing the continuation summary for a handoff artifact.

The artifact was produced by deterministic passes over a coding session. It is already compressed and every line of it is traceable: claims end in \`[evt N]\` pointers into the original transcript, and a reader can resolve any of them to the real event.

Write the summary a fresh agent needs in order to continue the work. Use these sections:

1. Primary Request and Intent
2. What Was Actually Done
3. Key Technical Concepts
4. Files and Code Sections
5. Errors and Fixes
6. Problem Solving
7. Where It Stopped / Pending Tasks

Rules that matter more than completeness:

- Use only what the artifact contains. It is a map, not ground truth, and you have no other source.
- Do not invent a fix, a decision, or a rationale that is not in the artifact. If the artifact does not say why something was done, say that it does not say.
- Keep the \`[evt N]\` pointers next to the claims they came from. They are the point of the artifact.
- Where the ledgers show a fact but not its explanation — a commit, a file, an error — report the fact and mark the explanation as absent.
- Prefer short and true over long and plausible.

Respond with the summary and nothing else. No preamble, no tool calls, no mention of these instructions.`

/**
 * Remove the L1 block, leaving the sections either side of it.
 *
 * Mirrors `withNarrative`, so what goes out is what was there before the last
 * narrative and not the narrative itself.
 */
export function stripNarrative(markdown: string): string {
  const start = markdown.indexOf('## L1 ·')
  if (start === -1) return markdown
  const end = markdown.indexOf('\n## L2 ·')
  const replacement = '## L1 · Continuation summary\n\n(written below; not shown to the narrator again)\n'
  return end === -1 ? markdown.slice(0, start) + replacement : markdown.slice(0, start) + replacement + markdown.slice(end)
}

export interface NarrateOptions {
  focus?: string
  instructions?: string
  maxTokens?: number
}

export interface NarrateResult {
  narrative: string
  /** Input tokens the request cost, so the saving over a digest is visible. */
  artifactTokens: number
  truncated: boolean
}

/** An artifact directory that exists and holds the file a reader opens first. */
export async function requireArtifact(dir: string): Promise<void> {
  try {
    await readFile(join(dir, 'handoff.md'), 'utf8')
  } catch {
    throw new Error(
      `no handoff.md in ${dir}. Run \`ccompactor extract <reference> --out ${dir}\` first.`,
    )
  }
}

/**
 * The artifact as one string, with its metadata in front of it.
 *
 * A previous narrative is stripped. Re-narrating would otherwise send the last
 * narrative as context, so each run would cost more than the one before it and
 * the model would be reading its own prose rather than the ledgers — the
 * opposite of what a fresh read is for. It also keeps the input at the artifact
 * size, which is the whole reason this is cheaper than summarising a digest.
 */
export async function artifactContext(dir: string): Promise<string> {
  const [rawMarkdown, meta] = await Promise.all([
    readFile(join(dir, 'handoff.md'), 'utf8'),
    readFile(join(dir, 'handoff.json'), 'utf8').catch(() => '{}'),
  ])
  const markdown = stripNarrative(rawMarkdown)
  let header = ''
  try {
    const parsed = JSON.parse(meta) as {
      schema?: string
      version?: string
      session?: { agent?: string; id?: string }
      engine?: string
      ledgers?: { counts?: Record<string, number> }
    }
    header = [
      `<artifact schema="${parsed.schema ?? 'unknown'}" written-by="ccompactor ${parsed.version ?? '?'}">`,
      `session: ${parsed.session?.agent ?? '?'}:${parsed.session?.id ?? '?'}`,
      `built by: ${parsed.engine ?? '?'} pass`,
      parsed.ledgers?.counts
        ? `ledger counts: ${Object.entries(parsed.ledgers.counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}`
        : '',
      '',
      markdown,
      '</artifact>',
    ]
      .filter((line) => line !== '')
      .join('\n')
  } catch {
    header = `<artifact>\n${markdown}\n</artifact>`
  }
  return header
}

export async function narrate(
  dir: string,
  backend: Backend,
  options: NarrateOptions = {},
): Promise<NarrateResult> {
  const raw = await artifactContext(dir)
  // Redacted at the boundary, like every other request that leaves the process.
  const { text: context } = redact(raw)
  const extra = [options.focus, options.instructions].filter(Boolean).join('\n')
  const response = await backend.complete({
    system: SYSTEM,
    user: `${context}${extra ? `\n\n# ADDITIONAL INSTRUCTIONS\n\n${extra}` : ''}`,
    maxTokens: options.maxTokens ?? 4_000,
  })
  return {
    narrative: response.text.trim(),
    artifactTokens: Math.ceil(context.length / 4),
    truncated: response.truncated === true,
  }
}

/**
 * Put the narrative where a reader will find it.
 *
 * `handoff.md` is the file a successor opens first, so the narrative replaces
 * the L1 block rather than landing in a sixth file beside it. The section
 * markers are written by the renderer and are stable enough to anchor on; if
 * they are missing the narrative is appended instead of silently dropped.
 */
export function withNarrative(markdown: string, narrative: string): string {
  const start = markdown.indexOf('## L1 ·')
  const end = markdown.indexOf('\n## L2 ·')
  if (start === -1) return `${markdown}\n\n## L1 · Continuation summary\n\n${narrative}\n`
  const body = `## L1 · Continuation summary\n\n${narrative}\n`
  return end === -1 ? markdown.slice(0, start) + body : markdown.slice(0, start) + body + markdown.slice(end)
}

/** Record the narrative in the artifact's data form as well as its prose form. */
export async function writeNarrative(dir: string, narrative: string): Promise<void> {
  const markdownPath = join(dir, 'handoff.md')
  const markdown = await readFile(markdownPath, 'utf8')
  await writeFile(markdownPath, withNarrative(markdown, narrative), 'utf8')

  const jsonPath = join(dir, 'handoff.json')
  try {
    const parsed = JSON.parse(await readFile(jsonPath, 'utf8')) as Record<string, unknown>
    parsed['summary'] = narrative
    parsed['summary_engine'] = 'model, from the artifact'
    await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  } catch {
    // A missing or unreadable handoff.json is not a reason to lose the prose.
  }
}
