import type { SportsLaunchErrorCode, SportsLaunchResponse } from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type { PlatformClient, PlatformSportsLaunch } from '@brand/platform';
import { isPlayerSessionEnded } from './auth.js';

const sportsPathPattern = /^\/[A-Za-z0-9/_\-.~%]+$/;

export class SportsLaunchError extends Error {
  readonly code: SportsLaunchErrorCode;
  readonly sessionEnded: boolean;

  constructor(code: SportsLaunchErrorCode, options: { sessionEnded?: boolean } = {}) {
    super('Sports launch failed');
    this.name = 'SportsLaunchError';
    this.code = code;
    this.sessionEnded = options.sessionEnded ?? false;
  }
}

export interface SportsLaunchInput {
  lang?: 'en' | 'ar';
  path?: string;
}

export interface SportsLaunchUseCases {
  launchGuest(input: SportsLaunchInput): Promise<SportsLaunchResponse>;
  launchAuthenticated(input: SportsLaunchInput, accessToken: string): Promise<SportsLaunchResponse>;
}

/** Accepts a sportsbook deep link and rejects anything that could change the iframe origin. */
export function normalizeSportsPath(path: string): string {
  if (
    path.length === 0 ||
    path.length > 255 ||
    path.startsWith('//') ||
    path.includes('..') ||
    !sportsPathPattern.test(path)
  ) {
    throw new SportsLaunchError('invalid_sports_path');
  }
  const stripped = path.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  if (stripped === '' || stripped === '/') throw new SportsLaunchError('invalid_sports_path');
  return stripped;
}

function requestInput(input: SportsLaunchInput): { lang?: 'en' | 'ar'; path?: string } {
  return {
    ...(input.lang === undefined ? {} : { lang: input.lang }),
    ...(input.path === undefined ? {} : { path: normalizeSportsPath(input.path) }),
  };
}

function toResponse(ticket: PlatformSportsLaunch, mode: SportsLaunchResponse['mode']): SportsLaunchResponse {
  return {
    launchUrl: ticket.url,
    expiresAt: new Date(ticket.expires_at).toISOString(),
    mode,
  };
}

export function createSportsLaunchUseCases(platform: PlatformClient): SportsLaunchUseCases {
  return {
    async launchGuest(input) {
      try {
        const ticket = await platform.requestSportsLaunchTicket(requestInput(input));
        if (ticket.play_mode !== 'DEMO') throw new PlatformClientError('invalid_response');
        return toResponse(ticket, 'demo');
      } catch (error) {
        if (error instanceof SportsLaunchError) throw error;
        throw new SportsLaunchError('sports_unavailable');
      }
    },
    async launchAuthenticated(input, accessToken) {
      try {
        const ticket = await platform.requestSportsLaunchTicket({
          ...requestInput(input),
          accessToken,
        });
        if (ticket.play_mode !== 'REAL') throw new SportsLaunchError('sports_unavailable');
        return toResponse(ticket, 'real');
      } catch (error) {
        if (error instanceof SportsLaunchError) throw error;
        if (
          isPlayerSessionEnded(error) ||
          (error instanceof PlatformClientError && error.status === 401)
        ) {
          throw new SportsLaunchError('auth_required', { sessionEnded: true });
        }
        throw new SportsLaunchError('sports_unavailable');
      }
    },
  };
}
