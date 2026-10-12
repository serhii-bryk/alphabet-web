import type { GameLaunchMode } from '@brand/contracts';
import {
  gameLaunchReducer,
  type GameLaunchAction,
  type GameLaunchState,
  type GameLaunchTarget,
} from './state';

export const MAX_OPEN_GAMES = 5;
export const MIN_WINDOW_WIDTH = 360;
export const MIN_WINDOW_HEIGHT = 280;
export const DEFAULT_WINDOW_WIDTH = 720;
export const DEFAULT_WINDOW_HEIGHT = 480;

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Presentation = 'page' | 'floating' | 'minimized' | 'maximized';

export type ActiveLaunch = Exclude<GameLaunchState, { status: 'idle' }>;

export interface GamePanel {
  id: string;
  launch: ActiveLaunch;
  presentation: Presentation;
  frame: Frame;
  restoreFrame: Frame | null;
  z: number;
}

export interface WorkspaceState {
  panels: GamePanel[];
  focusedId: string | null;
  nextZ: number;
  limitNotice: boolean;
  /** Set only by Keep open or Add Game. A normal game click does not set this. */
  multiGame: boolean;
}

export const initialWorkspaceState: WorkspaceState = {
  panels: [],
  focusedId: null,
  nextZ: 1,
  limitNotice: false,
  multiGame: false,
};

type PanelAction = Exclude<GameLaunchAction, { type: 'launch' | 'close' }>;

export type WorkspaceAction =
  | { type: 'open'; target: GameLaunchTarget; attempt: number; frame?: Frame; presentation?: Presentation }
  | { type: 'enterMultiGame' }
  | { type: 'replace'; id: string; target: GameLaunchTarget; attempt: number }
  | { type: 'focus'; id: string }
  | { type: 'close'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; frame: Frame }
  | { type: 'minimize'; id: string }
  | { type: 'maximize'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'dismissLimit' }
  | { type: 'showLimit' }
  | { type: 'dropMode'; mode: GameLaunchMode }
  | { type: 'panel'; id: string; action: PanelAction }
  | { type: 'reset' };

export function defaultFrame(index: number): Frame {
  const step = index * 36;
  return {
    x: 28 + step,
    y: 20 + step,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  };
}

export function clampFrame(frame: Frame): Frame {
  return {
    x: frame.x,
    y: frame.y,
    width: Math.max(MIN_WINDOW_WIDTH, frame.width),
    height: Math.max(MIN_WINDOW_HEIGHT, frame.height),
  };
}

function withFocus(state: WorkspaceState, id: string, restoreMinimized: boolean): WorkspaceState {
  const panel = state.panels.find((item) => item.id === id);
  if (!panel) return state;
  const z = state.nextZ;
  return {
    ...state,
    focusedId: id,
    nextZ: z + 1,
    limitNotice: false,
    panels: state.panels.map((item) =>
      item.id === id
        ? {
            ...item,
            z,
            presentation:
              restoreMinimized && item.presentation === 'minimized' ? 'floating' : item.presentation,
          }
        : item,
    ),
  };
}

function floatPagePanels(panels: GamePanel[]) {
  return panels.map((panel) =>
    panel.presentation === 'page' ? { ...panel, presentation: 'floating' as const } : panel,
  );
}

function focusNext(panels: GamePanel[], closedId: string, focusedId: string | null) {
  if (focusedId !== closedId) return focusedId;
  const remaining = panels.filter((panel) => panel.id !== closedId);
  return remaining.reduce<GamePanel | null>(
    (best, panel) => (!best || panel.z > best.z ? panel : best),
    null,
  )?.id ?? null;
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'open': {
      if (state.panels.some((panel) => panel.id === action.target.game.id)) {
        return withFocus(state, action.target.game.id, true);
      }
      const presentation = action.presentation ?? (state.multiGame ? 'floating' : 'page');
      const panel: GamePanel = {
        id: action.target.game.id,
        launch: { status: 'launching', target: action.target, attempt: action.attempt },
        presentation: presentation === 'page' ? 'page' : 'floating',
        frame: clampFrame(action.frame ?? defaultFrame(presentation === 'page' ? 0 : state.panels.length)),
        restoreFrame: null,
        z: state.nextZ,
      };
      if (panel.presentation === 'page') {
        return {
          panels: [panel],
          focusedId: panel.id,
          nextZ: state.nextZ + 1,
          limitNotice: false,
          multiGame: false,
        };
      }
      if (state.panels.length >= MAX_OPEN_GAMES) {
        return { ...state, limitNotice: true };
      }
      return {
        panels: [...floatPagePanels(state.panels), panel],
        focusedId: panel.id,
        nextZ: state.nextZ + 1,
        limitNotice: false,
        multiGame: true,
      };
    }
    case 'enterMultiGame': {
      if (state.multiGame && state.panels.every((panel) => panel.presentation !== 'page')) return state;
      return {
        ...state,
        multiGame: true,
        panels: floatPagePanels(state.panels),
      };
    }
    case 'replace': {
      const current = state.panels.find((panel) => panel.id === action.id);
      if (!current) return state;
      return withFocus(
        {
          ...state,
          panels: state.panels.map((panel) =>
            panel.id === action.id
              ? {
                  ...panel,
                  launch: { status: 'launching', target: action.target, attempt: action.attempt },
                }
              : panel,
          ),
        },
        action.id,
        true,
      );
    }
    case 'focus':
      return withFocus(state, action.id, true);
    case 'close': {
      const panels = state.panels.filter((panel) => panel.id !== action.id);
      return {
        ...state,
        panels,
        focusedId: focusNext(state.panels, action.id, state.focusedId),
        limitNotice: false,
        multiGame: panels.length === 0 ? false : state.multiGame,
      };
    }
    case 'move':
      return {
        ...state,
        panels: state.panels.map((panel) =>
          panel.id === action.id && panel.presentation === 'floating'
            ? { ...panel, frame: { ...panel.frame, x: action.x, y: action.y } }
            : panel,
        ),
      };
    case 'resize':
      return {
        ...state,
        panels: state.panels.map((panel) =>
          panel.id === action.id && panel.presentation === 'floating'
            ? { ...panel, frame: clampFrame(action.frame) }
            : panel,
        ),
      };
    case 'minimize':
      return {
        ...state,
        panels: state.panels.map((panel) =>
          panel.id === action.id ? { ...panel, presentation: 'minimized' } : panel,
        ),
      };
    case 'maximize':
      return {
        ...state,
        focusedId: action.id,
        panels: state.panels.map((panel) =>
          panel.id === action.id
            ? {
                ...panel,
                presentation: 'maximized',
                restoreFrame: panel.presentation === 'maximized' ? panel.restoreFrame : panel.frame,
                z: state.nextZ,
              }
            : panel,
        ),
        nextZ: state.nextZ + 1,
      };
    case 'restore':
      return {
        ...state,
        focusedId: action.id,
        panels: state.panels.map((panel) =>
          panel.id === action.id
            ? {
                ...panel,
                presentation: 'floating',
                frame: panel.restoreFrame ?? panel.frame,
                restoreFrame: null,
              }
            : panel,
        ),
      };
    case 'dismissLimit':
      return state.limitNotice ? { ...state, limitNotice: false } : state;
    case 'showLimit':
      return state.limitNotice ? state : { ...state, limitNotice: true };
    case 'dropMode': {
      const removed = new Set(
        state.panels.filter((panel) => panel.launch.target.mode === action.mode).map((panel) => panel.id),
      );
      if (removed.size === 0) return state;
      const panels = state.panels.filter((panel) => !removed.has(panel.id));
      const focusedId = state.focusedId && removed.has(state.focusedId)
        ? panels.reduce<GamePanel | null>((best, panel) => (!best || panel.z > best.z ? panel : best), null)?.id ?? null
        : state.focusedId;
      return { ...state, panels, focusedId, limitNotice: false, multiGame: panels.length === 0 ? false : state.multiGame };
    }
    case 'panel':
      return {
        ...state,
        panels: state.panels.map((panel) => {
          if (panel.id !== action.id) return panel;
          const launch = gameLaunchReducer(panel.launch, action.action);
          if (launch.status === 'idle') return panel;
          return launch === panel.launch ? panel : { ...panel, launch };
        }),
      };
    case 'reset':
      return initialWorkspaceState;
  }
}
