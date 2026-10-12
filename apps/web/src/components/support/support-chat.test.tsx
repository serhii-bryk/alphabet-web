// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children?: unknown }) => children ?? null,
  usePathname: () => '/casino',
  useRouter: () => ({ push, replace: () => undefined }),
  redirect: () => undefined,
}));

import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import { SupportChatProvider } from './support-chat';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(
  chat?: (body: { messages: { content: string }[]; context: { locale: string; route: string; authenticated: boolean } }) => unknown,
  channels: unknown = { available: false, channels: [] },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/api/session')) return json({ authenticated: false });
      if (target.includes('/channels')) return json(channels);
      if (!chat) return json({ error: { code: 'ai_unavailable', message: 'hidden' } }, 503);
      const body = JSON.parse(String(init?.body)) as {
        messages: { content: string }[];
        context: { locale: string; route: string; authenticated: boolean };
      };
      const result = chat(body);
      if (isRecord(result) && isRecord(result.error)) return json(result, 503);
      return json(result);
    }),
  );
}

async function renderChat(locale: 'en' | 'ar' = 'en') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en}>
          <SupportChatProvider>
            <p>Lobby</p>
          </SupportChatProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
  return root;
}

async function text(value: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.body.textContent?.includes(value)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Missing "${value}" in ${document.body.textContent}`);
}

function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.includes(label) || item.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

async function click(label: string) {
  await act(async () => {
    button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const roots: Root[] = [];

afterEach(() => {
  while (roots.length > 0) roots.pop()?.unmount();
  document.body.innerHTML = '';
  sessionStorage.clear();
  push.mockClear();
  vi.unstubAllGlobals();
});

describe('support chat ui', () => {
  it('opens, answers, and runs a live casino action', async () => {
    installFetch(() => ({
      message: 'Live Casino is in the product switch.',
      actions: [{ type: 'navigate', target: 'live_casino' }],
      confidence: 'known',
      escalate: false,
    }));
    roots.push(await renderChat());
    expect(document.querySelector('.support-panel')).toBeNull();
    await click('Open support chat');
    expect(document.querySelector('.support-panel')).not.toBeNull();
    await click('Close support chat');
    expect(document.querySelector('.support-panel')).toBeNull();
    await click('Open support chat');
    await text('How do I deposit?');
    await click('Where is Live Casino?');
    await text('Live Casino is in the product switch.');
    await click('Open Live Casino');
    expect(push).toHaveBeenCalledWith('/live-casino');
    expect(document.querySelector('.support-panel')).toBeNull();
    expect(sessionStorage.getItem('alphabet.supportChat.v1')).toContain('Live Casino is in the product switch.');
  });

  it('keeps the conversation after the panel is mounted again', async () => {
    sessionStorage.setItem(
      'alphabet.supportChat.v1',
      JSON.stringify({
        open: true,
        messages: [{ id: 'saved', role: 'user', content: 'Saved lobby question' }],
      }),
    );
    installFetch();
    roots.push(await renderChat());
    await text('Saved lobby question');
    expect(document.querySelector('.support-panel')).not.toBeNull();
  });

  it('uses Arabic copy and an RTL panel', async () => {
    installFetch((body) => {
      expect(body.context.locale).toBe('ar');
      expect(body.context.route).toBe('/casino');
      return {
        message: 'الإيداع من الصندوق.',
        actions: [{ type: 'open_cashier', mode: 'deposit' }],
        confidence: 'known',
        escalate: false,
      };
    });
    roots.push(await renderChat('ar'));
    await click('فتح دردشة الدعم');
    expect(document.querySelector('.support-panel')?.getAttribute('dir')).toBe('rtl');
    await text('كيف أُودع؟');
    await click('كيف أُودع؟');
    await text('الإيداع من الصندوق.');
    await text('فتح الإيداع');
  });

  it('keeps human support available when the assistant is down and when no contact is configured', async () => {
    installFetch(() => ({ error: { code: 'ai_unavailable', message: 'hidden upstream sk-secret' } }));
    roots.push(await renderChat());
    await click('Open support chat');
    await click('How do I deposit?');
    await text('Support chat is unavailable right now.');
    expect(document.body.textContent).not.toContain('sk-secret');
    await click('Talk to a person');
    await text('has not been configured');
    await text('Issue:');
  });

  it('shows a configured email and ignores an unsafe link', async () => {
    installFetch(undefined, {
      available: true,
      channels: [
        { id: 'email', kind: 'email', value: 'help@alphabet.example' },
        { id: 'helpdesk', kind: 'link', value: 'javascript:alert(1)' },
      ],
    });
    roots.push(await renderChat());
    await click('Open support chat');
    await click('Talk to a person');
    await text('help@alphabet.example');
    const hrefs = [...document.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('mailto:help@alphabet.example');
    expect(hrefs.some((href) => href?.includes('javascript'))).toBe(false);
  });
});
