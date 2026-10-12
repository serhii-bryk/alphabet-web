import type { SupportChannelsResponse } from '@brand/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { mutationOriginAllowed } from './session-cookie.js';
import { answerSupportChat } from './support/answer.js';
import { SupportAiError, type SupportAiProvider } from './support/provider.js';
import { supportChatRequestSchema } from './support/schema.js';

const channelsResponseSchema = z.strictObject({
  available: z.boolean(),
  channels: z
    .array(
      z.strictObject({
        id: z.enum(['email', 'telegram', 'whatsapp', 'helpdesk']),
        kind: z.enum(['email', 'link']),
        value: z.string().min(1).max(300),
      }),
    )
    .max(4),
});

const chatResponseSchema = z.strictObject({
  message: z.string().min(1).max(2000),
  actions: z.array(z.unknown()).max(3),
  confidence: z.enum(['known', 'general', 'unknown']),
  escalate: z.boolean(),
});

const messages = {
  invalid_support_request: 'Support chat could not read that message.',
  ai_unavailable: 'Support chat is unavailable right now.',
  ai_timeout: 'Support chat took too long to respond.',
  ai_response_invalid: 'Support chat could not use that response.',
  support_unavailable: 'Support chat is unavailable right now.',
} as const;

export interface SupportRouteDependencies {
  webOrigin: string;
  ai: SupportAiProvider | null;
  channels: SupportChannelsResponse;
  testDepositAvailable: boolean;
  secrets: string[];
}

export function isSupportPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return /^\/(?:api\/)?support(?:\/|$)/.test(pathname);
}

export function registerSupportRoutes(app: Hono, dependencies: SupportRouteDependencies) {
  const routes = new Hono();

  routes.get('/channels', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(channelsResponseSchema.parse(dependencies.channels));
  });

  routes.post('/chat', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
      return c.json(errorBody('support_unavailable'), 403);
    }
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return c.json(errorBody('invalid_support_request'), 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorBody('invalid_support_request'), 400);
    }
    const request = supportChatRequestSchema.safeParse(body);
    const latest = request.success ? request.data.messages[request.data.messages.length - 1] : undefined;
    if (!request.success || latest?.role !== 'user') {
      return c.json(errorBody('invalid_support_request'), 400);
    }
    if (!dependencies.ai) return c.json(errorBody('ai_unavailable'), 503);

    try {
      const reply = await answerSupportChat({
        provider: dependencies.ai,
        messages: request.data.messages,
        context: request.data.context,
        testDepositAvailable: dependencies.testDepositAvailable,
        secrets: dependencies.secrets,
      });
      return c.json(chatResponseSchema.parse(reply));
    } catch (error) {
      if (error instanceof SupportAiError) return c.json(errorBody(error.code), error.status);
      return c.json(errorBody('support_unavailable'), 502);
    }
  });

  app.route('/support', routes);
  app.route('/api/support', routes);
}

export function supportSecretValues(env: Record<string, string | undefined>): string[] {
  const names = [
    'SUPPORT_AI_API_KEY',
    'FINAL_PLATFORM_API_KEY',
    'FINAL_PLATFORM_API_SECRET',
    'FINALPAY_SECRET',
    'SESSION_SECRET',
  ];
  return names.flatMap((name) => {
    const value = env[name]?.trim();
    return value && value.length >= 8 ? [value] : [];
  });
}

function errorBody(code: keyof typeof messages) {
  return { error: { code, message: messages[code] } };
}
