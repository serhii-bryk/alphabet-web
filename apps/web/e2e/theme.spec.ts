import { expect, test } from '@playwright/test';

test.describe('theme', () => {
  test('defaults to dark and keeps a saved light preference', async ({ page }) => {
    await page.goto('/casino');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('keeps Arabic right to left with the dark default', async ({ page }) => {
    await page.goto('/ar/casino');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
