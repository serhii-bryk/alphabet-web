import type { SupportChannel, SupportChannelId, SupportChannelsResponse } from '@brand/contracts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const channelEnv: Record<SupportChannelId, string> = {
  email: 'SUPPORT_EMAIL',
  telegram: 'SUPPORT_TELEGRAM_URL',
  whatsapp: 'SUPPORT_WHATSAPP_URL',
  helpdesk: 'SUPPORT_HELPDESK_URL',
};

export function readSupportChannels(env: Record<string, string | undefined>): SupportChannelsResponse {
  const channels: SupportChannel[] = [];
  const email = readEmail(env.SUPPORT_EMAIL);
  if (email) channels.push({ id: 'email', kind: 'email', value: email });
  for (const id of ['telegram', 'whatsapp', 'helpdesk'] as const) {
    const href = readHttpsUrl(env[channelEnv[id]]);
    if (href) channels.push({ id, kind: 'link', value: href });
  }
  return { available: channels.length > 0, channels };
}

export const supportChannelEnvNames = Object.values(channelEnv);

function readEmail(value: string | undefined): string | undefined {
  const email = value?.trim() ?? '';
  if (!email || email.length > 254 || !emailPattern.test(email)) return undefined;
  return email;
}

function readHttpsUrl(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? '';
  if (!raw || raw.length > 300) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
