import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient } from './index.js';

function client(fetcher: typeof fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1',
    apiKey: 'private-key',
    apiSecret: 'private-secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

function signature(method: string, pathname: string, body = '') {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', 'private-secret')
    .update(`${method}\n${pathname}\n1700000000\n${bodyHash}`)
    .digest('base64');
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return init?.headers as Record<string, string>;
}

describe('responsible gaming client', () => {
  it('reads the three settings endpoints with HMAC and no player bearer', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/realityCheckSettings')) return Response.json({ values: [0, 30, 60] });
      if (path.endsWith('/coolOffSettings')) {
        return Response.json({
          periods: [{ id: 1, text: '24 hours', date_selector: false }],
          reasons: [{ id: 10, text: 'Need a break' }],
        });
      }
      return Response.json({
        periods: [{ id: 2, text: '6 months', date_selector: true }],
      });
    });
    const api = client(fetcher);

    await expect(api.getRealityCheckSettings()).resolves.toEqual({ values: [0, 30, 60] });
    await expect(api.getCoolOffSettings()).resolves.toEqual({
      periods: [{ id: 1, text: '24 hours', date_selector: false }],
      reasons: [{ id: 10, text: 'Need a break' }],
    });
    await expect(api.getSelfExclusionSettings()).resolves.toEqual({
      periods: [{ id: 2, text: '6 months', date_selector: true }],
    });

    const paths = ['/casino/realityCheckSettings', '/casino/coolOffSettings', '/casino/selfexclusionSettings'];
    paths.forEach((path, index) => {
      const [input, init] = fetcher.mock.calls[index]!;
      expect(String(input)).toBe(`https://platform.example/api/v1${path}`);
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(headersOf(init).Authorization).toBeUndefined();
      expect(headersOf(init)['X-API-KEY']).toBe('private-key');
      expect(headersOf(init)['X-SIGNATURE']).toBe(signature('GET', `/api/v1${path}`));
    });
  });

  it('reads and writes a player reality check with the player bearer', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ value: 0 });
      return Response.json({ value: 30 });
    });
    const api = client(fetcher);

    await expect(api.getPlayerRealityCheck(42, 'player-token')).resolves.toEqual({ value: 30 });
    await expect(api.setPlayerRealityCheck(42, 'player-token', 0)).resolves.toEqual({ value: 0 });

    const [readUrl, readInit] = fetcher.mock.calls[0]!;
    expect(String(readUrl)).toBe('https://platform.example/api/v1/player/42/reality-check');
    expect(readInit?.method).toBe('GET');
    expect(readInit?.body).toBeUndefined();
    expect(headersOf(readInit)).toMatchObject({
      Authorization: 'Bearer player-token',
      'X-SIGNATURE': signature('GET', '/api/v1/player/42/reality-check'),
    });

    const body = '{"value":0}';
    const [writeUrl, writeInit] = fetcher.mock.calls[1]!;
    expect(String(writeUrl)).toBe('https://platform.example/api/v1/player/42/reality-check');
    expect(writeInit?.method).toBe('POST');
    expect(writeInit?.body).toBe(body);
    expect(headersOf(writeInit)).toMatchObject({
      Authorization: 'Bearer player-token',
      'Content-Type': 'application/json',
      'X-SIGNATURE': signature('POST', '/api/v1/player/42/reality-check', body),
    });
  });

  it('posts exclusion with reason_id only when it was provided', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        type: 'cooloff',
        period: '24 hours',
        reason: null,
        status: 'CoolOff',
        expires_at: null,
        created_at: '2026-10-15T12:00:00.000Z',
      }),
    );
    const api = client(fetcher);

    await api.excludePlayer(42, 'player-token', { period_id: 1 });
    await api.excludePlayer(42, 'player-token', { period_id: 1, reason_id: 10 });

    const withoutReason = '{"period_id":1}';
    const withReason = '{"period_id":1,"reason_id":10}';
    const [firstUrl, firstInit] = fetcher.mock.calls[0]!;
    const [secondUrl, secondInit] = fetcher.mock.calls[1]!;
    expect(String(firstUrl)).toBe('https://platform.example/api/v1/player/42/exclusion');
    expect(String(secondUrl)).toBe('https://platform.example/api/v1/player/42/exclusion');
    expect(firstInit?.method).toBe('POST');
    expect(secondInit?.method).toBe('POST');
    expect(firstInit?.body).toBe(withoutReason);
    expect(secondInit?.body).toBe(withReason);
    expect(String(firstInit?.body)).not.toContain('reason_id');
    expect(headersOf(firstInit)).toMatchObject({
      Authorization: 'Bearer player-token',
      'Content-Type': 'application/json',
      'X-SIGNATURE': signature('POST', '/api/v1/player/42/exclusion', withoutReason),
    });
    expect(headersOf(secondInit)['X-SIGNATURE']).toBe(
      signature('POST', '/api/v1/player/42/exclusion', withReason),
    );
  });

  it('reads the latest login with HMAC only and drops ip and browser', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        logins: [
          {
            login_at: '2026-10-15T10:00:00.000Z',
            ip_address: '203.0.113.8',
            browser: 'SecretBrowser',
          },
        ],
      }),
    );
    const result = await client(fetcher).getPlayerLogins(42, 1);

    expect(result).toEqual({ logins: [{ login_at: '2026-10-15T10:00:00.000Z' }] });
    expect(JSON.stringify(result)).not.toContain('ip_address');
    expect(JSON.stringify(result)).not.toContain('203.0.113.8');
    expect(JSON.stringify(result)).not.toContain('browser');
    expect(JSON.stringify(result)).not.toContain('SecretBrowser');

    const [input, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.pathname).toBe('/api/v1/player/42/logins');
    expect(url.search).toBe('?limit=1');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(headersOf(init).Authorization).toBeUndefined();
    expect(headersOf(init)['X-API-KEY']).toBe('private-key');
    expect(headersOf(init)['X-SIGNATURE']).toBe(signature('GET', '/api/v1/player/42/logins'));
  });
});
