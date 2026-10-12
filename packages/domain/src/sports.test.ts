import type { PlatformClient, PlatformSportsLaunch } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createSportsLaunchUseCases, normalizeSportsPath, SportsLaunchError } from './sports.js';

const ticket = 'a'.repeat(64);
const guest: PlatformSportsLaunch = {
  url: `https://platform.example/sports/play/${ticket}`,
  ticket,
  expires_at: '2026-10-09T16:00:00.000Z',
  play_mode: 'DEMO',
  provider_code: 'hidden-provider',
};

function platform(requestSportsLaunchTicket: PlatformClient['requestSportsLaunchTicket']): PlatformClient {
  return { requestSportsLaunchTicket } as PlatformClient;
}

describe('normalizeSportsPath', () => {
  it('keeps a sportsbook deep link and strips a language prefix', () => {
    expect(normalizeSportsPath('/live')).toBe('/live');
    expect(normalizeSportsPath('/bet-history')).toBe('/bet-history');
    expect(normalizeSportsPath('/en/live/tennis')).toBe('/live/tennis');
  });

  it.each([
    'https://evil.example/live',
    '//evil.example/live',
    '/live?x=1',
    '/live#top',
    'live',
    '/../secret',
    '/en',
    '/live page',
  ])('rejects %s', (path) => {
    expect(() => normalizeSportsPath(path)).toThrow(SportsLaunchError);
  });
});

describe('createSportsLaunchUseCases', () => {
  it('launches a guest session without a player token', async () => {
    const requestSportsLaunchTicket = vi.fn(async () => guest);
    const result = await createSportsLaunchUseCases(platform(requestSportsLaunchTicket)).launchGuest({
      lang: 'ar',
      path: '/live',
    });

    expect(requestSportsLaunchTicket).toHaveBeenCalledWith({ lang: 'ar', path: '/live' });
    expect(result).toEqual({
      launchUrl: guest.url,
      expiresAt: '2026-10-09T16:00:00.000Z',
      mode: 'demo',
    });
    expect(result).not.toHaveProperty('ticket');
  });

  it('launches an authenticated session with the player token', async () => {
    const requestSportsLaunchTicket = vi.fn(async () => ({ ...guest, play_mode: 'REAL' as const }));
    const result = await createSportsLaunchUseCases(platform(requestSportsLaunchTicket)).launchAuthenticated(
      { lang: 'en' },
      'player-token',
    );

    expect(requestSportsLaunchTicket).toHaveBeenCalledWith({ lang: 'en', accessToken: 'player-token' });
    expect(result.mode).toBe('real');
  });

  it('does not turn an expired player session into a guest launch', async () => {
    const requestSportsLaunchTicket = vi.fn(async () => {
      throw new PlatformClientError('request_failed', 401, 'token_invalid');
    });
    const cases = createSportsLaunchUseCases(platform(requestSportsLaunchTicket));

    await expect(cases.launchAuthenticated({ lang: 'en' }, 'expired-token')).rejects.toMatchObject({
      code: 'auth_required',
      sessionEnded: true,
    });
    expect(requestSportsLaunchTicket).toHaveBeenCalledOnce();
    expect(requestSportsLaunchTicket).toHaveBeenCalledWith({ lang: 'en', accessToken: 'expired-token' });
  });

  it('passes the active language through', async () => {
    const requestSportsLaunchTicket = vi.fn(async () => guest);
    await createSportsLaunchUseCases(platform(requestSportsLaunchTicket)).launchGuest({ lang: 'ar' });
    expect(requestSportsLaunchTicket).toHaveBeenCalledWith({ lang: 'ar' });
  });
});
