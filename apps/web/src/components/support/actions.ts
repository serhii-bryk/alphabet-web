import {
  supportFaqIds,
  supportFillFields,
  supportNavigateTargets,
  supportPromotionSlugs,
  type SupportAction,
  type SupportFillField,
  type SupportCatalogGame,
  type SupportChatResponse,
  type SupportConfidence,
  type SupportFaqId,
  type SupportNavigateTarget,
  type SupportPromotionSlug,
  type SupportReplySource,
} from '@brand/contracts';

const targets = new Set<string>(supportNavigateTargets);

const paths: Record<SupportNavigateTarget, string> = {
  casino: '/casino',
  live_casino: '/live-casino',
  sports: '/sports',
  promotions: '/promotions',
  search: '/search',
  account: '/account',
  responsible_gaming: '/responsible-gaming',
  support: '/support',
  journal: '/journal',
  favorites: '/favorites',
  recently_played: '/recently-played',
};

export function visibleSupportActions(actions: SupportAction[], authenticated: boolean): SupportAction[] {
  if (authenticated) return actions.filter((action) => action.type !== 'open_registration');
  const guestActions = actions.map((action): SupportAction =>
    action.type === 'open_cashier' ? { type: 'open_login' } : action,
  );
  return guestActions.filter(
    (action, index) => action.type !== 'open_login' || guestActions.findIndex((item) => item.type === 'open_login') === index,
  );
}

export function supportActionHref(action: Extract<SupportAction, { type: 'navigate' }>): string {
  const path = paths[action.target];
  if (!action.search) return path;
  const params = new URLSearchParams();
  params.set(action.target === 'search' ? 'q' : 'search', action.search);
  return `${path}?${params.toString()}`;
}

export function parseSupportAction(value: unknown): SupportAction | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (value.type === 'navigate') {
    if (!keys.every((key) => key === 'type' || key === 'target' || key === 'search')) return null;
    if (typeof value.target !== 'string' || !targets.has(value.target)) return null;
    const search = value.search;
    if (search !== undefined && !isSafeSearch(search)) return null;
    return {
      type: 'navigate',
      target: value.target as SupportNavigateTarget,
      ...(typeof search === 'string' ? { search: search.trim() } : {}),
    };
  }
  if (value.type === 'open_cashier') {
    if (keys.length !== 2 || (value.mode !== 'deposit' && value.mode !== 'withdraw')) return null;
    return { type: 'open_cashier', mode: value.mode };
  }
  if (value.type === 'scroll_to') {
    if (keys.length !== 2 || value.section !== 'games') return null;
    return { type: 'scroll_to', section: 'games' };
  }
  if (value.type === 'open_promotion') {
    if (keys.length !== 2 || !isPromotionSlug(value.slug)) return null;
    return { type: 'open_promotion', slug: value.slug };
  }
  if (value.type === 'open_game') {
    if (keys.length !== 2 || typeof value.gameId !== 'string' || !/^[1-9]\d{0,11}$/.test(value.gameId)) return null;
    return { type: 'open_game', gameId: value.gameId };
  }
  if (value.type === 'fill_field') {
    if (keys.length !== 3 || !isFillField(value.field) || !isFillValue(value.value)) return null;
    return { type: 'fill_field', field: value.field, value: value.value.trim() };
  }
  if (keys.length !== 1) return null;
  if (value.type === 'open_login' || value.type === 'open_registration' || value.type === 'open_human_support') {
    return { type: value.type };
  }
  return null;
}

export function parseSupportReply(value: unknown): SupportChatResponse | null {
  if (!isRecord(value)) return null;
  if (typeof value.message !== 'string') return null;
  const message = sanitizeSupportMessage(value.message);
  if (!message) return null;
  if (!Array.isArray(value.actions) || value.actions.length > 8) return null;
  const actions: SupportAction[] = [];
  for (const item of value.actions) {
    const action = parseSupportAction(item);
    if (!action) return null;
    actions.push(action);
  }
  if (!isConfidence(value.confidence) || typeof value.escalate !== 'boolean') return null;
  const games = parseGames(value.games);
  if (value.games !== undefined && !games) return null;
  return {
    message,
    actions,
    confidence: value.confidence,
    escalate: value.escalate,
    source: isSource(value.source) ? value.source : 'model',
    autoRun: value.autoRun === true,
    ...(games ? { games } : {}),
    ...(parseRelated(value.related) ? { related: parseRelated(value.related) } : {}),
  };
}

export function sanitizeSupportMessage(value: string): string | null {
  const message = value
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!message || message.length > 2000) return null;
  return message;
}

function isFillField(value: unknown): value is SupportFillField {
  return typeof value === 'string' && (supportFillFields as readonly string[]).includes(value);
}

function isFillValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    !trimmed.includes('\\') &&
    !trimmed.includes('//') &&
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  );
}

function isSafeSearch(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const search = value.trim();
  return (
    search.length > 0 &&
    search.length <= 80 &&
    !/^[a-z][a-z0-9+.-]*:/i.test(search) &&
    !search.includes('//') &&
    !search.includes('\\')
  );
}

function isSource(value: unknown): value is SupportReplySource {
  return value === 'faq' || value === 'rules' || value === 'assistant' || value === 'model';
}

function isPromotionSlug(value: unknown): value is SupportPromotionSlug {
  return typeof value === 'string' && (supportPromotionSlugs as readonly string[]).includes(value);
}

function parseRelated(value: unknown): SupportFaqId[] | undefined {
  if (!Array.isArray(value) || value.length > 3) return undefined;
  const related: SupportFaqId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(supportFaqIds as readonly string[]).includes(item)) return undefined;
    related.push(item as SupportFaqId);
  }
  return related;
}

function parseGames(value: unknown): SupportCatalogGame[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 8) return null;
  const games: SupportCatalogGame[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== 'string' || !/^[1-9]\d{0,11}$/.test(item.id)) return null;
    if (typeof item.slug !== 'string' || typeof item.title !== 'string') return null;
    if (item.kind !== 'casino' && item.kind !== 'live') return null;
    if (item.imageUrl !== null && typeof item.imageUrl !== 'string') return null;
    if (typeof item.demoPlayEnabled !== 'boolean' || typeof item.active !== 'boolean') return null;
    games.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      kind: item.kind,
      imageUrl: item.imageUrl,
      demoPlayEnabled: item.demoPlayEnabled,
      active: item.active,
    });
  }
  return games;
}

function isConfidence(value: unknown): value is SupportConfidence {
  return value === 'known' || value === 'general' || value === 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
