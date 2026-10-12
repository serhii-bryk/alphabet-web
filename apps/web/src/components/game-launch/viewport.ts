import { useSyncExternalStore } from 'react';

export const DESKTOP_QUERY = '(min-width: 1100px)';

export function isDesktopViewport() {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
}

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useClientDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null,
  );
}
