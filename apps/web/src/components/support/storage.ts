import type { SupportAction, SupportCatalogGame, SupportChatErrorCode, SupportChatMode, SupportFaqId } from '@brand/contracts';
import { supportFaqIds } from '@brand/contracts';
import { parseSupportAction } from './actions';

const storageKey = 'alphabet.supportChat.v1';

export interface SupportTranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: SupportAction[];
  games?: SupportCatalogGame[];
  related?: SupportFaqId[];
  escalate?: boolean;
  errorCode?: SupportChatErrorCode | 'network';
  retryText?: string;
}

export interface SupportTranscript {
  open: boolean;
  mode: SupportChatMode;
  draft: string;
  topicsExpanded?: boolean;
  messages: SupportTranscriptItem[];
}

export function redactSensitive(text: string): string {
  return text
    .replace(/(?:\d[ -]?){13,19}/g, '[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|bearer\s+\S{8,})/gi, '[redacted]');
}

export function readSupportSession(): SupportTranscript | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return parseTranscript(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSupportSession(value: SupportTranscript) {
  try {
    const messages = value.messages.slice(-8).map((item) => ({
      ...item,
      content: redactSensitive(item.content).slice(0, 500),
      retryText: item.retryText ? redactSensitive(item.retryText).slice(0, 500) : undefined,
      actions: item.actions?.filter((action) => parseSupportAction(action)),
      games: item.games?.slice(0, 8),
      related: item.related?.slice(0, 3),
    }));
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        open: value.open,
        mode: value.mode,
        draft: redactSensitive(value.draft).slice(0, 500),
        topicsExpanded: value.topicsExpanded === true,
        messages,
      }),
    );
  } catch {
    // The conversation still lives in memory for this page.
  }
}

export function clearSupportSession() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}

export function buildHandoffSummary(input: {
  issue: string;
  locale: string;
  route: string;
  account: string;
  game: string;
}): string {
  const issue = redactSensitive(input.issue).replace(/\s+/g, ' ').trim().slice(0, 280);
  return [
    'Issue:',
    issue || 'Not specified',
    '',
    'Context:',
    `- locale: ${input.locale}`,
    `- route: ${input.route}`,
    `- account: ${input.account}`,
    `- game: ${input.game}`,
  ].join('\n');
}

function parseTranscript(value: unknown): SupportTranscript | null {
  if (!isRecord(value) || typeof value.open !== 'boolean' || !Array.isArray(value.messages)) return null;
  const messages: SupportTranscriptItem[] = [];
  for (const item of value.messages.slice(-8)) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant')) return null;
    if (typeof item.id !== 'string' || typeof item.content !== 'string') return null;
    const actions = Array.isArray(item.actions)
      ? item.actions.flatMap((action) => {
          const parsed = parseSupportAction(action);
          return parsed ? [parsed] : [];
        })
      : undefined;
    messages.push({
      id: item.id.slice(0, 80),
      role: item.role,
      content: redactSensitive(item.content).slice(0, 500),
      actions,
      games: parseStoredGames(item.games),
      related: parseStoredRelated(item.related),
      escalate: item.escalate === true,
      errorCode: isErrorCode(item.errorCode) ? item.errorCode : undefined,
      retryText: typeof item.retryText === 'string' ? redactSensitive(item.retryText).slice(0, 500) : undefined,
    });
  }
  return {
    open: value.open,
    mode: value.mode === 'assistant' ? 'assistant' : 'support',
    draft: typeof value.draft === 'string' ? redactSensitive(value.draft).slice(0, 500) : '',
    topicsExpanded: value.topicsExpanded === true,
    messages,
  };
}

function parseStoredGames(value: unknown): SupportCatalogGame[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const games: SupportCatalogGame[] = [];
  for (const item of value.slice(0, 8)) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.slug !== 'string' || typeof item.title !== 'string') continue;
    if (item.kind !== 'casino' && item.kind !== 'live') continue;
    if (typeof item.demoPlayEnabled !== 'boolean' || typeof item.active !== 'boolean') continue;
    games.push({
      id: item.id,
      slug: item.slug,
      title: item.title.slice(0, 120),
      kind: item.kind,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
      demoPlayEnabled: item.demoPlayEnabled,
      active: item.active,
    });
  }
  return games.length > 0 ? games : undefined;
}

function parseStoredRelated(value: unknown): SupportFaqId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const related = value.filter((item): item is SupportFaqId => typeof item === 'string' && (supportFaqIds as readonly string[]).includes(item));
  return related.length > 0 ? related.slice(0, 3) : undefined;
}

function isErrorCode(value: unknown): value is SupportTranscriptItem['errorCode'] {
  return (
    value === 'invalid_support_request' ||
    value === 'ai_unavailable' ||
    value === 'ai_timeout' ||
    value === 'ai_response_invalid' ||
    value === 'support_unavailable' ||
    value === 'rate_limited' ||
    value === 'budget_exhausted' ||
    value === 'network'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
