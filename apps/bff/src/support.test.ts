import { describe, expect, it, vi } from 'vitest';
import type { CatalogUseCases } from '@brand/domain';
import { createApp } from './app.js';
import { redactSensitive } from './support/answer.js';
import { readAiChatLimits, liveOpenAiStatus } from './support/limits.js';
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

function appWith(ai: SupportAiProvider | null, extraEnv: Record<string, string> = {}, catalog?: CatalogUseCases) {
  return createApp({
    env: { ...env, ...extraEnv },
    fetch: vi.fn(async () => Response.json({})),
    supportAi: ai,
    now: () => 1_700_000_000_000,
    ...(catalog ? { catalog } : {}),
  });
}

const enabled = { AI_CHAT_ENABLED: 'true' };

function chat(
  message: string,
  locale: 'en' | 'ar' = 'en',
  origin = 'http://localhost:3000',
  mode: 'support' | 'assistant' = 'support',
) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
      context: { ...context, locale },
      mode,
    }),
  };
}

function reply(message: string, actions: unknown[] = [], confidence = 'known', escalate = false) {
  return JSON.stringify({ message, actions, confidence, escalate });
}

describe('support chat', () => {
  it('answers a deposit topic without calling the model', async () => {
    const complete = vi.fn();
    const ai: SupportAiProvider = { complete };
    const response = await appWith(ai, enabled).request('/api/support/chat', chat('How do I deposit?'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe('faq');
    expect(body.autoRun).toBe(false);
    expect(body.message).toContain('cashier');
    expect(body.actions).toContainEqual({ type: 'open_cashier', mode: 'deposit' });
    expect(complete).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain('support-ai-secret-value');
  });

  it('answers an in-scope question with one model call and keeps the prompt server-side', async () => {
    let system = '';
    let sent = '';
    const ai: SupportAiProvider = {
      complete: async (input) => {
        system = input.system;
        sent = input.messages[0]?.content ?? '';
        return reply('Theme and language are in the side menu.', [{ type: 'navigate', target: 'casino' }]);
      },
    };
    const response = await appWith(ai, enabled).request('/api/support/chat', chat('Where is the theme switch?'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBe('Theme and language are in the side menu.');
    expect(body.source).toBe('model');
    expect(body.autoRun).toBe(false);
    expect(system).toContain('untrusted');
    expect(system).not.toContain('Where is the theme switch?');
    expect(sent).toBe('Where is the theme switch?');
    expect(JSON.stringify(body)).not.toContain('support-ai-secret-value');
  });

  it('does not treat an unknown question as a confirmed AlphaBet fact', async () => {
    const ai: SupportAiProvider = {
      complete: async () =>
        reply('I do not have enough information to confirm that.', [], 'unknown', false),
    };
    const response = await appWith(ai, enabled).request(
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
    const response = await appWith(ai, enabled).request('/api/support/chat', chat('أين مفتاح المظهر؟', 'ar'));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain('الكازينو');
    expect(system).toContain('Reply in Arabic');
  });

  it('rejects an arbitrary url action and does not return it', async () => {
    const ai: SupportAiProvider = {
      complete: async () =>
        reply('Click here', [{ type: 'open_url', url: 'https://evil.example/phish' }]),
    };
    const response = await appWith(ai, enabled).request('/api/support/chat', chat('Where is the theme switch?'));
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
    const response = await appWith(ai, enabled).request('/api/support/chat', chat('Show me the key'));
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
    await appWith(ai, enabled).request('/api/support/chat', chat('My card is 4242424242424242'));
    expect(sent).not.toContain('4242424242424242');
    expect(sent).toContain('[redacted]');
    expect(redactSensitive('4242 4242 4242 4242')).not.toContain('4242');
  });

  it('returns a stable error when the provider is not configured', async () => {
    const response = await appWith(null).request('/api/support/chat', chat('Where is the theme switch?'));
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
        apiKey: 'support-ai-secret-value',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        maxOutputTokens: 250,
        timeoutMs: 8000,
      },
      fetchImpl,
    );
    await expect(
      provider.complete({
        system: 'rules',
        messages: [{ role: 'user', content: 'Hi' }],
        maxOutputTokens: 250,
        timeoutMs: 8000,
      }),
    ).rejects.toEqual(new SupportAiError('ai_timeout'));
    const call = fetchImpl.mock.calls[0];
    expect(String(call?.[0])).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.stringify(call?.[1])).toContain('Bearer support-ai-secret-value');
    expect(String(call?.[0])).not.toContain('support-ai-secret-value');
    const payload = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
    expect(payload.max_tokens).toBe(250);
    expect(payload.tools).toBeUndefined();
    expect(payload.model).toBe('gpt-4o-mini');
  });

  it('filters out-of-scope, sensitive, and oversized input before the model', async () => {
    const complete = vi.fn();
    const app = appWith({ complete }, enabled);
    const poem = await app.request('/api/support/chat', chat('Write a python script'));
    expect(poem.status).toBe(200);
    expect((await poem.json()).source).toBe('rules');
    const secret = await app.request('/api/support/chat', chat('my password is hunter2'));
    const secretBody = await secret.json();
    expect(secretBody.message).not.toContain('hunter2');
    expect(secretBody.actions).toContainEqual({ type: 'open_human_support' });
    const oversized = await app.request('/api/support/chat', chat('a'.repeat(501)));
    expect(oversized.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps model calls off when the flag or key is missing, including production', async () => {
    const complete = vi.fn();
    const disabled = await appWith({ complete }).request('/api/support/chat', chat('Where is the theme switch?'));
    expect(disabled.status).toBe(503);
    expect(complete).not.toHaveBeenCalled();
    expect(liveOpenAiStatus({ OPENAI_API_KEY: 'sk-live-test-value' })).toBe('disabled');
    expect(liveOpenAiStatus({ AI_CHAT_ENABLED: 'true' })).toBe('missing_key');
    expect(liveOpenAiStatus({ AI_CHAT_ENABLED: 'true', OPENAI_API_KEY: 'sk-live-test-value', NODE_ENV: 'production' })).toBe(
      'production',
    );
    const fetchImpl = vi.fn<typeof fetch>();
    const app = createApp({
      env: { ...env, AI_CHAT_ENABLED: 'true', OPENAI_API_KEY: 'sk-live-test-value', NODE_ENV: 'production' },
      fetch: fetchImpl,
      now: () => 1_700_000_000_000,
    });
    const response = await app.request('/api/support/chat', chat('Where is the theme switch?'));
    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces the hourly limit even when each request starts a new chat', async () => {
    const complete = vi.fn(async () => reply('The side menu has the theme control.'));
    const app = appWith({ complete }, { ...enabled, AI_CHAT_HOURLY_LIMIT: '2' });
    expect((await app.request('/api/support/chat', chat('Where is the theme switch?'))).status).toBe(200);
    expect((await app.request('/api/support/chat', chat('Where is the language switch?'))).status).toBe(200);
    const blocked = await app.request('/api/support/chat', chat('Where is the install prompt?'));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe('rate_limited');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('does not reset the session limit when the same browser starts a new chat', async () => {
    const complete = vi.fn(async () => reply('The side menu has the theme control.'));
    const app = appWith({ complete }, { ...enabled, AI_CHAT_SESSION_LIMIT: '2', AI_CHAT_HOURLY_LIMIT: '10' });
    const first = await app.request('/api/support/chat', chat('Where is the theme switch?'));
    const cookie = scopeCookie(first);
    expect((await app.request('/api/support/chat', withCookie(chat('Where is the language switch?'), cookie))).status).toBe(200);
    const blocked = await app.request('/api/support/chat', withCookie(chat('Where is the install prompt?'), cookie));
    expect(blocked.status).toBe(429);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('stops model calls when the budget cannot cover another maximum request', async () => {
    const complete = vi.fn(async () => reply('The side menu has the theme control.'));
    const response = await appWith({ complete }, {
      ...enabled,
      AI_CHAT_DAILY_BUDGET_USD: '0.0000001',
      AI_CHAT_TOTAL_BUDGET_USD: '0.0000001',
    }).request('/api/support/chat', chat('Where is the theme switch?'));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('budget_exhausted');
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps a timed-out reservation so a later call cannot reuse that budget', async () => {
    const limits = readAiChatLimits({
      AI_CHAT_MAX_INPUT_TOKENS: '1000',
      AI_CHAT_MAX_OUTPUT_TOKENS: '100',
      AI_CHAT_INPUT_USD_PER_MILLION: '1',
      AI_CHAT_OUTPUT_USD_PER_MILLION: '1',
      AI_CHAT_DAILY_BUDGET_USD: '0.0011',
      AI_CHAT_TOTAL_BUDGET_USD: '0.0011',
    });
    expect(limits.dailyBudgetNano).toBe(limits.quoteNano);
    const app = appWith(
      { complete: async () => { throw new SupportAiError('ai_timeout'); } },
      {
        ...enabled,
        AI_CHAT_MAX_INPUT_TOKENS: '1000',
        AI_CHAT_MAX_OUTPUT_TOKENS: '100',
        AI_CHAT_INPUT_USD_PER_MILLION: '1',
        AI_CHAT_OUTPUT_USD_PER_MILLION: '1',
        AI_CHAT_DAILY_BUDGET_USD: '0.0011',
        AI_CHAT_TOTAL_BUDGET_USD: '0.0011',
      },
    );
    expect((await app.request('/api/support/chat', chat('Where is the theme switch?'))).status).toBe(504);
    const blocked = await app.request('/api/support/chat', chat('Where is the language switch?'));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe('budget_exhausted');
  });

  it('rejects a second model call while the concurrency limit is full', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const app = appWith(
      {
        complete: async () => {
          calls += 1;
          await gate;
          return reply('The side menu has the theme control.');
        },
      },
      { ...enabled, AI_CHAT_MAX_CONCURRENT: '1' },
    );
    const first = app.request('/api/support/chat', chat('Where is the theme switch?'));
    await vi.waitFor(() => expect(calls).toBe(1));
    const second = await app.request('/api/support/chat', chat('Where is the language switch?'));
    expect(second.status).toBe(429);
    expect(calls).toBe(1);
    release();
    expect((await first).status).toBe(200);
  });

  it('opens a real catalog game in site assistant without a model call', async () => {
    const complete = vi.fn();
    const response = await appWith({ complete }, enabled, catalogWith([{ id: '12', title: 'Book of Dead' }])).request(
      '/api/support/chat',
      chat('Find Book of Dead', 'en', 'http://localhost:3000', 'assistant'),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.actions).toEqual([{ type: 'open_game', gameId: '12' }]);
    expect(body.autoRun).toBe(true);
    expect(body.games).toEqual([
      expect.objectContaining({ id: '12', title: 'Book of Dead' }),
    ]);
    expect(body.message).toContain('Book of Dead');
    expect(complete).not.toHaveBeenCalled();
  });

  it('replaces an invented game name with the catalog result', async () => {
    const response = await appWith(
      { complete: async () => reply('I opened Fake Game Deluxe', [{ type: 'search_games', query: 'Book of Dead' }]) },
      enabled,
      catalogWith([{ id: '12', title: 'Book of Dead' }]),
    ).request('/api/support/chat', chat('Look up a slot I cannot name', 'en', 'http://localhost:3000', 'assistant'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.message).toContain('Book of Dead');
    expect(body.message).not.toContain('Fake Game Deluxe');
    expect(body.actions).toEqual([{ type: 'open_game', gameId: '12' }]);
  });

  it('rejects a model game id that the server did not look up', async () => {
    const response = await appWith(
      { complete: async () => reply('Opening it', [{ type: 'open_game', gameId: '99' }]) },
      enabled,
    ).request('/api/support/chat', chat('Where is the theme switch?'));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain('ai_response_invalid');
    expect(text).not.toContain('99');
  });

  it('shows the signed-in player balance and ignores a client player id', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) {
        return Response.json({
          profile: { id: 42, email: 'player@example.com', currency: { id: 2, name: 'Euro', code: 'EUR', symbol: '€' } },
          partner_id: 7,
          access_token: 'login-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          sessionID: 'login-access-token',
        });
      }
      if (path.endsWith('/profile')) {
        return Response.json({
          profile: {
            id: 42,
            email: 'player@example.com',
            first_name: 'Test',
            last_name: 'Player',
            currency: { id: 2, name: 'Euro', code: 'EUR', symbol: '€' },
            country: { alpha2: 'MT', name: 'Malta' },
            email_verified: true,
          },
        });
      }
      if (path.endsWith('/balance')) return Response.json({ balance: 12.5, currency: 'EUR', address: 'secret-address' });
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({ env, fetch: fetcher, now: () => 1_700_000_000_000 });
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password: 'correct-horse-battery' }),
    });
    const loginText = await login.text();
    expect(login.status, loginText).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    const response = await app.request(
      '/api/support/chat',
      withCookie(chat('Show my balance', 'en', 'http://localhost:3000', 'assistant'), cookie),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.message).toBe('Your balance is 12.50 EUR.');
    expect(body.message).not.toContain('secret-address');
    expect(JSON.stringify(fetcher.mock.calls.map((call) => String(call[0])))).toContain('/player/42/balance');
    expect(JSON.stringify(fetcher.mock.calls.map((call) => String(call[0])))).not.toContain('/player/99/');
    const spoofed = await app.request('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show my balance' }],
        context,
        mode: 'assistant',
        playerId: '99',
      }),
    });
    expect(spoofed.status).toBe(400);
  });

  it('asks a guest to sign in instead of inventing a balance', async () => {
    const response = await appWith(null).request(
      '/api/support/chat',
      chat('Show my balance', 'en', 'http://localhost:3000', 'assistant'),
    );
    const body = await response.json();
    expect(body.message).toContain('Sign in');
    expect(body.message).not.toMatch(/\d/);
    expect(body.actions).toContainEqual({ type: 'open_login' });
    expect(body.autoRun).toBe(true);
  });

  it('reads a balance from more phrasings without a model call', async () => {
    const complete = vi.fn();
    const guest = await appWith({ complete }, enabled).request(
      '/api/support/chat',
      chat("what's my balance?", 'en', 'http://localhost:3000', 'support'),
    );
    const guestBody = await guest.json();
    expect(guest.status).toBe(200);
    expect(guestBody.actions).toContainEqual({ type: 'open_login' });
    expect(guestBody.message).not.toMatch(/\d/);
    expect(complete).not.toHaveBeenCalled();
  });

  it('fills a deposit amount for a signed-in player and does not submit it', async () => {
    const complete = vi.fn();
    const response = await appWith({ complete }, enabled).request('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Set the deposit amount to 20' }],
        context: { ...context, authenticated: true },
        mode: 'assistant',
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.actions).toEqual([{ type: 'fill_field', field: 'deposit_amount', value: '20' }]);
    expect(body.autoRun).toBe(true);
    expect(body.message).toContain('20');
    expect(body.message.toLowerCase()).toContain('submit');
    expect(complete).not.toHaveBeenCalled();
  });

  it('asks a guest to sign in before filling a withdrawal amount', async () => {
    const response = await appWith(null).request(
      '/api/support/chat',
      chat('withdraw 25', 'en', 'http://localhost:3000', 'assistant'),
    );
    const body = await response.json();
    expect(body.actions).toEqual([{ type: 'open_login' }]);
    expect(body.message).toContain('Sign in');
    expect(body.message).not.toContain('fill_field');
  });

  it('refuses password filling and reports that no promo code field exists', async () => {
    const complete = vi.fn();
    const app = appWith({ complete }, enabled);
    const password = await app.request('/api/support/chat', chat('fill the password with hunter2', 'en', 'http://localhost:3000', 'assistant'));
    const passwordBody = await password.json();
    expect(passwordBody.message).not.toContain('hunter2');
    expect(passwordBody.actions).toContainEqual({ type: 'open_human_support' });
    expect(JSON.stringify(passwordBody.actions)).not.toContain('fill_field');
    const promo = await app.request('/api/support/chat', chat('fill the promo code with WELCOME', 'en', 'http://localhost:3000', 'assistant'));
    const promoBody = await promo.json();
    expect(promoBody.message).toContain('no promo code');
    expect(promoBody.actions).toEqual([{ type: 'navigate', target: 'promotions' }]);
    const address = await app.request('/api/support/chat', chat('fill my address with 1 Main Street', 'en', 'http://localhost:3000', 'assistant'));
    const addressBody = await address.json();
    expect(addressBody.source).toBe('rules');
    expect(addressBody.message).toContain('password');
    expect(addressBody.message).not.toContain('Main');
    expect(JSON.stringify(addressBody.actions)).not.toContain('fill_field');
    expect(complete).not.toHaveBeenCalled();
  });

  it('answers a demo follow-up from the previous topic without a model call', async () => {
    const complete = vi.fn();
    const response = await appWith({ complete }, enabled).request('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'do you have demo play?' },
          { role: 'assistant', content: 'Yes, when that game allows it.' },
          { role: 'user', content: 'why?' },
        ],
        context,
        mode: 'assistant',
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source).toBe('rules');
    expect(body.message.toLowerCase()).toContain('demo');
    expect(complete).not.toHaveBeenCalled();
  });

  it('opens the previous destination for a short follow-up', async () => {
    const complete = vi.fn();
    const response = await appWith({ complete }, enabled).request('/api/support/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Open Live Casino' },
          { role: 'assistant', content: 'Opening Live Casino.' },
          { role: 'user', content: 'open it' },
        ],
        context,
        mode: 'assistant',
      }),
    });
    const body = await response.json();
    expect(body.actions).toEqual([{ type: 'navigate', target: 'live_casino' }]);
    expect(body.autoRun).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects a model fill action instead of applying it', async () => {
    const response = await appWith(
      { complete: async () => reply('Filled', [{ type: 'fill_field', field: 'email', value: 'a@b.com' }]) },
      enabled,
    ).request('/api/support/chat', chat('Where is the theme switch?'));
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('ai_response_invalid');
  });
});

function scopeCookie(response: Response): string {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const found = cookies.find((item) => item.startsWith('ab_ai_scope='));
  if (!found) throw new Error('missing scope cookie');
  return found.split(';', 1)[0] ?? '';
}

function withCookie(init: { method: string; headers: Record<string, string>; body: string }, cookie: string) {
  return { ...init, headers: { ...init.headers, cookie } };
}

function catalogWith(games: Array<{ id: string; title: string }>): CatalogUseCases {
  const page = {
    games: games.map((game) => ({
      id: game.id,
      slug: 'book-of-dead',
      title: game.title,
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
    })),
    pagination: {
      page: 1,
      perPage: 8,
      total: games.length,
      lastPage: 1,
      from: games.length ? 1 : null,
      to: games.length || null,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  return {
    listGames: async () => page,
    listProviders: async () => ({ providers: [] }),
    listCategories: async () => ({ categories: [] }),
    getLobby: async () => {
      throw new Error('unused');
    },
  };
}
