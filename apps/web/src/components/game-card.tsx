'use client';
import { useState, type ReactNode } from 'react';
import { LoaderCircle, Play } from 'lucide-react';
import type { CatalogGame, GameLaunchMode } from '@brand/contracts';
import { Badge } from './ui';
import { useGameLauncher } from './game-launch/provider';

const palettes=[['#273c75','#fbc531'],['#6b2d5c','#f4c7a1'],['#155e75','#fbbf24'],['#394867','#9ba4b5'],['#31572c','#ecf39e'],['#5f0f40','#fb8b24']];
function artIndex(game: CatalogGame) {
  return [...game.id].reduce((total, character) => total + character.charCodeAt(0), 0);
}

export function GameArt({ game }: { game:CatalogGame }) {
  const art=artIndex(game);
  const colors=palettes[art%palettes.length] ?? palettes[0]!;
  return <svg viewBox="0 0 320 220" role="img" aria-label={`${game.title} artwork`} className="aspect-[3/4] w-full" style={{background:colors[0]}}><circle cx={50+(art*23)%180} cy={45+(art*19)%90} r={28+(art%3)*13} fill={colors[1]} opacity=".94"/><path d={`M0 ${170-(art%20)*3} L${100+(art%15)*8} ${75+(art%20)*2} L220 ${190-(art%20)*5} L320 90 V220 H0Z`} fill="#fff" opacity=".15"/><rect x={190-(art%4)*12} y="32" width="72" height="72" rx={art%2?36:10} fill="none" stroke={colors[1]} strokeWidth="10"/><text x="22" y="198" fill="#fff" fontSize="21" fontWeight="800" letterSpacing="1">{game.title.toUpperCase().slice(0,16)}</text></svg>;
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

const playIconClass =
  'pointer-events-none absolute left-1/2 top-[38%] inline-flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100';

function CardVisual({ game, children }: { game: CatalogGame; children?: ReactNode }) {
  return (
    <span className="relative block transition duration-200 group-focus-within:-translate-y-1 group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-1)]">
      <GameThumbnail game={game} />
      {game.kind === 'live' && <span className="absolute left-3 top-3"><Badge tone="positive">live</Badge></span>}
      {children}
    </span>
  );
}

function CardMeta({ game, children }: { game: CatalogGame; children?: ReactNode }) {
  const provider = game.provider?.displayName || game.provider?.name || 'Independent';
  return (
    <div className="pointer-events-none relative z-10 -mt-12 bg-gradient-to-t from-black/88 via-black/72 to-transparent px-2.5 pb-2.5 pt-8">
      <h3 className="pointer-events-auto truncate text-sm font-black leading-tight text-white drop-shadow-sm">{game.title}</h3>
      <p className="truncate text-[11px] font-semibold text-white/78">{provider}</p>
      {children ? <div className="pointer-events-auto">{children}</div> : null}
    </div>
  );
}

const cardClass = {
  rail: 'group relative w-[154px] shrink-0 snap-start overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] sm:w-[184px]',
  grid: 'group relative min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]',
};

const secondaryActionClass =
  'relative z-10 mt-1.5 inline-flex min-h-7 items-center rounded-[var(--radius-pill)] bg-white/16 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-white/28 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100';

function LaunchCard({
  game,
  mode,
  layout,
  children,
}: {
  game: CatalogGame;
  mode: GameLaunchMode;
  layout: 'rail' | 'grid';
  children?: ReactNode;
}) {
  const { launch, launchingGameId, launchingGameIds = [] } = useGameLauncher();
  const launching = launchingGameIds.includes(game.id) || launchingGameId === game.id;
  return (
    <article className={cardClass[layout]}>
      <button
        type="button"
        aria-label={mode === 'demo' ? `Play ${game.title} demo` : `Play ${game.title}`}
        aria-busy={launching || undefined}
        onClick={(event) => launch(game, event.currentTarget, mode)}
        className="block w-full cursor-pointer rounded-[var(--radius-md)] text-start"
      >
        <CardVisual game={game}>
          {launching ? (
            <span className="absolute inset-1.5 grid place-items-center rounded-[calc(var(--radius-md)-2px)] bg-black/55">
              <LoaderCircle aria-hidden size={26} className="animate-spin text-white motion-reduce:animate-none" />
            </span>
          ) : (
            <span aria-hidden className={playIconClass}>
              <Play size={14} fill="currentColor" />
            </span>
          )}
        </CardVisual>
      </button>
      <CardMeta game={game}>{children}</CardMeta>
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

export function GameCard({ game, layout = 'rail' }: { game: CatalogGame; layout?: 'rail' | 'grid' }) {
  const { launch, authenticated } = useGameLauncher();
  if (authenticated) {
    return (
      <LaunchCard game={game} mode="real" layout={layout}>
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
      <LaunchCard game={game} mode="demo" layout={layout}>
        <SecondaryAction label={`Play ${game.title}`} onClick={(opener) => launch(game, opener, 'real')}>
          Play
        </SecondaryAction>
      </LaunchCard>
    );
  }
  return (
    <article className={cardClass[layout]}>
      <CardVisual game={game} />
      <CardMeta game={game}>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/80">Demo unavailable</p>
        <SecondaryAction label={`Sign in to play ${game.title}`} onClick={(opener) => launch(game, opener, 'real')}>
          Sign in
        </SecondaryAction>
      </CardMeta>
    </article>
  );
}
