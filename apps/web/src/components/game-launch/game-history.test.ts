import { describe, expect, it } from 'vitest';
import { gameHistoryAction, gameHistoryKey } from './game-history';

describe('gameHistoryAction', () => {
  it('ignores history while a game entry is still current or a close is already in flight', () => {
    expect(gameHistoryAction({ [gameHistoryKey]: 4 }, 4, false)).toBe('ignore');
    expect(gameHistoryAction(null, 4, true)).toBe('ignore');
    expect(gameHistoryAction(null, null, false)).toBe('ignore');
  });

  it('closes games when the player moves past the game history entry', () => {
    expect(gameHistoryAction(null, 4, false)).toBe('close');
    expect(gameHistoryAction({ [gameHistoryKey]: 2 }, 4, false)).toBe('close');
  });
});
