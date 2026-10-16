import { createMemoryPaymentIntentStore } from '@brand/domain';
import { createApp } from '../src/app.js';
import { createMemoryAiBudget } from '../src/support/budget.js';
import { readAiChatLimits } from '../src/support/limits.js';

const env = demoEnvironment(process.env);
const app = createApp({
  env,
  intentStore: createMemoryPaymentIntentStore(),
  supportBudget: createMemoryAiBudget(readAiChatLimits(env)),
});

export default function handler(request: Request): Response | Promise<Response> {
  return app.fetch(request);
}

export const config = {
  path: '/api/*',
};

export function demoEnvironment(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...source };
  delete env.FINALPAY_URL;
  delete env.FINALPAY_SECRET;
  delete env.PAYMENTS_CALLBACK_BASE_URL;
  delete env.OPENAI_API_KEY;
  env.AI_CHAT_ENABLED = 'false';
  env.PAYMENTS_TEST_MODE = 'false';
  env.PAYMENTS_MOCK_MODE = 'true';
  env.PAYMENTS_MOCK_ALLOW_PRODUCTION = 'true';
  if (!env.WEB_ORIGIN) {
    const site = siteOrigin(env.DEPLOY_PRIME_URL) ?? siteOrigin(env.URL);
    if (site) env.WEB_ORIGIN = site;
  }
  return env;
}

function siteOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
