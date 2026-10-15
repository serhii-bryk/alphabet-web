'use client';

import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { scrollToLobbySection } from './game-launch/casino-nav';

const SECTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;

export function SectionScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '');
    if (!SECTION_ID.test(id)) return;
    let frame = 0;
    let attempts = 0;
    const tick = () => {
      if (document.getElementById(id)) {
        scrollToLobbySection(id);
        return;
      }
      attempts += 1;
      if (attempts < 30) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
