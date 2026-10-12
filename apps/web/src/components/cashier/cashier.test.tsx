// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children?: unknown }) => children ?? null,
  usePathname: () => '/casino',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

import messages from '../../../messages/en.json';
import { accountKey } from '../auth/session';
import { CashierProvider, DepositButton } from './cashier-provider';

const session = {
  authenticated: true,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

const methods = {
  currency: 'EUR',
  balance: 40,
  depositMethods: [
    { id: 'test-deposit', label: 'Test Deposit', minAmount: 1, maxAmount: 50, fields: [], test: true },
  ],
  withdrawMethods: [
    {
      id: 'bank',
      label: 'Bank',
      minAmount: 10,
      maxAmount: 100,
      fields: [{ name: 'iban', label: 'IBAN', required: true }],
      test: false,
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(deposit?: (init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/session')) return json(session);
      if (url.includes('/api/account/balance')) return json({ balance: 40, currency: 'EUR' });
      if (url.includes('/api/payments/methods')) return json(methods);
      if (url.includes('/api/payments/deposit')) return deposit ? deposit(init) : json({ status: 'completed', paymentId: '11111111-1111-4111-8111-111111111111' });
      return json({ error: { code: 'provider_unavailable', message: 'Payments are temporarily unavailable' } }, 502);
    }),
  );
}

async function renderCashier() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <CashierProvider>
            <DepositButton appearance="header" />
          </CashierProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const opener = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Deposit'));
    if (opener && !opener.hasAttribute('disabled')) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return { invalidate, root, container };
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
  const found = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

async function click(label: string) {
  await act(async () => {
    button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function typeAmount(value: string) {
  const input = document.querySelector('input[inputmode="decimal"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing amount');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const roots: Root[] = [];

afterEach(() => {
  while (roots.length > 0) roots.pop()?.unmount();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('cashier', () => {
  it('opens the deposit cashier, switches to withdraw, and validates the amount', async () => {
    installFetch();
    const view = await renderCashier();
    roots.push(view.root);
    await click('Deposit');
    await text('Test Deposit');
    expect(document.body.textContent).toContain('€40.00');
    await click('Withdraw');
    await text('Bank');
    await text('IBAN');
    await typeAmount('5');
    await click('Confirm withdrawal');
    await text('Enter a valid amount.');
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/api/payments/withdraw'))).toBe(false);
  });

  it('disables submit while a deposit is in flight and shows a payment error', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installFetch(
      () =>
        new Promise((resolve) => {
          void gate.then(() =>
            resolve(json({ error: { code: 'deposit_failed', message: 'The deposit did not complete' } }, 422)),
          );
        }),
    );
    const view = await renderCashier();
    roots.push(view.root);
    await click('Deposit');
    await text('Test Deposit');
    await typeAmount('20');
    await click('Add test funds');
    await text('Processing…');
    const submit = button('Processing…');
    expect(submit.hasAttribute('disabled')).toBe(true);
    await act(async () => {
      release();
    });
    await text('The deposit did not complete.');
  });

  it('invalidates the account balance after a completed test deposit', async () => {
    installFetch();
    const view = await renderCashier();
    roots.push(view.root);
    await click('Deposit');
    await text('Test Deposit');
    await typeAmount('20');
    await click('Add test funds');
    await text('Your deposit is complete.');
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: accountKey });
    const depositCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/api/payments/deposit'));
    expect(String(depositCall?.[1]?.body)).toContain('"methodId":"test-deposit"');
    expect(String(depositCall?.[1]?.body)).toContain('"amount":20');
  });
});
