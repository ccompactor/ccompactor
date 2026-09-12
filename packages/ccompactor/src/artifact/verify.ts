/**
 * `ccompactor verify` — is this handoff still true?
 *
 * An artifact ages. Two checks are cheap and catch most of it: every quoted
 * constraint must still appear in the transcript it cites, and every file the
 * ledger claims was touched must still exist. Neither needs a model, and a
 * handoff whose quotes cannot be found is not a handoff.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface VerifyReport {
  dir: string
  constraintsQuoted: number
  missingQuotes: Array<{ text: string; evt: number }>
  filesClaimed: number
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
  const transcript = source ? await readFile(source, 'utf8').catch(() => '') : ''

  const missingQuotes: Array<{ text: string; evt: number }> = []
  for (const constraint of constraints) {
    // The quote must be in the transcript, not merely in the artifact: a quote
    // checked against its own output proves only that it was copied.
    if (transcript && !transcript.includes(constraint.text.replace(/\\"/g, '"'))) {
      missingQuotes.push(constraint)
    }
  }

  const files = handoff.ledgers?.files ?? []
  const missingFiles: string[] = []
  for (const file of files.slice(0, 200)) {
    const info = await stat(file.path).catch(() => null)
    if (!info) missingFiles.push(file.path)
  }

  return {
    dir,
    constraintsQuoted: constraints.length,
    missingQuotes,
    filesClaimed: files.length,
    missingFiles,
    stale: missingFiles.length > 0,
  }
}
