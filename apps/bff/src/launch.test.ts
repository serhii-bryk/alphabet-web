import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const launch = {
  id: 406,
  name: 'Demo Game',
  slug: 'demo-game',
  provider: 'Studio',
  provider_code: 'studio',
  launch_url: 'https://platform.example/game/play/ticket-123',
  session_id: null,
};

const env = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'private-key',
  FINAL_PLATFORM_API_SECRET: 'private-secret',
};

function makeApp(
  respond: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = async () =>
    Response.json(launch),
) {
  const fetcher = vi.fn(respond);
  const app = createApp({ env, fetch: fetcher, now: () => 1_700_000_000_000 });
  return { app, fetcher };
}

describe('demo game launch route', () => {
  it.each(['/games/406/launch/demo', '/api/games/406/launch/demo'])(
    'returns only the browser launch contract at %s',
    async (path) => {
      const { app, fetcher } = makeApp();
      const response = await app.request(path, { method: 'POST' });
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(JSON.parse(text)).toEqual({
        launchUrl: 'https://platform.example/game/play/ticket-123',
        mode: 'demo',
      });
      expect(text).not.toMatch(/session_id|provider_code|launch_url|private/);
      expect(fetcher).toHaveBeenCalledOnce();
      const [input, init] = fetcher.mock.calls[0]!;
      expect(String(input)).toBe('https://platform.example/api/v1/player/game/launch');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('{"game_id":"406","play_mode":"demo"}');
    },
  );

  it('does not expose a string session id', async () => {
    const { app } = makeApp(async () => Response.json({ ...launch, session_id: 'session-secret' }));
    const response = await app.request('/api/games/406/launch/demo', { method: 'POST' });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain('session');
  });

  it.each(['abc', '0', '01', '-1', '1.5', '1234567890123', '%20', '1e3'])(
    'rejects invalid game id %s without calling Platform',
    async (gameId) => {
      const { app, fetcher } = makeApp();
      const response = await app.request(`/api/games/${gameId}/launch/demo`, { method: 'POST' });

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        error: { code: 'invalid_game_id', message: 'Invalid game id' },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('accepts the maximum 12-digit id', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/games/999999999999/launch/demo', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe('{"game_id":"999999999999","play_mode":"demo"}');
  });

  it.each([
    [403, 422, 'demo_unavailable', 'Demo play is not available for this game'],
    [404, 404, 'game_not_found', 'Game not found'],
    [405, 404, 'game_not_found', 'Game not found'],
    [401, 502, 'launch_unavailable', 'Game launch is unavailable'],
    [422, 502, 'launch_unavailable', 'Game launch is unavailable'],
    [500, 502, 'launch_unavailable', 'Game launch is unavailable'],
    [503, 502, 'launch_unavailable', 'Game launch is unavailable'],
  ])('maps Platform %i to %i %s', async (upstreamStatus, status, code, message) => {
    const { app } = makeApp(
      async () =>
        new Response('{"message":"demo_game_launch_not_supported upstream-detail"}', {
          status: upstreamStatus,
        }),
    );
    const response = await app.request('/api/games/406/launch/demo', { method: 'POST' });
    const text = await response.text();

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ error: { code, message } });
    expect(text).not.toMatch(/private|upstream-detail|demo_game_launch_not_supported|Platform/);
  });

  it.each([
    ['network', async () => Promise.reject(new Error('private network details'))],
    [
      'timeout',
      async () => Promise.reject(new DOMException('private timeout details', 'TimeoutError')),
    ],
    ['invalid JSON', async () => new Response('not-json')],
    ['invalid response', async () => Response.json({ launch_url: 'https://platform.example/x' })],
    [
      'foreign-origin URL',
      async () => Response.json({ ...launch, launch_url: 'https://evil.example/game/play/t' }),
    ],
    [
      'non-https URL',
      async () => Response.json({ ...launch, launch_url: 'http://platform.example/game/play/t' }),
    ],
  ])('returns 502 launch_unavailable for %s failure', async (_failure, respond) => {
    const { app } = makeApp(respond);
    const response = await app.request('/games/406/launch/demo', { method: 'POST' });
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({
      error: { code: 'launch_unavailable', message: 'Game launch is unavailable' },
    });
    expect(text).not.toMatch(/private|not-json|evil|Platform|TimeoutError|catalog/);
  });

  it('does not treat GET as a launch', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/api/games/406/launch/demo');

    expect([404, 405]).toContain(response.status);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('answers the CORS preflight for POST from the web origin', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/api/games/406/launch/demo', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(fetcher).not.toHaveBeenCalled();
  });

  function makeInjectedApp(launchDemo: () => Promise<unknown>) {
    return createApp({
      env,
      catalog: {
        listGames: vi.fn(),
        listProviders: vi.fn(),
        listCategories: vi.fn(),
        getLobby: vi.fn(),
      },
      gameLaunch: { launchDemo: launchDemo as never, launchReal: vi.fn() },
    });
  }

  it('strips unexpected fields from a use-case result', async () => {
    const app = makeInjectedApp(async () => ({
      launchUrl: 'https://platform.example/game/play/t',
      mode: 'demo',
      launch_url: 'https://platform.example/raw',
      session_id: 'session-secret',
      provider_code: 'studio',
    }));
    const response = await app.request('/api/games/7/launch/demo', { method: 'POST' });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      launchUrl: 'https://platform.example/game/play/t',
      mode: 'demo',
    });
    expect(text).not.toMatch(/session|provider_code|launch_url|raw/);
  });

  it.each(['javascript:alert(1)', 'http://platform.example/game', 'not a url'])(
    'returns 502 launch_unavailable when the use case yields unsafe url %s',
    async (launchUrl) => {
      const app = makeInjectedApp(async () => ({ launchUrl, mode: 'demo' }));
      const response = await app.request('/api/games/7/launch/demo', { method: 'POST' });
      const text = await response.text();

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(JSON.parse(text)).toEqual({
        error: { code: 'launch_unavailable', message: 'Game launch is unavailable' },
      });
      expect(text).not.toContain(launchUrl);
    },
  );

  it('uses injected launch use cases', async () => {
    const launchDemo = vi.fn(async () => ({
      launchUrl: 'https://platform.example/game/play/t',
      mode: 'demo' as const,
    }));
    const app = createApp({
      env,
      catalog: {
        listGames: vi.fn(),
        listProviders: vi.fn(),
        listCategories: vi.fn(),
        getLobby: vi.fn(),
      },
      gameLaunch: { launchDemo, launchReal: vi.fn() },
    });
    const response = await app.request('/games/7/launch/demo', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(launchDemo).toHaveBeenCalledWith('7');
  });
});
