'use client';

import { useTranslations } from 'next-intl';
import type { CatalogGame } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { GameCard } from '../game-card';
import { useAuthDialog } from '../auth/auth-provider';
import { useSession } from '../auth/session';
import { Button, Skeleton } from '../ui';
import { useFavorites, usePlayedLibrary } from './use-personalization';

type LibraryKind = 'favorites' | 'recent' | 'most';

const copy = {
  favorites: {
    title: 'favorites',
    empty: 'favoritesEmpty',
    signIn: 'signInFavorites',
  },
  recent: {
    title: 'recentlyPlayed',
    empty: 'recentEmpty',
    signIn: 'signInRecent',
  },
  most: {
    title: 'mostPlayed',
    empty: 'mostEmpty',
    signIn: 'signInMost',
  },
} as const;

export function PlayerLibrary({ kind }: { kind: LibraryKind }) {
  const t = useTranslations('personalization');
  const text = copy[kind];
  return (
    <section className="py-6 sm:py-10">
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t(text.title)}</h1>
      <div className="mt-6">
        <LibraryBody kind={kind} emptyKey={text.empty} signInKey={text.signIn} />
      </div>
    </section>
  );
}

function LibraryBody({
  kind,
  emptyKey,
  signInKey,
}: {
  kind: LibraryKind;
  emptyKey: 'favoritesEmpty' | 'recentEmpty' | 'mostEmpty';
  signInKey: 'signInFavorites' | 'signInRecent' | 'signInMost';
}) {
  const { status } = useSession();
  if (status === 'pending') return <LibrarySkeleton />;
  if (status !== 'authenticated') return <SignInPrompt messageKey={signInKey} />;
  if (kind === 'favorites') return <FavoritesBody emptyKey={emptyKey} />;
  return <PlayedBody kind={kind === 'recent' ? 'last-played' : 'most-played'} emptyKey={emptyKey} />;
}

function FavoritesBody({ emptyKey }: { emptyKey: 'favoritesEmpty' | 'recentEmpty' | 'mostEmpty' }) {
  const t = useTranslations('personalization');
  const query = useFavorites();
  if (query.isPending) return <LibrarySkeleton />;
  if (query.isError) return <LibraryError onRetry={() => void query.refetch()} />;
  const games = query.data?.games ?? [];
  if (games.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8">
        <p className="text-sm text-[var(--muted)]">{t(emptyKey)}</p>
        <Link href="/casino" className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)]">
          {t('browseCasino')}
        </Link>
      </div>
    );
  }
  return <GameGrid games={games} />;
}

function PlayedBody({
  kind,
  emptyKey,
}: {
  kind: 'last-played' | 'most-played';
  emptyKey: 'favoritesEmpty' | 'recentEmpty' | 'mostEmpty';
}) {
  const t = useTranslations('personalization');
  const query = usePlayedLibrary(kind);
  if (query.isPending) return <LibrarySkeleton />;
  if (query.isError) return <LibraryError onRetry={() => void query.refetch()} />;
  const games = query.data?.pages.flatMap((page) => page.games) ?? [];
  if (games.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8">
        <p className="text-sm text-[var(--muted)]">{t(emptyKey)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <GameGrid games={games} showRounds={kind === 'most-played'} />
      {query.hasNextPage && (
        <Button type="button" variant="secondary" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}

function GameGrid({ games, showRounds = false }: { games: CatalogGame[]; showRounds?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {games.map((game) => (
        <GameCard key={game.id} game={game} layout="grid" showRounds={showRounds} />
      ))}
    </div>
  );
}

function SignInPrompt({ messageKey }: { messageKey: 'signInFavorites' | 'signInRecent' | 'signInMost' }) {
  const t = useTranslations('personalization');
  const { openLogin } = useAuthDialog();
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-8">
      <p className="text-sm text-[var(--muted)]">{t(messageKey)}</p>
      <Button type="button" className="mt-4" onClick={(event) => openLogin(event.currentTarget)}>
        {t('signInAction')}
      </Button>
    </div>
  );
}

function LibraryError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('personalization');
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6">
      <p className="text-sm text-[var(--muted)]">{t('error')}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[3/4] w-full" />
      ))}
    </div>
  );
}
