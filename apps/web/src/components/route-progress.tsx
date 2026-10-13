'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const startEvent = 'alphabet:route-progress';
const TRICKLE_MS = 280;
const SAFETY_MS = 12_000;
const HIDE_MS = 520;

/** Starts the header progress bar for programmatic `router.push` / `router.replace` calls. */
export function startRouteProgress() {
  window.dispatchEvent(new Event(startEvent));
}

function routeKey(url: URL) {
  return `${url.pathname}${url.search}`;
}

function navigatesToNewRoute(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  let next: URL;
  try {
    next = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }
  if (next.origin !== window.location.origin) return false;
  return routeKey(next) !== routeKey(new URL(window.location.href));
}

export function RouteProgress() {
  return (
    <div aria-hidden className="route-progress">
      <Suspense fallback={null}>
        <RouteProgressBar />
      </Suspense>
    </div>
  );
}

function RouteProgressBar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const bar = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const firstRoute = useRef(true);

  useEffect(() => {
    const state = { active: false, value: 0, trickle: 0, safety: 0, hide: 0 };
    const paint = () => bar.current?.style.setProperty('--progress', String(state.value));
    const finish = () => {
      const el = bar.current;
      if (!state.active || !el) return;
      state.active = false;
      window.clearInterval(state.trickle);
      window.clearTimeout(state.safety);
      state.value = 1;
      el.dataset.state = 'done';
      paint();
      state.hide = window.setTimeout(() => {
        if (state.active) return;
        el.dataset.state = 'idle';
        state.value = 0;
        paint();
      }, HIDE_MS);
    };
    const start = () => {
      const el = bar.current;
      if (state.active || !el) return;
      state.active = true;
      window.clearTimeout(state.hide);
      if (el.dataset.state !== 'idle') {
        el.dataset.state = 'idle';
        state.value = 0;
        paint();
        void el.offsetWidth;
      }
      el.dataset.state = 'loading';
      state.value = 0.12;
      paint();
      state.trickle = window.setInterval(() => {
        state.value += (0.92 - state.value) * 0.09;
        paint();
      }, TRICKLE_MS);
      state.safety = window.setTimeout(finish, SAFETY_MS);
    };
    const onClick = (event: MouseEvent) => {
      if (navigatesToNewRoute(event)) start();
    };
    finishRef.current = finish;
    document.addEventListener('click', onClick, true);
    window.addEventListener(startEvent, start);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(startEvent, start);
      window.clearInterval(state.trickle);
      window.clearTimeout(state.safety);
      window.clearTimeout(state.hide);
    };
  }, []);

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    finishRef.current();
  }, [pathname, search]);

  return <div ref={bar} data-state="idle" className="route-progress-bar" />;
}
