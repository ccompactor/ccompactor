/**
 * Secret redaction.
 *
 * A transcript is somebody's working session. It contains the API keys they
 * pasted, the tokens their shell echoed back, and the contents of their `.env`.
 * Two rules follow, and they are not negotiable:
 *
 * 1. **Redact before anything leaves the process.** The LLM path and the rendered
 *    artifact both go through here. A redaction that runs after the request has
 *    been sent is a redaction that did not happen.
 *
 * 2. **Redact by shape, not by keyword.** A pattern list keyed on the word "key"
 *    catches `apiKey = "..."` and misses a bare 40-character token, which is the
 *    form that actually leaks. What follows matches the *shapes* secrets take.
 *
 * The replacement is a stable marker rather than a deletion: `[REDACTED:openai]`
 * tells a reader that a value was here and what kind it was, so an artifact with
 * a hole in it is diagnosable instead of merely wrong.
 */

interface Rule {
  /** What to call it in the marker. */
  kind: string
  pattern: RegExp
  /** Which capture group holds the secret. 0 means the whole match. */
  group?: number
}

/**
 * Ordered most specific first. An Anthropic key would also match the generic
 * long-token rule, and naming it correctly is what makes the marker useful.
 */
const RULES: Rule[] = [
  { kind: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'anthropic', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: 'openai', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { kind: 'github-pat', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'aws-key-id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    kind: 'aws-secret',
    pattern: /aws_secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    group: 1,
  },
  { kind: 'google-api', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: 'slack', pattern: /xox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'npm-token', pattern: /npm_[A-Za-z0-9]{36}/g },
  { kind: 'pypi-token', pattern: /pypi-[A-Za-z0-9_-]{50,}/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: 'bearer', pattern: /\bBearer\s+([A-Za-z0-9\-._~+/]{20,}=*)/g, group: 1 },
  {
    kind: 'assignment',
    pattern:
      /\b(?:api[_-]?key|apikey|secret|password|passwd|token|access[_-]?token|client[_-]?secret)\b\s*[=:]\s*["']([^"'\s]{12,})["']/gi,
    group: 1,
  },
  {
    kind: 'env-line',
    pattern: /^([A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_PASSWD))\s*=\s*(.{12,})$/gm,
    group: 2,
  },
]

export interface RedactionReport {
  text: string
  /** How many of each kind were replaced. */
  counts: Record<string, number>
  total: number
}

/**
 * Internal placeholders, swapped for the readable marker at the very end.
 *
 * Rules run in sequence, so a marker written by an earlier rule is text that a
 * later rule can match. It did: `OPENAI_API_KEY=sk-proj-…` became
 * `OPENAI_API_KEY=[REDACTED:openai]`, and the env-line rule then redacted the
 * marker, reporting the key under the wrong name. A NUL-delimited sentinel
 * cannot be produced by any rule, so nothing downstream can see it.
 */
const SENTINEL = '\u0000'

/** Replace every secret-shaped span in `text` with a named marker. */
export function redact(text: string, rules: Rule[] = RULES): RedactionReport {
  const counts: Record<string, number> = {}
  let out = text
  for (const rule of rules) {
    out = out.replace(rule.pattern, (match, ...args) => {
      const captured = rule.group ? (args[rule.group - 1] as string | undefined) : match
      if (captured === undefined) return match
      counts[rule.kind] = (counts[rule.kind] ?? 0) + 1
      const marker = `${SENTINEL}${rule.kind}${SENTINEL}`
      // Only the captured span is replaced, so the surrounding syntax — a
      // variable name, a header prefix — survives for the reader.
      return rule.group ? match.replace(captured, marker) : marker
    })
  }
  const finished = out.replace(
    new RegExp(`${SENTINEL}([a-z-]+)${SENTINEL}`, 'g'),
    (_match, kind: string) => `[REDACTED:${kind}]`,
  )
  return { text: finished, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }
}

/** Redact every string field of a record, leaving structure intact. */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redact(value).text as unknown as T
  if (Array.isArray(value)) return value.map((item) => redactValue(item)) as unknown as T
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      // The key itself can be a secret: an env dump keys the token.
      out[redact(key).text] = redactValue(entry)
    }
    return out as unknown as T
  }
  return value
}

/** Total secrets replaced, for the artifact header. */
export function summarize(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return 'none'
  return entries.map(([kind, count]) => `${kind}×${count}`).join(' ')
}
