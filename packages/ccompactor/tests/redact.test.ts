import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redact, redactValue } from '../src/redact.js'

test('shapes, not keywords', () => {
  const cases: Array<[string, string]> = [
    ['key sk-ant-api03-abcdefghijklmnopqrstuvwxyz here', 'anthropic'],
    ['sk-proj-abcdefghijklmnopqrstuvwxyz012345', 'openai'],
    ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github-pat'],
    ['AKIAIOSFODNN7EXAMPLE', 'aws-key-id'],
    ['xoxb-1234567890-abcdefghijkl', 'slack'],
    ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', 'jwt'],
  ]
  for (const [input, kind] of cases) {
    const report = redact(input)
    assert.ok(report.total > 0, `nothing redacted from: ${input}`)
    assert.ok(
      report.text.includes('[REDACTED:'),
      `no marker in: ${report.text}`,
    )
    // The secret itself must be gone, not merely decorated.
    for (const token of input.split(/\s+/)) {
      if (token.length < 20) continue
      assert.ok(!report.text.includes(token), `secret survived: ${report.text}`)
    }
    void kind
  }
})

test('the marker names what was removed, so a hole is diagnosable', () => {
  const report = redact('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz012345')
  assert.ok(report.text.includes('[REDACTED:openai]'), report.text)
  assert.equal(report.counts['openai'], 1)
})

test('redaction is idempotent and leaves ordinary text alone', () => {
  const once = redact('the api key is sk-ant-abcdefghijklmnopqrstuvwxyz').text
  const twice = redact(once).text
  assert.equal(once, twice, 'a second pass must not change anything')
  const prose = 'we should refactor the parser before the next release'
  assert.equal(redact(prose).text, prose)
  assert.equal(redact(prose).total, 0)
})

test('a redacted record keeps its shape', () => {
  const value = { env: { OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz012345' }, list: ['sk-ant-abcdefghijklmnopqrstuvwxyz'] }
  const out = redactValue(value) as typeof value
  assert.equal(typeof out.env.OPENAI_API_KEY, 'string')
  assert.ok(out.env.OPENAI_API_KEY.includes('[REDACTED:'))
  assert.ok(out.list[0]!.includes('[REDACTED:'))
})
