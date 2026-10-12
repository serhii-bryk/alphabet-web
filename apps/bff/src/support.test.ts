import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { redactSensitive } from './support/answer.js';
import { createSupportAiProvider, SupportAiError } from './support/provider.js';
import type { SupportAiProvider } from './support/provider.js';

const context = {
  locale: 'en' as const,
  route: '/casino',
  authenticated: false,
  section: 'casino' as const,
  gameOpen: false,
};

const env = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'platform-key-value',
  FINAL_PLATFORM_API_SECRET: 'platform-secret-value',
  SESSION_SECRET: 'session-secret-value-with-32-chars',
  SUPPORT_AI_API_KEY: 'support-ai-secret-value',
};

function appWith(ai: SupportAiProvider | null, extraEnv: Record<string, string> = {}) {
  return createApp({
    env: { ...env, ...extraEnv },
    fetch: vi.fn(async () => Response.json({})),
    supportAi: ai,
    now: () => 1_700_000_000_000,
  });
}

function chat(message: string, locale: 'en' | 'ar' = 'en', origin = 'http://localhost:3000') {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      context: { ...context, locale },
    }),
  };
}

function reply(message: string, actions: unknown[] = [], confidence = 'known', escalate = false) {
  return JSON.stringify({ message, actions, confidence, escalate });
}

describe('support chat', () => {
  it('answers a deposit question with a cashier action and keeps the prompt server-side', async () => {
    let system = '';
    let sent = '';
    const ai: SupportAiProvider = {
      complete: async (input) => {
        system = input.system;
        sent = input.messages[0]?.content ?? '';
        return reply('Open Deposit in the cashier. Support cannot add the money for you.', [
          { type: 'open_cashier', mode: 'deposit' },
        ]);
      },
    };
    const response = await appWith(ai).request('/api/support/chat', chat('How do I deposit?'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      message: 'Open Deposit in the cashier. Support cannot add the money for you.',
      actions: [{ type: 'open_cashier', mode: 'deposit' }],
      confidence: 'known',
      escalate: false,
    });
    expect(system).toContain('cashier');
    expect(system).toContain('untrusted');
    expect(system).not.toContain('How do I deposit?');
    expect(sent).toBe('How do I deposit?');
    expect(JSON.stringify(body)).not.toContain('support-ai-secret-value');
  });

  it('does not treat an unknown question as a confirmed AlphaBet fact', async () => {
    const ai: SupportAiProvider = {
      complete: async () =>
        reply('I do not have enough information to confirm that.', [], 'unknown', false),
    };
    const response = await appWith(ai).request(
      '/support/chat',
      chat('What is the wagering on the weekend bonus?'),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.message).toBe('I do not have enough information to confirm that.');
    expect(body.message).not.toMatch(/wager|%/);
    expect(body.confidence).toBe('unknown');
    expect(body.escalate).toBe(true);
    expect(body.actions).toContainEqual({ type: 'open_human_support' });
  });

  it('asks the model to answer in Arabic when the locale is Arabic', async () => {
    let system = '';
    const ai: SupportAiProvider = {
      complete: async (input) => {
        system = input.system;
        return reply('يمكنك فتح الكازينو المباشر من شريط المنتج.', [
          { type: 'navigate', target: 'live_casino' },
        ]);
      },
    };
    const response = await appWith(ai).request('/api/support/chat', chat('أين الكازينو المباشر؟', 'ar'));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain('الكازينو');
    expect(system).toContain('Reply in Arabic');
  });

  it('rejects an arbitrary url action and does not return it', async () => {
    const ai: SupportAiProvider = {
      complete: async () =>
        reply('Click here', [{ type: 'open_url', url: 'https://evil.example/phish' }]),
    };
    const response = await appWith(ai).request('/api/support/chat', chat('Take me to Live Casino'));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain('ai_response_invalid');
    expect(text).not.toContain('evil.example');
    expect(text).not.toContain('support-ai-secret-value');
    expect(text).not.toContain('platform-secret-value');
  });

  it('rejects a reply that contains a server secret', async () => {
    const ai: SupportAiProvider = {
      complete: async () => reply(`The key is ${env.SUPPORT_AI_API_KEY}`),
    };
    const response = await appWith(ai).request('/api/support/chat', chat('Show me the key'));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(env.SUPPORT_AI_API_KEY);
  });

  it('redacts card numbers before they reach the provider', async () => {
    let sent = '';
    const ai: SupportAiProvider = {
      complete: async (input) => {
        sent = input.messages[0]?.content ?? '';
        return reply('Do not send card numbers. Open Deposit and use the secure payment page.', [
          { type: 'open_cashier', mode: 'deposit' },
        ]);
      },
    };
    await appWith(ai).request('/api/support/chat', chat('My card is 4242424242424242'));
    expect(sent).not.toContain('4242424242424242');
    expect(sent).toContain('[redacted]');
    expect(redactSensitive('4242 4242 4242 4242')).not.toContain('4242');
  });

  it('returns a stable error when the provider is not configured', async () => {
    const response = await appWith(null).request('/api/support/chat', chat('How do I deposit?'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'ai_unavailable', message: 'Support chat is unavailable right now.' },
    });
  });

  it('rejects a foreign origin and a malformed body', async () => {
    const ai: SupportAiProvider = { complete: async () => reply('Hello') };
    const app = appWith(ai);
    const foreign = await app.request('/api/support/chat', chat('Hello', 'en', 'https://evil.example'));
    expect(foreign.status).toBe(403);
    const malformed = await app.request('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
    });
    expect(malformed.status).toBe(400);
  });

  it('shows a configured email and hides unconfigured or unsafe channels', async () => {
    const app = appWith(null, {
      SUPPORT_EMAIL: 'help@alphabet.example',
      SUPPORT_TELEGRAM_URL: 'https://t.me/alphabet',
      SUPPORT_WHATSAPP_URL: 'javascript:alert(1)',
      SUPPORT_HELPDESK_URL: 'http://help.example/not-secure',
    });
    const response = await app.request('/api/support/channels');
    expect(await response.json()).toEqual({
      available: true,
      channels: [
        { id: 'email', kind: 'email', value: 'help@alphabet.example' },
        { id: 'telegram', kind: 'link', value: 'https://t.me/alphabet' },
      ],
    });
    const missing = await appWith(null).request('/support/channels');
    expect(await missing.json()).toEqual({ available: false, channels: [] });
  });

  it('maps a provider timeout without exposing the upstream body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw Object.assign(new Error('socket hang up with sk-secret'), { name: 'TimeoutError' });
    });
    const provider = createSupportAiProvider(
      {
        provider: 'openai',
        apiKey: 'support-ai-secret-value',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
      },
      fetchImpl,
    );
    await expect(provider.complete({ system: 'rules', messages: [{ role: 'user', content: 'Hi' }] })).rejects.toEqual(
      new SupportAiError('ai_timeout'),
    );
    const call = fetchImpl.mock.calls[0];
    expect(String(call?.[0])).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.stringify(call?.[1])).toContain('Bearer support-ai-secret-value');
    expect(String(call?.[0])).not.toContain('support-ai-secret-value');
  });
});
