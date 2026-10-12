'use client';

import type { CatalogGame } from '@brand/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { formatListedAt, gameFacts, type GameFact } from './game-facts';

function factValue(fact: GameFact, t: ReturnType<typeof useTranslations<'workspace'>>, locale: string) {
  if (fact.id === 'format') return fact.value === 'live' ? t('formatLive') : t('formatCasino');
  if (fact.id === 'demo' || fact.id === 'real') {
    return fact.value === 'available' ? t('available') : t('unavailable');
  }
  if (fact.id === 'listed') return formatListedAt(fact.value, locale);
  return fact.value;
}

function factLabel(fact: GameFact, t: ReturnType<typeof useTranslations<'workspace'>>) {
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

export function GameInfo({ game }: { game: CatalogGame }) {
  const t = useTranslations('workspace');
  const locale = useLocale();
  const provider = game.provider?.displayName || game.provider?.name;
  const rows = gameFacts(game).flatMap((fact) => {
    const value = factValue(fact, t, locale);
    return value ? [{ id: fact.id, label: factLabel(fact, t), value }] : [];
  });

  return (
    <section aria-label={t('infoTitle')} className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <div className="mx-auto flex max-w-3xl gap-4">
        {game.imageUrl && (
          <div className="hidden w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] sm:block">
            <GameThumbnail game={game} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black">{game.title}</p>
          {provider && <p className="truncate text-sm text-[var(--muted)]">{provider}</p>}
          <h3 className="mb-2 mt-3 text-sm font-bold">{t('infoTitle')}</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-[var(--muted)]">{row.label}</dt>
                <dd className="text-end font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
