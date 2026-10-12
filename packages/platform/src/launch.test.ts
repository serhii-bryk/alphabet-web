import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, PlatformClientError } from './index.js';

const launch = {
  id: 406,
  name: 'Demo Game',
  slug: 'demo-game',
  provider: 'Studio',
  provider_code: 'studio',
  launch_url: 'https://platform.example/game/play/ticket-123',
  session_id: null,
};

function makeLaunchClient(fetcher: typeof globalThis.fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1/',
    apiKey: 'key',
    apiSecret: 'secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

describe('launchDemoGame', () => {
  it('signs a POST with the exact JSON body and no player authorization', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(launch);
    });

    const result = await makeLaunchClient(fetcher).launchDemoGame('406');

    expect(result).toEqual(launch);
    expect(fetcher).toHaveBeenCalledOnce();
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/game/launch');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    expect(body).toBe('{"game_id":"406","play_mode":"demo"}');
    expect(JSON.parse(String(body))).toEqual({ game_id: '406', play_mode: 'demo' });
    const bodyHash = createHash('sha256').update(String(body)).digest('hex');
    const expected = createHmac('sha256', 'secret')
      .update(`POST\n/api/v1/player/game/launch\n1700000000\n${bodyHash}`)
      .digest('base64');
    expect(init?.headers).toEqual({
      'X-API-KEY': 'key',
      'X-TIMESTAMP': '1700000000',
      'X-SIGNATURE': expected,
      'Content-Type': 'application/json',
    });
    expect(Object.keys(init?.headers ?? {}).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('signs a real launch with the player bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(launch));
    const result = await makeLaunchClient(fetcher).launchRealGame('406', 'player-token');

    expect(result.launch_url).toBe(launch.launch_url);
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/game/launch');
    const body = '{"game_id":"406","play_mode":"real"}';
    expect(init?.body).toBe(body);
    const bodyHash = createHash('sha256').update(body).digest('hex');
    expect(init?.headers).toEqual({
      'X-API-KEY': 'key',
      'X-TIMESTAMP': '1700000000',
      'X-SIGNATURE': createHmac('sha256', 'secret')
        .update(`POST\n/api/v1/player/game/launch\n1700000000\n${bodyHash}`)
        .digest('base64'),
      'Content-Type': 'application/json',
      Authorization: 'Bearer player-token',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts a string session id', async () => {
    const client = makeLaunchClient(async () => Response.json({ ...launch, session_id: 'sess' }));
    await expect(client.launchDemoGame('406')).resolves.toMatchObject({ session_id: 'sess' });
  });

  it.each([
    ['non-https', 'http://platform.example/game/play/ticket'],
    ['foreign origin', 'https://evil.example/game/play/ticket'],
    ['lookalike host', 'https://platform.example.evil.example/game/play/ticket'],
    ['other port', 'https://platform.example:8443/game/play/ticket'],
    ['javascript', 'javascript:alert(1)'],
    ['not a url', 'not a url'],
  ])('rejects a %s launch url', async (_case, launchUrl) => {
    const client = makeLaunchClient(async () =>
      Response.json({ ...launch, launch_url: launchUrl }),
    );
    await expect(client.launchDemoGame('406')).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Platform response was invalid',
    });
  });

  it('rejects a response missing documented fields', async () => {
    const { launch_url: _omitted, ...rest } = launch;
    void _omitted;
    const client = makeLaunchClient(async () => Response.json(rest));
    await expect(client.launchDemoGame('406')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([401, 403, 404, 405, 422, 503])(
    'propagates HTTP status %i without the upstream body',
    async (status) => {
      const client = makeLaunchClient(
        async () =>
          new Response('{"message":"demo_game_launch_not_supported secret-detail"}', { status }),
      );
      const error: unknown = await client.launchDemoGame('406').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PlatformClientError);
      expect(error).toMatchObject({
        code: 'request_failed',
        status,
        message: 'Platform request failed',
      });
      expect(JSON.stringify(error)).not.toContain('secret-detail');
      expect(String((error as Error).message)).not.toContain('demo_game_launch_not_supported');
    },
  );

  it('leaves status undefined for network failures', async () => {
    const client = makeLaunchClient(async () => {
      throw new Error('socket details');
    });
    await expect(client.launchDemoGame('406')).rejects.toMatchObject({
      code: 'request_failed',
      status: undefined,
    });
  });
});
