import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../messages/en.json';

vi.mock('next/image', () => ({
  default: ({ alt = '', src }: { alt?: string; src: string }) =>
    createElement('img', { alt, src }),
}));

const session = vi.hoisted(() => ({
  status: 'guest' as 'pending' | 'guest' | 'authenticated',
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/sports',
}));

vi.mock('@/components/auth/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useSession: () => ({
      status: session.status,
      session: session.status === 'authenticated' ? { authenticated: true } : null,
      query: { isPending: session.status === 'pending' },
    }),
  };
});

import { SportsHero } from './sports-hero';

function renderHero() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SportsHero />
    </NextIntlClientProvider>,
  );
}

describe('sports hero acquisition', () => {
  it('shows one compact registration form for a guest', () => {
    session.status = 'guest';
    const html = renderHero();

    expect(html).toContain('data-hero-registration');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('>Continue<');
    expect(html).not.toContain('>Register<');
  });

  it('does not show guest acquisition while signed in or pending', () => {
    session.status = 'authenticated';
    expect(renderHero()).not.toContain('data-hero-registration');

    session.status = 'pending';
    expect(renderHero()).not.toContain('data-hero-registration');
  });
});
