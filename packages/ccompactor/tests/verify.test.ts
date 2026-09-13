import { strict as assert } from 'node:assert'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'
import { verify } from '../src/artifact/verify.js'

/**
 * Build an artifact directory whose transcript is `transcript` and whose
 * constraints are the ones given.
 */
function fixture(transcript: string, constraints: Array<{ text: string; evt: number }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccompactor-verify-'))
  const source = path.join(dir, 'session.jsonl')
  fs.writeFileSync(source, transcript)
  fs.writeFileSync(
    path.join(dir, 'handoff.json'),
    JSON.stringify({ session: { path: source }, constraints, ledgers: { files: [] } }),
  )
  return dir
}

test('a quote is found in the transcript whatever its case or punctuation', async () => {
  // The first streaming version built a pattern out of the *lowercased* quote
  // and tested it against raw text without /i, so every quote broke at its
  // first capitalised word and six of seven were reported missing from a
  // transcript that contained all of them.
  const dir = fixture(
    'noise\nSo: "NEVER stage with git add -A or git add .; always use explicit file paths" — the rule\nmore noise\n',
    [{ text: 'Never stage with git add -A or git add .; always use explicit file paths', evt: 7 }],
  )
  try {
    const report = await verify(dir)
    assert.deepEqual(report.missingQuotes, [])
    assert.equal(report.constraintsQuoted, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a quote that is not in the transcript is still reported missing', async () => {
  // The check has to keep failing when it should, or the fix above is a
  // rubber stamp.
  const dir = fixture('something else entirely\n', [
    { text: 'a rule that was never spoken aloud', evt: 7 },
  ])
  try {
    const report = await verify(dir)
    assert.equal(report.missingQuotes.length, 1)
    assert.equal(report.missingQuotes[0]?.evt, 7)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a quote straddling a read boundary is found', async () => {
  // The transcript is read in pages, so a quote split across a page boundary is
  // the case the carry has to cover. On a real 292 MB session the whole-file
  // version died with a heap OOM instead of answering at all.
  const quote = 'Do NOT push without explicit instruction, per the persisted memory rule'
  const page = 4 * 1024 * 1024
  const filler = 'x'.repeat(page - 40)
  const dir = fixture(`${filler}\n${quote}\n${'y'.repeat(1000)}\n`, [{ text: quote, evt: 1 }])
  try {
    // The file is a page long, so the quote lands across the first boundary.
    assert.ok(fs.statSync(path.join(dir, 'session.jsonl')).size > page)
    const report = await verify(dir)
    assert.deepEqual(report.missingQuotes, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('verify reports how many ledger paths it actually looked for', async () => {
  // It stats a sample rather than every path; the report says so instead of
  // implying the whole ledger was checked.
  const dir = fixture('text\n', [])
  try {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: path.join(dir, `f${i}.ts`) }))
    fs.writeFileSync(
      path.join(dir, 'handoff.json'),
      JSON.stringify({
        session: { path: path.join(dir, 'session.jsonl') },
        constraints: [],
        ledgers: { files },
      }),
    )
    fs.writeFileSync(path.join(dir, 'f0.ts'), 'x')
    const report = await verify(dir)
    assert.equal(report.filesClaimed, 5)
    assert.equal(report.filesChecked, 5)
    assert.deepEqual(report.missingFiles, [path.join(dir, 'f1.ts'), path.join(dir, 'f2.ts'), path.join(dir, 'f3.ts'), path.join(dir, 'f4.ts')])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
