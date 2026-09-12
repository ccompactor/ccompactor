/**
 * Session metadata and a preview, loaded on demand.
 *
 * The list must stay fast — `stat` and nothing else — because scanning several
 * hundred sessions with a full parse each would take minutes. So the columns a
 * reader cares about are filled in when they land on a row, and the preview is
 * loaded when they ask to look inside.
 *
 * The preview is what makes the tool usable without a session id in hand: the
 * first thing anyone wants to know is "is this the session I meant?", and the
 * only thing that answers it is the last few turns.
 */
import type { SessionIR, SessionRef } from '../ir/types.js'
import { readSession } from '../discover/index.js'
import { buildLedgers } from '../ledgers/index.js'

export interface PreviewLine {
  role: string
  text: string
  evt: number
}

export interface SessionDetails {
  messages: number
  userTurns: number
  toolCalls: number
  tokens: number
  cwd?: string
  branch?: string
  model?: string
  version?: string
  first?: string
  last?: string
  compactBoundaries: number
  /** The newest turns, oldest first, for the quick look. */
  preview: PreviewLine[]
  diagnostics: number
}

/** Load metadata and the newest `previewCount` turns. */
export async function loadDetails(
  ref: SessionRef,
  previewCount = 30,
): Promise<SessionDetails> {
  // `light` throughout: nothing here needs the original records, and keeping
  // them for a handful of concurrent 200 MB transcripts is what exhausted the
  // heap.
  const ir = await readSession(ref, { light: true })
  return describe(ir, previewCount)
}

export function describe(ir: SessionIR, previewCount: number): SessionDetails {
  const ledgers = buildLedgers(ir)
  const text = ir.messages.reduce((n, m) => n + (m.text?.length ?? 0), 0)
  const first = ir.messages[0]?.timestamp
  const last = ir.messages.at(-1)?.timestamp
  return {
    messages: ir.messages.length,
    userTurns: ledgers.counts.userTurns,
    toolCalls: ledgers.counts.toolCalls,
    tokens: Math.ceil(text / 4),
    ...(str(ir.metadata['cwd']) ? { cwd: str(ir.metadata['cwd'])! } : {}),
    ...(str(ir.metadata['branch']) ? { branch: str(ir.metadata['branch'])! } : {}),
    ...(str(ir.metadata['model']) ? { model: str(ir.metadata['model'])! } : {}),
    ...(str(ir.metadata['version']) ? { version: str(ir.metadata['version'])! } : {}),
    ...(first ? { first } : {}),
    ...(last ? { last } : {}),
    compactBoundaries: ir.compactBoundaries.length,
    preview: preview(ir, previewCount),
    diagnostics: ir.diagnostics.length,
  }
}

/** The newest turns, oldest first. Tool calls become one line; results are dropped. */
function preview(ir: SessionIR, count: number): PreviewLine[] {
  const out: PreviewLine[] = []
  for (const message of ir.messages) {
    const text = (message.text ?? '').trim()
    if (message.isHumanTurn && text) {
      out.push({ role: 'user', text: clip(text, 900), evt: message.eventIndex })
      continue
    }
    if (message.role === 'assistant') {
      if (text) {
        out.push({ role: 'agent', text: clip(text, 700), evt: message.eventIndex })
      } else if (message.toolName) {
        out.push({
          role: 'tool',
          text: `${message.toolName} ${clip(stringify(message.toolInput), 90)}`,
          evt: message.eventIndex,
        })
      }
    }
  }
  return out.slice(-count)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringify(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function clip(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`
}
