// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children?: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/responsible-gaming',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import messages from '../../../messages/en.json';
import { AuthProvider } from '../auth/auth-provider';
import { applyAuthenticatedSession, sessionKey, useEndSession } from '../auth/session';
import { PlayerControlCenter } from './player-control-center';
import { RealityCheckReminder, SessionClockLink, realityCheckKey, resetReminderLeader } from './session-clock';
import {
  PLAYER_CONTROL_KEY,
  RECEIPT_KEY,
  canSubmitPeriod,
  currentReminderBoundary,
  resolveSessionStart,
} from './storage';

const player = {
  authenticated: true as const,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

const catalog = {
  realityCheckIntervals: [0, 15, 30],
  coolOffPeriods: [
    { id: 1, text: '24 hours', dateSelector: false },
    { id: 2, text: 'Custom', dateSelector: true },
  ],
  coolOffReasons: [{ id: 7, text: 'Need a break' }],
  selfExclusionPeriods: [
    { id: 9, text: '6 months', dateSelector: false },
    { id: 10, text: 'Pick a date', dateSelector: true },
  ],
};

const platformStart = '2026-10-15T11:00:00.000Z';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function exclusionResult(kind: 'cool_off' | 'self_exclusion', periodText: string) {
  return {
    kind,
    periodText,
    reasonText: kind === 'cool_off' ? 'Need a break' : null,
    status: kind === 'cool_off' ? 'CoolOff' : 'SelfExclusion',
    expiresAt: '2027-04-15T12:00:00.000Z',
    createdAt: '2026-10-15T12:00:00.000Z',
    sessionEnded: true as const,
  };
}

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  resetReminderLeader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function render(node: ReactNode, client = queryClient()) {
  act(() => root?.unmount());
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <AuthProvider>{node}</AuthProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
  return client;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await settle();
  }
  throw new Error(`timed out: ${document.body.textContent?.slice(0, 240)}`);
}

function installFetch(options?: {
  guest?: boolean;
  clock?: unknown;
  interval?: number;
  catalogBody?: unknown;
  catalogStatus?: number;
  holdCatalog?: Promise<void>;
}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/api/auth/login')) return json(player);
    if (url.includes('/api/session') && !url.includes('responsible-gaming')) {
      return json(options?.guest ? { authenticated: false } : player);
    }
    if (url.includes('/api/responsible-gaming/catalog')) {
      if (options?.holdCatalog) await options.holdCatalog;
      if (options?.catalogStatus) {
        return json({ error: { code: 'responsible_gaming_unavailable', message: 'down' } }, options.catalogStatus);
      }
      return json(options?.catalogBody ?? catalog);
    }
    if (url.endsWith('/api/responsible-gaming/session')) {
      return json(options?.clock ?? { startedAt: platformStart, source: 'platform_login' });
    }
    if (url.includes('/api/responsible-gaming/reality-check')) {
      const posted = init?.method === 'POST' ? JSON.parse(String(init.body)).intervalMinutes : options?.interval ?? 0;
      return json({ intervalMinutes: posted });
    }
    if (url.includes('/api/responsible-gaming/cool-off')) {
      return json(exclusionResult('cool_off', '24 hours'));
    }
    if (url.includes('/api/responsible-gaming/self-exclusion')) {
      return json(exclusionResult('self_exclusion', '6 months'));
    }
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, calls };
}

function authedPaths(calls: { url: string }[]) {
  return calls
    .map((call) => call.url)
    .filter((url) => url.includes('/api/responsible-gaming/') && !url.includes('/catalog'));
}

async function click(selector: string) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`missing ${selector}`);
  await act(async () => {
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function clickButton(label: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing button ${label}`);
  await act(async () => {
    button.click();
  });
}

describe('session clock', () => {
  it('does not reset when the component remounts with a platform startedAt', async () => {
    let now = Date.parse('2026-10-15T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    installFetch({ interval: 60 });
    const client = queryClient();

    await render(<SessionClockLink placement="header" />, client);
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('1:00:00') === true);
    await settle();
    expect(document.querySelector('[data-clock-kind="platform"]')).not.toBeNull();
    expect(localStorage.getItem(PLAYER_CONTROL_KEY)).toBeNull();

    now = Date.parse('2026-10-15T12:05:00.000Z');
    await render(<SessionClockLink placement="header" />, client);
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('1:05:00') === true);
    expect(document.body.textContent).not.toContain('0:05:00');
    expect(localStorage.getItem(PLAYER_CONTROL_KEY)).toBeNull();
  });

  it('drops the device clock and cached session start when the player signs in or out', async () => {
    localStorage.setItem(
      PLAYER_CONTROL_KEY,
      JSON.stringify({
        players: { '42': { deviceStartedAt: '2026-10-15T10:00:00.000Z', acknowledgedThrough: 1 } },
      }),
    );
    const client = queryClient();
    client.setQueryData(['responsible-gaming', 'session', '42'], {
      startedAt: platformStart,
      source: 'platform_login',
    });
    applyAuthenticatedSession(client, player);
    const afterLogin = JSON.parse(localStorage.getItem(PLAYER_CONTROL_KEY) ?? '{}') as {
      players: { '42'?: { deviceStartedAt?: string; acknowledgedThrough?: number } };
    };
    expect(afterLogin.players['42']?.deviceStartedAt).toBeUndefined();
    expect(afterLogin.players['42']?.acknowledgedThrough).toBe(1);
    expect(client.getQueryData(['responsible-gaming', 'session', '42'])).toBeUndefined();

    localStorage.setItem(
      PLAYER_CONTROL_KEY,
      JSON.stringify({ players: { '42': { deviceStartedAt: '2026-10-15T10:00:00.000Z' } } }),
    );
    client.setQueryData(sessionKey, player);
    client.setQueryData(['responsible-gaming', 'session', '42'], {
      startedAt: platformStart,
      source: 'platform_login',
    });
    function EndProbe() {
      const end = useEndSession();
      return (
        <button type="button" onClick={end}>
          end
        </button>
      );
    }
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <EndProbe />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(localStorage.getItem(PLAYER_CONTROL_KEY)).not.toContain('deviceStartedAt');
    expect(client.getQueryData(['responsible-gaming', 'session', '42'])).toBeUndefined();
    expect(client.getQueryData(sessionKey)).toEqual({ authenticated: false });
  });

  it('keeps a device clock across remounts and labels it as device time', async () => {
    let now = Date.parse('2026-10-15T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    installFetch({
      interval: 15,
      clock: { startedAt: null, source: 'unavailable' },
    });
    const client = queryClient();
    await render(<SessionClockLink placement="header" />, client);
    await waitFor(() => localStorage.getItem(PLAYER_CONTROL_KEY)?.includes('deviceStartedAt') === true);
    const stored = localStorage.getItem(PLAYER_CONTROL_KEY);
    const clock = document.querySelector('[data-testid="session-clock"]');
    expect(clock?.getAttribute('data-clock-kind')).toBe('device');
    expect(clock?.getAttribute('aria-label')).toContain('Not an enforced limit');

    now = Date.parse('2026-10-15T12:05:00.000Z');
    await render(<SessionClockLink placement="header" />, client);
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('05:00') === true);
    expect(localStorage.getItem(PLAYER_CONTROL_KEY)).toBe(stored);
    expect(document.querySelector('[data-clock-kind="device"]')).not.toBeNull();
  });

  it('does not treat an interval change as a new session start', () => {
    const start = Date.parse(platformStart);
    const now = Date.parse('2026-10-15T11:40:00.000Z');
    expect(currentReminderBoundary(start, 30, now)).toBe(Date.parse('2026-10-15T11:30:00.000Z'));
    expect(currentReminderBoundary(start, 60, now)).toBeNull();
    const resolved = resolveSessionStart({
      source: 'platform_login',
      startedAt: platformStart,
      deviceStartedAt: null,
      now,
    });
    expect(resolved).toEqual({ startedAtMs: start, kind: 'platform', deviceStartedAtToStore: null });
  });

  it('hides the timer when reality check is off and follows sign-in, sign-out, and a saved interval', async () => {
    vi.spyOn(Date, 'now').mockImplementation(() => Date.parse('2026-10-15T12:00:00.000Z'));
    const options = { guest: true, interval: 0 };
    installFetch(options);
    const client = await render(<SessionClockLink placement="header" />);
    await waitFor(() => client.getQueryState(sessionKey)?.status === 'success');
    await settle();
    expect(document.querySelector('[data-testid="session-clock"]')).toBeNull();

    options.guest = false;
    options.interval = 30;
    await act(async () => {
      client.setQueryData(sessionKey, player);
    });
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('1:00:00') === true);

    await act(async () => {
      client.setQueryData(realityCheckKey('42'), { intervalMinutes: 0 });
    });
    await waitFor(() => document.querySelector('[data-testid="session-clock"]') === null);
    expect(document.querySelector('.skeleton')).toBeNull();

    await act(async () => {
      client.setQueryData(realityCheckKey('42'), { intervalMinutes: 30 });
    });
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('1:00:00') === true);

    await act(async () => {
      client.setQueryData(sessionKey, { authenticated: false });
    });
    await waitFor(() => document.querySelector('[data-testid="session-clock"]') === null);
  });
});

describe('reality check reminder', () => {
  function at(iso: string) {
    const now = Date.parse(iso);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  }

  async function showReminder(client = queryClient()) {
    await render(
      <>
        <SessionClockLink placement="header" />
        <RealityCheckReminder />
        <RealityCheckReminder />
      </>,
      client,
    );
    return client;
  }

  it('fires once per interval and acknowledgement suppresses the same reminder', async () => {
    at('2026-10-15T11:20:00.000Z');
    installFetch({ interval: 15 });
    const client = await showReminder();
    await waitFor(() => document.querySelectorAll('[data-testid="reality-reminder"]').length === 1);
    expect(document.body.textContent).toContain('You have been signed in for 20:00');

    const acknowledge = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Acknowledge');
    await act(async () => {
      acknowledge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => document.querySelector('[data-testid="reality-reminder"]') === null);
    const stored = JSON.parse(localStorage.getItem(PLAYER_CONTROL_KEY) ?? '{}') as {
      players: { '42': { acknowledgedThrough: number; deviceStartedAt?: string } };
    };
    expect(stored.players['42']?.acknowledgedThrough).toBe(Date.parse('2026-10-15T11:15:00.000Z'));
    expect(stored.players['42']?.deviceStartedAt).toBeUndefined();

    await showReminder(client);
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('20:00') === true);
    await settle();
    expect(document.querySelector('[data-testid="reality-reminder"]')).toBeNull();

    at('2026-10-15T11:31:00.000Z');
    await showReminder(client);
    await waitFor(() => document.querySelectorAll('[data-testid="reality-reminder"]').length === 1);
    expect(document.body.textContent).toContain('31:00');
  });

  it('does not open a second dialog when another tab acknowledges', async () => {
    at('2026-10-15T11:20:00.000Z');
    installFetch({ interval: 15 });
    await showReminder();
    await waitFor(() => document.querySelectorAll('[data-testid="reality-reminder"]').length === 1);

    const acknowledged = {
      players: { '42': { acknowledgedThrough: Date.parse('2026-10-15T11:15:00.000Z') } },
    };
    localStorage.setItem(PLAYER_CONTROL_KEY, JSON.stringify(acknowledged));
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_CONTROL_KEY, newValue: JSON.stringify(acknowledged) }));
    });
    await waitFor(() => document.querySelector('[data-testid="reality-reminder"]') === null);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_CONTROL_KEY, newValue: JSON.stringify(acknowledged) }));
    });
    await settle();
    expect(document.querySelectorAll('[data-testid="reality-reminder"]')).toHaveLength(0);
  });
});

describe('player control center', () => {
  it('lets a guest read the catalog without calling authed controls', async () => {
    const { calls } = installFetch({ guest: true });
    await render(<PlayerControlCenter />);
    await waitFor(() => document.body.textContent?.includes('24 hours') === true);
    expect(document.body.textContent).toContain('Custom');
    expect(document.body.textContent).toContain('Need a break');
    expect(document.body.textContent).toContain('6 months');
    expect(authedPaths(calls)).toEqual([]);
    const catalogCall = calls.find((call) => call.url.includes('/catalog'));
    expect(catalogCall?.init?.credentials).toBe('omit');

    const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Sign in to save'));
    await act(async () => {
      save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Sign in to play and see your balance.');
    expect(authedPaths(calls)).toEqual([]);
  });

  it('does not submit a period that asks for a custom end date', async () => {
    expect(canSubmitPeriod({ dateSelector: true })).toBe(false);
    expect(canSubmitPeriod({ dateSelector: false })).toBe(true);
    const { calls } = installFetch({ interval: 0 });
    await render(<PlayerControlCenter />);
    await waitFor(() => document.querySelector('[data-testid="cool-off-2"]') !== null);
    expect(document.querySelector('[data-testid="session-clock-hero"]')).toBeNull();

    const custom = document.querySelector('[data-testid="cool-off-2"]');
    expect(custom).toBeInstanceOf(HTMLInputElement);
    expect((custom as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('A custom end date cannot be sent.');
    await act(async () => {
      custom?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect((custom as HTMLInputElement).checked).toBe(false);
    const review = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Review cool-off');
    expect(review).toBeInstanceOf(HTMLButtonElement);
    expect((review as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((call) => call.url.includes('/cool-off'))).toBe(false);

    await click('[data-testid="cool-off-1"]');
    const enabledReview = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Review cool-off');
    await act(async () => {
      enabledReview?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Start cool-off');
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => calls.some((call) => call.url.includes('/cool-off')));
    const post = calls.find((call) => call.url.includes('/cool-off'));
    expect(post?.init?.credentials).toBe('include');
    expect(JSON.parse(String(post?.init?.body))).toEqual({ periodId: 1 });
    expect(calls.some((call) => String(call.init?.body).includes('"periodId":2'))).toBe(false);
  });

  it('stores a local receipt and ends the session after self-exclusion', async () => {
    const { calls } = installFetch({ interval: 30 });
    const client = await render(<PlayerControlCenter />);
    await waitFor(() => document.querySelector('[data-testid="self-exclusion-9"]') !== null);
    await waitFor(() => document.querySelector('[data-testid="session-clock-hero"]') !== null);

    const custom = document.querySelector('[data-testid="self-exclusion-10"]');
    expect((custom as HTMLInputElement).disabled).toBe(true);

    await click('[data-testid="self-exclusion-9"]');
    const review = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Review self-exclusion');
    await act(async () => {
      review?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Self-exclude');
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => document.querySelector('[data-testid="local-receipt"]') !== null);
    expect(document.querySelector('[data-testid="session-clock-hero"]')).toBeNull();
    expect(document.body.textContent).toContain('Local note');
    expect(document.body.textContent).toContain('not account protection');
    expect(document.body.textContent).toContain('You are signed out.');
    expect(document.body.textContent).toContain('Sign in to save');
    const receipt = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? '{}') as { periodText?: string; kind?: string };
    expect(receipt.kind).toBe('self_exclusion');
    expect(receipt.periodText).toBe('6 months');
    expect(client.getQueryData(sessionKey)).toEqual({ authenticated: false });
    const post = calls.find((call) => call.url.includes('/self-exclusion'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ periodId: 9 });
  });

  it('shows the session timer after a reminder is saved and hides it when reminders are turned off', async () => {
    vi.spyOn(Date, 'now').mockImplementation(() => Date.parse('2026-10-15T12:00:00.000Z'));
    installFetch({ interval: 0 });
    await render(
      <>
        <SessionClockLink placement="bar" />
        <PlayerControlCenter />
      </>,
    );
    await waitFor(() => document.querySelector('[data-testid="reality-interval-0"]') !== null);
    await settle();
    expect(document.querySelector('[data-testid="session-clock"]')).toBeNull();
    expect(document.querySelector('[data-testid="session-clock-hero"]')).toBeNull();

    await click('[data-testid="reality-interval-30"]');
    await clickButton('Save reminder');
    await waitFor(() => document.querySelector('[data-testid="session-clock"]')?.textContent?.includes('1:00:00') === true);
    expect(document.querySelector('[data-testid="session-clock-hero"]')?.textContent).toContain('1:00:00');

    await click('[data-testid="reality-interval-0"]');
    await clickButton('Save reminder');
    await waitFor(() => document.querySelector('[data-testid="session-clock"]') === null);
    expect(document.querySelector('[data-testid="session-clock-hero"]')).toBeNull();
  });

  it('shows an empty catalog and an error that can be retried', async () => {
    const empty = installFetch({
      guest: true,
      catalogBody: { realityCheckIntervals: [], coolOffPeriods: [], coolOffReasons: [], selfExclusionPeriods: [] },
    });
    await render(<PlayerControlCenter />);
    await waitFor(() => document.body.textContent?.includes('No control options are available right now.') === true);

    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/session')) return json({ authenticated: false });
        if (url.includes('/catalog')) {
          if (fail) return json({ error: { code: 'responsible_gaming_unavailable', message: 'down' } }, 502);
          return json(catalog);
        }
        throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
      }),
    );
    void empty;
    await render(<PlayerControlCenter />);
    await waitFor(() => document.body.textContent?.includes('Player controls are temporarily unavailable.') === true);
    const skeletons = document.querySelector('[aria-busy="true"]');
    expect(skeletons).toBeNull();
    fail = false;
    const retry = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Retry');
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => document.body.textContent?.includes('24 hours') === true);
  });
});
