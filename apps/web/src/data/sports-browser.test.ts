import { describe, expect, it, vi } from 'vitest';
import { parseSportsLaunchResponse, requestSportsLaunch, SportsRequestError } from './sports-browser';

const ticket = 'a'.repeat(64);
const launch = {
  launchUrl: `https://platform.example/sports/play/${ticket}`,
  expiresAt: '2026-10-09T16:00:00.000Z',
  mode: 'demo' as const,
};

describe('requestSportsLaunch', () => {
  it('posts the locale and keeps the browser contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(launch)),
    );
    await expect(requestSportsLaunch({ locale: 'ar', path: '/live' })).resolves.toEqual(launch);
    expect(fetch).toHaveBeenCalledWith(
      '/api/sports/launch',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ locale: 'ar', path: '/live' }),
      }),
    );
  });

  it('maps an ended session without treating it as a guest success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'auth_required', message: 'Sign in again to open the sportsbook' } },
          { status: 401 },
        ),
      ),
    );
    await expect(requestSportsLaunch({ locale: 'en' })).rejects.toMatchObject({ code: 'auth_required' });
    await expect(requestSportsLaunch({ locale: 'en' })).rejects.toBeInstanceOf(SportsRequestError);
  });

  it('rejects a non-https launch URL', () => {
    expect(parseSportsLaunchResponse({ ...launch, launchUrl: 'http://platform.example/sports/play/x' })).toBeNull();
  });
});
