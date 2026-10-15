import type {
  SupportChannel,
  SupportChannelsResponse,
  SupportChatErrorCode,
  SupportChatRequest,
  SupportChatResponse,
} from '@brand/contracts';
import { hasErrorCode, isRecord, readJson } from './browser-json';
import { parseSupportReply } from '@/components/support/actions';

const errorCodes: SupportChatErrorCode[] = [
  'invalid_support_request',
  'ai_unavailable',
  'ai_timeout',
  'ai_response_invalid',
  'support_unavailable',
  'rate_limited',
  'budget_exhausted',
];

export class SupportRequestError extends Error {
  readonly code: SupportChatErrorCode | 'network';

  constructor(code: SupportChatErrorCode | 'network') {
    super(code);
    this.name = 'SupportRequestError';
    this.code = code;
  }
}

export async function sendSupportChat(request: SupportChatRequest, signal?: AbortSignal): Promise<SupportChatResponse> {
  let response: Response;
  try {
    response = await fetch('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new SupportRequestError('network');
  }
  const body = await readJson(response);
  if (!response.ok) throw new SupportRequestError(errorCode(body));
  const reply = parseSupportReply(body);
  if (!reply) throw new SupportRequestError('ai_response_invalid');
  return reply;
}

export async function fetchSupportChannels(signal?: AbortSignal): Promise<SupportChannelsResponse> {
  try {
    const response = await fetch('/api/support/channels', { signal, headers: { accept: 'application/json' } });
    const body = await readJson(response);
    const channels = parseChannels(body);
    if (!response.ok || !channels) return { available: false, channels: [] };
    return channels;
  } catch {
    return { available: false, channels: [] };
  }
}

function errorCode(body: unknown): SupportChatErrorCode | 'network' {
  const code = errorCodes.find((item) => hasErrorCode(body, item));
  return code ?? 'support_unavailable';
}

function parseChannels(value: unknown): SupportChannelsResponse | null {
  if (!isRecord(value) || !Array.isArray(value.channels)) return null;
  if (value.channels.length > 4) return null;
  const channels: SupportChannel[] = [];
  for (const item of value.channels) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.value !== 'string') return null;
    if (item.value.length > 300) return null;
    if (item.id === 'email' && item.kind === 'email') {
      channels.push({ id: 'email', kind: 'email', value: item.value });
      continue;
    }
    if (
      (item.id === 'telegram' || item.id === 'whatsapp' || item.id === 'helpdesk') &&
      item.kind === 'link'
    ) {
      channels.push({ id: item.id, kind: 'link', value: item.value });
      continue;
    }
    return null;
  }
  return { available: channels.length > 0, channels };
}
