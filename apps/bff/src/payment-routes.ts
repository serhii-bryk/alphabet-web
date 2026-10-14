import type { PaymentErrorCode } from '@brand/contracts';
import { PaymentError } from '@brand/domain';
import type { PaymentUseCases, RefreshIfNeededResult } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  applyResolvedSession,
  resolvePlayerSession,
  type AuthRouteDependencies,
} from './auth-routes.js';
import { callbackChecksumMatches } from './finalpay.js';
import type { PaymentsConfig } from './payments-config.js';
import {
  clearSessionCookieHeader,
  cookieIsSecure,
  firstForwardedIp,
  loginBrowser,
  mutationOriginAllowed,
} from './session-cookie.js';

const paymentMessages = {
  session_ended: 'Your session has ended',
  invalid_amount: 'Enter a valid amount',
  insufficient_balance: 'Not enough balance',
  method_unavailable: 'This payment method is unavailable',
  provider_unavailable: 'Payments are temporarily unavailable',
  deposit_failed: 'The deposit did not complete',
  payment_cancelled: 'The payment was cancelled',
  withdrawal_rejected: 'The withdrawal was rejected',
  withdrawal_unavailable: 'Withdrawals are temporarily unavailable',
  duplicate_request: 'That payment is already being processed',
} as const satisfies Record<PaymentErrorCode, string>;

const paymentStatus: Record<PaymentErrorCode, 400 | 401 | 409 | 422 | 502> = {
  session_ended: 401,
  invalid_amount: 400,
  insufficient_balance: 422,
  method_unavailable: 422,
  provider_unavailable: 502,
  deposit_failed: 422,
  payment_cancelled: 422,
  withdrawal_rejected: 422,
  withdrawal_unavailable: 502,
  duplicate_request: 409,
};

const methodSchema = z.object({
  id: z.string(),
  label: z.string(),
  minAmount: z.number().nullable(),
  maxAmount: z.number().nullable(),
  fields: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      required: z.boolean(),
    }),
  ),
  test: z.boolean(),
  mock: z.boolean(),
});

const methodsResponseSchema = z.object({
  currency: z.string().length(3),
  balance: z.number(),
  depositMethods: z.array(methodSchema),
  withdrawMethods: z.array(methodSchema),
});

const mutationResponseSchema = z.object({
  status: z.enum(['redirect', 'completed', 'processing', 'failed']),
  paymentId: z.uuid(),
  redirectUrl: z.url({ protocol: /^https$/ }).optional(),
});

const statusResponseSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  direction: z.enum(['deposit', 'withdraw']),
});

const depositBodySchema = z.object({
  methodId: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive(),
  idempotencyKey: z.uuid(),
});

const withdrawBodySchema = depositBodySchema.extend({
  details: z.record(z.string().trim().min(1).max(40), z.string().max(200)).optional(),
});

const callbackBodySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  state: z.string().min(1).max(40),
  checksum: z.string().trim().min(64).max(64),
  info: z.unknown().optional(),
});

const knownCallbackStates = new Set([
  'INITIATED',
  'ACCEPTED',
  'CAPTURED',
  'PENDING',
  'DECLINED',
  'CANCELLED',
  'ERROR',
  'FAILED',
  'LOCKED',
  'REDIRECT',
  'USER_APPROVE',
]);

export interface PaymentRouteDependencies extends AuthRouteDependencies {
  getPayments: () => PaymentUseCases;
  paymentsConfig: PaymentsConfig;
  inflight: Map<string, Promise<RefreshIfNeededResult>>;
}

export function registerPaymentRoutes(app: Hono, dependencies: PaymentRouteDependencies): void {
  const methods = (c: Context) => handleMethods(c, dependencies);
  const deposit = (c: Context) => handleDeposit(c, dependencies);
  const withdraw = (c: Context) => handleWithdraw(c, dependencies);
  const status = (c: Context) => handleStatus(c, dependencies);
  const callback = (c: Context) => handleCallback(c, dependencies);

  app.get('/payments/methods', methods);
  app.get('/api/payments/methods', methods);
  app.post('/payments/deposit', deposit);
  app.post('/api/payments/deposit', deposit);
  app.post('/payments/withdraw', withdraw);
  app.post('/api/payments/withdraw', withdraw);
  app.get('/payments/status', status);
  app.get('/api/payments/status', status);
  app.post('/payments/callback/:paymentId', callback);
  app.post('/api/payments/callback/:paymentId', callback);
}

export function isPaymentPath(path: string): boolean {
  return /^\/(?:api\/)?payments(?:\/|$)/.test(path.split('?')[0] ?? path);
}

export function isPaymentCallbackPath(path: string): boolean {
  return /^\/(?:api\/)?payments\/callback\/[^/]+$/.test(path.split('?')[0] ?? path);
}

async function handleMethods(c: Context, dependencies: PaymentRouteDependencies): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  const actor = await authenticatedActor(c, dependencies);
  if (actor instanceof Response) return actor;
  try {
    return c.json(methodsResponseSchema.parse(await dependencies.getPayments().listMethods(actor)));
  } catch (error) {
    return paymentFailure(c, dependencies, error);
  }
}

async function handleDeposit(c: Context, dependencies: PaymentRouteDependencies): Promise<Response> {
  return handleMutation(c, dependencies, depositBodySchema, (actor, body) =>
    dependencies.getPayments().deposit(actor, body),
  );
}

async function handleWithdraw(c: Context, dependencies: PaymentRouteDependencies): Promise<Response> {
  return handleMutation(c, dependencies, withdrawBodySchema, (actor, body) =>
    dependencies.getPayments().withdraw(actor, body),
  );
}

async function handleMutation<T extends { methodId: string; amount: number; idempotencyKey: string }>(
  c: Context,
  dependencies: PaymentRouteDependencies,
  schema: z.ZodType<T>,
  run: (actor: Actor, body: T) => Promise<{ status: string; paymentId: string; redirectUrl?: string }>,
): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return paymentError(c, 'provider_unavailable');
  }
  if (!isJsonContentType(c.req.header('content-type'))) return paymentError(c, 'invalid_amount');
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return paymentError(c, 'invalid_amount');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return paymentError(c, bodyFailureCode(parsed.error));
  const actor = await authenticatedActor(c, dependencies);
  if (actor instanceof Response) return actor;
  try {
    return c.json(mutationResponseSchema.parse(await run(actor, parsed.data)));
  } catch (error) {
    return paymentFailure(c, dependencies, error);
  }
}

async function handleStatus(c: Context, dependencies: PaymentRouteDependencies): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  const paymentId = z.uuid().safeParse(new URL(c.req.url).searchParams.get('paymentId'));
  if (!paymentId.success) return paymentError(c, 'method_unavailable');
  const actor = await authenticatedActor(c, dependencies);
  if (actor instanceof Response) return actor;
  try {
    return c.json(statusResponseSchema.parse(await dependencies.getPayments().status(actor, paymentId.data)));
  } catch (error) {
    return paymentFailure(c, dependencies, error);
  }
}

async function handleCallback(c: Context, dependencies: PaymentRouteDependencies): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  const paymentId = z.uuid().safeParse(c.req.param('paymentId'));
  if (!paymentId.success) return callbackAck(c, 'FAIL', 400);
  const secret = dependencies.paymentsConfig.finalpaySecret;
  if (!secret) return callbackAck(c, 'FAIL', 400);
  const media = c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (media && media !== 'application/json' && media !== 'text/plain') return callbackAck(c, 'FAIL', 400);
  let raw = '';
  try {
    raw = await c.req.text();
  } catch {
    return callbackAck(c, 'FAIL', 400);
  }
  if (raw.length === 0 || raw.length > 8_000) return callbackAck(c, 'FAIL', 400);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return callbackAck(c, 'FAIL', 400);
  }
  const parsed = callbackBodySchema.safeParse(payload);
  if (!parsed.success) return callbackAck(c, 'FAIL', 400);
  const providerPaymentId = String(parsed.data.id);
  if (!callbackChecksumMatches(providerPaymentId, parsed.data.state, parsed.data.checksum, secret)) {
    logCallback(paymentId.data, parsed.data.state, 'rejected');
    return callbackAck(c, 'FAIL', 400);
  }
  const providerId = Number(providerPaymentId);
  if (!Number.isSafeInteger(providerId) || providerId <= 0) return callbackAck(c, 'FAIL', 400);
  try {
    const result = await dependencies.getPayments().handleCallback({
      paymentId: paymentId.data,
      providerPaymentId: providerId,
      state: parsed.data.state,
    });
    logCallback(paymentId.data, parsed.data.state, result.outcome);
    if (result.ack === 'fail' && result.outcome === 'retry') return callbackAck(c, 'FAIL', 503);
    return callbackAck(c, result.ack === 'ok' ? 'OK' : 'FAIL', result.ack === 'ok' ? 200 : 200);
  } catch {
    logCallback(paymentId.data, parsed.data.state, 'retry');
    return callbackAck(c, 'FAIL', 503);
  }
}

async function authenticatedActor(c: Context, dependencies: PaymentRouteDependencies) {
  const secure = cookieIsSecure(dependencies.webOrigin);
  const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight);
  if (resolved.status === 'unavailable') return paymentError(c, 'provider_unavailable');
  if (resolved.status !== 'ready') {
    applyResolvedSession(c, resolved, dependencies, secure);
    return paymentError(c, 'session_ended');
  }
  applyResolvedSession(c, resolved, dependencies, secure);
  return {
    session: resolved.session,
    ip: firstForwardedIp(c.req.header('x-forwarded-for')),
    browser: loginBrowser(c.req.header('user-agent')),
    locale: paymentLocale(c.req.header('cookie'), c.req.header('referer'), dependencies.webOrigin),
  };
}

type Actor = Exclude<Awaited<ReturnType<typeof authenticatedActor>>, Response>;

function paymentFailure(
  c: Context,
  dependencies: PaymentRouteDependencies,
  error: unknown,
): Response {
  if (error instanceof PaymentError && error.code === 'session_ended') {
    c.header('Set-Cookie', clearSessionCookieHeader(cookieIsSecure(dependencies.webOrigin)));
  }
  const code = error instanceof PaymentError ? error.code : 'provider_unavailable';
  return paymentError(c, code);
}

function paymentError(c: Context, code: PaymentErrorCode): Response {
  return c.json({ error: { code, message: paymentMessages[code] } }, paymentStatus[code]);
}

function callbackAck(c: Context, status: 'OK' | 'FAIL', httpStatus: 200 | 400 | 503): Response {
  return c.json({ status }, httpStatus);
}

function bodyFailureCode(error: z.ZodError): PaymentErrorCode {
  const amountIssue = error.issues.some((issue) => issue.path[0] === 'amount');
  if (amountIssue) return 'invalid_amount';
  const methodIssue = error.issues.some((issue) => issue.path[0] === 'methodId');
  if (methodIssue) return 'method_unavailable';
  return 'invalid_amount';
}

function paymentLocale(
  cookieHeader: string | undefined,
  referer: string | undefined,
  webOrigin: string | undefined,
): 'en' | 'ar' {
  const fromCookie = localeCookie(cookieHeader);
  if (fromCookie) return fromCookie;
  if (!referer || !webOrigin) return 'en';
  try {
    const url = new URL(referer);
    if (url.origin !== new URL(webOrigin).origin) return 'en';
    if (url.pathname === '/ar' || url.pathname.startsWith('/ar/')) return 'ar';
  } catch {
    return 'en';
  }
  return 'en';
}

function localeCookie(header: string | undefined): 'en' | 'ar' | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== 'NEXT_LOCALE') continue;
    const value = decodeURIComponent(rest.join('='));
    if (value === 'en' || value === 'ar') return value;
  }
  return null;
}

function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function logCallback(paymentId: string, state: string, outcome: string): void {
  const normalized = state.trim().toUpperCase();
  console.info(
    JSON.stringify({
      event: 'payment_callback',
      paymentId,
      state: knownCallbackStates.has(normalized) ? normalized : 'unknown',
      outcome,
    }),
  );
}
