export const DEMO_PLAY_STORAGE_KEY = 'alphabet.demoPlay.v1';

export const DEMO_PROMPT_DEFAULTS = {
  softMs: 10 * 60 * 1000,
  strongMs: 20 * 60 * 1000,
} as const;

export interface DemoPromptThresholds {
  softMs: number;
  strongMs: number;
}

export interface DemoPlayState {
  accumulatedMs: number;
  softDismissed: boolean;
  strongDismissed: boolean;
}

export const emptyDemoPlay: DemoPlayState = {
  accumulatedMs: 0,
  softDismissed: false,
  strongDismissed: false,
};

export type DemoPromptLevel = 'none' | 'soft' | 'strong';

function positiveMs(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function demoPromptThresholds(input?: {
  soft?: string;
  strong?: string;
  search?: string;
  allowSearchOverride?: boolean;
}): DemoPromptThresholds {
  let softMs = positiveMs(input?.soft, DEMO_PROMPT_DEFAULTS.softMs);
  let strongMs = positiveMs(input?.strong, DEMO_PROMPT_DEFAULTS.strongMs);
  if (input?.allowSearchOverride && input.search) {
    const params = new URLSearchParams(input.search);
    softMs = positiveMs(params.get('demoSoftMs'), softMs);
    strongMs = positiveMs(params.get('demoStrongMs'), strongMs);
  }
  if (strongMs < softMs) strongMs = softMs;
  return { softMs, strongMs };
}

export function demoPromptLevel(
  state: DemoPlayState,
  thresholds: DemoPromptThresholds,
): DemoPromptLevel {
  if (state.accumulatedMs >= thresholds.strongMs && !state.strongDismissed) return 'strong';
  if (state.accumulatedMs >= thresholds.softMs && !state.softDismissed) return 'soft';
  return 'none';
}

export function promptForSession(level: DemoPromptLevel, authenticated: boolean): DemoPromptLevel {
  return authenticated ? 'none' : level;
}

export function advanceDemoPlay(state: DemoPlayState, deltaMs: number): DemoPlayState {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  return { ...state, accumulatedMs: state.accumulatedMs + deltaMs };
}

export function dismissDemoPrompt(
  state: DemoPlayState,
  level: Exclude<DemoPromptLevel, 'none'>,
): DemoPlayState {
  if (level === 'soft') return { ...state, softDismissed: true };
  return { ...state, softDismissed: true, strongDismissed: true };
}

export function readDemoPlay(storage: Pick<Storage, 'getItem'>): DemoPlayState {
  try {
    const raw = storage.getItem(DEMO_PLAY_STORAGE_KEY);
    if (!raw) return emptyDemoPlay;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyDemoPlay;
    const record = parsed as Record<string, unknown>;
    const accumulatedMs =
      typeof record.accumulatedMs === 'number' &&
      Number.isFinite(record.accumulatedMs) &&
      record.accumulatedMs > 0
        ? record.accumulatedMs
        : 0;
    return {
      accumulatedMs,
      softDismissed: record.softDismissed === true,
      strongDismissed: record.strongDismissed === true,
    };
  } catch {
    return emptyDemoPlay;
  }
}

export function writeDemoPlay(storage: Pick<Storage, 'setItem'>, state: DemoPlayState) {
  storage.setItem(DEMO_PLAY_STORAGE_KEY, JSON.stringify(state));
}
