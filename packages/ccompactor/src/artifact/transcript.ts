/**
 * The readable transcript: what was said, in order, with nothing added.
 *
 * A second output shape, because a handoff and a transcript answer different
 * questions. The handoff says *where the work stands* and drops almost
 * everything to say it. This says *what was actually said* — the user's turns
 * and the agent's replies, verbatim, in a file a human can read top to bottom
 * or grep.
 *
 * It exists because "is this the session I want?" is a question people answer by
 * skimming, and a 4,000-token brief cannot be skimmed for that. Tool calls and
 * their output are summarised to one line each by default: they are most of the
 * bytes and almost none of the meaning, and `--full` includes them when they are
 * the point.
 */
import type { IRMessage, SessionIR } from '../ir/types.js'

export interface TranscriptOptions {
  /** Include tool calls and their output, not just the conversation. */
  full?: boolean
  /** Include reasoning blocks. Off by default: it is the noisiest tier. */
  reasoning?: boolean
  /** Only the last N messages, when the file is too large to read whole. */
  last?: number
}

export interface Transcript {
  text: string
  messages: number
  tokens: number
}

/** Render a session as plain text, oldest first. */
export function renderTranscript(ir: SessionIR, options: TranscriptOptions = {}): Transcript {
  const source = options.last ? ir.messages.slice(-options.last) : ir.messages
  const out: string[] = []
  let rendered = 0

  const header = [
    `# ${ir.ref.agent} session ${ir.ref.id}`,
    `# ${ir.ref.path}`,
    typeof ir.metadata['cwd'] === 'string' ? `# cwd: ${ir.metadata['cwd']}` : undefined,
    typeof ir.metadata['branch'] === 'string' ? `# branch: ${ir.metadata['branch']}` : undefined,
    typeof ir.metadata['model'] === 'string' ? `# model: ${ir.metadata['model']}` : undefined,
    `# ${source.length} of ${ir.messages.length} message(s)`,
    '',
  ].filter((line): line is string => line !== undefined)
  out.push(...header)

  for (const message of source) {
    const block = renderOne(message, options)
    if (!block) continue
    out.push(block)
    rendered += 1
  }

  const text = `${out.join('\n')}\n`
  return { text, messages: rendered, tokens: Math.ceil(text.length / 4) }
}

function renderOne(message: IRMessage, options: TranscriptOptions): string | undefined {
  const text = (message.text ?? '').trim()

  if (message.isHumanTurn) {
    return `\n${rule('USER')}\n${text}\n`
  }

  if (message.role === 'user') {
    // Harness-injected, but worth seeing: it is where provider summaries land.
    return text ? `\n${rule('USER (harness)')}\n${text}\n` : undefined
  }

  if (message.role === 'assistant') {
    const parts: string[] = []
    if (text) parts.push(`${rule('ASSISTANT')}\n${text}`)
    if (message.toolName) {
      if (options.full) {
        parts.push(`${rule(`TOOL ${message.toolName}`)}\n${stringify(message.toolInput)}`)
      } else if (!text) {
        // A tool call with no prose still tells the reader what happened.
        parts.push(`  · ${message.toolName} ${oneLine(stringify(message.toolInput), 100)}`)
      }
    }
    return parts.length > 0 ? `\n${parts.join('\n')}\n` : undefined
  }

  if (message.role === 'tool') {
    if (!options.full) return undefined
    return `${rule('TOOL RESULT')}\n${oneLine(text, 2_000)}\n`
  }

  if (message.role === 'system') {
    return text ? `\n${rule('SYSTEM')}\n${text}\n` : undefined
  }

  if (message.role === 'attachment') {
    return text ? `\n${rule('PROVIDER SUMMARY')}\n${text}\n` : undefined
  }

  return undefined
}

function rule(label: string): string {
  return `──── ${label} ${'─'.repeat(Math.max(4, 60 - label.length))}`
}

function stringify(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function oneLine(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`
}
