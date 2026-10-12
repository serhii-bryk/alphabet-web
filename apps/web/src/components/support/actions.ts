import {
  supportNavigateTargets,
  type SupportAction,
  type SupportChatResponse,
  type SupportConfidence,
  type SupportNavigateTarget,
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
};

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
  if (!Array.isArray(value.actions) || value.actions.length > 3) return null;
  const actions: SupportAction[] = [];
  for (const item of value.actions) {
    const action = parseSupportAction(item);
    if (!action) return null;
    actions.push(action);
  }
  if (!isConfidence(value.confidence) || typeof value.escalate !== 'boolean') return null;
  return { message, actions, confidence: value.confidence, escalate: value.escalate };
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

function isConfidence(value: unknown): value is SupportConfidence {
  return value === 'known' || value === 'general' || value === 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
