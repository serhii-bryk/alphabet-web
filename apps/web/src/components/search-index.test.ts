import { describe, expect, it } from 'vitest';
import type { CatalogCategory, CatalogProvider } from '@brand/contracts';
import {
  buildSiteSearchDocuments,
  categoryDestination,
  collectSearchGroups,
  normalizeSearchText,
  primaryLaunchMode,
  providerDestination,
  searchQueryLength,
  type SiteSearchLabels,
} from './search-index';

const labels: SiteSearchLabels = {
  casino: 'Casino',
  live: 'Live Casino',
  sports: 'Sports',
  promotions: 'Promotions',
  search: 'Search',
  journal: 'Journal',
  support: 'Support',
  responsible: 'Responsible gaming',
  terms: 'Terms',
  privacy: 'Privacy',
  favorites: 'Favorites',
  recent: 'Recently Played',
  most: 'Most Played',
  account: 'Account',
  register: 'Create account',
  games: 'Games',
  providers: 'Providers',
  liveTables: 'Studio tables',
  journalNotes: 'Journal',
  journalLobby: 'How the lobby is arranged',
  journalLive: 'What live play feels like',
  profile: 'Profile',
  balance: 'Balance',
  welcomeTitle: 'Welcome on the floor',
  welcomeBody: 'A first-session highlight for new players.',
  weekendTitle: 'Weekend live rooms',
  weekendBody: 'Tables we want in front of you.',
  journalPromoTitle: 'Journal drops',
  journalPromoBody: 'When a new room lands, the note shows up in the journal.',
};

describe('search text', () => {
  it('folds Arabic diacritics, alef variants, and teh marbuta', () => {
    expect(normalizeSearchText('إمارة')).toBe('اماره');
    expect(normalizeSearchText('مَكْتَبَة')).toBe('مكتبه');
    expect(searchQueryLength('ا')).toBe(1);
    expect(searchQueryLength('كازينو')).toBe(6);
  });
});

describe('site search documents', () => {
  it('hides register from signed-in players and account sections from guests', () => {
    const guest = buildSiteSearchDocuments(labels, 'guest');
    const member = buildSiteSearchDocuments(labels, 'authenticated');
    const pending = buildSiteSearchDocuments(labels, 'pending');
    expect(guest.some((item) => item.id === 'page-register')).toBe(true);
    expect(member.some((item) => item.id === 'page-register')).toBe(false);
    expect(pending.some((item) => item.id === 'page-register')).toBe(false);
    expect(member.some((item) => item.id === 'section-account-balance')).toBe(true);
    expect(guest.some((item) => item.id === 'section-account-profile')).toBe(false);
  });

  it('finds Arabic aliases, promotions, and limits each group', () => {
    const site = buildSiteSearchDocuments(labels, 'guest');
    const arabic = collectSearchGroups({
      site,
      categories: [],
      providers: [],
      query: 'كازينو',
      floors: { casino: 'Casino', live: 'Live Casino' },
      providerLabel: 'Providers',
    });
    expect(arabic.find((group) => group.group === 'pages')?.items.some((item) => item.id === 'page-casino')).toBe(true);

    const promo = collectSearchGroups({
      site,
      categories: [],
      providers: [],
      query: 'weekend',
      floors: { casino: 'Casino', live: 'Live Casino' },
      providerLabel: 'Providers',
    });
    expect(promo.find((group) => group.group === 'promotions')?.items[0]?.href).toBe('/promotions/weekend-live');

    const many = Array.from({ length: 10 }, (_, index) => ({
      id: `page-${index}`,
      group: 'pages' as const,
      kind: 'page' as const,
      title: `Room ${index}`,
      subtitle: '',
      href: '/casino',
      keywords: [],
    }));
    const limited = collectSearchGroups({
      site: many,
      categories: [],
      providers: [],
      query: 'room',
      floors: { casino: 'Casino', live: 'Live Casino' },
      providerLabel: 'Providers',
    });
    expect(limited[0]?.items).toHaveLength(6);
  });
});

describe('catalog destinations', () => {
  it('routes live categories and grouped providers onto existing filters', () => {
    const live = { id: '1', slug: 'live-blackjack', name: 'Blackjack', parentId: null } satisfies CatalogCategory;
    const tables = { id: '2', slug: 'tables', fullSlug: 'live/tables', name: 'Tables', parentId: null } satisfies CatalogCategory;
    const slots = { id: '3', slug: 'slots', name: 'Slots', parentId: null } satisfies CatalogCategory;
    expect(categoryDestination(live)).toBe('/live-casino?category=live-blackjack');
    expect(categoryDestination(tables)).toBe('/live-casino?category=tables');
    expect(categoryDestination(slots)).toBe('/casino?category=slots');

    const provider = {
      id: '7',
      code: 'studio',
      name: 'Studio',
      displayName: 'Studio Games',
      groupedCode: 'studio-group',
    } satisfies CatalogProvider;
    expect(providerDestination(provider)).toBe('/casino?group=studio-group');
  });

  it('shows one result for studios that share a grouped code', () => {
    const providers: CatalogProvider[] = [
      { id: '1', code: 'a', name: 'Studio A', displayName: 'Studio Games', groupedCode: 'studio' },
      { id: '2', code: 'b', name: 'Studio B', displayName: 'Studio Games', groupedCode: 'studio' },
    ];
    const groups = collectSearchGroups({
      site: [],
      categories: [],
      providers,
      query: 'studio',
      floors: { casino: 'Casino', live: 'Live Casino' },
      providerLabel: 'Providers',
    });
    expect(groups.find((group) => group.group === 'providers')?.items).toHaveLength(1);
  });
});

describe('primaryLaunchMode', () => {
  const game = {
    id: '1',
    slug: 'one',
    title: 'One',
    kind: 'casino' as const,
    imageUrl: null,
    provider: null,
    categories: [],
    demoPlayEnabled: true,
    active: true,
    rtp: null,
    volatility: null,
    gameType: null,
    listedAt: null,
  };

  it('keeps the existing real, demo, and sign-in choice', () => {
    expect(primaryLaunchMode(game, true)).toBe('real');
    expect(primaryLaunchMode(game, false)).toBe('demo');
    expect(primaryLaunchMode({ ...game, demoPlayEnabled: false }, false)).toBe('real');
  });
});
