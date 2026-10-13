import type { CatalogGame } from '@brand/contracts';
import { describe, expect, it } from 'vitest';
import type { GameLaunchTarget } from './state';
import {
  MAX_OPEN_GAMES,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  initialWorkspaceState,
  workspaceReducer,
  type GamePanel,
} from './workspace-state';

const game = (id: string, title = `Game ${id}`): CatalogGame => ({
  id,
  slug: id,
  title,
  kind: 'casino',
  imageUrl: null,
  provider: null,
  categories: [],
  demoPlayEnabled: true,
});

function target(id: string, mode: 'demo' | 'real' = 'demo'): GameLaunchTarget {
  return { game: game(id), mode };
}

function launch(ids: string[]) {
  return ids.reduce(
    (state, id) =>
      workspaceReducer(state, {
        type: 'open',
        target: target(id),
        attempt: Number(id),
        presentation: 'floating',
      }),
    initialWorkspaceState,
  );
}

function panel(state: ReturnType<typeof launch>, id: string): GamePanel {
  const found = state.panels.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('workspaceReducer', () => {
  it('opens the first game as a full page until multi-game is chosen', () => {
    const first = workspaceReducer(initialWorkspaceState, {
      type: 'open',
      target: target('1', 'demo'),
      attempt: 1,
    });
    expect(first.multiGame).toBe(false);
    expect(first.panels).toHaveLength(1);
    expect(panel(first, '1').presentation).toBe('page');

    const replaced = workspaceReducer(first, { type: 'open', target: target('2'), attempt: 2 });
    expect(replaced.panels.map((item) => item.id)).toEqual(['2']);
    expect(panel(replaced, '2').presentation).toBe('page');
    expect(replaced.multiGame).toBe(false);
  });

  it('adds a game without popping the current one out, then pops out only on request', () => {
    const first = workspaceReducer(initialWorkspaceState, {
      type: 'open',
      target: target('1', 'demo'),
      attempt: 1,
    });
    const ready = workspaceReducer(first, {
      type: 'panel',
      id: '1',
      action: { type: 'resolved', attempt: 1, launchUrl: 'https://games.example/a' },
    });
    const armed = workspaceReducer(ready, { type: 'armMultiGame' });
    expect(armed.multiGame).toBe(true);
    expect(panel(armed, '1').presentation).toBe('page');
    expect(panel(armed, '1').launch).toBe(panel(ready, '1').launch);

    const both = workspaceReducer(armed, { type: 'open', target: target('2'), attempt: 2 });
    expect(both.panels.map((item) => item.id)).toEqual(['1', '2']);
    expect(panel(both, '1').presentation).toBe('background');
    expect(panel(both, '1').launch).toBe(panel(ready, '1').launch);
    expect(panel(both, '2').presentation).toBe('page');
    expect(both.focusedId).toBe('2');

    const back = workspaceReducer(both, { type: 'focus', id: '1' });
    expect(back.focusedId).toBe('1');
    expect(panel(back, '1').presentation).toBe('page');
    expect(panel(back, '1').launch).toBe(panel(ready, '1').launch);
    expect(panel(back, '2').presentation).toBe('background');
    expect(panel(back, '2').launch).toBe(panel(both, '2').launch);

    const popped = workspaceReducer(back, { type: 'popOut', id: '1' });
    expect(panel(popped, '1').presentation).toBe('floating');
    expect(panel(popped, '1').launch).toBe(panel(ready, '1').launch);
    expect(panel(popped, '2').presentation).toBe('page');
    expect(panel(popped, '2').launch).toBe(panel(both, '2').launch);
    expect(popped.focusedId).toBe('2');
  });

  it('promotes a background game when the main one closes, without relaunching it', () => {
    const armed = workspaceReducer(
      workspaceReducer(initialWorkspaceState, { type: 'open', target: target('1'), attempt: 1 }),
      { type: 'armMultiGame' },
    );
    const ready = workspaceReducer(armed, {
      type: 'panel',
      id: '1',
      action: { type: 'resolved', attempt: 1, launchUrl: 'https://games.example/a' },
    });
    const both = workspaceReducer(ready, { type: 'open', target: target('2'), attempt: 2 });
    const closed = workspaceReducer(both, { type: 'close', id: '2' });
    expect(closed.panels.map((item) => item.id)).toEqual(['1']);
    expect(panel(closed, '1').presentation).toBe('page');
    expect(panel(closed, '1').launch).toBe(panel(ready, '1').launch);
  });

  it('opens a second game without replacing the first launch', () => {
    const first = workspaceReducer(initialWorkspaceState, {
      type: 'open',
      target: target('1', 'demo'),
      attempt: 1,
      presentation: 'floating',
    });
    const ready = workspaceReducer(first, {
      type: 'panel',
      id: '1',
      action: { type: 'resolved', attempt: 1, launchUrl: 'https://games.example/a' },
    });
    const both = workspaceReducer(ready, { type: 'open', target: target('2'), attempt: 2, presentation: 'floating' });
    expect(both.panels).toHaveLength(2);
    expect(panel(both, '1').launch).toBe(panel(ready, '1').launch);
    expect(panel(both, '2').launch.status).toBe('launching');
    expect(both.focusedId).toBe('2');
  });

  it('focuses an open game instead of starting another launch', () => {
    const open = workspaceReducer(initialWorkspaceState, {
      type: 'open',
      target: target('1'),
      attempt: 4,
    });
    const again = workspaceReducer(open, { type: 'open', target: target('1'), attempt: 9 });
    expect(again.panels).toHaveLength(1);
    expect(panel(again, '1').launch.attempt).toBe(4);
  });

  it('moves, resizes, minimizes, maximizes, and restores without touching the launch', () => {
    const open = launch(['1', '2']);
    const launchA = panel(open, '1').launch;
    const launchB = panel(open, '2').launch;
    const moved = workspaceReducer(open, { type: 'move', id: '1', x: 80, y: 40 });
    const resized = workspaceReducer(moved, {
      type: 'resize',
      id: '2',
      frame: { x: 10, y: 12, width: 500, height: 360 },
    });
    const minimized = workspaceReducer(resized, { type: 'minimize', id: '1' });
    const maximized = workspaceReducer(minimized, { type: 'maximize', id: '2' });
    const restored = workspaceReducer(
      workspaceReducer(maximized, { type: 'restore', id: '1' }),
      { type: 'restore', id: '2' },
    );

    expect(panel(moved, '1').frame).toMatchObject({ x: 80, y: 40 });
    expect(panel(resized, '2').frame).toMatchObject({ width: 500, height: 360 });
    expect(panel(minimized, '1').presentation).toBe('minimized');
    expect(panel(maximized, '2').presentation).toBe('maximized');
    expect(panel(maximized, '2').restoreFrame).toEqual(panel(resized, '2').frame);
    expect(panel(restored, '1').presentation).toBe('floating');
    expect(panel(restored, '2').presentation).toBe('floating');
    expect(panel(restored, '2').frame).toEqual(panel(resized, '2').frame);
    expect(panel(restored, '1').launch).toBe(launchA);
    expect(panel(restored, '2').launch).toBe(launchB);
  });

  it('refuses a window smaller than the minimum', () => {
    const open = launch(['1']);
    const resized = workspaceReducer(open, {
      type: 'resize',
      id: '1',
      frame: { x: 0, y: 0, width: 40, height: 40 },
    });
    expect(panel(resized, '1').frame.width).toBe(MIN_WINDOW_WIDTH);
    expect(panel(resized, '1').frame.height).toBe(MIN_WINDOW_HEIGHT);
  });

  it('keeps the remaining iframe launch when one game closes', () => {
    const open = launch(['1', '2']);
    const resolved = workspaceReducer(open, {
      type: 'panel',
      id: '2',
      action: { type: 'resolved', attempt: 2, launchUrl: 'https://games.example/b' },
    });
    const closed = workspaceReducer(resolved, { type: 'close', id: '1' });
    expect(closed.panels.map((item) => item.id)).toEqual(['2']);
    expect(panel(closed, '2').launch).toBe(panel(resolved, '2').launch);
    const emptied = workspaceReducer(closed, { type: 'close', id: '2' });
    expect(emptied.multiGame).toBe(false);
  });

  it('allows five games and blocks the sixth without closing the oldest', () => {
    const five = launch(['1', '2', '3', '4', '5']);
    expect(five.panels).toHaveLength(MAX_OPEN_GAMES);
    const blocked = workspaceReducer(five, { type: 'open', target: target('6'), attempt: 6 });
    expect(blocked.panels.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(blocked.limitNotice).toBe(true);
    expect(panel(blocked, '1').launch).toBe(panel(five, '1').launch);
  });

  it('drops real launches on logout and leaves demo launches mounted', () => {
    const mixed = workspaceReducer(
      workspaceReducer(initialWorkspaceState, {
        type: 'open',
        target: target('1', 'demo'),
        attempt: 1,
        presentation: 'floating',
      }),
      { type: 'open', target: target('2', 'real'), attempt: 2, presentation: 'floating' },
    );
    const demoLaunch = panel(mixed, '1').launch;
    const next = workspaceReducer(mixed, { type: 'dropMode', mode: 'real' });
    expect(next.panels.map((item) => item.id)).toEqual(['1']);
    expect(panel(next, '1').launch).toBe(demoLaunch);
  });

  it('switches focus without relaunching either game', () => {
    const open = launch(['1', '2']);
    const focused = workspaceReducer(open, { type: 'focus', id: '1' });
    expect(focused.focusedId).toBe('1');
    expect(panel(focused, '1').launch).toBe(panel(open, '1').launch);
    expect(panel(focused, '2').launch).toBe(panel(open, '2').launch);
  });
});
