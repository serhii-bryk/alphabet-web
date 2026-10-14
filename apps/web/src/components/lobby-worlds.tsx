'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandBanner } from './brand-banner';
import { openCasinoGameSection } from './game-launch/casino-nav';

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
        const className = `product-world product-world-${room.id}`;
        const copy = (
          <>
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
          </>
        );
        if (room.href === '/casino' && pathname === '/casino') {
          return (
            <a
              key={room.id}
              href="#games"
              aria-current="page"
              className={className}
              onClick={(event) => {
                event.preventDefault();
                openCasinoGameSection(pathname, () => undefined);
              }}
            >
              {copy}
            </a>
          );
        }
        return (
          <Link key={room.id} href={room.href} aria-current={current ? 'page' : undefined} className={className}>
            {copy}
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
  if (id === 'slots') {
    return <BrandBanner variant="slots" scrim="none" priority sizes={cardSizes} />;
  }
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
