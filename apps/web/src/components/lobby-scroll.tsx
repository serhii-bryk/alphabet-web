'use client';

import { useEffect } from 'react';

const storageKey = 'alphabet:lobby-grid';

export function LobbyGridScroll({ token }: { token: string }) {
  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(storageKey);
      sessionStorage.setItem(storageKey, token);
    } catch {
      return;
    }
    if (previous === null || previous === token) return;
    const target = document.getElementById('games');
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [token]);

  return null;
}
