import { expect, test } from '@playwright/test';

const ticket = 'a'.repeat(64);

test('guest sportsbook opens one iframe and stays on that launch', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/sports/launch', async (route) => {
    posts += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        launchUrl: `https://sports.example/sports/play/${ticket}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        mode: 'demo',
      }),
    });
  });
  await page.route('https://sports.example/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>book</title><p id="book">sportsbook ready</p>',
    });
  });

  await page.goto('/sports');
  const frame = page.getByTitle('Sportsbook');
  await expect(frame).toBeVisible();
  await expect(page.locator('.sportsbook')).toBeVisible();
  await page.waitForTimeout(400);
  expect(posts).toBe(1);
});
