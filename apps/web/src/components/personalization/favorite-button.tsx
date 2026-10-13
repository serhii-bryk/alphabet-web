'use client';

import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CatalogGame } from '@brand/contracts';
import { ToolButton } from '../game-launch/game-toolbar';
import { useFavoriteToggle } from './use-personalization';

export function FavoriteButton({
  game,
  variant = 'card',
}: {
  game: CatalogGame;
  variant?: 'card' | 'tool' | 'info';
}) {
  const client = useContext(QueryClientContext);
  if (!client) return null;
  return <FavoriteControl game={game} variant={variant} />;
}

function FavoriteControl({
  game,
  variant,
}: {
  game: CatalogGame;
  variant: 'card' | 'tool' | 'info';
}) {
  const t = useTranslations('personalization');
  const { status, isPending, favorited, toggle } = useFavoriteToggle();
  const saved = favorited(game.id);
  const pending = isPending(game.id);
  const label =
    status === 'guest' ? t('favoriteSignIn') : saved ? t('unfavorite', { title: game.title }) : t('favorite', { title: game.title });

  const onClick = (opener: HTMLElement) => {
    void toggle(game, opener);
  };

  if (variant === 'tool') {
    return (
      <ToolButton
        label={label}
        pressed={status === 'authenticated' ? saved : undefined}
        disabled={pending}
        onClick={() => onClick(document.activeElement instanceof HTMLElement ? document.activeElement : document.body)}
      >
        <Heart aria-hidden size={17} fill={saved ? 'currentColor' : 'none'} />
      </ToolButton>
    );
  }

  const className =
    variant === 'card'
      ? 'game-card-favorite absolute end-2 top-2 z-20 inline-grid size-8 place-items-center rounded-full border border-white/30 bg-black/50 text-white'
      : 'inline-grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--text)]';

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={status === 'authenticated' ? saved : undefined}
      aria-busy={pending || undefined}
      onClick={(event) => onClick(event.currentTarget)}
      className={className}
    >
      <Heart aria-hidden size={16} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
