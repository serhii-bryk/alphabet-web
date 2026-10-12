import type {
  PaymentErrorCode,
  PaymentMethod,
  PaymentMethodsResponse,
  PaymentMutationResponse,
  PaymentStatusResponse,
} from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

const paymentErrorCodes = [
  'session_ended',
  'invalid_amount',
  'insufficient_balance',
  'method_unavailable',
  'provider_unavailable',
  'deposit_failed',
  'payment_cancelled',
  'withdrawal_rejected',
  'withdrawal_unavailable',
  'duplicate_request',
] as const satisfies readonly PaymentErrorCode[];

export class PaymentRequestError extends Error {
  readonly code: PaymentErrorCode;

  constructor(code: PaymentErrorCode) {
    super(code);
    this.name = 'PaymentRequestError';
    this.code = code;
  }
}

export function fetchPaymentMethods(signal?: AbortSignal) {
  return sendJson('/api/payments/methods', { method: 'GET', signal }, parseMethods);
}

export function submitDeposit(input: { methodId: string; amount: number; idempotencyKey: string }) {
  return sendJson(
    '/api/payments/deposit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    parseMutation,
  );
}

export function submitWithdraw(input: {
  methodId: string;
  amount: number;
  idempotencyKey: string;
  details?: Record<string, string>;
}) {
  return sendJson(
    '/api/payments/withdraw',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    parseMutation,
  );
}

export function fetchPaymentStatus(paymentId: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ paymentId });
  return sendJson(`/api/payments/status?${query.toString()}`, { method: 'GET', signal }, parseStatus);
}

async function sendJson<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PaymentRequestError('provider_unavailable');
  }
  const body = await readJson(response);
  if (response.ok) {
    const parsed = parse(body);
    if (parsed) return parsed;
  }
  throw new PaymentRequestError(errorCode(body, response.status));
}

function errorCode(body: unknown, status: number): PaymentErrorCode {
  for (const code of paymentErrorCodes) {
    if (hasErrorCode(body, code)) return code;
  }
  if (status === 401) return 'session_ended';
  return 'provider_unavailable';
}

function parseMethods(body: unknown): PaymentMethodsResponse | null {
  if (!isRecord(body) || typeof body.currency !== 'string' || typeof body.balance !== 'number') return null;
  if (!Array.isArray(body.depositMethods) || !Array.isArray(body.withdrawMethods)) return null;
  const depositMethods = body.depositMethods.flatMap((method) => {
    const parsed = parseMethod(method);
    return parsed ? [parsed] : [];
  });
  const withdrawMethods = body.withdrawMethods.flatMap((method) => {
    const parsed = parseMethod(method);
    return parsed ? [parsed] : [];
  });
  if (depositMethods.length !== body.depositMethods.length) return null;
  if (withdrawMethods.length !== body.withdrawMethods.length) return null;
  return { currency: body.currency, balance: body.balance, depositMethods, withdrawMethods };
}

function parseMethod(body: unknown): PaymentMethod | null {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.label !== 'string' ||
    !isNullableNumber(body.minAmount) ||
    !isNullableNumber(body.maxAmount) ||
    !Array.isArray(body.fields) ||
    typeof body.test !== 'boolean'
  ) {
    return null;
  }
  const fields = body.fields.flatMap((field) => {
    if (
      !isRecord(field) ||
      typeof field.name !== 'string' ||
      typeof field.label !== 'string' ||
      typeof field.required !== 'boolean'
    ) {
      return [];
    }
    return [{ name: field.name, label: field.label, required: field.required }];
  });
  if (fields.length !== body.fields.length) return null;
  return {
    id: body.id,
    label: body.label,
    minAmount: body.minAmount,
    maxAmount: body.maxAmount,
    fields,
    test: body.test,
  };
}

function parseMutation(body: unknown): PaymentMutationResponse | null {
  if (!isRecord(body) || typeof body.paymentId !== 'string') return null;
  if (body.status !== 'redirect' && body.status !== 'completed' && body.status !== 'processing' && body.status !== 'failed') {
    return null;
  }
  if (body.redirectUrl !== undefined && typeof body.redirectUrl !== 'string') return null;
  return {
    status: body.status,
    paymentId: body.paymentId,
    ...(typeof body.redirectUrl === 'string' ? { redirectUrl: body.redirectUrl } : {}),
  };
}

function parseStatus(body: unknown): PaymentStatusResponse | null {
  if (!isRecord(body)) return null;
  if (
    body.status !== 'pending' &&
    body.status !== 'processing' &&
    body.status !== 'completed' &&
    body.status !== 'failed' &&
    body.status !== 'cancelled'
  ) {
    return null;
  }
  if (body.direction !== 'deposit' && body.direction !== 'withdraw') return null;
  return { status: body.status, direction: body.direction };
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}
