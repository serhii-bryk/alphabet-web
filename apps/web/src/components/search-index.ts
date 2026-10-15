import type { CatalogCategory, CatalogGame, CatalogProvider, GameLaunchMode } from '@brand/contracts';
import { promotionEntries, promotionHref } from '@/data/promotions';

export const GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_GAME_LIMIT = 8;

const GROUP_LIMITS = {
  promotions: 3,
  pages: 6,
  categories: 4,
  providers: 4,
} as const;

const BROWSE_IDS = ['page-casino', 'page-live', 'page-sports', 'page-promotions', 'page-support'] as const;

const ARABIC_MARKS = /[\u0640\u064B-\u0652\u0670\u06D6-\u06ED]/g;

export type SearchAudience = 'guest' | 'authenticated' | 'pending';
export type SearchGroup = keyof typeof GROUP_LIMITS;
export type SearchKind = 'page' | 'section' | 'promotion' | 'category' | 'provider';

export interface SearchDocument {
  id: string;
  group: SearchGroup;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  keywords: string[];
}

export interface SiteSearchLabels {
  casino: string;
  live: string;
  sports: string;
  promotions: string;
  search: string;
  journal: string;
  support: string;
  responsible: string;
  terms: string;
  privacy: string;
  favorites: string;
  recent: string;
  most: string;
  account: string;
  register: string;
  games: string;
  providers: string;
  liveTables: string;
  journalNotes: string;
  journalLobby: string;
  journalLive: string;
  profile: string;
  balance: string;
  welcomeTitle: string;
  welcomeBody: string;
  weekendTitle: string;
  weekendBody: string;
  journalPromoTitle: string;
  journalPromoBody: string;
}

export interface SearchGroupResult {
  group: SearchGroup;
  items: SearchDocument[];
}

export function getNextFocusIndex(focusableCount: number, currentIndex: number, backwards: boolean) {
  if (focusableCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= focusableCount) {
    return backwards ? focusableCount - 1 : 0;
  }
  return (currentIndex + (backwards ? -1 : 1) + focusableCount) % focusableCount;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function searchQueryLength(value: string): number {
  return [...normalizeSearchText(value)].length;
}

export function primaryLaunchMode(game: CatalogGame, authenticated: boolean): GameLaunchMode {
  if (authenticated) return 'real';
  return game.demoPlayEnabled ? 'demo' : 'real';
}

export function categoryDestination(category: CatalogCategory): string {
  const slug = category.slug.toLowerCase();
  const full = (category.fullSlug ?? '').toLowerCase();
  const live = slug.startsWith('live') || full.includes('live');
  const path = live ? '/live-casino' : '/casino';
  return `${path}?category=${encodeURIComponent(category.slug)}`;
}

export function providerDestination(provider: CatalogProvider): string {
  if (provider.groupedCode) return `/casino?group=${encodeURIComponent(provider.groupedCode)}`;
  return `/casino?provider=${encodeURIComponent(provider.code)}`;
}

function document(
  id: string,
  group: SearchGroup,
  kind: SearchKind,
  title: string,
  subtitle: string,
  href: string,
  keywords: string[],
): SearchDocument {
  return { id, group, kind, title, subtitle, href, keywords };
}

export function buildSiteSearchDocuments(labels: SiteSearchLabels, audience: SearchAudience): SearchDocument[] {
  const pages: SearchDocument[] = [
    document('page-casino', 'pages', 'page', labels.casino, '', '/casino', ['casino', 'slots', 'كازينو', 'سلوت']),
    document('page-live', 'pages', 'page', labels.live, '', '/live-casino', ['live casino', 'live', 'الكازينو المباشر', 'مباشر']),
    document('page-sports', 'pages', 'page', labels.sports, '', '/sports', ['sports', 'sportsbook', 'odds', 'fixtures', 'رياضة', 'الرياضة']),
    document('page-promotions', 'pages', 'page', labels.promotions, '', '/promotions', ['promotions', 'offers', 'العروض', 'عروض']),
    document('page-search', 'pages', 'page', labels.search, '', '/search', ['search', 'بحث']),
    document('page-journal', 'pages', 'page', labels.journal, '', '/journal', ['journal', 'notes', 'المجلة']),
    document('page-support', 'pages', 'page', labels.support, '', '/support', ['support', 'help', 'الدعم', 'مساعدة']),
    document('page-responsible', 'pages', 'page', labels.responsible, '', '/responsible-gaming', ['responsible gaming', 'play safe', 'اللعب المسؤول']),
    document('page-terms', 'pages', 'page', labels.terms, '', '/terms', ['terms', 'الشروط']),
    document('page-privacy', 'pages', 'page', labels.privacy, '', '/privacy', ['privacy', 'الخصوصية']),
    document('page-favorites', 'pages', 'page', labels.favorites, '', '/favorites', ['favorites', 'المفضلة']),
    document('page-recent', 'pages', 'page', labels.recent, '', '/recently-played', ['recently played', 'recent', 'لعبت مؤخرا']),
    document('page-most', 'pages', 'page', labels.most, '', '/most-played', ['most played', 'الأكثر لعبا']),
    document('page-account', 'pages', 'page', labels.account, '', '/account', ['account', 'الحساب']),
  ];
  if (audience === 'guest') {
    pages.push(document('page-register', 'pages', 'page', labels.register, '', '/register', ['register', 'create account', 'sign up', 'إنشاء حساب', 'تسجيل']));
  }

  const sections: SearchDocument[] = [
    document('section-casino-games', 'pages', 'section', labels.games, labels.casino, '/casino#games', ['games', 'الألعاب']),
    document('section-casino-providers', 'pages', 'section', labels.providers, labels.casino, '/casino#providers', ['providers', 'studios', 'المزودون']),
    document('section-casino-live', 'pages', 'section', labels.liveTables, labels.casino, '/casino#live-discovery', ['live tables', 'studio', 'طاولات']),
    document('section-casino-journal', 'pages', 'section', labels.journalNotes, labels.casino, '/casino#journal', ['journal', 'المجلة']),
    document('section-live-games', 'pages', 'section', labels.games, labels.live, '/live-casino#games', ['games', 'الألعاب', 'live']),
    document('section-live-providers', 'pages', 'section', labels.providers, labels.live, '/live-casino#providers', ['providers', 'المزودون', 'live']),
    document('section-journal-lobby', 'pages', 'section', labels.journalLobby, labels.journal, '/journal#journal-lobby', ['lobby', 'الصفحة الرئيسية']),
    document('section-journal-live', 'pages', 'section', labels.journalLive, labels.journal, '/journal#journal-live', ['live play', 'اللعب المباشر']),
  ];
  if (audience === 'authenticated') {
    sections.push(
      document('section-account-balance', 'pages', 'section', labels.balance, labels.account, '/account#account-balance', ['balance', 'deposit', 'withdraw', 'رصيد', 'إيداع', 'سحب']),
      document('section-account-profile', 'pages', 'section', labels.profile, labels.account, '/account#account-profile', ['profile', 'email', 'الملف', 'البريد']),
    );
  }

  const promotions: Array<[string, string, string]> = [
    ['welcome', labels.welcomeTitle, labels.welcomeBody],
    ['weekend-live', labels.weekendTitle, labels.weekendBody],
    ['journal-drops', labels.journalPromoTitle, labels.journalPromoBody],
  ];
  const promoAliases: Record<string, string[]> = {
    welcome: ['welcome', 'ترحيب في الصالة', 'welcome on the floor'],
    'weekend-live': ['weekend', 'غرف مباشرة في نهاية الأسبوع', 'weekend live rooms'],
    'journal-drops': ['journal drops', 'مواد المجلة', 'journal'],
  };
  const promotionDocuments = promotionEntries.map((entry, index) => {
    const copy = promotions[index] ?? ['', '', ''];
    return document(
      `promotion-${entry.slug}`,
      'promotions',
      'promotion',
      copy[1],
      copy[2],
      promotionHref(entry.slug),
      ['promotion', 'عرض', ...(promoAliases[entry.slug] ?? [])],
    );
  });

  return [...promotionDocuments, ...pages, ...sections];
}

export function browseDocuments(documents: SearchDocument[]): SearchDocument[] {
  return BROWSE_IDS.flatMap((id) => {
    const found = documents.find((item) => item.id === id);
    return found ? [found] : [];
  });
}

function scoreDocument(item: SearchDocument, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = normalizeSearchText(item.title);
  const haystack = normalizeSearchText([item.title, item.subtitle, ...item.keywords].filter(Boolean).join(' '));
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  const query = tokens.join(' ');
  if (title === query) return 400;
  if (title.startsWith(query)) return 300;
  if (title.includes(query)) return 200;
  return 100;
}

function matchDocuments(documents: SearchDocument[], query: string, limit: number): SearchDocument[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  return documents
    .map((item) => ({ item, score: scoreDocument(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function uniqueProviders(providers: CatalogProvider[]): CatalogProvider[] {
  const seen = new Set<string>();
  const unique: CatalogProvider[] = [];
  for (const provider of providers) {
    const key = (provider.groupedCode || provider.code || provider.id).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(provider);
  }
  return unique;
}

function categoryDocuments(categories: CatalogCategory[], floors: { casino: string; live: string }): SearchDocument[] {
  const seen = new Set<string>();
  const documents: SearchDocument[] = [];
  for (const category of categories) {
    const slug = category.slug.trim();
    const name = category.name.trim();
    if (!slug || !name || seen.has(slug)) continue;
    seen.add(slug);
    const href = categoryDestination(category);
    documents.push(
      document(
        `category-${slug}`,
        'categories',
        'category',
        name,
        href.startsWith('/live-casino') ? floors.live : floors.casino,
        href,
        [slug, category.fullSlug ?? '', 'category', 'تصنيف'],
      ),
    );
  }
  return documents;
}

function providerDocuments(providers: CatalogProvider[], providerLabel: string): SearchDocument[] {
  return uniqueProviders(providers).flatMap((provider) => {
    const title = (provider.displayName || provider.name).trim();
    if (!title) return [];
    return [
      document(
        `provider-${provider.groupedCode || provider.code || provider.id}`,
        'providers',
        'provider',
        title,
        providerLabel,
        providerDestination(provider),
        [provider.name, provider.code, provider.groupedCode ?? '', 'provider', 'مزود'],
      ),
    ];
  });
}

export function collectSearchGroups(input: {
  site: SearchDocument[];
  categories: CatalogCategory[];
  providers: CatalogProvider[];
  query: string;
  floors: { casino: string; live: string };
  providerLabel: string;
}): SearchGroupResult[] {
  const grouped: SearchGroupResult[] = [
    { group: 'promotions', items: matchDocuments(input.site.filter((item) => item.group === 'promotions'), input.query, GROUP_LIMITS.promotions) },
    { group: 'pages', items: matchDocuments(input.site.filter((item) => item.group === 'pages'), input.query, GROUP_LIMITS.pages) },
    { group: 'categories', items: matchDocuments(categoryDocuments(input.categories, input.floors), input.query, GROUP_LIMITS.categories) },
    { group: 'providers', items: matchDocuments(providerDocuments(input.providers, input.providerLabel), input.query, GROUP_LIMITS.providers) },
  ];
  return grouped.filter((group) => group.items.length > 0);
}
