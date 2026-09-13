/**
 * `ccompactor verify` — is this handoff still true?
 *
 * An artifact ages. Two checks are cheap and catch most of it: every quoted
 * constraint must still appear in the transcript it cites, and every file the
 * ledger claims was touched must still exist. Neither needs a model, and a
 * handoff whose quotes cannot be found is not a handoff.
 */
import { readFile, stat } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import { join } from 'node:path'

/** Collapse whitespace and punctuation so a quote survives reformatting. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** A quote is checked in pages so its raw span cannot outrun the window. */
const WINDOW = 64 * 1024

/**
 * The normalised quote as a pattern that can be tested against *raw* text.
 *
 * `normalize(x).includes(normalize(q))` is the same question as "does a run of
 * non-alphanumerics separate each word of `q` in `x`", and asking it that way
 * means the transcript never has to be normalised as a whole. On a 292 MB
 * session the whole-file version allocated three copies of the file — the read,
 * the lowercased copy, the punctuation-stripped copy — and died with a heap OOM
 * in `RegExpReplace`.
 */
function quotePattern(quote: string): RegExp | undefined {
  const words = normalize(quote).split(' ').filter(Boolean)
  if (words.length === 0) return undefined
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // The words come from the lowercased quote and the text does not, so the
  // pattern needs /i — and the separator class is written `[^A-Za-z0-9]` so
  // that /i cannot loosen it into matching letters. `[^a-z0-9]` under /i would
  // have matched every capital, and the quote would break at its first
  // capitalised word: the first version of this reported six of seven quotes as
  // missing on a transcript that contains all of them.
  return new RegExp(escaped.join('[^A-Za-z0-9]+'), 'i')
}

/** Does `quote` occur in the file at `path`, without holding the file? */
async function quoteAppears(path: string, quote: string): Promise<boolean> {
  const pattern = quotePattern(quote)
  if (!pattern) return true
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(path, 'r')
  } catch {
    return false
  }
  try {
    const chunk = Buffer.alloc(4 * 1024 * 1024)
    let carry = ''
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) return false
      const text = carry + chunk.toString('utf8', 0, bytesRead)
      if (pattern.test(text)) return true
      // A run of punctuation can be arbitrarily long, so the window is generous
      // rather than the length of the quote.
      carry = text.slice(-WINDOW)
    }
  } finally {
    await handle.close()
  }
}

/** How many ledger paths `verify` stats before it stops. */
const FILES_CHECKED = 200

export interface VerifyReport {
  dir: string
  constraintsQuoted: number
  missingQuotes: Array<{ text: string; evt: number }>
  filesClaimed: number
  /** How many of `filesClaimed` were actually looked for. */
  filesChecked: number
  missingFiles: string[]
  stale: boolean
}

export async function verify(dir: string): Promise<VerifyReport> {
  const handoff = JSON.parse(await readFile(join(dir, 'handoff.json'), 'utf8')) as {
    constraints?: Array<{ text: string; evt: number }>
    ledgers?: { files?: Array<{ path: string }> }
    session?: { path?: string }
  }

  const constraints = handoff.constraints ?? []
  const source = handoff.session?.path

  const missingQuotes: Array<{ text: string; evt: number }> = []
  for (const constraint of constraints) {
    // The quote must be in the transcript, not merely in the artifact: a quote
    // checked against its own output proves only that it was copied.
    // Compared normalized, not raw. The artifact quotes the rule with its
    // markdown and line breaks collapsed, so a byte comparison against the
    // transcript reports every quote as missing — which the first run of this
    // did, and which is worse than not checking at all.
    if (source && !(await quoteAppears(source, constraint.text))) {
      missingQuotes.push(constraint)
    }
  }

  const files = handoff.ledgers?.files ?? []
  const missingFiles: string[] = []
  // A sample, and reported as one: checking a thousand paths on a network mount
  // is slow enough that verify stops being a command anyone runs.
  const checked = files.slice(0, FILES_CHECKED)
  for (const file of checked) {
    const info = await stat(file.path).catch(() => null)
    if (!info) missingFiles.push(file.path)
  }

  return {
    dir,
    constraintsQuoted: constraints.length,
    missingQuotes,
    filesClaimed: files.length,
    filesChecked: checked.length,
    missingFiles,
    stale: missingFiles.length > 0,
  }
}
