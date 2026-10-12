import { describe, expect, it } from 'vitest';
import type { CatalogGame } from '@brand/contracts';
import {
  gameLaunchReducer,
  initialGameLaunchState,
  isRetryable,
  supportsLaunchMode,
  type GameLaunchAction,
  type GameLaunchState,
  type GameLaunchTarget,
} from './state';

const game: CatalogGame = {
  id: '406',
  slug: 'book-of-tests',
  title: 'Book of Tests',
  kind: 'casino',
  imageUrl: null,
  provider: null,
  categories: [],
  demoPlayEnabled: true,
};
const target: GameLaunchTarget = { game, mode: 'demo' };
const url = 'https://platform.example/game/play/ticket-1';

function run(actions: GameLaunchAction[], from: GameLaunchState = initialGameLaunchState) {
  return actions.reduce(gameLaunchReducer, from);
}

const launching = run([{ type: 'launch', target, attempt: 1 }]);
const loading = run([{ type: 'resolved', attempt: 1, launchUrl: url }], launching);

describe('gameLaunchReducer', () => {
  it('moves idle → launching → loading → ready', () => {
    expect(launching).toEqual({ status: 'launching', target, attempt: 1 });
    expect(loading).toEqual({ status: 'loading', target, attempt: 1, launchUrl: url });
    expect(run([{ type: 'frameLoaded', attempt: 1 }], loading)).toEqual({
      status: 'ready',
      target,
      attempt: 1,
      launchUrl: url,
    });
  });

  it('ignores a duplicate launch while launching or open', () => {
    const other: GameLaunchTarget = { game: { ...game, id: '407' }, mode: 'demo' };
    expect(run([{ type: 'launch', target: other, attempt: 2 }], launching)).toBe(launching);
    expect(run([{ type: 'launch', target: other, attempt: 2 }], loading)).toBe(loading);
  });

  it('moves launching → error with the failure code', () => {
    expect(run([{ type: 'failed', attempt: 1, code: 'demo_unavailable' }], launching)).toEqual({
      status: 'error',
      target,
      attempt: 1,
      code: 'demo_unavailable',
    });
  });

  it('ignores stale attempt responses', () => {
    expect(run([{ type: 'resolved', attempt: 0, launchUrl: url }], launching)).toBe(launching);
    expect(run([{ type: 'failed', attempt: 0, code: 'launch_unavailable' }], launching)).toBe(
      launching,
    );
    expect(run([{ type: 'frameLoaded', attempt: 0 }], loading)).toBe(loading);
    expect(run([{ type: 'loadTimeout', attempt: 0 }], loading)).toBe(loading);
  });

  it('ignores responses that arrive after close', () => {
    const closed = run([{ type: 'close' }], launching);
    expect(run([{ type: 'resolved', attempt: 1, launchUrl: url }], closed)).toEqual(
      initialGameLaunchState,
    );
  });

  it('moves loading → slow on timeout, then ready if the frame still loads', () => {
    const slow = run([{ type: 'loadTimeout', attempt: 1 }], loading);
    expect(slow).toEqual({ status: 'slow', target, attempt: 1, launchUrl: url });
    expect(run([{ type: 'loadTimeout', attempt: 1 }], slow)).toBe(slow);
    expect(run([{ type: 'frameLoaded', attempt: 1 }], slow).status).toBe('ready');
  });

  it('retries a slow load or launch_unavailable as a new attempt without the old URL', () => {
    const slow = run([{ type: 'loadTimeout', attempt: 1 }], loading);
    const retried = run([{ type: 'retry', attempt: 2 }], slow);
    expect(retried).toEqual({ status: 'launching', target, attempt: 2 });
    expect('launchUrl' in retried).toBe(false);
    expect(run([{ type: 'resolved', attempt: 1, launchUrl: url }], retried)).toBe(retried);

    const failed = run([{ type: 'failed', attempt: 1, code: 'launch_unavailable' }], launching);
    expect(run([{ type: 'retry', attempt: 2 }], failed)).toEqual({
      status: 'launching',
      target,
      attempt: 2,
    });
  });

  it.each(['demo_unavailable', 'game_not_found', 'invalid_game_id'] as const)(
    'does not retry %s',
    (code) => {
      const failed = run([{ type: 'failed', attempt: 1, code }], launching);
      expect(isRetryable(failed)).toBe(false);
      expect(run([{ type: 'retry', attempt: 2 }], failed)).toBe(failed);
    },
  );

  it('does not retry while launching, loading, ready, or idle', () => {
    const ready = run([{ type: 'frameLoaded', attempt: 1 }], loading);
    for (const state of [initialGameLaunchState, launching, loading, ready]) {
      expect(run([{ type: 'retry', attempt: 9 }], state)).toBe(state);
    }
  });

  it('ignores late results from the previous attempt after a retry resolves with a new URL', () => {
    const slow = run([{ type: 'loadTimeout', attempt: 1 }], loading);
    const retryUrl = 'https://platform.example/game/play/ticket-2';
    const retried = run(
      [
        { type: 'retry', attempt: 2 },
        { type: 'failed', attempt: 1, code: 'launch_unavailable' },
        { type: 'resolved', attempt: 2, launchUrl: retryUrl },
        { type: 'frameLoaded', attempt: 1 },
        { type: 'loadTimeout', attempt: 1 },
      ],
      slow,
    );
    expect(retried).toEqual({ status: 'loading', target, attempt: 2, launchUrl: retryUrl });
    expect(run([{ type: 'frameLoaded', attempt: 2 }], retried)).toEqual({
      status: 'ready',
      target,
      attempt: 2,
      launchUrl: retryUrl,
    });
  });

  it('ignores the closed attempt after a relaunch', () => {
    const other: GameLaunchTarget = { game: { ...game, id: '407' }, mode: 'demo' };
    const relaunched = run(
      [
        { type: 'close' },
        { type: 'failed', attempt: 1, code: 'demo_unavailable' },
        { type: 'launch', target: other, attempt: 2 },
        { type: 'resolved', attempt: 1, launchUrl: url },
        { type: 'failed', attempt: 1, code: 'game_not_found' },
      ],
      launching,
    );
    expect(relaunched).toEqual({ status: 'launching', target: other, attempt: 2 });
  });

  it('does not change state when a ready frame fires another load event', () => {
    const ready = run([{ type: 'frameLoaded', attempt: 1 }], loading);
    expect(run([{ type: 'frameLoaded', attempt: 1 }], ready)).toBe(ready);
    expect(run([{ type: 'loadTimeout', attempt: 1 }], ready)).toBe(ready);
  });

  it('close resets every state to idle', () => {
    const failed = run([{ type: 'failed', attempt: 1, code: 'launch_unavailable' }], launching);
    for (const state of [launching, loading, failed]) {
      expect(run([{ type: 'close' }], state)).toEqual(initialGameLaunchState);
    }
  });
});

describe('supportsLaunchMode', () => {
  it('uses Platform demoPlayEnabled as the only demo capability source', () => {
    expect(supportsLaunchMode(game, 'demo')).toBe(true);
    expect(supportsLaunchMode({ ...game, demoPlayEnabled: false }, 'demo')).toBe(false);
    expect(supportsLaunchMode(game, 'demo', true)).toBe(true);
    expect(supportsLaunchMode({ ...game, demoPlayEnabled: false }, 'demo', true)).toBe(false);
  });

  it('allows real play for any game only when authenticated', () => {
    const noDemo = { ...game, demoPlayEnabled: false };
    expect(supportsLaunchMode(game, 'real', true)).toBe(true);
    expect(supportsLaunchMode(noDemo, 'real', true)).toBe(true);
    expect(supportsLaunchMode(game, 'real', false)).toBe(false);
    expect(supportsLaunchMode(noDemo, 'real')).toBe(false);
  });
});
