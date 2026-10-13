'use client';

import { useId } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandBanner } from './brand-banner';

const cardSizes = '(min-width: 1100px) 30vw, (min-width: 640px) 48vw, 84vw';

const rooms = [
  {
    id: 'slots',
    href: '/casino',
    labelKey: 'casinoLabel',
    headlineKey: 'casinoHeadline',
  },
  {
    id: 'live',
    href: '/live-casino',
    labelKey: 'liveLabel',
    headlineKey: 'liveHeadline',
  },
  {
    id: 'sports',
    href: '/sports',
    labelKey: 'sportsLabel',
    headlineKey: 'sportsHeadline',
  },
] as const;

export function LobbyProductWorlds({ pathname }: { pathname: '/casino' | '/live-casino' }) {
  const t = useTranslations('worlds');

  return (
    <section aria-label={t('label')} data-product-worlds="" className="product-worlds scrollbar-none">
      {rooms.map((room) => {
        const current =
          (room.href === '/casino' && pathname === '/casino') ||
          (room.href === '/live-casino' && pathname === '/live-casino');
        return (
          <Link
            key={room.id}
            href={room.href}
            aria-current={current ? 'page' : undefined}
            className={`product-world product-world-${room.id}`}
          >
            <span className="product-world-media">
              <RoomArt id={room.id} />
              <span className="product-world-wash" />
            </span>
            <span className="product-world-shade" aria-hidden />
            <span className="product-world-copy">
              <span className="product-world-label">{t(room.labelKey)}</span>
              <span className="product-world-headline">{t(room.headlineKey)}</span>
              <span className="product-world-cta">
                {t('explore')}
                <ArrowRight aria-hidden size={16} />
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}

export function LobbyLiveDiscovery() {
  const t = useTranslations('worlds');
  return (
    <section id="live-discovery" tabIndex={-1} aria-label={t('liveLabel')} className="lobby-anchor live-discovery">
      <Link href="/live-casino" className="live-discovery-link">
        <span className="product-world-media">
          <BrandBanner
            variant="casino"
            scrim="none"
            position="object-[84%_34%] rtl:object-[16%_34%]"
            sizes="(min-width: 1100px) 70vw, 100vw"
          />
          <span className="product-world-wash" />
        </span>
        <span className="live-discovery-shade" aria-hidden />
        <span className="live-discovery-copy">
          <span>
            <span className="product-world-label">{t('liveLabel')}</span>
            <span className="mt-1 block text-xl font-black tracking-tight">{t('liveTitle')}</span>
            <span className="mt-1 block max-w-md text-sm leading-relaxed text-[var(--muted)]">{t('liveBody')}</span>
          </span>
          <span className="product-world-cta">
            {t('liveCta')}
            <ArrowRight aria-hidden size={16} />
          </span>
        </span>
      </Link>
    </section>
  );
}

function RoomArt({ id }: { id: (typeof rooms)[number]['id'] }) {
  if (id === 'slots') return <SlotsArt />;
  if (id === 'live') {
    return (
      <BrandBanner
        variant="casino"
        scrim="none"
        priority
        position="object-[86%_32%] rtl:object-[14%_32%]"
        sizes={cardSizes}
      />
    );
  }
  return <BrandBanner variant="sports" scrim="none" priority sizes={cardSizes} />;
}

function SlotsArt() {
  const raw = useId().replace(/:/g, '');
  const glow = `${raw}-glow`;
  const gold = `${raw}-gold`;
  const cabinet = `${raw}-cabinet`;
  const reel = `${raw}-reel`;
  return (
    <svg className="product-world-art" viewBox="0 0 640 780" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={glow} cx="62%" cy="24%" r="62%">
          <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.55" />
          <stop offset="38%" stopColor="#2450c8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#070b16" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1c2" />
          <stop offset="42%" stopColor="#e4b45a" />
          <stop offset="100%" stopColor="#8c5a18" />
        </linearGradient>
        <linearGradient id={cabinet} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3c2c16" />
          <stop offset="38%" stopColor="#1a130c" />
          <stop offset="100%" stopColor="#0c0907" />
        </linearGradient>
        <linearGradient id={reel} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#243044" />
          <stop offset="50%" stopColor="#0c121c" />
          <stop offset="100%" stopColor="#243044" />
        </linearGradient>
      </defs>
      <rect width="640" height="780" fill="#070b16" />
      <rect width="640" height="780" fill={`url(#${glow})`} />
      <circle cx="92" cy="128" r="74" fill="#4d7dff" opacity="0.18" />
      <circle cx="168" cy="250" r="28" fill="#f5c16c" opacity="0.22" />
      <circle cx="70" cy="360" r="46" fill="#8eb0ff" opacity="0.12" />
      <ellipse cx="340" cy="690" rx="250" ry="46" fill="#05070d" opacity="0.55" />
      <g transform="translate(168 86)">
        <rect x="118" y="18" width="196" height="28" rx="8" fill={`url(#${gold})`} />
        <rect x="36" y="40" width="292" height="430" rx="28" fill={`url(#${cabinet})`} stroke={`url(#${gold})`} strokeWidth="7" />
        <rect x="62" y="68" width="240" height="52" rx="12" fill="#140f0a" stroke={`url(#${gold})`} strokeWidth="3" />
        <g fill={`url(#${gold})`}>
          <circle cx="130" cy="94" r="7" />
          <circle cx="182" cy="94" r="7" />
          <circle cx="234" cy="94" r="7" />
        </g>
        <rect x="62" y="140" width="240" height="196" rx="16" fill="#05070d" />
        <Reel x={74} y={152} reel={reel} gold={gold} symbol="seven" />
        <Reel x={150} y={152} reel={reel} gold={gold} symbol="diamond" />
        <Reel x={226} y={152} reel={reel} gold={gold} symbol="bar" />
        <rect x="62" y="354" width="240" height="18" rx="9" fill={`url(#${gold})`} />
        <circle cx="182" cy="420" r="28" fill="#1a120c" stroke={`url(#${gold})`} strokeWidth="4" />
        <circle cx="182" cy="420" r="10" fill={`url(#${gold})`} />
        <path d="M328 150c28 8 48 36 48 70" fill="none" stroke={`url(#${gold})`} strokeWidth="8" strokeLinecap="round" />
        <circle cx="392" cy="132" r="18" fill={`url(#${gold})`} />
      </g>
      <g fill={`url(#${gold})`}>
        <ellipse cx="214" cy="612" rx="34" ry="12" />
        <ellipse cx="214" cy="600" rx="34" ry="12" />
        <ellipse cx="250" cy="628" rx="28" ry="10" />
        <ellipse cx="250" cy="618" rx="28" ry="10" />
        <ellipse cx="430" cy="620" rx="30" ry="11" />
        <ellipse cx="430" cy="608" rx="30" ry="11" />
      </g>
    </svg>
  );
}

function Reel({
  x,
  y,
  reel,
  gold,
  symbol,
}: {
  x: number;
  y: number;
  reel: string;
  gold: string;
  symbol: 'seven' | 'diamond' | 'bar';
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="64" height="172" rx="10" fill={`url(#${reel})`} stroke="#d7b56a" strokeWidth="2" />
      {symbol === 'seven' && (
        <text x="32" y="102" textAnchor="middle" fill={`url(#${gold})`} fontSize="54" fontWeight="800" fontFamily="Inter, sans-serif">
          7
        </text>
      )}
      {symbol === 'diamond' && <polygon points="32,48 52,86 32,124 12,86" fill={`url(#${gold})`} />}
      {symbol === 'bar' && (
        <g fill={`url(#${gold})`}>
          <rect x="12" y="62" width="40" height="10" rx="2" />
          <rect x="12" y="80" width="40" height="10" rx="2" />
          <rect x="12" y="98" width="40" height="10" rx="2" />
        </g>
      )}
    </g>
  );
}
