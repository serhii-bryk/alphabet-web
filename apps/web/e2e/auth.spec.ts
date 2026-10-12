import { expect, test, type Page } from '@playwright/test';

const session = {
  authenticated: true,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
};

const profile = {
  playerId: '42',
  email: 'player@example.com',
  firstName: 'Test',
  lastName: 'Player',
  currency: 'EUR',
  countryCode: 'MT',
  emailVerified: true,
};

async function installAuthRoutes(page: Page) {
  let authenticated = false;
  let loginPosts = 0;

  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authenticated ? session : { authenticated: false }),
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    loginPosts += 1;
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if (body.password === 'wrong-password') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'invalid_credentials', message: 'The email or password is incorrect' },
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
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'session_ended', message: 'Your session has ended' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balance: 12.5, currency: 'EUR' }),
    });
  });
  await page.route('**/api/account/profile', async (route) => {
    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? profile
          : { error: { code: 'session_ended', message: 'Your session has ended' } },
      ),
    });
  });

  return { loginPosts: () => loginPosts };
}

async function openCasino(page: Page) {
  await page.goto('/en/casino');
  await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
}

async function signIn(page: Page, password: string) {
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await dialog.getByLabel('Email').fill('player@example.com');
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('account session', () => {
  test('logs in, keeps the session after refresh, and logs out', async ({ page }) => {
    const routes = await installAuthRoutes(page);
    await openCasino(page);

    await signIn(page, 'correct-horse-battery');

    await expect(page.getByRole('link', { name: 'Account player@example.com' })).toBeVisible();
    await expect(page.getByTestId('balance').first()).toContainText('12.50');
    expect(routes.loginPosts()).toBe(1);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Account player@example.com' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });

  test('shows invalid credentials and does not authenticate', async ({ page }) => {
    await installAuthRoutes(page);
    await openCasino(page);

    await signIn(page, 'wrong-password');

    await expect(page.getByText('The email or password is incorrect.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });

  test('shows profile and balance on the account page', async ({ page }) => {
    await installAuthRoutes(page);
    await openCasino(page);
    await signIn(page, 'correct-horse-battery');
    await page.getByRole('link', { name: 'Account player@example.com' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
    await expect(page.getByTestId('account-balance')).toContainText('12.50');
    await expect(page.getByRole('region', { name: 'Profile' }).getByText('Test Player')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Profile' }).getByText('player@example.com')).toBeVisible();
  });
});
