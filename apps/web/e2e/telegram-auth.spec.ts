import { expect, test, type Page } from '@playwright/test';

const session = {
  authenticated: true,
  playerId: '77',
  email: 'ada@example.com',
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
};

const clientState = 'a'.repeat(32);

async function installExternalRoutes(
  page: Page,
  finish: 'session' | 'onboarding' | 'expired',
  methods: Array<{ code: string; name: string; type: 'redirect' }> = [
    { code: 'telegram', name: 'Telegram', type: 'redirect' },
  ],
) {
  let authenticated = false;
  await page.route('**/api/auth/methods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ methods }),
    });
  });
  await page.route('**/api/auth/external/start', async (route) => {
    const body = route.request().postDataJSON() as { method?: string };
    const query =
      finish === 'expired'
        ? `error=authentication_expired&client_state=${clientState}`
        : `ticket=LT_testticket&client_state=${clientState}`;
    await route.fulfill({
      status: body.method === 'telegram' || body.method === 'google' ? 200 : 502,
      contentType: 'application/json',
      body: JSON.stringify({
        redirectUrl: `http://localhost:3100/auth/callback?${query}`,
      }),
    });
  });
  await page.route('**/api/auth/external/finish', async (route) => {
    if (finish === 'expired') {
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'external_auth_expired', message: 'This sign-in expired. Start again' },
        }),
      });
      return;
    }
    if (finish === 'onboarding') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'onboarding_required',
          requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
          prefill: { first_name: 'Ada', last_name: 'Lovelace' },
          expiresAt: '2026-10-16T12:30:00.000Z',
          next: '/casino',
        }),
      });
      return;
    }
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...session, next: '/casino' }),
    });
  });
  await page.route('**/api/auth/onboarding', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
          prefill: { first_name: 'Ada', last_name: 'Lovelace' },
          expiresAt: '2026-10-16T12:30:00.000Z',
          next: '/casino',
        }),
      });
      return;
    }
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...session, next: '/casino' }),
    });
  });
  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authenticated ? session : { authenticated: false }),
    });
  });
  await page.route('**/api/account/balance', async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? { balance: 12.5, currency: 'EUR' }
          : { error: { code: 'session_ended', message: 'Your session has ended' } },
      ),
    });
  });
  await page.route('**/api/auth/logout', async (route) => {
    authenticated = false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    });
  });
}

test.describe('external authentication', () => {
  test('signs in an existing player through the platform redirect', async ({ page }) => {
    await installExternalRoutes(page, 'session');
    await page.goto('/casino');
    const heroForm = page.locator('[data-hero-registration]');
    await expect(heroForm).toBeVisible();
    await expect(page.locator('.lobby-hero').getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
    await expect(heroForm.locator('[data-provider-icon="telegram"]')).toBeVisible();
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in' });
    await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.getByRole('link', { name: 'Account' }).first()).toBeVisible();
    await expect(page.getByTestId('balance').first()).toContainText('12.50');
    await expect(heroForm).toHaveCount(0);
    await expect(page).toHaveURL(/\/casino$/);
    expect(page.url()).not.toContain('ticket');
  });

  test('shows the onboarding form with prefilled names and creates the session', async ({ page }) => {
    await installExternalRoutes(page, 'onboarding');
    await page.goto('/casino');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.getByRole('heading', { name: 'Finish creating your account' })).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Ada');
    await expect(page.getByLabel('Last name')).toHaveValue('Lovelace');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Country').selectOption('GB');
    await page.getByLabel('Date of birth').fill('1990-01-02');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('balance').first()).toContainText('12.50');
    expect(page.url()).not.toContain('OB_');
  });

  test('shows an expired callback without a session', async ({ page }) => {
    await installExternalRoutes(page, 'expired');
    await page.goto('/casino');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.getByText('This sign-in expired. Start again.')).toBeVisible();
    await expect(page.getByTestId('balance')).toHaveCount(0);
    expect(page.url()).not.toContain('error=');
  });

  test('offers only returned methods on a phone and in Arabic', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installExternalRoutes(page, 'session', [
      { code: 'telegram', name: 'Telegram', type: 'redirect' },
      { code: 'google', name: 'Google', type: 'redirect' },
    ]);
    await page.goto('/casino');
    await page.locator('.mobile-only').getByRole('button', { name: 'Register', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create your account' });
    await expect(dialog.getByRole('button', { name: 'Continue with Telegram' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
    await page.goto('/sports');
    await expect(page.locator('[data-hero-registration]')).toBeVisible();
    await expect(page.locator('.sports-hero').getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/ar/casino');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    const arabic = page.getByRole('dialog', { name: 'تسجيل الدخول' });
    await expect(arabic.getByRole('button', { name: 'المتابعة عبر Telegram' })).toBeVisible();
    await expect(arabic.getByLabel('البريد الإلكتروني')).toBeVisible();
  });
});
