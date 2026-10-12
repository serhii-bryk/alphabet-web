import type { AccountErrorCode, PlayerBalance, PlayerProfile } from '@brand/contracts';
import type { PlatformClient } from '@brand/platform';
import { isPlayerSessionEnded, playerIdNumber } from './auth.js';
import type { PlayerSession } from './auth.js';

export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode) {
    super(code === 'session_ended' ? 'Session ended' : 'Account unavailable');
    this.name = 'AccountError';
    this.code = code;
  }
}

export interface AccountUseCases {
  getProfile(session: PlayerSession): Promise<PlayerProfile>;
  getBalance(session: PlayerSession): Promise<PlayerBalance>;
}

export function createAccountUseCases(platform: PlatformClient): AccountUseCases {
  return {
    async getProfile(session) {
      const profile = await readAccount(session, (playerId, accessToken) =>
        platform.getProfile(playerId, accessToken),
      );
      if (String(profile.profile.id) !== session.playerId) {
        throw new AccountError('account_unavailable');
      }
      return {
        playerId: session.playerId,
        email: profile.profile.email,
        firstName: profile.profile.first_name ?? '',
        lastName: profile.profile.last_name ?? '',
        currency: profile.profile.currency?.code ?? null,
        countryCode: profile.profile.country?.alpha2 ?? null,
        emailVerified: profile.profile.email_verified ?? false,
      };
    },

    async getBalance(session) {
      const balance = await readAccount(session, (playerId, accessToken) =>
        platform.getBalance(playerId, accessToken),
      );
      if (!Number.isFinite(balance.balance)) throw new AccountError('account_unavailable');
      return { balance: balance.balance, currency: balance.currency };
    },
  };
}

async function readAccount<T>(
  session: PlayerSession,
  read: (playerId: number, accessToken: string) => Promise<T>,
): Promise<T> {
  const playerId = playerIdNumber(session.playerId);
  if (playerId === undefined) throw new AccountError('session_ended');
  try {
    return await read(playerId, session.accessToken);
  } catch (error) {
    if (error instanceof AccountError) throw error;
    if (isPlayerSessionEnded(error)) throw new AccountError('session_ended');
    throw new AccountError('account_unavailable');
  }
}
