'use client';

import { useContext, type ReactNode } from 'react';
import { QueryClientContext, type UseQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { CatalogGame, PlayerPlayedResponse } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { GameCard } from '../game-card';
import { useSession } from '../auth/session';
import { Skeleton } from '../ui';
import { useFavorites, usePlayedRail } from './use-personalization';

export function CasinoPersonalizationRails({ placement }: { placement: 'lead' | 'tail' }) {
  const client = useContext(QueryClientContext);
  if (!client) return null;
  return <LiveRails placement={placement} />;
}

function LiveRails({ placement }: { placement: 'lead' | 'tail' }) {
  const { status } = useSession();
  const recent = usePlayedRail('last-played');
  const favorites = useFavorites();
  const most = usePlayedRail('most-played');
  if (status !== 'authenticated') return null;
  if (placement === 'lead') {
    return (
      <>
        <PlayedRail query={recent} href="/recently-played" titleKey="recentlyPlayed" />
        <FavoritesRail games={favorites.data?.games} pending={favorites.isPending} error={favorites.isError} onRetry={() => void favorites.refetch()} />
      </>
    );
  }
  return <PlayedRail query={most} href="/most-played" titleKey="mostPlayed" showRounds />;
}

function FavoritesRail({
  games,
  pending,
  error,
  onRetry,
}: {
  games: CatalogGame[] | undefined;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('personalization');
  return (
    <RailFrame title={t('favorites')} href="/favorites" pending={pending} error={error} onRetry={onRetry} games={games}>
      {(game) => <GameCard key={game.id} game={game} />}
    </RailFrame>
  );
}

function PlayedRail({
  query,
  href,
  titleKey,
  showRounds = false,
}: {
  query: UseQueryResult<PlayerPlayedResponse>;
  href: '/recently-played' | '/most-played';
  titleKey: 'recentlyPlayed' | 'mostPlayed';
  showRounds?: boolean;
}) {
  const t = useTranslations('personalization');
  return (
    <RailFrame
      title={t(titleKey)}
      href={href}
      pending={query.isPending}
      error={query.isError}
      onRetry={() => void query.refetch()}
      games={query.data?.games}
    >
      {(game) => <GameCard key={game.id} game={game} showRounds={showRounds} />}
    </RailFrame>
  );
}

function RailFrame({
  title,
  href,
  pending,
  error,
  onRetry,
  games,
  children,
}: {
  title: string;
  href: '/favorites' | '/recently-played' | '/most-played';
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  games: CatalogGame[] | undefined;
  children: (game: CatalogGame) => ReactNode;
}) {
  const t = useTranslations('personalization');
  if (!pending && !error && games && games.length === 0) return null;
  return (
    <section aria-label={title} className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="lobby-title text-lg font-black">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-[var(--accent)]">
          {t('viewAll')}
        </Link>
      </div>
      {pending && (
        <div aria-busy="true" className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-[168px] shrink-0" />
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="text-sm text-[var(--muted)]">{t('railError')}</p>
          <button type="button" onClick={onRetry} className="text-sm font-semibold text-[var(--accent)]">
            {t('retry')}
          </button>
        </div>
      )}
      {games && games.length > 0 && (
        <div className="scrollbar-none -mx-1 flex snap-x gap-3.5 overflow-x-auto px-1 pb-2">{games.map(children)}</div>
      )}
    </section>
  );
}
