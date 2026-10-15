import type {
  CoolOffRequest,
  ExclusionResult,
  RealityCheckPreference,
  ResponsibleGamingCatalog,
  ResponsibleGamingErrorCode,
  SelfExclusionRequest,
  SessionClock,
} from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type {
  PlatformClient,
  PlatformCoolOffSettings,
  PlatformExclusion,
  PlatformResponsiblePeriod,
  PlatformSelfExclusionSettings,
} from '@brand/platform';
import { isPlayerSessionEnded, playerIdNumber, type PlayerSession } from './auth.js';

export class ResponsibleGamingError extends Error {
  readonly code: ResponsibleGamingErrorCode;

  constructor(code: ResponsibleGamingErrorCode) {
    super(
      code === 'session_ended'
        ? 'Session ended'
        : code === 'auth_required'
          ? 'Authentication required'
          : code === 'invalid_interval'
            ? 'Invalid reality check interval'
            : code === 'invalid_period'
              ? 'Invalid period'
              : code === 'invalid_reason'
                ? 'Invalid reason'
                : code === 'account_restricted'
                  ? 'Account restricted'
                  : 'Responsible gaming unavailable',
    );
    this.name = 'ResponsibleGamingError';
    this.code = code;
  }
}

export interface ResponsibleGamingUseCases {
  catalog(): Promise<ResponsibleGamingCatalog>;
  getRealityCheck(session: PlayerSession): Promise<RealityCheckPreference>;
  setRealityCheck(session: PlayerSession, intervalMinutes: number): Promise<RealityCheckPreference>;
  sessionClock(session: PlayerSession): Promise<SessionClock>;
  coolOff(session: PlayerSession, request: CoolOffRequest): Promise<ExclusionResult>;
  selfExclude(session: PlayerSession, request: SelfExclusionRequest): Promise<ExclusionResult>;
}

export function createResponsibleGamingUseCases(platform: PlatformClient): ResponsibleGamingUseCases {
  return {
    async catalog() {
      const [reality, coolOff, selfExclusion] = await readPublic(() =>
        Promise.all([
          platform.getRealityCheckSettings(),
          platform.getCoolOffSettings(),
          platform.getSelfExclusionSettings(),
        ]),
      );
      return {
        realityCheckIntervals: reality.values,
        coolOffPeriods: coolOff.periods.map(mapPeriod),
        coolOffReasons: coolOff.reasons.map((reason) => ({ id: reason.id, text: reason.text })),
        selfExclusionPeriods: selfExclusion.periods.map(mapPeriod),
      };
    },

    async getRealityCheck(session) {
      const current = await readPlayer(session, (playerId, accessToken) =>
        platform.getPlayerRealityCheck(playerId, accessToken),
      );
      return { intervalMinutes: current.value };
    },

    async setRealityCheck(session, intervalMinutes) {
      if (!Number.isFinite(intervalMinutes)) throw new ResponsibleGamingError('invalid_interval');
      const settings = await readPublic(() => platform.getRealityCheckSettings());
      if (!settings.values.includes(intervalMinutes)) {
        throw new ResponsibleGamingError('invalid_interval');
      }
      const saved = await readPlayer(session, (playerId, accessToken) =>
        platform.setPlayerRealityCheck(playerId, accessToken, intervalMinutes),
      );
      return { intervalMinutes: saved.value };
    },

    async sessionClock(session) {
      const playerId = playerIdNumber(session.playerId);
      if (playerId === undefined) throw new ResponsibleGamingError('session_ended');
      try {
        const result = await platform.getPlayerLogins(playerId, 1);
        const startedAt = result.logins[0]?.login_at;
        if (!startedAt) return { startedAt: null, source: 'unavailable' };
        return { startedAt, source: 'platform_login' };
      } catch {
        return { startedAt: null, source: 'unavailable' };
      }
    },

    async coolOff(session, request) {
      const settings = await readPublic(() => platform.getCoolOffSettings());
      assertPeriod(settings, request.periodId);
      if (
        request.reasonId !== undefined &&
        !settings.reasons.some((reason) => reason.id === request.reasonId)
      ) {
        throw new ResponsibleGamingError('invalid_reason');
      }
      const input =
        request.reasonId === undefined
          ? { period_id: request.periodId }
          : { period_id: request.periodId, reason_id: request.reasonId };
      const result = await readPlayer(session, (playerId, accessToken) =>
        platform.excludePlayer(playerId, accessToken, input),
      );
      return mapExclusion(result);
    },

    async selfExclude(session, request) {
      const settings = await readPublic(() => platform.getSelfExclusionSettings());
      assertPeriod(settings, request.periodId);
      const result = await readPlayer(session, (playerId, accessToken) =>
        platform.excludePlayer(playerId, accessToken, { period_id: request.periodId }),
      );
      return mapExclusion(result);
    },
  };
}

function mapPeriod(period: PlatformResponsiblePeriod): ResponsibleGamingCatalog['coolOffPeriods'][number] {
  return {
    id: period.id,
    text: period.text,
    dateSelector: period.date_selector,
  };
}

function mapExclusion(result: PlatformExclusion): ExclusionResult {
  return {
    kind: result.type === 'cooloff' ? 'cool_off' : 'self_exclusion',
    periodText: result.period,
    reasonText: result.reason,
    status: result.status,
    expiresAt: result.expires_at,
    createdAt: result.created_at,
    sessionEnded: true,
  };
}

function assertPeriod(
  settings: PlatformCoolOffSettings | PlatformSelfExclusionSettings,
  periodId: number,
): void {
  const period = settings.periods.find((item) => item.id === periodId);
  // A date_selector period needs an end date. This body cannot send one, and a null duration would be permanent.
  if (!period || period.date_selector) throw new ResponsibleGamingError('invalid_period');
}

async function readPublic<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw mapFailure(error);
  }
}

async function readPlayer<T>(
  session: PlayerSession,
  read: (playerId: number, accessToken: string) => Promise<T>,
): Promise<T> {
  const playerId = playerIdNumber(session.playerId);
  if (playerId === undefined) throw new ResponsibleGamingError('session_ended');
  try {
    return await read(playerId, session.accessToken);
  } catch (error) {
    throw mapFailure(error);
  }
}

function mapFailure(error: unknown): ResponsibleGamingError {
  if (error instanceof ResponsibleGamingError) return error;
  if (isPlayerSessionEnded(error)) return new ResponsibleGamingError('session_ended');
  if (error instanceof PlatformClientError && error.code === 'request_failed') {
    if (error.status === 404 && error.platformCode === 'responsible_gaming_period_not_found') {
      return new ResponsibleGamingError('invalid_period');
    }
    if (
      error.status === 403 &&
      (error.platformCode === 'player_has_excluded' || error.platformCode === 'player_not_active')
    ) {
      return new ResponsibleGamingError('account_restricted');
    }
  }
  return new ResponsibleGamingError('responsible_gaming_unavailable');
}
