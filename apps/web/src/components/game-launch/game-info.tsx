'use client';

import type { CatalogGame } from '@brand/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { FavoriteButton } from '../personalization/favorite-button';
import { formatListedAt, gameFacts, gameTags, type GameFact, type GameTag } from './game-facts';

type WorkspaceT = ReturnType<typeof useTranslations<'workspace'>>;

function factValue(fact: GameFact, t: WorkspaceT, locale: string) {
  if (fact.id === 'format') return fact.value === 'live' ? t('formatLive') : t('formatCasino');
  if (fact.id === 'demo' || fact.id === 'real') {
    return fact.value === 'available' ? t('available') : t('unavailable');
  }
  if (fact.id === 'listed') return formatListedAt(fact.value, locale);
  return fact.value;
}

function factLabel(fact: GameFact, t: WorkspaceT) {
  switch (fact.id) {
    case 'provider':
      return t('provider');
    case 'categories':
      return t('category');
    case 'format':
      return t('format');
    case 'gameType':
      return t('gameType');
    case 'rtp':
      return t('rtp');
    case 'volatility':
      return t('volatility');
    case 'demo':
      return t('demoPlay');
    case 'real':
      return t('realPlay');
    case 'listed':
      return t('listed');
  }
}

function tagLabel(tag: GameTag, t: WorkspaceT) {
  switch (tag.id) {
    case 'rtp':
      return `${t('rtp')} ${tag.value}`;
    case 'volatility':
      return t('volatilityTag', { value: tag.value });
    case 'format':
      return tag.value === 'live' ? t('formatLive') : t('formatCasino');
    case 'category':
      return tag.value;
    case 'demo':
      return t('demoAvailable');
  }
}

export function GameInfo({ game, id, compact = false }: { game: CatalogGame; id?: string; compact?: boolean }) {
  const t = useTranslations('workspace');
  const locale = useLocale();
  const provider = game.provider?.displayName || game.provider?.name;
  const rows = gameFacts(game).flatMap((fact) => {
    if (fact.id === 'provider') return [];
    const value = factValue(fact, t, locale);
    return value ? [{ id: fact.id, label: factLabel(fact, t), value }] : [];
  });
  const tags = gameTags(game);

  if (compact) {
    return (
      <section aria-label={t('infoTitle')} className="game-info shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-3 py-2">
        {provider && <p className="truncate text-[10px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">{provider}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-black">{game.title}</p>
          <FavoriteButton game={game} variant="info" />
        </div>
        {tags.length > 0 && (
          <ul aria-label={t('highlights')} className="scrollbar-none mt-1.5 flex gap-1.5 overflow-x-auto">
            {tags.map((tag) => (
              <li key={`${tag.id}-${tag.value}`} className={`game-info-tag shrink-0 ${tag.id === 'rtp' || tag.id === 'demo' ? 'game-info-tag-accent' : ''}`}>
                {tagLabel(tag, t)}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section id={id} aria-label={t('infoTitle')} className="game-info shrink-0 scroll-mt-16 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 sm:flex-row sm:items-start">
        <div className="hidden w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] shadow-[var(--shadow-1)] sm:block">
          <GameThumbnail game={game} />
        </div>
        <div className="min-w-0 flex-1">
          {provider && (
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="game-provider-mark">{provider.trim().charAt(0).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">{t('provider')}</p>
                <p className="truncate text-sm font-bold">{provider}</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-start justify-between gap-3">
            <p className="text-xl font-black leading-tight tracking-tight sm:text-2xl">{game.title}</p>
            <FavoriteButton game={game} variant="info" />
          </div>
          {tags.length > 0 && (
            <ul aria-label={t('highlights')} className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={`${tag.id}-${tag.value}`} className={`game-info-tag ${tag.id === 'rtp' || tag.id === 'demo' ? 'game-info-tag-accent' : ''}`}>
                  {tagLabel(tag, t)}
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">{t('infoTitle')}</h3>
              <dl className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] sm:grid-cols-2">
                {rows.map((row) => (
                  <div key={row.id} className="game-info-row flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm">
                    <dt className="text-[var(--muted)]">{row.label}</dt>
                    <dd className="text-end font-semibold">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
