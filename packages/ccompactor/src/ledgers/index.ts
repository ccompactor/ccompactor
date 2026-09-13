/**
 * Deterministic ledgers.
 *
 * Everything here is computed from the transcript without a model. That is the
 * point: a handoff that cannot say which files were touched, which commands
 * failed and what the human actually asked for is not worth the model call that
 * would summarise it, and these facts are cheap and exact.
 *
 * Every record carries the event index it came from, so anything the artifact
 * claims can be pulled back out with `ccompactor expand`.
 */
import type { IRMessage, SessionIR } from '../ir/types.js'

export interface FileRecord {
  path: string
  edits: number
  writes: number
  reads: number
  firstEvt: number
  lastEvt: number
}

export interface CommandRecord {
  command: string
  evt: number
  exitCode?: number
  failed: boolean
  outputHead: string
}

export interface ErrorRecord {
  signature: string
  evt: number
  occurrences: number
  example: string
}

export interface CommitRecord {
  sha: string
  subject: string
  evt: number
}

export interface Ledgers {
  files: FileRecord[]
  commands: CommandRecord[]
  errors: ErrorRecord[]
  commits: CommitRecord[]
  userTurns: Array<{ evt: number; text: string }>
  toolUse: Array<{ name: string; count: number }>
  counts: {
    messages: number
    userTurns: number
    toolCalls: number
    failedCommands: number
  }
}

/** Tools whose argument names a file the session worked on. */
const FILE_TOOLS: Record<string, 'edit' | 'write' | 'read'> = {
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
  Read: 'read',
  NotebookRead: 'read',
}

const COMMAND_TOOLS = new Set(['Bash', 'BashOutput', 'Shell', 'shell'])

export function buildLedgers(ir: SessionIR): Ledgers {
  const files = new Map<string, FileRecord>()
  const commands: CommandRecord[] = []
  const errors: ErrorRecord[] = []
  const commits: CommitRecord[] = []
  const userTurns: Array<{ evt: number; text: string }> = []
  const toolCounts = new Map<string, number>()

  // Tool results are keyed by call id, so a command's outcome attaches to the
  // call that produced it rather than being guessed from proximity.
  const resultFor = new Map<string, IRMessage>()
  for (const message of ir.messages) {
    if (message.role === 'tool' && message.toolUseId) resultFor.set(message.toolUseId, message)
  }

  for (const message of ir.messages) {
    if (message.isHumanTurn && message.text) {
      userTurns.push({ evt: message.eventIndex, text: message.text })
      continue
    }
    if (message.role !== 'assistant' || !message.toolName) continue

    toolCounts.set(message.toolName, (toolCounts.get(message.toolName) ?? 0) + 1)
    const input = asRecord(message.toolInput)
    const result = message.toolUseId ? resultFor.get(message.toolUseId) : undefined

    const fileKind = FILE_TOOLS[message.toolName]
    if (fileKind) {
      const path = firstString(input, ['file_path', 'path', 'notebook_path'])
      if (path) {
        const record = files.get(path) ?? {
          path,
          edits: 0,
          writes: 0,
          reads: 0,
          firstEvt: message.eventIndex,
          lastEvt: message.eventIndex,
        }
        if (fileKind === 'edit') record.edits += 1
        if (fileKind === 'write') record.writes += 1
        if (fileKind === 'read') record.reads += 1
        record.lastEvt = Math.max(record.lastEvt, message.eventIndex)
        files.set(path, record)
      }
      continue
    }

    if (COMMAND_TOOLS.has(message.toolName)) {
      const command = firstString(input, ['command', 'cmd'])
      if (!command) continue
      const exitCode = exitCodeOf(result)
      const failed = result?.isError === true || (exitCode !== undefined && exitCode !== 0)
      commands.push({
        command: command.split('\n')[0]!.slice(0, 300),
        evt: message.eventIndex,
        ...(exitCode !== undefined ? { exitCode } : {}),
        failed,
        outputHead: head(result?.text),
      })
      if (failed) {
        errors.push(errorRecord(result?.text ?? command, message.eventIndex, command))
      }
      collectCommit(command, result?.text ?? '', message.eventIndex, commits)
    }
  }

  return {
    files: [...files.values()].sort((a, b) => weight(b) - weight(a) || a.path.localeCompare(b.path)),
    commands: commands.sort((a, b) => a.evt - b.evt),
    errors: mergeErrors(errors),
    commits,
    userTurns,
    toolUse: [...toolCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    counts: {
      messages: ir.messages.length,
      userTurns: userTurns.length,
      toolCalls: [...toolCounts.values()].reduce((a, b) => a + b, 0),
      failedCommands: commands.filter((c) => c.failed).length,
    },
  }
}

/** A file the session wrote to matters more than one it merely read. */
function weight(file: FileRecord): number {
  return file.edits * 3 + file.writes * 3 + file.reads
}

/**
 * What `git commit` prints: `[main beea1ea] subject`, `[main (root-commit)
 * beea1ea] subject`, or `[detached HEAD beea1ea] subject`.
 *
 * This is the only place either half of a commit is stated outright. The
 * command line cannot supply it: most commits here are written as
 * `git commit -m "$(cat <<'EOF'`, whose first line carries no message at all,
 * and a heredoc's subject is on a later line that the command ledger never
 * keeps. Reading the command produced 245 commits with `sha: "?"` and 97
 * subjects that were the string `$(cat <<`.
 */
const GIT_COMMIT_OUTPUT = /^\[([^\]\s]+)(?:\s+\([^)]*\))?\s+([0-9a-f]{7,40})\]\s*(.*)$/m

/** `git commit -m "..."`, for a commit whose output was not captured. */
const GIT_COMMIT_M = /git\s+commit\b[^\n]*?-m\s+["']([^"']+)["']/

function collectCommit(
  command: string,
  output: string,
  evt: number,
  out: CommitRecord[],
): void {
  if (!command.includes('git commit')) return
  const printed = GIT_COMMIT_OUTPUT.exec(output)
  if (printed) {
    const subject = printed[3]!.trim()
    // An amended or rebased commit prints the same sha twice; the ledgers name
    // each commit once.
    if (out.some((c) => c.sha === printed[2])) return
    out.push({ sha: printed[2]!, subject: subject.slice(0, 200), evt })
    return
  }
  // No output to read — a dry run, or a commit that failed. The message on the
  // command line is still better than nothing, but it has no sha to attach.
  const message = GIT_COMMIT_M.exec(command)?.[1]?.split('\n')[0]?.trim()
  // `-m "$(cat <<'EOF'` captures `$(cat <<`. A commit whose message was written
  // that way has no subject on the command line, and inventing one out of shell
  // syntax is worse than leaving the subject empty.
  if (message && message.length > 0 && !/[$`]|<<|\$\(/.test(message)) {
    out.push({ sha: '?', subject: message.slice(0, 200), evt })
  }
}

function exitCodeOf(result: IRMessage | undefined): number | undefined {
  if (!result) return undefined
  const raw = asRecord(result.raw)
  const toolUseResult = asRecord(raw['toolUseResult'])
  for (const candidate of [toolUseResult['exitCode'], toolUseResult['exit_code']]) {
    if (typeof candidate === 'number') return candidate
  }
  const match = /exit code (\d+)/i.exec(result.text ?? '')
  return match ? Number.parseInt(match[1]!, 10) : undefined
}

/**
 * A signature is the error's *shape* with the parts that vary per occurrence
 * removed — paths, line numbers, hex ids, counts — so the same failure repeated
 * forty times is one record with a count rather than forty records.
 */
/**
 * Lines that report *that* something failed without saying what.
 *
 * Every failed command ends in one of these, so signing on them merges fifteen
 * unrelated failures into one entry that tells a reader nothing.
 */
const WRAPPER = /^(exit code \d+|command failed[^:]*|non-zero exit.*|\[?error\]?)$/i

/** What a real failure line looks like. */
const FAILURE =
  /error|fail|exception|traceback|cannot|unable|not found|denied|refused|✗|×|ENOENT|TS\d{4}/i

export function errorSignature(text: string): string {
  // The first line of a failed command's output is usually the wrapper — "Exit
  // code 1", a shell banner, the command echoed back — and signing on it made
  // every unrelated failure look like the same error. The first line that
  // actually reads like a failure is used when there is one.
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const useful = lines.filter((l) => !WRAPPER.test(l) && /\p{L}/u.test(l))
  const line = (
    useful.find((l) => FAILURE.test(l)) ??
    useful[0] ??
    'failed with no error output'
  ).slice(0, 200)
  return line
    .replace(/0x[0-9a-f]+/gi, '0x…')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '…')
    .replace(/\/[^\s:]+/g, (m) => (m.length > 12 ? `…${m.slice(-12)}` : m))
    .replace(/:\d+:\d+/g, ':N:N')
    .replace(/:\d+/g, ':N')
    .replace(/\b\d{2,}\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
}

function errorRecord(text: string, evt: number, fallback: string): ErrorRecord {
  const signature = errorSignature(text) || errorSignature(fallback)
  return { signature, evt, occurrences: 1, example: head(text) }
}

function mergeErrors(errors: ErrorRecord[]): ErrorRecord[] {
  const merged = new Map<string, ErrorRecord>()
  for (const error of errors) {
    const existing = merged.get(error.signature)
    if (existing) {
      existing.occurrences += 1
      existing.evt = Math.max(existing.evt, error.evt)
    } else {
      merged.set(error.signature, { ...error })
    }
  }
  return [...merged.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.signature.localeCompare(b.signature),
  )
}

function head(text: string | undefined): string {
  if (!text) return ''
  return text.split('\n').slice(0, 3).join(' ').trim().slice(0, 200)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** Paths under these are noise: dependencies, build output, logs, caches. */
const NOISE = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.log$/,
  /(^|\/)\.cache\//,
]

export function isNoisePath(path: string): boolean {
  return NOISE.some((pattern) => pattern.test(path))
}
