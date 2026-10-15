'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';

const sources = {
  casino: '/banners/casino.jpg',
  slots: '/banners/slots.jpg',
  sports: '/banners/sports.jpg',
  promo: '/banners/promo.jpg',
  journal: '/banners/journal.jpg',
} as const;

const focus = {
  casino: 'object-[76%_36%] rtl:object-[24%_36%]',
  slots: 'object-[62%_18%]',
  sports: 'object-[64%_40%] rtl:object-[36%_40%]',
  promo: 'object-[74%_center] rtl:object-[26%_center]',
  journal: 'object-[70%_center] rtl:object-[30%_center]',
} as const;

export type BannerVariant = keyof typeof sources;

export function BrandBanner({
  variant,
  priority = false,
  sizes,
  scrim = 'side',
  position,
}: {
  variant: BannerVariant;
  priority?: boolean;
  sizes: string;
  scrim?: 'side' | 'stage' | 'none';
  position?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = frameRef.current;
    const host = node?.closest('.lobby-hero, .page-hero');
    if (!(host instanceof HTMLElement) || host.closest('a')) return;
    if (host.dataset.bannerMotion === 'on') return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduced.matches) return;

    host.dataset.bannerMotion = 'on';
    let frame = 0;
    let clientX = 0;
    let clientY = 0;
    const paint = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      host.style.setProperty('--banner-x', x.toFixed(3));
      host.style.setProperty('--banner-y', y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      clientX = event.clientX;
      clientY = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(paint);
    };
    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      host.style.setProperty('--banner-x', '0');
      host.style.setProperty('--banner-y', '0');
    };
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', reset);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', reset);
      if (frame) window.cancelAnimationFrame(frame);
      delete host.dataset.bannerMotion;
      host.style.removeProperty('--banner-x');
      host.style.removeProperty('--banner-y');
    };
  }, []);

  return (
    <div ref={frameRef} aria-hidden className="pointer-events-none absolute inset-0" data-banner={variant}>
      <Image
        src={sources[variant]}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className={`banner-photo object-cover ${position ?? focus[variant]}`}
      />
      <div className="banner-light absolute inset-0" />
      {scrim !== 'none' && (
        <div className={`absolute inset-0 ${scrim === 'stage' ? 'banner-scrim-stage' : 'banner-scrim'}`} />
      )}
    </div>
  );
}
