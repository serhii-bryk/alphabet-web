'use client';
import { useState, type ReactNode } from 'react';
import type { CatalogGame, GameLaunchMode } from '@brand/contracts';
import { useTranslations } from 'next-intl';
import { AlphaBetLoader } from './alphabet-loader';
import { Badge } from './ui';
import { useGameLauncher } from './game-launch/provider';
import { FavoriteButton } from './personalization/favorite-button';

const palettes = [
  ['#172554', '#f5c16c'],
  ['#3b0764', '#f0b429'],
  ['#083344', '#7dd3fc'],
  ['#1e1b4b', '#c4b5fd'],
  ['#052e16', '#d9f99d'],
  ['#431407', '#fdba74'],
];
function artIndex(game: CatalogGame) {
  return [...game.id].reduce((total, character) => total + character.charCodeAt(0), 0);
}

export function GameArt({ game }: { game: CatalogGame }) {
  const art = artIndex(game);
  const colors = palettes[art % palettes.length] ?? palettes[0]!;
  const tilt = (art % 9) - 4;
  return (
    <svg viewBox="0 0 300 400" role="img" aria-label={`${game.title} artwork`} className="aspect-[3/4] w-full">
      <rect width="300" height="400" fill={colors[0]} />
      <circle cx="228" cy="118" r="108" fill={colors[1]} opacity="0.28" />
      <circle cx="64" cy="310" r="84" fill="#fff" opacity="0.06" />
      <g transform={`rotate(${tilt} 118 214)`} fill="none" stroke={colors[1]} strokeWidth="8" opacity="0.88">
        <rect x="72" y="148" width="92" height="132" rx="12" />
        <rect x="86" y="168" width="64" height="8" rx="4" fill={colors[1]} stroke="none" opacity="0.7" />
      </g>
      <circle cx="198" cy="196" r="38" fill={colors[1]} />
      <circle cx="198" cy="196" r="16" fill={colors[0]} />
      <circle cx="214" cy="286" r="22" fill="none" stroke={colors[1]} strokeWidth="7" />
    </svg>
  );
}

function safeImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? imageUrl : null;
  } catch {
    return null;
  }
}

export function GameThumbnail({ game }: { game: CatalogGame }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = safeImageUrl(game.imageUrl);
  if (!imageUrl || failed) return <GameArt game={game} />;

  return (
    // Catalog imagery can come from multiple provider CDNs, so a native image avoids unsafe wildcard config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={`${game.title} game thumbnail`}
      loading="lazy"
      decoding="async"
      className="aspect-[3/4] w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function LaunchGlyph() {
  return (
    <span aria-hidden className="game-card-play pointer-events-none absolute grid place-items-center rounded-full text-white">
      <span className="game-card-play-halo" />
      <svg viewBox="0 0 24 24" className="game-card-play-glyph" fill="none">
        <path d="M9 6.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L10.2 6.1A.8.8 0 0 0 9 6.8Z" fill="currentColor" />
        <path d="M5.2 4.6v3.2M3.6 6.2h3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="game-card-play-spark" />
      </svg>
    </span>
  );
}

function CardVisual({ game, children }: { game: CatalogGame; children?: ReactNode }) {
  return (
    <span className="game-card-media relative block">
      <GameThumbnail game={game} />
      <span aria-hidden className="game-card-scrim" />
      <span aria-hidden className="game-card-shade" />
      {game.kind === 'live' && <span className="absolute start-2.5 top-2.5"><Badge tone="positive">live</Badge></span>}
      {children}
    </span>
  );
}

function CardMeta({ game, children }: { game: CatalogGame; children?: ReactNode }) {
  const provider = game.provider?.displayName || game.provider?.name || 'Independent';
  return (
    <div className="game-card-meta pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-8">
      <h3 className="game-card-title line-clamp-2">{game.title}</h3>
      <p className="game-card-provider mt-1 truncate">{provider}</p>
      {children ? <div className="pointer-events-auto">{children}</div> : null}
    </div>
  );
}

const cardClass = {
  rail: 'game-card group relative w-[168px] shrink-0 snap-start rounded-[var(--radius-lg)] border border-white/12 bg-[#0c1016] sm:w-[196px]',
  grid: 'game-card group relative min-w-0 rounded-[var(--radius-lg)] border border-white/12 bg-[#0c1016]',
};

const secondaryActionClass =
  'game-card-action relative z-10 mt-1.5 inline-flex min-h-7 items-center rounded-[var(--radius-pill)] border border-white/25 bg-white/14 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_6px_16px_-8px_rgb(0_0_0/0.8)] hover:bg-white/28';

function RoundsLabel({ count }: { count: number }) {
  const t = useTranslations('personalization');
  return <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-wider text-white/75">{t('rounds', { count })}</p>;
}

function LaunchCard({
  game,
  mode,
  layout,
  showRounds = false,
  children,
}: {
  game: CatalogGame;
  mode: GameLaunchMode;
  layout: 'rail' | 'grid';
  showRounds?: boolean;
  children?: ReactNode;
}) {
  const { launch, launchingGameId, launchingGameIds = [] } = useGameLauncher();
  const launching = launchingGameIds.includes(game.id) || launchingGameId === game.id;
  return (
    <article className={cardClass[layout]}>
      <FavoriteButton game={game} />
      <button
        type="button"
        aria-label={mode === 'demo' ? `Play ${game.title} demo` : `Play ${game.title}`}
        aria-busy={launching || undefined}
        onClick={(event) => launch(game, event.currentTarget, mode)}
        className="game-card-launch block w-full cursor-pointer rounded-[var(--radius-md)] text-start"
      >
        <CardVisual game={game}>
          {launching ? (
            <span className="fade-enter absolute inset-1.5 grid place-items-center rounded-[calc(var(--radius-md)-2px)] bg-black/55">
              <AlphaBetLoader size="md" className="text-white" />
            </span>
          ) : (
            <LaunchGlyph />
          )}
        </CardVisual>
      </button>
      <CardMeta game={game}>{children}</CardMeta>
      {showRounds && typeof game.rounds === 'number' && <RoundsLabel count={game.rounds} />}
    </article>
  );
}

function SecondaryAction({ label, children, onClick }: { label: string; children: ReactNode; onClick: (opener: HTMLElement) => void }) {
  return (
    <button type="button" aria-label={label} onClick={(event) => onClick(event.currentTarget)} className={secondaryActionClass}>
      {children}
    </button>
  );
}

export function GameCard({
  game,
  layout = 'rail',
  showRounds = false,
}: {
  game: CatalogGame;
  layout?: 'rail' | 'grid';
  showRounds?: boolean;
}) {
  const { launch, authenticated } = useGameLauncher();
  if (authenticated) {
    return (
      <LaunchCard game={game} mode="real" layout={layout} showRounds={showRounds}>
        {game.demoPlayEnabled && (
          <SecondaryAction label={`Play ${game.title} demo`} onClick={(opener) => launch(game, opener, 'demo')}>
            Free play
          </SecondaryAction>
        )}
      </LaunchCard>
    );
  }
  if (game.demoPlayEnabled) {
    return (
      <LaunchCard game={game} mode="demo" layout={layout} showRounds={showRounds}>
        <SecondaryAction label={`Play ${game.title}`} onClick={(opener) => launch(game, opener, 'real')}>
          <svg aria-hidden viewBox="0 0 10 10" className="me-1 size-2 fill-current"><path d="M2 1.2v7.6L8.6 5z" /></svg>
          Play
        </SecondaryAction>
      </LaunchCard>
    );
  }
  return (
    <article className={cardClass[layout]}>
      <FavoriteButton game={game} />
      <CardVisual game={game} />
      <CardMeta game={game}>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/80">Demo unavailable</p>
        <SecondaryAction label={`Sign in to play ${game.title}`} onClick={(opener) => launch(game, opener, 'real')}>
          Sign in
        </SecondaryAction>
      </CardMeta>
      {showRounds && typeof game.rounds === 'number' && <RoundsLabel count={game.rounds} />}
    </article>
  );
}
