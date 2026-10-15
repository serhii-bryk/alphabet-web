import type { AuthErrorCode, AuthSession } from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type {
  PlatformClient,
  PlatformLoginInput,
  PlatformLoginResponse,
  PlatformProfileResponse,
  PlatformTelegramLoginInput,
} from '@brand/platform';

const refreshWithinMs = 300_000;

const playerSessionEnded = new Set([
  'session_expired',
  'token_invalid',
  'token_missing',
  'token_refresh_failed',
  'player_session_expired',
  'game_launch_authentication_required',
]);

export class AuthError extends Error {
  readonly code: Exclude<AuthErrorCode, 'session_ended'>;

  constructor(code: Exclude<AuthErrorCode, 'session_ended'>) {
    super('Authentication failed');
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface PlayerSession {
  accessToken: string;
  playerId: string;
  email: string | null;
  currency: string | null;
  expiresAt: string;
}

export interface LoginCommand {
  email: string;
  password: string;
  ipNumber?: string;
  browser?: string;
  domain?: string;
}

export interface TelegramLoginCommand {
  payload: PlatformTelegramLoginInput['payload'];
  ipNumber?: string;
  browser?: string;
  domain?: string;
}

export type RefreshIfNeededResult =
  | { action: 'keep'; session: PlayerSession }
  | { action: 'replace'; session: PlayerSession }
  | { action: 'clear' };

export interface AuthUseCases {
  login(command: LoginCommand): Promise<PlayerSession>;
  loginWithTelegram(command: TelegramLoginCommand): Promise<PlayerSession>;
  refreshIfNeeded(session: PlayerSession): Promise<RefreshIfNeededResult>;
  logout(session: PlayerSession): Promise<void>;
}

export function toAuthSession(session: PlayerSession): AuthSession {
  return {
    authenticated: true,
    playerId: session.playerId,
    email: session.email,
    currency: session.currency,
    expiresAt: session.expiresAt,
  };
}

export function createAuthUseCases(
  platform: PlatformClient,
  options: { now?: () => number } = {},
): AuthUseCases {
  const now = options.now ?? Date.now;

  return {
    async login(command) {
      let authenticated: PlatformLoginResponse;
      try {
        authenticated = await platform.login(loginInput(command));
      } catch (error) {
        throw mapLoginFailure(error);
      }
      return establishSession(platform, authenticated, now);
    },

    async loginWithTelegram(command) {
      let authenticated: PlatformLoginResponse;
      try {
        authenticated = await platform.authenticateTelegram(telegramInput(command));
      } catch (error) {
        throw mapTelegramFailure(error);
      }
      try {
        return await establishSession(platform, authenticated, now);
      } catch (error) {
        if (error instanceof AuthError) throw error;
        throw new AuthError('external_auth_unavailable');
      }
    },

    async refreshIfNeeded(session) {
      const expiresAtMs = Date.parse(session.expiresAt);
      const remaining = expiresAtMs - now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        return { action: 'clear' };
      }
      if (remaining >= refreshWithinMs) {
        return { action: 'keep', session };
      }

      const playerId = playerIdNumber(session.playerId);
      if (playerId === undefined) {
        return { action: 'clear' };
      }

      try {
        const refreshed = await platform.refresh(playerId, session.accessToken);
        const nextExpiresAt = new Date(now() + refreshed.expires_in * 1000);
        if (Number.isNaN(nextExpiresAt.getTime())) {
          return { action: 'keep', session };
        }
        return {
          action: 'replace',
          session: {
            accessToken: refreshed.access_token,
            playerId: session.playerId,
            email: session.email,
            currency: session.currency,
            expiresAt: nextExpiresAt.toISOString(),
          },
        };
      } catch (error) {
        // A partner or transport failure leaves a still-valid session in place.
        // Player-session-ended codes are the only refresh failures that clear it.
        if (isPlayerSessionEnded(error)) {
          return { action: 'clear' };
        }
        return { action: 'keep', session };
      }
    },

    async logout(session) {
      const playerId = playerIdNumber(session.playerId);
      if (playerId === undefined) return;
      try {
        await platform.logout(playerId, session.accessToken);
      } catch {
        // Local logout still succeeds. Do not retry.
      }
    },
  };
}

async function establishSession(
  platform: PlatformClient,
  authenticated: PlatformLoginResponse,
  now: () => number,
): Promise<PlayerSession> {
  let profile: PlatformProfileResponse;
  try {
    profile = await platform.getProfile(authenticated.profile.id, authenticated.access_token);
  } catch {
    throw new AuthError('auth_unavailable');
  }

  if (profile.profile.id !== authenticated.profile.id) {
    throw new AuthError('auth_unavailable');
  }

  const expiresAt = new Date(now() + authenticated.expires_in * 1000);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AuthError('auth_unavailable');
  }

  return {
    accessToken: authenticated.access_token,
    playerId: String(profile.profile.id),
    email: profile.profile.email,
    currency: profile.profile.currency?.code ?? null,
    expiresAt: expiresAt.toISOString(),
  };
}

function loginInput(command: LoginCommand): PlatformLoginInput {
  return {
    email: command.email,
    password: command.password,
    ...(command.ipNumber ? { ipNumber: command.ipNumber } : {}),
    ...(command.browser ? { browser: command.browser } : {}),
    ...(command.domain ? { domain: command.domain } : {}),
  };
}

function telegramInput(command: TelegramLoginCommand): PlatformTelegramLoginInput {
  return {
    payload: command.payload,
    ...(command.ipNumber ? { ipNumber: command.ipNumber } : {}),
    ...(command.browser ? { browser: command.browser } : {}),
    ...(command.domain ? { domain: command.domain } : {}),
  };
}

const telegramUnavailable = new Set([
  'login_method_unavailable',
  'login_method_not_found',
  'login_method_driver_not_configured',
  'login_method_credentials_missing',
  'unsupported_login_method_flow',
]);

const accountRestricted = new Set(['player_has_excluded', 'player_login_unavailable']);

function mapTelegramFailure(error: unknown): AuthError {
  if (error instanceof PlatformClientError && error.code === 'request_failed' && error.platformCode) {
    if (error.platformCode === 'invalid_login_method_authentication') {
      return new AuthError('external_auth_rejected');
    }
    if (telegramUnavailable.has(error.platformCode)) return new AuthError('external_auth_unavailable');
    if (accountRestricted.has(error.platformCode)) return new AuthError('account_restricted');
  }
  return new AuthError('external_auth_unavailable');
}

function mapLoginFailure(error: unknown): AuthError {
  if (
    error instanceof PlatformClientError &&
    error.code === 'request_failed' &&
    error.status === 401 &&
    error.platformCode === 'invalid_player_credentials'
  ) {
    return new AuthError('invalid_credentials');
  }
  if (error instanceof PlatformClientError && error.code === 'request_failed' && error.status === 422) {
    return new AuthError('invalid_login');
  }
  if (
    error instanceof PlatformClientError &&
    error.code === 'request_failed' &&
    error.status === 403 &&
    error.platformCode === 'player_has_excluded'
  ) {
    return new AuthError('account_restricted');
  }
  return new AuthError('auth_unavailable');
}

export function isPlayerSessionEnded(error: unknown): boolean {
  return (
    error instanceof PlatformClientError &&
    error.code === 'request_failed' &&
    typeof error.platformCode === 'string' &&
    playerSessionEnded.has(error.platformCode)
  );
}

export function playerIdNumber(playerId: string): number | undefined {
  if (!/^[1-9]\d*$/.test(playerId)) return undefined;
  const parsed = Number(playerId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}
