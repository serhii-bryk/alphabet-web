export type SupportAiProviderName = 'openai' | 'anthropic';

export interface SupportAiConfig {
  provider: SupportAiProviderName;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface SupportAiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportAiCompletion {
  system: string;
  messages: SupportAiMessage[];
  signal?: AbortSignal;
}

export interface SupportAiProvider {
  complete(input: SupportAiCompletion): Promise<string>;
}

export class SupportAiError extends Error {
  readonly code: 'ai_timeout' | 'ai_unavailable' | 'ai_response_invalid';
  readonly status: 502 | 503 | 504;

  constructor(code: SupportAiError['code']) {
    super(code);
    this.name = 'SupportAiError';
    this.code = code;
    this.status = code === 'ai_timeout' ? 504 : code === 'ai_unavailable' ? 503 : 502;
  }
}

const modelPattern = /^[A-Za-z0-9._:-]{1,80}$/;

export function readSupportAiConfig(env: Record<string, string | undefined>): SupportAiConfig | null {
  const apiKey = env.SUPPORT_AI_API_KEY?.trim() ?? '';
  if (!apiKey || apiKey.length > 400) return null;
  const requested = env.SUPPORT_AI_PROVIDER?.trim().toLowerCase() || 'openai';
  if (requested !== 'openai' && requested !== 'anthropic') return null;
  const model = env.SUPPORT_AI_MODEL?.trim() || (requested === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini');
  if (!modelPattern.test(model)) return null;
  const fallback = requested === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
  const baseUrl = readBaseUrl(env.SUPPORT_AI_BASE_URL, fallback);
  if (!baseUrl) return null;
  return { provider: requested, apiKey, model, baseUrl };
}

export function createSupportAiProvider(
  config: SupportAiConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): SupportAiProvider {
  return {
    complete: (input) =>
      config.provider === 'anthropic'
        ? completeAnthropic(config, input, fetchImpl)
        : completeOpenAi(config, input, fetchImpl),
  };
}

async function completeOpenAi(
  config: SupportAiConfig,
  input: SupportAiCompletion,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await request(
    `${config.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          ...input.messages,
        ],
      }),
      signal: signalWithTimeout(input.signal),
    },
    fetchImpl,
  );
  const content = readPath(await readBody(response), ['choices', '0', 'message', 'content']);
  if (typeof content !== 'string' || !content.trim()) throw new SupportAiError('ai_response_invalid');
  return content;
}

async function completeAnthropic(
  config: SupportAiConfig,
  input: SupportAiCompletion,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await request(
    `${config.baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 800,
        temperature: 0.2,
        system: input.system,
        messages: input.messages,
      }),
      signal: signalWithTimeout(input.signal),
    },
    fetchImpl,
  );
  const blocks = readPath(await readBody(response), ['content']);
  const text = Array.isArray(blocks)
    ? blocks
        .map((block) => (isRecord(block) && block.type === 'text' ? block.text : null))
        .find((value) => typeof value === 'string')
    : null;
  if (typeof text !== 'string' || !text.trim()) throw new SupportAiError('ai_response_invalid');
  return text;
}

async function request(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  try {
    const response = await fetchImpl(url, init);
    if (!response.ok) throw new SupportAiError('ai_unavailable');
    return response;
  } catch (error) {
    if (error instanceof SupportAiError) throw error;
    if (isTimeout(error)) throw new SupportAiError('ai_timeout');
    throw new SupportAiError('ai_unavailable');
  }
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SupportAiError('ai_response_invalid');
  }
}

function signalWithTimeout(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(20_000);
  if (!parent) return timeout;
  return AbortSignal.any([parent, timeout]);
}

function isTimeout(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function readBaseUrl(value: string | undefined, fallback: string): string | null {
  const raw = value?.trim() || fallback;
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current)) {
      current = current[Number(key)];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
