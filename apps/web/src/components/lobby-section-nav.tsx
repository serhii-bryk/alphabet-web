'use client';

import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useGameLauncher } from './game-launch/provider';
import { GameInfo } from './game-launch/game-info';
import { scrollToLobbySection } from './game-launch/casino-nav';
import { useClientDesktop } from './game-launch/viewport';

const chip =
  'chip-link inline-flex h-11 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)]';
const explore =
  'btn btn-primary group inline-flex h-11 shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-black';

export function LobbySectionNav({
  pathname,
  showPromotions,
}: {
  pathname: '/casino' | '/live-casino';
  showPromotions: boolean;
}) {
  const t = useTranslations('lobbyNav');

  useEffect(() => {
    const scrollHash = () => {
      const id = window.location.hash.slice(1);
      if (id) scrollToLobbySection(id);
    };
    const frame = window.requestAnimationFrame(scrollHash);
    window.addEventListener('popstate', scrollHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('popstate', scrollHash);
    };
  }, [pathname]);

  return (
    <nav aria-label={t('label')} data-lobby-nav="" className="lobby-section-nav scrollbar-none">
      <a href="#games" className={explore}>
        {t('exploreGames')}
        <ChevronDown aria-hidden size={18} className="transition-transform duration-[var(--dur-normal)] group-hover:translate-y-0.5" />
      </a>
      <Link href="/casino#games" aria-current={pathname === '/casino' ? 'page' : undefined} className={chip}>
        {t('casino')}
      </Link>
      <Link href="/live-casino#games" aria-current={pathname === '/live-casino' ? 'page' : undefined} className={chip}>
        {t('live')}
      </Link>
      <a href="#providers" className={chip}>
        {t('providers')}
      </a>
      {showPromotions && (
        <a href="#promotions" className={chip}>
          {t('promotions')}
        </a>
      )}
    </nav>
  );
}

export function LobbyGameInfo() {
  const { focusedGame } = useGameLauncher();
  const desktop = useClientDesktop();
  if (desktop !== true || !focusedGame) return null;
  return (
    <div className="panel fade-enter mt-8 overflow-hidden rounded-[var(--radius-lg)]">
      <GameInfo game={focusedGame} />
    </div>
  );
}
