export const SPORTSBOOK_MESSAGE_SOURCE = 'cobraflux-sports';
export const SPORTS_RENEW_BEFORE_MS = 5_000;
export const SPORTS_LOAD_TIMEOUT_MS = 30_000;

export function sportsLaunchKey(input: {
  status: 'guest' | 'authenticated';
  playerId: string | null;
  locale: string;
  path?: string;
}) {
  return `${input.status}:${input.playerId ?? ''}:${input.locale}:${input.path ?? ''}`;
}

export function launchStillValid(
  launch: { key: string; expiresAt: string } | null,
  key: string,
  now: number,
) {
  if (!launch || launch.key !== key) return false;
  const expiresAt = Date.parse(launch.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now > SPORTS_RENEW_BEFORE_MS;
}

export function launchIsUsable(expiresAt: string, now: number) {
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires - now > 1_000;
}

export function readSportsbookAction(
  data: unknown,
): 'sign_in' | 'sign_up' | 'ignored' | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.source !== SPORTSBOOK_MESSAGE_SOURCE) return null;
  if (record.action === 'sign_in' || record.action === 'sign_up') return record.action;
  return 'ignored';
}

export function acceptSportsbookMessage(
  event: { origin: string; data: unknown },
  launchOrigin: string,
): 'sign_in' | 'sign_up' | null {
  if (event.origin !== launchOrigin) return null;
  const action = readSportsbookAction(event.data);
  return action === 'sign_in' || action === 'sign_up' ? action : null;
}
