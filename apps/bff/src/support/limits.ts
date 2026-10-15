const NANO = 1_000_000_000;

export interface AiChatLimits {
  dailyBudgetNano: number;
  totalBudgetNano: number;
  sessionLimit: number;
  hourlyLimit: number;
  hourWindowMs: number;
  maxMessageChars: number;
  maxOutputTokens: number;
  maxInputTokens: number;
  maxConcurrent: number;
  timeoutMs: number;
  maxHistory: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  quoteNano: number;
  staleReservationMs: number;
}

export type LiveOpenAiStatus = 'ready' | 'disabled' | 'missing_key' | 'production' | 'invalid';

export interface OpenAiLiveConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

const modelPattern = /^[A-Za-z0-9._:-]{1,80}$/;

/**
 * In-process budget checks complement, and do not replace, OpenAI organization
 * and project usage limits. Keep those billing controls set as well.
 */
export function readAiChatLimits(env: Record<string, string | undefined>): AiChatLimits {
  const maxOutputTokens = positiveInt(env.AI_CHAT_MAX_OUTPUT_TOKENS, 250, 2_000);
  const maxInputTokens = positiveInt(env.AI_CHAT_MAX_INPUT_TOKENS, 2_000, 8_000);
  const timeoutMs = positiveInt(env.AI_CHAT_TIMEOUT_MS, 8_000, 20_000);
  const inputUsdPerMillion = positiveDecimal(env.AI_CHAT_INPUT_USD_PER_MILLION, 0.15, 100);
  const outputUsdPerMillion = positiveDecimal(env.AI_CHAT_OUTPUT_USD_PER_MILLION, 0.6, 100);
  const limits: AiChatLimits = {
    dailyBudgetNano: usdToNano(positiveDecimal(env.AI_CHAT_DAILY_BUDGET_USD, 1, 100)),
    totalBudgetNano: usdToNano(positiveDecimal(env.AI_CHAT_TOTAL_BUDGET_USD, 5, 100)),
    sessionLimit: positiveInt(env.AI_CHAT_SESSION_LIMIT, 10, 100),
    hourlyLimit: positiveInt(env.AI_CHAT_HOURLY_LIMIT, 10, 100),
    hourWindowMs: 60 * 60 * 1000,
    maxMessageChars: positiveInt(env.AI_CHAT_MAX_MESSAGE_CHARS, 500, 2_000),
    maxOutputTokens,
    maxInputTokens,
    maxConcurrent: positiveInt(env.AI_CHAT_MAX_CONCURRENT, 2, 8),
    timeoutMs,
    maxHistory: positiveInt(env.AI_CHAT_MAX_HISTORY, 6, 8),
    inputUsdPerMillion,
    outputUsdPerMillion,
    quoteNano: 0,
    staleReservationMs: timeoutMs + 5_000,
  };
  limits.quoteNano = tokenCostNano(maxInputTokens, maxOutputTokens, limits);
  return limits;
}

export function liveOpenAiStatus(env: Record<string, string | undefined>): LiveOpenAiStatus {
  if (env.AI_CHAT_ENABLED?.trim() !== 'true') return 'disabled';
  if (env.NODE_ENV === 'production') return 'production';
  const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey || apiKey.length > 400) return 'missing_key';
  const model = env.AI_CHAT_MODEL?.trim() || 'gpt-4o-mini';
  if (!modelPattern.test(model)) return 'invalid';
  if (!readBaseUrl(env.AI_CHAT_BASE_URL)) return 'invalid';
  return 'ready';
}

export function readOpenAiLiveConfig(env: Record<string, string | undefined>): OpenAiLiveConfig | null {
  if (liveOpenAiStatus(env) !== 'ready') return null;
  const limits = readAiChatLimits(env);
  const baseUrl = readBaseUrl(env.AI_CHAT_BASE_URL);
  if (!baseUrl) return null;
  return {
    apiKey: env.OPENAI_API_KEY?.trim() ?? '',
    model: env.AI_CHAT_MODEL?.trim() || 'gpt-4o-mini',
    baseUrl,
    maxOutputTokens: limits.maxOutputTokens,
    timeoutMs: limits.timeoutMs,
  };
}

export function tokenCostNano(
  inputTokens: number,
  outputTokens: number,
  limits: Pick<AiChatLimits, 'inputUsdPerMillion' | 'outputUsdPerMillion'>,
): number {
  return costNano(inputTokens, limits.inputUsdPerMillion) + costNano(outputTokens, limits.outputUsdPerMillion);
}

export function usdToNano(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * NANO);
}

function costNano(tokens: number, usdPerMillion: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.ceil((tokens * usdPerMillion * NANO) / 1_000_000);
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) return fallback;
  return parsed;
}

function positiveDecimal(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return fallback;
  return parsed;
}

function readBaseUrl(value: string | undefined): string | null {
  const raw = value?.trim() || 'https://api.openai.com/v1';
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
