import type { GameLaunchErrorCode, GameLaunchMode, GameLaunchResponse } from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

export class GameLaunchError extends Error {
  readonly code: GameLaunchErrorCode;

  constructor(code: GameLaunchErrorCode) {
    super(`Game launch failed: ${code}`);
    this.name = 'GameLaunchError';
    this.code = code;
  }
}

const errorCodeByStatus: Record<GameLaunchMode, Partial<Record<number, GameLaunchErrorCode>>> = {
  demo: {
    400: 'invalid_game_id',
    404: 'game_not_found',
    422: 'demo_unavailable',
    502: 'launch_unavailable',
  },
  real: {
    400: 'invalid_game_id',
    401: 'auth_required',
    403: 'game_unavailable',
    404: 'game_not_found',
    502: 'launch_unavailable',
  },
};

export function parseLaunchResponse(
  body: unknown,
  mode: GameLaunchMode,
): GameLaunchResponse | null {
  if (!isRecord(body) || body.mode !== mode || typeof body.launchUrl !== 'string') return null;
  try {
    const url = new URL(body.launchUrl);
    return url.protocol === 'https:' ? { launchUrl: url.href, mode } : null;
  } catch {
    return null;
  }
}

export function parseDemoLaunchResponse(body: unknown): GameLaunchResponse | null {
  return parseLaunchResponse(body, 'demo');
}

async function requestLaunch(
  gameId: string,
  mode: GameLaunchMode,
  signal?: AbortSignal,
): Promise<GameLaunchResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/games/${encodeURIComponent(gameId)}/launch/${mode}`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      // Demo is anonymous; real launch needs the HttpOnly session cookie.
      credentials: mode === 'real' ? 'same-origin' : 'omit',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new GameLaunchError('launch_unavailable');
  }

  const body = await readJson(response);
  if (response.status === 200) {
    const launch = parseLaunchResponse(body, mode);
    if (launch) return launch;
    throw new GameLaunchError('launch_unavailable');
  }

  // Any 401 means the session is gone, whatever the body says.
  if (mode === 'real' && response.status === 401) throw new GameLaunchError('auth_required');
  const expected = errorCodeByStatus[mode][response.status];
  throw new GameLaunchError(
    expected && hasErrorCode(body, expected) ? expected : 'launch_unavailable',
  );
}

export function requestDemoLaunch(gameId: string, signal?: AbortSignal) {
  return requestLaunch(gameId, 'demo', signal);
}

export function requestRealLaunch(gameId: string, signal?: AbortSignal) {
  return requestLaunch(gameId, 'real', signal);
}
