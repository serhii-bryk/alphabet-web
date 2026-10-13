import { createHash } from 'node:crypto';
import { createMemoryPaymentIntentStore } from '@brand/domain';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const start = 1_700_000_000_000;
const password = 'correct-horse-battery';
const accessToken = 'login-access-token';
const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };
const withdrawalHash = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = 'pay-secret';

const baseEnv = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'private-key',
  FINAL_PLATFORM_API_SECRET: 'private-secret',
  SESSION_SECRET: 's'.repeat(32),
  FINALPAY_URL: 'https://pay.example/api',
  FINALPAY_SECRET: secret,
  FINALPAY_TRANSACTION_PREFIX: 'ab',
  PAYMENTS_BRAND_NAME: 'alphabet',
  PAYMENTS_CALLBACK_BASE_URL: 'http://localhost:4000',
};

const loginResponse = {
  profile: { id: 42, email: 'player@example.com', currency },
  partner_id: 7,
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
};

const profileResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    first_name: 'Test',
    last_name: 'Player',
    currency,
    country: { alpha2: 'MT' },
    email_verified: true,
    phone: '790000000',
    phone_prefix: '356',
    date_of_birth: '1990-01-02',
    address: '1 Main',
    city: 'Valletta',
    postal_code: 'VLT1000',
  },
};

function cookiePair(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('missing set-cookie');
  return header.split(';', 1)[0] ?? '';
}

function calls(fetcher: ReturnType<typeof vi.fn>, part: string) {
  return fetcher.mock.calls.filter((call) => String(call[0]).includes(part));
}

function jsonBody(call: unknown[] | undefined): Record<string, unknown> {
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

function checksum(id: number | string, state: string) {
  return createHash('sha256').update(`${id}${state}${secret}`).digest('hex');
}

function makeApp(
  respond: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  env: Record<string, string | undefined> = baseEnv,
) {
  const fetcher = vi.fn(respond);
  const app = createApp({
    env,
    fetch: fetcher,
    now: () => start,
    intentStore: createMemoryPaymentIntentStore(),
  });
  return { app, fetcher };
}

function providerResponse(input: RequestInfo | URL, init?: RequestInit): Response | undefined {
  const url = String(input);
  const path = new URL(url).pathname;
  if (path.endsWith('/login')) return Response.json(loginResponse);
  if (path.endsWith('/profile')) return Response.json(profileResponse);
  if (path.endsWith('/balance')) return Response.json({ balance: 100, currency: 'EUR', address: 'hidden-address' });
  if (path.endsWith('/init')) {
    const body = jsonBody([input, init]);
    const data = body.data as { pay?: { request_type?: string } };
    const payout = data.pay?.request_type === 'pay-out';
    return Response.json({
      id: payout ? 9002 : 9001,
      status: 'OK',
      code: 0,
      state: 'INITIATED',
      options: [
        payout
          ? {
              id: 8,
              name: 'Bank',
              url: 'https://pay.example/payout?hash=payout-hash',
              newfields: [
                { name: 'iban', type: 'text', text: 'IBAN' },
                { name: 'cc', type: 'text', text: 'Card' },
                { name: 'ccv', type: 'text', text: 'Code' },
              ],
              details: { EUR: { amount_min: '10', amount_max: '80' } },
            }
          : {
              id: 7,
              name: 'Card',
              url: 'https://pay.example/submit?hash=submit-hash',
              newfields: [{ name: 'cc', type: 'text', text: 'Card number' }],
              details: { EUR: { amount_min: '10', amount_max: '500' } },
            },
      ],
    });
  }
  if (url.startsWith('https://pay.example/submit') || url.startsWith('https://pay.example/payout')) {
    return Response.json({ status: 'OK', url: 'https://pay.example/cashier/redirect', state: 'REDIRECT' });
  }
  if (path.endsWith('/transactions/deposit')) {
    return Response.json({
      type: 'deposit',
      balance: 120,
      amount: 20,
      currency: 'EUR',
      address: 'hidden-address',
      transaction_id: 'hidden-transaction',
    });
  }
  if (path.endsWith('/transactions/withdraw/request')) {
    return Response.json({ hash: withdrawalHash, status: 'REQUESTED', amount: 20, currency: 'EUR' });
  }
  if (path.endsWith('/transactions/withdraw/approve')) {
    return Response.json({ hash: withdrawalHash, status: 'APPROVED' });
  }
  if (path.endsWith('/transactions/withdraw/confirm')) {
    return Response.json({ hash: withdrawalHash, status: 'CONFIRMED' });
  }
  if (path.endsWith('/transactions/withdraw/rollback')) {
    return Response.json({ hash: withdrawalHash, status: 'ROLLEDBACK' });
  }
  return undefined;
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'player@example.com', password }),
  });
  return cookiePair(response);
}

function authed(cookie: string, body?: unknown, extra: Record<string, string> = {}) {
  return {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

describe('deposit payments', () => {
  it('loads methods without provider urls and returns a redirect', async () => {
    const { app, fetcher } = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const cookie = await login(app);
    const methods = await app.request('/api/payments/methods', authed(cookie));
    const methodsBody = await methods.json();
    expect(methods.status).toBe(200);
    expect(methodsBody.depositMethods).toEqual([
      {
        id: '7',
        label: 'Card',
        minAmount: 10,
        maxAmount: 500,
        fields: [{ name: 'cc', label: 'Card number', required: true }],
        test: false,
      },
    ]);
    expect(JSON.stringify(methodsBody)).not.toMatch(/https:|hash|checksum|submit/);
    const initCall = calls(fetcher, '/init').find((call) => jsonBody(call).data && (jsonBody(call).data as { pay: { request_type: string } }).pay.request_type === 'pay-in');
    const initBody = jsonBody(initCall);
    const data = initBody.data as {
      callback_url: string;
      success_url: string;
      error_url: string;
      cancelled_url: string;
      pay: { request_type: string; trans_ref: string; amount?: number; currency: string };
      customer: Record<string, string>;
    };
    const paymentId = data.callback_url.split('/').pop();
    const success = `http://localhost:3000/casino?cashier=deposit&result=success&paymentId=${paymentId}`;
    const cancel = `http://localhost:3000/casino?cashier=deposit&result=cancelled&paymentId=${paymentId}`;
    expect(data.error_url).toBe(data.success_url);
    expect(data.pay.amount).toBeUndefined();
    expect(initBody.checksum).toBe(
      createHash('sha256')
        .update(
          [
            `http://localhost:4000/payments/callback/${paymentId}`,
            success,
            success,
            cancel,
            'pay-in',
            `ab${paymentId}`,
            '',
            'EUR',
            '',
            '42',
            'Test',
            'Player',
            'player@example.com',
            'MT',
            'Valletta',
            '1 Main',
            'VLT1000',
            '356790000000',
            '1990-01-02',
            '',
            secret,
          ].join(''),
        )
        .digest('hex'),
    );

    const key = '33333333-3333-4333-8333-333333333333';
    const deposit = await app.request(
      '/payments/deposit',
      authed(cookie, { methodId: '7', amount: 20, idempotencyKey: key, playerId: 99 }),
    );
    const depositBody = await deposit.json();
    expect(deposit.status).toBe(200);
    expect(depositBody).toEqual({
      status: 'redirect',
      paymentId,
      redirectUrl: 'https://pay.example/cashier/redirect',
    });
    expect(JSON.stringify(depositBody)).not.toMatch(/hidden|hash|9001/);
    expect(calls(fetcher, 'https://pay.example/submit')).toHaveLength(1);

    const repeat = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: '7', amount: 20, idempotencyKey: key }),
    );
    expect(await repeat.json()).toEqual(depositBody);
    expect(calls(fetcher, 'https://pay.example/submit')).toHaveLength(1);
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(0);
  });

  it('rejects an invalid amount before calling the provider submit', async () => {
    const { app, fetcher } = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const cookie = await login(app);
    await app.request('/api/payments/methods', authed(cookie));
    const response = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: '7', amount: 5, idempotencyKey: crypto.randomUUID() }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid_amount', message: 'Enter a valid amount' } });
    expect(calls(fetcher, 'https://pay.example/submit')).toHaveLength(0);
  });

  it('credits a captured callback once and ignores declined or cancelled callbacks', async () => {
    const { app, fetcher } = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const cookie = await login(app);
    await app.request('/api/payments/methods', authed(cookie));
    const created = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: '7', amount: 20, idempotencyKey: crypto.randomUUID() }),
    );
    const { paymentId } = (await created.json()) as { paymentId: string };
    const declined = await app.request(`/api/payments/callback/${paymentId}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ id: 9001, state: 'DECLINED', checksum: checksum(9001, 'DECLINED'), info: { error_message: 'hidden card 4242' } }),
    });
    expect(declined.status).toBe(200);
    expect(await declined.json()).toEqual({ status: 'OK' });
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(0);

    const capturedDeposit = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: '7', amount: 20, idempotencyKey: crypto.randomUUID() }),
    );
    const capturedId = ((await capturedDeposit.json()) as { paymentId: string }).paymentId;
    const captured = await app.request(`/api/payments/callback/${capturedId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 9001,
        state: 'CAPTURED',
        checksum: checksum(9001, 'CAPTURED'),
        info: { amount: 999, currency: 'EUR' },
      }),
    });
    expect(captured.status).toBe(200);
    expect(jsonBody(calls(fetcher, '/transactions/deposit')[0])).toMatchObject({
      player_id: 42,
      amount: 20,
      currency: 'EUR',
      transaction_reference: capturedId,
    });
    const duplicate = await app.request(`/payments/callback/${capturedId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9001, state: 'CAPTURED', checksum: checksum(9001, 'CAPTURED') }),
    });
    expect(await duplicate.json()).toEqual({ status: 'OK' });
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(1);
    const mismatch = await app.request(`/api/payments/callback/${capturedId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9001, state: 'CAPTURED', checksum: '0'.repeat(64) }),
    });
    expect(mismatch.status).toBe(400);
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(1);

    const cancelledApp = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const cancelledCookie = await login(cancelledApp.app);
    await cancelledApp.app.request('/api/payments/methods', authed(cancelledCookie));
    const cancelledDeposit = await cancelledApp.app.request(
      '/api/payments/deposit',
      authed(cancelledCookie, { methodId: '7', amount: 20, idempotencyKey: crypto.randomUUID() }),
    );
    const cancelledId = ((await cancelledDeposit.json()) as { paymentId: string }).paymentId;
    await cancelledApp.app.request(`/payments/callback/${cancelledId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9001, state: 'CANCELLED', checksum: checksum(9001, 'CANCELLED') }),
    });
    expect(calls(cancelledApp.fetcher, '/transactions/deposit')).toHaveLength(0);
  });
});

describe('withdraw payments', () => {
  it('reserves with the session player, then submits, and confirms only on capture', async () => {
    const { app, fetcher } = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const cookie = await login(app);
    await app.request('/payments/methods', authed(cookie));
    const key = crypto.randomUUID();
    const response = await app.request(
      '/api/payments/withdraw',
      authed(cookie, {
        methodId: '8',
        amount: 20,
        idempotencyKey: key,
        playerId: 99,
        details: { iban: 'DE89 3704 0044', cc: '4242 4242', ccv: '12 3' },
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('processing');
    expect(JSON.stringify(body)).not.toContain(withdrawalHash);
    const request = jsonBody(calls(fetcher, '/transactions/withdraw/request')[0]);
    expect(request.player_id).toBe(42);
    expect(request).not.toHaveProperty('hash');
    const submit = jsonBody(calls(fetcher, 'https://pay.example/payout')[0]);
    expect(submit).toMatchObject({ amount: '20', checksum: 'payout-hash', iban: 'DE8937040044', cc: '42424242', ccv: '123' });
    const repeat = await app.request(
      '/payments/withdraw',
      authed(cookie, { methodId: '8', amount: 20, idempotencyKey: key, details: { iban: 'DE8937040044' } }),
    );
    expect(await repeat.json()).toEqual(body);
    expect(calls(fetcher, '/transactions/withdraw/request')).toHaveLength(1);

    const paymentId = body.paymentId as string;
    const captured = await app.request(`/api/payments/callback/${paymentId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9002, state: 'CAPTURED', checksum: checksum(9002, 'CAPTURED') }),
    });
    expect(await captured.json()).toEqual({ status: 'OK' });
    expect(calls(fetcher, '/transactions/withdraw/approve')).toHaveLength(1);
    expect(calls(fetcher, '/transactions/withdraw/confirm')).toHaveLength(1);
    await app.request(`/payments/callback/${paymentId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9002, state: 'CAPTURED', checksum: checksum(9002, 'CAPTURED') }),
    });
    expect(calls(fetcher, '/transactions/withdraw/confirm')).toHaveLength(1);
  });

  it('rejects insufficient and invalid amounts and rolls back a declined callback', async () => {
    const { app, fetcher } = makeApp(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/transactions/withdraw/request') && jsonBody([input, init]).amount === 20) {
        return Response.json(
          { error: { code: 'insufficient_wallet_balance', message: 'hidden upstream', context: { hash: withdrawalHash } } },
          { status: 422 },
        );
      }
      return providerResponse(input, init) ?? new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    await app.request('/api/payments/methods', authed(cookie));
    const tooHigh = await app.request(
      '/api/payments/withdraw',
      authed(cookie, { methodId: '8', amount: 150, idempotencyKey: crypto.randomUUID(), details: { iban: 'DE89' } }),
    );
    expect(await tooHigh.json()).toEqual({ error: { code: 'insufficient_balance', message: 'Not enough balance' } });
    const invalid = await app.request(
      '/api/payments/withdraw',
      authed(cookie, { methodId: '8', amount: 5, idempotencyKey: crypto.randomUUID(), details: { iban: 'DE89' } }),
    );
    expect(invalid.status).toBe(400);
    expect(calls(fetcher, '/transactions/withdraw/request')).toHaveLength(0);

    const platformInsufficient = await app.request(
      '/api/payments/withdraw',
      authed(cookie, {
        methodId: '8',
        amount: 20,
        idempotencyKey: crypto.randomUUID(),
        details: { iban: 'DE89', cc: '4242', ccv: '123' },
      }),
    );
    const text = await platformInsufficient.text();
    expect(platformInsufficient.status).toBe(422);
    expect(text).not.toMatch(/hidden upstream|aaaaaaaa/);
    expect(JSON.parse(text)).toEqual({ error: { code: 'insufficient_balance', message: 'Not enough balance' } });

    const { app: declineApp, fetcher: declineFetch } = makeApp(
      async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }),
    );
    const declineCookie = await login(declineApp);
    await declineApp.request('/api/payments/methods', authed(declineCookie));
    const processing = await declineApp.request(
      '/api/payments/withdraw',
      authed(declineCookie, {
        methodId: '8',
        amount: 20,
        idempotencyKey: crypto.randomUUID(),
        details: { iban: 'DE89', cc: '4242', ccv: '123' },
      }),
    );
    const paymentId = ((await processing.json()) as { paymentId: string }).paymentId;
    const declined = await declineApp.request(`/api/payments/callback/${paymentId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9002, state: 'DECLINED', checksum: checksum(9002, 'DECLINED') }),
    });
    expect(await declined.json()).toEqual({ status: 'OK' });
    expect(calls(declineFetch, '/transactions/withdraw/rollback')).toHaveLength(1);
    expect(calls(declineFetch, '/transactions/withdraw/confirm')).toHaveLength(0);
    await declineApp.request(`/payments/callback/${paymentId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 9002, state: 'DECLINED', checksum: checksum(9002, 'DECLINED') }),
    });
    expect(calls(declineFetch, '/transactions/withdraw/rollback')).toHaveLength(1);
  });
});

describe('test deposit', () => {
  it('hides the test method unless the flag is on outside production', async () => {
    const off = makeApp(async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }));
    const offCookie = await login(off.app);
    const offMethods = await off.app.request('/api/payments/methods', authed(offCookie));
    expect(JSON.stringify(await offMethods.json())).not.toContain('test-deposit');

    const production = makeApp(
      async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }),
      { ...baseEnv, PAYMENTS_TEST_MODE: 'true', NODE_ENV: 'production' },
    );
    const productionCookie = await login(production.app);
    const productionMethods = await production.app.request('/api/payments/methods', authed(productionCookie));
    expect(JSON.stringify(await productionMethods.json())).not.toContain('test-deposit');
    const rejected = await production.app.request(
      '/api/payments/deposit',
      authed(productionCookie, { methodId: 'test-deposit', amount: 10, idempotencyKey: crypto.randomUUID() }),
    );
    expect((await rejected.json()).error.code).toBe('method_unavailable');
    expect(calls(production.fetcher, '/transactions/deposit')).toHaveLength(0);
  });

  it('credits a test deposit when the provider is not configured', async () => {
    const env = {
      ...baseEnv,
      PAYMENTS_TEST_MODE: 'true',
      FINALPAY_URL: undefined,
      FINALPAY_SECRET: undefined,
      PAYMENTS_CALLBACK_BASE_URL: undefined,
    };
    const { app, fetcher } = makeApp(
      async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }),
      env,
    );
    const cookie = await login(app);
    const methods = await app.request('/api/payments/methods', authed(cookie));
    const body = await methods.json();
    expect(body.depositMethods).toEqual([
      expect.objectContaining({ id: 'test-deposit', label: 'Test Deposit', test: true, minAmount: 1, maxAmount: 50 }),
    ]);
    expect(calls(fetcher, '/init')).toHaveLength(0);
    const credited = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 5, idempotencyKey: crypto.randomUUID() }),
    );
    expect(credited.status).toBe(200);
    expect((await credited.json()).status).toBe('completed');
    expect(jsonBody(calls(fetcher, '/transactions/deposit')[0])).toMatchObject({
      player_id: 42,
      amount: 5,
      currency: 'EUR',
    });
    expect(calls(fetcher, '/init')).toHaveLength(0);
  });

  it('credits through the ledger deposit and rejects amounts above the maximum', async () => {
    const env = { ...baseEnv, PAYMENTS_TEST_MODE: 'true', PAYMENTS_TEST_MAX_AMOUNT: '25' };
    const { app, fetcher } = makeApp(
      async (input, init) => providerResponse(input, init) ?? new Response('unexpected', { status: 500 }),
      env,
    );
    const cookie = await login(app);
    const methods = await app.request('/api/payments/methods', authed(cookie));
    const body = await methods.json();
    expect(body.depositMethods[0]).toMatchObject({ id: 'test-deposit', label: 'Test Deposit', test: true, minAmount: 1, maxAmount: 25 });
    const tooHigh = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 26, idempotencyKey: crypto.randomUUID(), playerId: 99 }),
    );
    expect(tooHigh.status).toBe(400);
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(0);

    const key = crypto.randomUUID();
    const credited = await app.request(
      '/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 20, idempotencyKey: key, playerId: 99 }),
    );
    const creditedBody = await credited.json();
    expect(credited.status).toBe(200);
    expect(creditedBody.status).toBe('completed');
    expect(JSON.stringify(creditedBody)).not.toMatch(/hidden|address|transaction_id/);
    expect(jsonBody(calls(fetcher, '/transactions/deposit')[0])).toMatchObject({
      player_id: 42,
      amount: 20,
      currency: 'EUR',
      transaction_reference: creditedBody.paymentId,
    });
    const replay = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 20, idempotencyKey: key }),
    );
    expect(await replay.json()).toEqual(creditedBody);
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(1);
  });

  it('does not call the ledger again after a failed test deposit', async () => {
    const { app, fetcher } = makeApp(
      async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/transactions/deposit')) {
          return Response.json({ error: { code: 'wallet_failed', message: 'do-not-leak-this' } }, { status: 500 });
        }
        return providerResponse(input, init) ?? new Response('unexpected', { status: 500 });
      },
      { ...baseEnv, PAYMENTS_TEST_MODE: 'true' },
    );
    const cookie = await login(app);
    const key = crypto.randomUUID();
    const failed = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 10, idempotencyKey: key }),
    );
    const text = await failed.text();
    expect(failed.status).toBe(422);
    expect(text).not.toContain('do-not-leak-this');
    expect(JSON.parse(text)).toEqual({ error: { code: 'deposit_failed', message: 'The deposit did not complete' } });
    const retry = await app.request(
      '/api/payments/deposit',
      authed(cookie, { methodId: 'test-deposit', amount: 10, idempotencyKey: key }),
    );
    expect(retry.status).toBe(422);
    expect(calls(fetcher, '/transactions/deposit')).toHaveLength(1);
  });
});
