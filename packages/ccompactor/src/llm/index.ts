/**
 * LLM backends for the summary step.
 *
 * `--llm none` is a first-class mode, not a degraded one: the deterministic
 * artifact is complete for following the evidence, and it costs nothing. The
 * model is what turns evidence into understanding, and everything else works
 * without it.
 *
 * Only `fetch` is used. An SDK per provider is a dependency per provider, and
 * the differences between these APIs are a URL, a header and a JSON shape.
 */

export type Selection =
  | { kind: 'none' }
  | { kind: 'anthropic'; model: string }
  | { kind: 'openai'; model: string }
  | { kind: 'compat'; model: string; baseUrl: string }

export interface LlmRequest {
  system: string
  user: string
  maxTokens: number
}

export interface LlmResponse {
  text: string
  inputTokens?: number
  outputTokens?: number
}

export interface Backend {
  readonly label: string
  complete(request: LlmRequest): Promise<LlmResponse>
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4.1-mini',
  compat: 'deepseek-chat',
}

export function parseSelection(text: string): Selection {
  const value = text.trim()
  if (value === 'none') return { kind: 'none' }
  // The spec writes these as `api:anthropic`, `api:compat/<model>`. Splitting on
  // `/` before stripping the `api:` prefix makes the provider `api:compat` and
  // every run fail with a message that names the prefix it just failed to strip.
  const bare = value.startsWith('api:') ? value.slice(4) : value
  const [provider, model] = bare.split('/')
  if (!provider) throw new Error(`unknown --llm \`${text}\``)
  if (provider === 'anthropic') return { kind: 'anthropic', model: model ?? DEFAULT_MODELS['anthropic']! }
  if (provider === 'openai') return { kind: 'openai', model: model ?? DEFAULT_MODELS['openai']! }
  if (provider === 'compat') {
    const baseUrl = process.env['CCOMPACTOR_BASE_URL']
    if (!baseUrl) throw new Error('--llm api:compat needs CCOMPACTOR_BASE_URL')
    return { kind: 'compat', model: model ?? DEFAULT_MODELS['compat']!, baseUrl }
  }
  throw new Error(
    `unknown --llm provider \`${provider}\` (expected none, api:anthropic, api:openai, api:compat/<model>)`,
  )
}

/** Resolve `auto`: an API key if one is present, otherwise nothing. */
export function resolveAuto(): Selection {
  const explicit = process.env['CCOMPACTOR_LLM']
  if (explicit && explicit !== 'auto') return parseSelection(explicit)
  if (process.env['ANTHROPIC_API_KEY']) return parseSelection('api:anthropic')
  if (process.env['OPENAI_API_KEY']) return parseSelection('api:openai')
  if (process.env['CCOMPACTOR_API_KEY'] && process.env['CCOMPACTOR_BASE_URL']) {
    return parseSelection('api:compat')
  }
  return { kind: 'none' }
}

export function selectionLabel(selection: Selection): string {
  return selection.kind === 'none' ? 'none' : `api:${selection.kind}/${selection.model}`
}

export function build(selection: Selection): Backend | undefined {
  if (selection.kind === 'none') return undefined
  return new HttpBackend(selection)
}

class HttpBackend implements Backend {
  readonly label: string
  constructor(private readonly selection: Exclude<Selection, { kind: 'none' }>) {
    this.label = selectionLabel(selection)
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (this.selection.kind === 'anthropic') return this.anthropic(request)
    return this.openaiCompatible(request)
  }

  private async anthropic(request: LlmRequest): Promise<LlmResponse> {
    const key = process.env['ANTHROPIC_API_KEY']
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: (this.selection as { model: string }).model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      }),
    })
    if (!response.ok) {
      throw new Error(`anthropic ${response.status}: ${(await response.text()).slice(0, 400)}`)
    }
    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
    return {
      text,
      ...(body.usage?.input_tokens !== undefined ? { inputTokens: body.usage.input_tokens } : {}),
      ...(body.usage?.output_tokens !== undefined ? { outputTokens: body.usage.output_tokens } : {}),
    }
  }

  private async openaiCompatible(request: LlmRequest): Promise<LlmResponse> {
    const selection = this.selection as { kind: 'openai' | 'compat'; model: string; baseUrl?: string }
    const base =
      selection.kind === 'compat'
        ? selection.baseUrl!.replace(/\/$/, '')
        : 'https://api.openai.com'
    const key =
      selection.kind === 'compat'
        ? (process.env['CCOMPACTOR_API_KEY'] ?? '')
        : (process.env['OPENAI_API_KEY'] ?? '')
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: selection.model,
        max_tokens: request.maxTokens,
        temperature: 0,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    })
    if (!response.ok) {
      throw new Error(`${selection.kind} ${response.status}: ${(await response.text()).slice(0, 400)}`)
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      ...(body.usage?.prompt_tokens !== undefined ? { inputTokens: body.usage.prompt_tokens } : {}),
      ...(body.usage?.completion_tokens !== undefined
        ? { outputTokens: body.usage.completion_tokens }
        : {}),
    }
  }
}
