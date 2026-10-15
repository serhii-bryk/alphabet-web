export const promotionEntries = [
  { slug: 'welcome', titleKey: 'promoWelcomeTitle', bodyKey: 'promoWelcomeBody' },
  { slug: 'weekend-live', titleKey: 'promoWeekendTitle', bodyKey: 'promoWeekendBody' },
  { slug: 'journal-drops', titleKey: 'promoJournalTitle', bodyKey: 'promoJournalBody' },
] as const;

export type PromotionSlug = (typeof promotionEntries)[number]['slug'];
export type PromotionEntry = (typeof promotionEntries)[number];

export function promotionBySlug(slug: string): PromotionEntry | undefined {
  return promotionEntries.find((entry) => entry.slug === slug);
}

export function promotionHref(slug: PromotionSlug): string {
  return `/promotions/${slug}`;
}
