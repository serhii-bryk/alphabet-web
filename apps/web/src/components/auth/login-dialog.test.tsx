import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/casino',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

import { LoginDialog, LoginForm } from './login-dialog';

const noop = () => {};

function renderUi(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('LoginDialog', () => {
  it('renders nothing while closed', () => {
    expect(
      renderUi(
        <LoginDialog
          open={false}
          pending={false}
          error={null}
          onSubmit={noop}
          onClose={noop}
          onCreateAccount={noop}
        />,
      ),
    ).toBe('');
  });

  it('renders a labelled modal with autocomplete-ready inputs', () => {
    const html = renderUi(
      <LoginDialog
        open
        pending={false}
        error={null}
        onSubmit={noop}
        onClose={noop}
        onCreateAccount={noop}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('New here?');
    expect(html).toContain('>Create account<');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="([^"]+)".*<h2 id="\1"[^>]*>Sign in<\/h2>/);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Email<\/label><input id="\1"/);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Password<\/label><input id="\1"/);
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('type="password" autoComplete="current-password"');
    expect(html).not.toContain('role="alert"');
  });
});

describe('LoginForm', () => {
  it('disables submit and shows a loading label while pending', () => {
    const html = renderUi(<LoginForm pending error={null} onSubmit={noop} />);
    expect(html).toMatch(/<button[^>]*type="submit" disabled="" aria-busy="true"/);
    expect(html).toContain('Signing in…');
    expect(html).toContain('data-alphabet-loader');
  });

  it.each([
    ['invalid_credentials', 'The email or password is incorrect.'],
    ['invalid_login', 'Enter a valid email and a password of at least 8 characters.'],
    ['auth_unavailable', 'Sign-in is unavailable. Please try again.'],
    ['account_restricted', 'This account is cooled off or self-excluded. You cannot sign in until that period ends.'],
  ] as const)('renders the %s message inline', (code, message) => {
    const html = renderUi(<LoginForm pending={false} error={code} onSubmit={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).toContain('aria-invalid="true"');
  });
});
