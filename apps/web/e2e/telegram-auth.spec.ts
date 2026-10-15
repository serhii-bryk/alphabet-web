import { expect, test, type Page } from '@playwright/test';

const session = {
  authenticated: true,
  playerId: '77',
  email: null,
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
};

async function installTelegramRoutes(page: Page, user: Record<string, unknown> | false) {
  let authenticated = false;
  await page.addInitScript((widgetUser) => {
    Object.assign(window, { __telegramUser: widgetUser });
  }, user);
  await page.route('https://telegram.org/js/telegram-widget.js*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.Telegram = window.Telegram || {};
        window.Telegram.Login = {
          auth(options, callback) {
            window.__telegramAuthOptions = options;
            const widgetUser = window.__telegramUser;
            callback(widgetUser === false ? false : widgetUser);
          },
        };
      `,
    });
  });
  await page.route('**/api/auth/providers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ telegram: { botId: '123456789' } }),
    });
  });
  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authenticated ? session : { authenticated: false }),
    });
  });
  await page.route('**/api/auth/telegram', async (route) => {
    const body = route.request().postDataJSON() as { hash?: string };
    if (body.hash === 'b'.repeat(64)) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'external_auth_rejected', message: 'Telegram sign-in was not accepted' },
        }),
      });
      return;
    }
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
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
  await page.route('**/api/account/profile', async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? {
              playerId: '77',
              email: null,
              firstName: 'Telegram',
              lastName: 'Player',
              currency: 'EUR',
              countryCode: null,
              emailVerified: false,
            }
          : { error: { code: 'session_ended', message: 'Your session has ended' } },
      ),
    });
  });
}

test.describe('telegram authentication', () => {
  test('signs in from the login dialog and logs out', async ({ page }) => {
    await installTelegramRoutes(page, {
      id: 900000001,
      first_name: 'Telegram',
      last_name: 'Player',
      username: 'telegram_player',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'a'.repeat(64),
    });
    await page.goto('/casino');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in' });
    await dialog.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.getByRole('link', { name: 'Account' }).first()).toBeVisible();
    await expect(page.getByTestId('balance').first()).toContainText('12.50');

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });

  test('keeps the dialog open when Telegram is cancelled or rejected', async ({ page }) => {
    await installTelegramRoutes(page, false);
    await page.goto('/casino');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in' });
    await dialog.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(dialog.getByText('Telegram sign-in was cancelled.')).toBeVisible();
    await expect(page.getByTestId('balance')).toHaveCount(0);

    await page.evaluate(() => {
      Object.assign(window, {
        __telegramUser: {
          id: 900000001,
          first_name: 'Telegram',
          auth_date: Math.floor(Date.now() / 1000),
          hash: 'b'.repeat(64),
        },
      });
    });
    await dialog.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(dialog.getByText('Telegram sign-in was not accepted. Try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });

  test('offers Telegram in the registration dialog on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegramRoutes(page, {
      id: 900000001,
      first_name: 'Telegram',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'a'.repeat(64),
    });
    await page.goto('/casino');
    await page.locator('.mobile-only').getByRole('button', { name: 'Register', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create your account' });
    await expect(dialog.getByRole('button', { name: 'Continue with Telegram' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Google' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Phone' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Continue with Telegram' }).click();
    await expect(page.locator('.mobile-only').getByTestId('balance')).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('shows Telegram on a right-to-left Arabic sign-in dialog', async ({ page }) => {
    await installTelegramRoutes(page, false);
    await page.goto('/ar/casino');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'تسجيل الدخول' });
    await expect(dialog.getByRole('button', { name: 'المتابعة عبر تيليغرام' })).toBeVisible();
    await expect(dialog.getByLabel('البريد الإلكتروني')).toBeVisible();
  });
});
