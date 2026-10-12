import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, PlatformClientError } from './index.js';

const ticket = 'a'.repeat(64);
const sports = {
  url: `https://platform.example/sports/play/${ticket}`,
  ticket,
  expires_at: '2026-10-09T16:00:00.000Z',
  play_mode: 'DEMO',
  provider_code: 'hidden-provider',
};

function client(fetcher: typeof globalThis.fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1/',
    apiKey: 'key',
    apiSecret: 'secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

describe('requestSportsLaunchTicket', () => {
  it('requests a guest ticket without a player bearer', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(sports));
    const result = await client(fetcher).requestSportsLaunchTicket({ lang: 'en', path: '/live' });

    expect(result.play_mode).toBe('DEMO');
    expect(result.url).toBe(sports.url);
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/sports/request-launch-ticket');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"lang":"en","path":"/live"}');
    expect(Object.keys(init?.headers ?? {}).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('sends the player bearer for an authenticated ticket', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ...sports, play_mode: 'REAL' }),
    );
    await client(fetcher).requestSportsLaunchTicket({ lang: 'ar', accessToken: 'player-token' });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"lang":"ar"}');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer player-token' });
  });

  it('rejects a launch URL that is not the platform sports play path', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ...sports, url: 'https://evil.example/sports/play/' + ticket }),
    );
    await expect(client(fetcher).requestSportsLaunchTicket({ lang: 'en' })).rejects.toBeInstanceOf(
      PlatformClientError,
    );
  });

  it('rejects a real ticket when no player token was sent', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ ...sports, play_mode: 'REAL' }),
    );
    await expect(client(fetcher).requestSportsLaunchTicket({ lang: 'en' })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
