import type { SportsLaunchErrorCode, SportsLaunchResponse } from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

export class SportsRequestError extends Error {
  readonly code: SportsLaunchErrorCode;

  constructor(code: SportsLaunchErrorCode) {
    super('Sports launch failed');
    this.name = 'SportsRequestError';
    this.code = code;
  }
}

const errorCodeByStatus: Partial<Record<number, SportsLaunchErrorCode>> = {
  400: 'invalid_sports_request',
  401: 'auth_required',
  502: 'sports_unavailable',
};

export function parseSportsLaunchResponse(body: unknown): SportsLaunchResponse | null {
  if (!isRecord(body) || (body.mode !== 'demo' && body.mode !== 'real')) return null;
  if (typeof body.launchUrl !== 'string' || typeof body.expiresAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(body.expiresAt))) return null;
  try {
    const url = new URL(body.launchUrl);
    if (url.protocol !== 'https:') return null;
    return { launchUrl: url.href, expiresAt: new Date(body.expiresAt).toISOString(), mode: body.mode };
  } catch {
    return null;
  }
}

export async function requestSportsLaunch(
  input: { locale: 'en' | 'ar'; path?: string },
  signal?: AbortSignal,
): Promise<SportsLaunchResponse> {
  let response: Response;
  try {
    response = await fetch('/api/sports/launch', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({
        locale: input.locale,
        ...(input.path === undefined ? {} : { path: input.path }),
      }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new SportsRequestError('sports_unavailable');
  }

  const body = await readJson(response);
  if (response.status === 200) {
    const launch = parseSportsLaunchResponse(body);
    if (launch) return launch;
    throw new SportsRequestError('sports_unavailable');
  }
  if (response.status === 401) throw new SportsRequestError('auth_required');
  const expected = errorCodeByStatus[response.status];
  if (response.status === 400 && hasErrorCode(body, 'invalid_sports_path')) {
    throw new SportsRequestError('invalid_sports_path');
  }
  throw new SportsRequestError(
    expected && hasErrorCode(body, expected) ? expected : 'sports_unavailable',
  );
}
