import type {
  CatalogGame,
  GameLaunchErrorCode,
  GameLaunchMode,
  GameLaunchResponse,
} from '@brand/contracts';

export type GameLauncher = (gameId: string, signal: AbortSignal) => Promise<GameLaunchResponse>;
export type GameLaunchers = Record<GameLaunchMode, GameLauncher>;

export interface GameLaunchTarget {
  game: CatalogGame;
  mode: GameLaunchMode;
}

interface ActiveLaunch {
  target: GameLaunchTarget;
  attempt: number;
}

export type GameLaunchState =
  | { status: 'idle' }
  | (ActiveLaunch & { status: 'launching' })
  | (ActiveLaunch & { status: 'loading' | 'slow' | 'ready'; launchUrl: string })
  | (ActiveLaunch & { status: 'error'; code: GameLaunchErrorCode });

export type GameLaunchAction =
  | { type: 'launch'; target: GameLaunchTarget; attempt: number }
  | { type: 'retry'; attempt: number }
  | { type: 'resolved'; attempt: number; launchUrl: string }
  | { type: 'failed'; attempt: number; code: GameLaunchErrorCode }
  | { type: 'frameLoaded'; attempt: number }
  | { type: 'loadTimeout'; attempt: number }
  | { type: 'close' };

export const initialGameLaunchState: GameLaunchState = { status: 'idle' };

// Some providers (e.g. Mascot on stage) take ~25s to fire the frame load event.
export const GAME_LOAD_TIMEOUT_MS = 45_000;

export function supportsLaunchMode(
  game: CatalogGame,
  mode: GameLaunchMode,
  authenticated = false,
) {
  return mode === 'real' ? authenticated : game.demoPlayEnabled;
}

export function isRetryable(
  state: GameLaunchState,
): state is Extract<GameLaunchState, { status: 'slow' | 'error' }> {
  return (
    state.status === 'slow' || (state.status === 'error' && state.code === 'launch_unavailable')
  );
}

export function gameLaunchReducer(
  state: GameLaunchState,
  action: GameLaunchAction,
): GameLaunchState {
  switch (action.type) {
    case 'launch':
      if (state.status !== 'idle') return state;
      return { status: 'launching', target: action.target, attempt: action.attempt };
    case 'retry':
      if (!isRetryable(state)) return state;
      return { status: 'launching', target: state.target, attempt: action.attempt };
    case 'resolved':
      if (state.status !== 'launching' || state.attempt !== action.attempt) return state;
      return { ...state, status: 'loading', launchUrl: action.launchUrl };
    case 'failed':
      if (state.status !== 'launching' || state.attempt !== action.attempt) return state;
      return { status: 'error', target: state.target, attempt: state.attempt, code: action.code };
    case 'frameLoaded':
      if (
        (state.status !== 'loading' && state.status !== 'slow') ||
        state.attempt !== action.attempt
      ) {
        return state;
      }
      return { ...state, status: 'ready' };
    case 'loadTimeout':
      if (state.status !== 'loading' || state.attempt !== action.attempt) return state;
      return { ...state, status: 'slow' };
    case 'close':
      return initialGameLaunchState;
  }
}
