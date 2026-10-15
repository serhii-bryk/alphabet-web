import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const chatBody = {
  messages: [{ role: 'user', content: 'Where is the theme switch?' }],
  context: {
    locale: 'en',
    route: '/casino',
    authenticated: false,
    section: 'casino',
    gameOpen: false,
  },
  mode: 'support',
};

describe('Netlify BFF function', () => {
  it('keeps Stage platform settings and turns payments and OpenAI off', async () => {
    stubPlatformEnv();
    const { demoEnvironment } = await loadFunction();
    const env = demoEnvironment({
      FINAL_PLATFORM_API_URL: 'https://stage.example/api/v1',
      FINAL_PLATFORM_API_KEY: 'stage-key',
      FINAL_PLATFORM_API_SECRET: 'stage-secret',
      SESSION_SECRET: 'session-secret-value-with-32-chars',
      FINALPAY_URL: 'https://payments.example',
      FINALPAY_SECRET: 'pay-secret',
      PAYMENTS_CALLBACK_BASE_URL: 'https://payments.example',
      OPENAI_API_KEY: 'sk-demo',
      AI_CHAT_ENABLED: 'true',
      PAYMENTS_TEST_MODE: 'true',
      PAYMENTS_MOCK_MODE: 'true',
      DEPLOY_PRIME_URL: 'https://alphabet.netlify.app/',
    });

    expect(env.FINAL_PLATFORM_API_URL).toBe('https://stage.example/api/v1');
    expect(env.FINAL_PLATFORM_API_KEY).toBe('stage-key');
    expect(env.SESSION_SECRET).toBe('session-secret-value-with-32-chars');
    expect(env.FINALPAY_URL).toBeUndefined();
    expect(env.FINALPAY_SECRET).toBeUndefined();
    expect(env.PAYMENTS_CALLBACK_BASE_URL).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.AI_CHAT_ENABLED).toBe('false');
    expect(env.PAYMENTS_TEST_MODE).toBe('false');
    expect(env.PAYMENTS_MOCK_MODE).toBe('false');
    expect(env.WEB_ORIGIN).toBe('https://alphabet.netlify.app');
  });

  it('serves browser /api routes and does not call OpenAI', async () => {
    stubPlatformEnv();
    vi.stubEnv('WEB_ORIGIN', 'https://alphabet.example');
    vi.stubEnv('SESSION_SECRET', 'session-secret-value-with-32-chars');
    vi.stubEnv('TELEGRAM_BOT_ID', '');
    vi.stubEnv('AI_CHAT_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'sk-demo');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FINALPAY_URL', 'https://payments.example');
    vi.stubEnv('FINALPAY_SECRET', 'pay-secret');
    vi.stubEnv('PAYMENTS_CALLBACK_BASE_URL', 'https://payments.example');
    const fetcher = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetcher);
    const { default: handler } = await loadFunction();

    const providers = await handler(new Request('https://alphabet.example/api/auth/providers'));
    expect(providers.status).toBe(200);
    expect(await providers.json()).toEqual({ telegram: null });

    const session = await handler(new Request('https://alphabet.example/api/session'));
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ authenticated: false });

    const methods = await handler(new Request('https://alphabet.example/api/payments/methods'));
    expect(methods.status).toBe(401);
    const methodsBody = (await methods.json()) as { error: { code: string } };
    expect(methodsBody.error.code).toBe('session_ended');

    const chat = await handler(
      new Request('https://alphabet.example/api/support/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://alphabet.example' },
        body: JSON.stringify(chatBody),
      }),
    );
    expect(chat.status).toBe(503);
    const chatBodyJson = (await chat.json()) as { error: { code: string } };
    expect(chatBodyJson.error.code).toBe('ai_unavailable');
    expect(JSON.stringify(chatBodyJson)).not.toContain('sk-demo');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function stubPlatformEnv() {
  vi.stubEnv('FINAL_PLATFORM_API_URL', 'https://stage.example/api/v1');
  vi.stubEnv('FINAL_PLATFORM_API_KEY', 'stage-key');
  vi.stubEnv('FINAL_PLATFORM_API_SECRET', 'stage-secret');
  vi.stubEnv('SESSION_SECRET', 'session-secret-value-with-32-chars');
}

async function loadFunction() {
  vi.resetModules();
  return import('../netlify/bff.js');
}
