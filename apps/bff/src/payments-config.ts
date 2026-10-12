import { isTestDepositEnabled, resolveTestMaxAmount } from '@brand/domain';

export interface PaymentsConfig {
  finalpayUrl: string | undefined;
  finalpaySecret: string | undefined;
  userPrefix: string;
  transactionPrefix: string;
  brandName: string;
  callbackBaseUrl: string | undefined;
  webOrigin: string;
  testMode: boolean;
  testMaxAmount: number;
  providerConfigured: boolean;
}

export function readPaymentsConfig(env: Record<string, string | undefined>): PaymentsConfig {
  const finalpayUrl = readBaseUrl(env.FINALPAY_URL);
  const finalpaySecret = readSecret(env.FINALPAY_SECRET);
  const callbackBaseUrl = readOrigin(env.PAYMENTS_CALLBACK_BASE_URL);
  const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV;
  return {
    finalpayUrl,
    finalpaySecret,
    userPrefix: readPrefix(env.FINALPAY_USER_PREFIX, ''),
    transactionPrefix: readPrefix(env.FINALPAY_TRANSACTION_PREFIX, 'ab'),
    brandName: readLabel(env.PAYMENTS_BRAND_NAME, 'alphabet'),
    callbackBaseUrl,
    webOrigin: readOrigin(env.WEB_ORIGIN) ?? 'http://localhost:3000',
    testMode: isTestDepositEnabled(env.PAYMENTS_TEST_MODE, nodeEnv),
    testMaxAmount: resolveTestMaxAmount(env.PAYMENTS_TEST_MAX_AMOUNT),
    providerConfigured: Boolean(finalpayUrl && finalpaySecret && callbackBaseUrl),
  };
}

function readSecret(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function readPrefix(value: string | undefined, fallback: string): string {
  if (value === undefined || value === '') return fallback;
  return /^[A-Za-z0-9_-]{1,16}$/.test(value) ? value : fallback;
}

function readLabel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 64) return fallback;
  return trimmed;
}

function readBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function readOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.pathname !== '/' && url.pathname !== '') return undefined;
    if (url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
