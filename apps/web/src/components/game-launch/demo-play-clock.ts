'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  advanceDemoPlay,
  demoPromptLevel,
  demoPromptThresholds,
  dismissDemoPrompt,
  emptyDemoPlay,
  promptForSession,
  readDemoPlay,
  writeDemoPlay,
  type DemoPlayState,
  type DemoPromptLevel,
} from './demo-play';

const listeners = new Set<() => void>();
let snapshot: DemoPlayState = emptyDemoPlay;
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  snapshot = readDemoPlay(localStorage);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clientSnapshot() {
  hydrate();
  return snapshot;
}

function publish(next: DemoPlayState) {
  if (next === snapshot) return;
  snapshot = next;
  writeDemoPlay(localStorage, next);
  emit();
}

export function useDemoPlayClock(active: boolean, authenticated: boolean) {
  const state = useSyncExternalStore(subscribe, clientSnapshot, () => emptyDemoPlay);
  const thresholds = useMemo(
    () =>
      demoPromptThresholds({
        soft: process.env.NEXT_PUBLIC_DEMO_PROMPT_SOFT_MS,
        strong: process.env.NEXT_PUBLIC_DEMO_PROMPT_STRONG_MS,
        search: typeof window === 'undefined' ? '' : window.location.search,
        allowSearchOverride: process.env.NODE_ENV !== 'production',
      }),
    [],
  );

  useEffect(() => {
    if (!active || authenticated) return;
    let last = Date.now();
    const commit = (delta: number) => {
      publish(advanceDemoPlay(clientSnapshot(), delta));
    };
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (document.hidden) return;
      commit(delta);
    }, 1_000);
    const onVisibility = () => {
      last = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      const now = Date.now();
      if (!document.hidden) commit(now - last);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, authenticated]);

  const dismiss = useCallback((level: Exclude<DemoPromptLevel, 'none'>) => {
    publish(dismissDemoPrompt(clientSnapshot(), level));
  }, []);

  return {
    level: promptForSession(demoPromptLevel(state, thresholds), authenticated),
    dismiss,
  };
}
