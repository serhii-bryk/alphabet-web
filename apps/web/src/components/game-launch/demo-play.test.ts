import { describe, expect, it } from 'vitest';
import {
  DEMO_PROMPT_DEFAULTS,
  advanceDemoPlay,
  demoPromptLevel,
  demoPromptThresholds,
  dismissDemoPrompt,
  emptyDemoPlay,
  promptForSession,
  readDemoPlay,
  writeDemoPlay,
} from './demo-play';

const thresholds = demoPromptThresholds();

describe('demo prompt thresholds', () => {
  it('defaults to 10 and 20 minutes', () => {
    expect(thresholds).toEqual({
      softMs: DEMO_PROMPT_DEFAULTS.softMs,
      strongMs: DEMO_PROMPT_DEFAULTS.strongMs,
    });
    expect(thresholds.softMs).toBe(600_000);
    expect(thresholds.strongMs).toBe(1_200_000);
  });

  it('accepts shorter development values without changing the defaults', () => {
    expect(demoPromptThresholds({ soft: '1500', strong: '4000' })).toEqual({
      softMs: 1500,
      strongMs: 4000,
    });
    expect(
      demoPromptThresholds({
        search: '?demoSoftMs=2000&demoStrongMs=5000',
        allowSearchOverride: true,
      }),
    ).toEqual({ softMs: 2000, strongMs: 5000 });
    expect(
      demoPromptThresholds({
        search: '?demoSoftMs=2000',
        allowSearchOverride: false,
      }).softMs,
    ).toBe(DEMO_PROMPT_DEFAULTS.softMs);
  });
});

describe('demo prompt level', () => {
  it('stays quiet before the first threshold', () => {
    const state = advanceDemoPlay(emptyDemoPlay, thresholds.softMs - 1);
    expect(demoPromptLevel(state, thresholds)).toBe('none');
  });

  it('shows the soft prompt at the first threshold and hides it after dismiss', () => {
    const due = advanceDemoPlay(emptyDemoPlay, thresholds.softMs);
    expect(demoPromptLevel(due, thresholds)).toBe('soft');
    const dismissed = dismissDemoPrompt(due, 'soft');
    expect(demoPromptLevel(dismissed, thresholds)).toBe('none');
    expect(demoPromptLevel(advanceDemoPlay(dismissed, 1_000), thresholds)).toBe('none');
  });

  it('shows the stronger prompt at the second threshold and keeps demo play available', () => {
    const playing = dismissDemoPrompt(advanceDemoPlay(emptyDemoPlay, thresholds.softMs), 'soft');
    const before = advanceDemoPlay(playing, thresholds.strongMs - thresholds.softMs - 1);
    expect(demoPromptLevel(before, thresholds)).toBe('none');
    const due = advanceDemoPlay(playing, thresholds.strongMs - playing.accumulatedMs);
    expect(demoPromptLevel(due, thresholds)).toBe('strong');
    expect(due.accumulatedMs).toBeGreaterThan(0);
    expect(demoPromptLevel(dismissDemoPrompt(due, 'strong'), thresholds)).toBe('none');
  });

  it('stops prompts after login or registration', () => {
    const due = advanceDemoPlay(emptyDemoPlay, thresholds.strongMs);
    expect(promptForSession(demoPromptLevel(due, thresholds), true)).toBe('none');
    expect(promptForSession(demoPromptLevel(due, thresholds), false)).toBe('strong');
  });

  it('keeps accumulated time when the same game is closed and opened again', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const played = advanceDemoPlay(emptyDemoPlay, thresholds.softMs + 5_000);
    writeDemoPlay(storage, dismissDemoPrompt(played, 'soft'));
    const restored = readDemoPlay(storage);
    expect(restored.accumulatedMs).toBe(played.accumulatedMs);
    expect(restored.softDismissed).toBe(true);
    expect(demoPromptLevel(restored, thresholds)).toBe('none');
  });
});
