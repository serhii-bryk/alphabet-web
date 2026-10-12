import Image from 'next/image';

const sources = {
  casino: '/banners/casino.jpg',
  sports: '/banners/sports.jpg',
  promo: '/banners/promo.jpg',
  journal: '/banners/journal.jpg',
} as const;

export type BannerVariant = keyof typeof sources;

export function BrandBanner({
  variant,
  priority = false,
  sizes,
}: {
  variant: BannerVariant;
  priority?: boolean;
  sizes: string;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Image
        src={sources[variant]}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover object-[72%_center] rtl:object-[28%_center]"
      />
      <div className="banner-scrim absolute inset-0" />
    </div>
  );
}
