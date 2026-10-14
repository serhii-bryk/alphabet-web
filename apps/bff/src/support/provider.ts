import type { OpenAiLiveConfig } from './limits.js';

export interface SupportAiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportAiCompletion {
  system: string;
  messages: SupportAiMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SupportAiResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SupportAiProvider {
  complete(input: SupportAiCompletion): Promise<SupportAiResult | string>;
}

export class SupportAiError extends Error {
  readonly code: 'ai_timeout' | 'ai_unavailable' | 'ai_response_invalid' | 'rate_limited' | 'budget_exhausted';
  readonly status: 429 | 502 | 503 | 504;

  constructor(code: SupportAiError['code']) {
    super(code);
    this.name = 'SupportAiError';
    this.code = code;
    this.status =
      code === 'ai_timeout' ? 504 : code === 'rate_limited' || code === 'budget_exhausted' ? 429 : code === 'ai_unavailable' ? 503 : 502;
  }
}

export function createSupportAiProvider(
  config: OpenAiLiveConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): SupportAiProvider {
  return {
    complete: (input) => completeOpenAi(config, input, fetchImpl),
  };
}

async function completeOpenAi(
  config: OpenAiLiveConfig,
  input: SupportAiCompletion,
  fetchImpl: typeof fetch,
): Promise<SupportAiResult> {
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
        max_tokens: input.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: input.system }, ...input.messages],
      }),
      signal: signalWithTimeout(input.timeoutMs, input.signal),
    },
    fetchImpl,
  );
  const body = await readBody(response);
  const content = readPath(body, ['choices', '0', 'message', 'content']);
  if (typeof content !== 'string' || !content.trim()) throw new SupportAiError('ai_response_invalid');
  const inputTokens = readToken(body, 'prompt_tokens');
  const outputTokens = readToken(body, 'completion_tokens');
  return {
    text: content,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
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

function signalWithTimeout(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!parent) return timeout;
  return AbortSignal.any([parent, timeout]);
}

function isTimeout(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function readToken(body: unknown, name: 'prompt_tokens' | 'completion_tokens'): number | undefined {
  const usage = readPath(body, ['usage']);
  if (!isRecord(usage)) return undefined;
  const value = usage[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000) return undefined;
  return value;
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
