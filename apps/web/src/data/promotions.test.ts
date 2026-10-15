import { describe, expect, it } from 'vitest';
import { promotionBySlug, promotionHref } from './promotions';

describe('promotions', () => {
  it('resolves the three existing previews and nothing else', () => {
    expect(promotionBySlug('welcome')?.titleKey).toBe('promoWelcomeTitle');
    expect(promotionHref('weekend-live')).toBe('/promotions/weekend-live');
    expect(promotionBySlug('journal-drops')?.bodyKey).toBe('promoJournalBody');
    expect(promotionBySlug('bonus-500')).toBeUndefined();
  });
});
