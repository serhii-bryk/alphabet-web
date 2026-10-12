import { describe, expect, it } from 'vitest';
import {
  acceptSportsbookMessage,
  launchStillValid,
  SPORTSBOOK_MESSAGE_SOURCE,
  sportsLaunchKey,
} from './launch';

const origin = 'https://platform.example';

describe('sports launch lifecycle', () => {
  it('keeps a current launch and changes key when language or player changes', () => {
    const launch = {
      key: sportsLaunchKey({ status: 'guest', playerId: null, locale: 'en' }),
      expiresAt: '2026-10-09T16:00:00.000Z',
    };
    const now = Date.parse('2026-10-09T15:00:00.000Z');
    expect(launchStillValid(launch, launch.key, now)).toBe(true);
    expect(
      launchStillValid(
        launch,
        sportsLaunchKey({ status: 'guest', playerId: null, locale: 'ar' }),
        now,
      ),
    ).toBe(false);
    expect(
      launchStillValid(
        launch,
        sportsLaunchKey({ status: 'authenticated', playerId: '42', locale: 'en' }),
        now,
      ),
    ).toBe(false);
    expect(launchStillValid(launch, launch.key, Date.parse(launch.expiresAt))).toBe(false);
  });

  it('accepts sign-in from the launch origin and ignores other messages', () => {
    expect(
      acceptSportsbookMessage(
        { origin, data: { source: SPORTSBOOK_MESSAGE_SOURCE, action: 'sign_in' } },
        origin,
      ),
    ).toBe('sign_in');
    expect(
      acceptSportsbookMessage(
        { origin, data: { source: SPORTSBOOK_MESSAGE_SOURCE, action: 'page_change', url: '/live' } },
        origin,
      ),
    ).toBeNull();
    expect(
      acceptSportsbookMessage(
        { origin: 'https://other.example', data: { source: SPORTSBOOK_MESSAGE_SOURCE, action: 'sign_up' } },
        origin,
      ),
    ).toBeNull();
  });
});
