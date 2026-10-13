import Image from 'next/image';

const sources = {
  casino: '/banners/casino.jpg',
  sports: '/banners/sports.jpg',
  promo: '/banners/promo.jpg',
  journal: '/banners/journal.jpg',
} as const;

const focus = {
  casino: 'object-[76%_36%] rtl:object-[24%_36%]',
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
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-banner={variant}>
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
