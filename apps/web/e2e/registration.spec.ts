import { expect, test } from '@playwright/test';

test('mobile registration signs the player into the casino', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/casino');

  await page.getByRole('region', { name: 'AlphaBet welcome' }).getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/en\/casino$/);
  await expect(page).not.toHaveURL(/\/register/);
  const dialog = page.getByRole('dialog', { name: 'Create your account' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Phone/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Google/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Apple/ })).toBeDisabled();

  await dialog.getByLabel('Email').fill('mobile@example.com');
  await dialog.getByLabel('Password', { exact: true }).fill('password-1');
  await dialog.getByRole('button', { name: 'Continue' }).click();

  const prefix = dialog.getByLabel('Prefix');
  const phone = dialog.getByLabel('Phone');
  const firstName = dialog.getByLabel('First name');
  await expect(prefix).toBeVisible();
  const prefixBox = await prefix.boundingBox();
  const phoneBox = await phone.boundingBox();
  const nameBox = await firstName.boundingBox();
  if (!prefixBox || !phoneBox || !nameBox) throw new Error('prefix or phone box missing');
  expect(prefixBox.width).toBeLessThanOrEqual(100);
  expect(phoneBox.width).toBeGreaterThan(prefixBox.width * 2);
  expect(prefixBox.height).toBeLessThanOrEqual(48);
  expect(Math.abs(prefixBox.height - nameBox.height)).toBeLessThanOrEqual(4);

  await firstName.fill('Mobile');
  await page.getByLabel('Last name').fill('Player');
  await page.getByLabel('Date of birth').fill('1990-01-15');
  await page.getByLabel('Postal code').fill('SW1A 1AA');
  await page.getByLabel('Address').fill('1 Test Street');
  await page.getByLabel('City').fill('London');
  await phone.fill('7700900123');
  await dialog.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('dialog', { name: 'Check your email' })).toHaveCount(0);
  await expect(page.getByText('Check your email')).toHaveCount(0);
  await expect(page).toHaveURL(/\/en\/casino$/);
  await expect(page).not.toHaveURL(/verify-email/);
  await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'Account mobile@example.com' })).toBeVisible();
});
