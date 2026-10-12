import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const FAKE_GAME_URL = 'https://example.com/fake-game';
const FAKE_GAME_HTML =
  '<!doctype html><html><body><p id="fake-game">Fake game ready</p></body></html>';
const BOOK_DEMO = 'Play Book of Tests demo';
const SECOND_DEMO = 'Play Second Test demo';

type LaunchResult = 'ok' | '502';

interface RouteOptions {
  launchDelayMs?: number;
  responses?: LaunchResult[];
  frameDelayMs?: number;
  hangFrame?: boolean;
}

interface LaunchRoutes {
  posts: () => number;
  frameHits: () => number;
  releaseFrame: () => void;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requestHost(url: string) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

async function installLaunchRoutes(page: Page, options: RouteOptions = {}): Promise<LaunchRoutes> {
  let posts = 0;
  let frameHits = 0;
  let releaseFrame = () => {};
  const frameHold = new Promise<void>((resolve) => {
    releaseFrame = resolve;
  });
  const planned = options.responses ?? ['ok'];
  let responseIndex = 0;

  const takeResponse = (): LaunchResult => {
    const kind = planned[Math.min(responseIndex, Math.max(planned.length - 1, 0))];
    responseIndex += 1;
    return kind ?? 'ok';
  };

  await page.route('**/*', async (route) => {
    if (requestHost(route.request().url()).includes('cobraflux')) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.route(/\/api\/games\/[^/]+\/launch\/demo$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.abort('blockedbyclient');
      return;
    }
    posts += 1;
    if (options.launchDelayMs) await delay(options.launchDelayMs);
    if (takeResponse() === '502') {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'launch_unavailable', message: 'Game launch is unavailable' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ launchUrl: FAKE_GAME_URL, mode: 'demo' }),
    });
  });

  await page.route(/https:\/\/example\.com\/.*/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/fake-game') {
      await route.abort('blockedbyclient');
      return;
    }
    frameHits += 1;
    await fulfillFakeGame(route);
  });

  async function fulfillFakeGame(route: Route) {
    if (options.hangFrame) await frameHold;
    else if (options.frameDelayMs) await delay(options.frameDelayMs);
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: FAKE_GAME_HTML,
    });
  }

  return {
    posts: () => posts,
    frameHits: () => frameHits,
    releaseFrame,
  };
}

async function openCasino(page: Page) {
  await page.goto('/en/casino');
  await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
}

function demoFrame(page: Page, title: string) {
  return page.frameLocator(`iframe[title="${title} demo"]`);
}

async function iframeIsHitTarget(iframe: Locator) {
  return iframe.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element;
  });
}

test.describe('demo game launch', () => {
  test('sends one launch when the demo button is clicked twice in flight', async ({ page }) => {
    const routes = await installLaunchRoutes(page, { launchDelayMs: 300 });
    await openCasino(page);

    await page.evaluate((name) => {
      const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
      if (!button) throw new Error('missing demo button');
      button.click();
      button.click();
    }, BOOK_DEMO);

    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    expect(routes.posts()).toBe(1);
  });

  test('opens the demo dialog and shows the fake game', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Book of Tests' })).toBeVisible();
    await expect(dialog.getByText('Test Provider · Demo')).toBeVisible();
    await expect(dialog.locator('iframe[title="Book of Tests demo"]')).toBeVisible();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    expect(routes.posts()).toBe(1);
  });

  test('keeps the loading indicator off the iframe', async ({ page }) => {
    const routes = await installLaunchRoutes(page, { frameDelayMs: 1_000 });
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();

    const dialog = page.getByRole('dialog');
    const iframe = dialog.locator('iframe[title="Book of Tests demo"]');
    await expect(dialog.getByText('Loading game…')).toBeVisible();
    await expect(iframe).toBeVisible();
    expect(await iframeIsHitTarget(iframe)).toBe(true);
    await expect(dialog.locator('.place-items-center')).toHaveCount(0);
    expect(routes.posts()).toBe(1);
  });

  test('shows the slow warning only after 45 seconds', async ({ page }) => {
    await page.clock.install();
    const routes = await installLaunchRoutes(page, { hangFrame: true });
    try {
      await openCasino(page);
      await page.getByRole('button', { name: BOOK_DEMO }).click();

      const dialog = page.getByRole('dialog');
      const iframe = dialog.locator('iframe[title="Book of Tests demo"]');
      await expect(dialog.getByText('Loading game…')).toBeVisible();

      await page.clock.fastForward(44_000);
      await expect(dialog.getByText('This is taking longer than usual')).toHaveCount(0);

      await page.clock.fastForward(2_000);
      await expect(dialog.getByText('This is taking longer than usual')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Keep waiting' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Reload game' })).toBeVisible();
      await expect(iframe).toHaveCount(1);
      expect(routes.posts()).toBe(1);
    } finally {
      routes.releaseFrame();
    }
  });

  test('shows the launch error without auto-retry and recovers on Retry', async ({ page }) => {
    const routes = await installLaunchRoutes(page, { responses: ['502', 'ok'] });
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Couldn’t start the demo')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back to lobby' }).first()).toBeVisible();
    await expect(dialog.locator('iframe')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(routes.posts()).toBe(1);

    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    expect(routes.posts()).toBe(2);
  });

  test('Escape closes the dialog, keeps the lobby URL, and restores focus', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/casino$/);
    await expect(page.getByRole('button', { name: BOOK_DEMO })).toBeFocused();
    expect(routes.posts()).toBe(1);
  });

  test('Back to lobby closes the dialog, keeps the lobby URL, and restores focus', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    const dialog = page.getByRole('dialog');
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await dialog.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/casino$/);
    await expect(page.getByRole('button', { name: BOOK_DEMO })).toBeFocused();
    expect(routes.posts()).toBe(1);
  });

  test('browser back closes the dialog and stays on the casino lobby', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/casino$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
    expect(routes.posts()).toBe(1);
  });

  test('does not relaunch until the pending history back settles', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.evaluate((secondName) => {
      const record = window as Window & { __brandPopCount?: number };
      record.__brandPopCount = 0;
      window.addEventListener('popstate', () => {
        record.__brandPopCount = (record.__brandPopCount ?? 0) + 1;
      });

      const dialog = document.querySelector('[role="dialog"]');
      const back = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) =>
        button.textContent?.includes('Back to lobby'),
      );
      const second = document.querySelector<HTMLButtonElement>(`button[aria-label="${secondName}"]`);
      if (!back || !second) throw new Error('missing history-race controls');
      back.click();
      second.click();
    }, SECOND_DEMO);

    expect(routes.posts()).toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __brandPopCount?: number }).__brandPopCount ?? 0))
      .toBe(1);

    await page.getByRole('button', { name: SECOND_DEMO }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Second Test' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(dialog.getByRole('heading', { name: 'Second Test' })).toBeVisible();
    expect(routes.posts()).toBe(2);
  });

  test('does not launch a live game when demo is unavailable', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await page.goto('/en/live-casino');
    await expect(page.getByText('Demo unavailable')).toBeVisible();
    await page.getByRole('heading', { name: 'Test Blackjack' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(routes.posts()).toBe(0);
  });

  test('requests the fake game once after the iframe loads', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.waitForLoadState('networkidle', { timeout: 1_000 }).catch(() => undefined);
    expect(routes.posts()).toBe(1);
    expect(routes.frameHits()).toBe(1);
  });
});

test('keeps two games mounted and does not relaunch the one that stays open', async ({ page }) => {
  const routes = await installLaunchRoutes(page);
  await openCasino(page);
  await page.getByRole('button', { name: BOOK_DEMO }).click();
  await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

  await page.getByRole('button', { name: 'Add game' }).click();
  await page.getByRole('button', { name: SECOND_DEMO }).click();
  await expect(demoFrame(page, 'Second Test').locator('#fake-game')).toHaveText('Fake game ready');
  await expect(page.locator('iframe[title="Book of Tests demo"]')).toHaveCount(1);
  await expect(page.locator('iframe[title="Second Test demo"]')).toHaveCount(1);
  expect(routes.posts()).toBe(2);
  expect(routes.frameHits()).toBe(2);

  await page.getByRole('button', { name: 'Close Book of Tests' }).click();
  await expect(page.locator('iframe[title="Book of Tests demo"]')).toHaveCount(0);
  await expect(demoFrame(page, 'Second Test').locator('#fake-game')).toHaveText('Fake game ready');
  await page.waitForTimeout(400);
  expect(routes.posts()).toBe(2);
  expect(routes.frameHits()).toBe(2);
});

test('shows demo prompts from short development thresholds and lets play continue', async ({ page }) => {
  await page.clock.install();
  await installLaunchRoutes(page);
  await page.goto('/en/casino?demoSoftMs=4000&demoStrongMs=8000');
  await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
  await page.getByRole('button', { name: BOOK_DEMO }).click();
  await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
  await expect(page.getByText('Enjoying the game?')).toHaveCount(0);

  await page.clock.fastForward(3_500);
  await expect(page.getByText('Enjoying the game?')).toHaveCount(0);
  await page.clock.fastForward(1_500);
  await expect(page.getByText('Enjoying the game?')).toBeVisible();
  await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

  await page.getByRole('button', { name: 'Maybe later' }).click();
  await expect(page.getByText('Enjoying the game?')).toHaveCount(0);
  await page.clock.fastForward(4_000);
  await expect(page.getByText('Ready to play for real?')).toBeVisible();
  await page.getByRole('button', { name: 'Maybe later' }).click();
  await expect(page.getByText('Ready to play for real?')).toHaveCount(0);
  await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
});

test.describe('mobile demo launch', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fits the iframe to the viewport and shows Back to lobby', async ({ page }) => {
    await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();

    const dialog = page.getByRole('dialog');
    const iframe = dialog.locator('iframe[title="Book of Tests demo"]');
    await expect(iframe).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back to lobby' })).toBeVisible();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    const box = await iframe.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(Math.abs((box?.width ?? 0) - (viewport?.width ?? 0))).toBeLessThanOrEqual(2);
  });

  test('switches open games without relaunching the one that was minimized', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.getByRole('button', { name: 'Add game' }).first().click();
    await page.getByRole('button', { name: SECOND_DEMO }).click();
    await expect(demoFrame(page, 'Second Test').locator('#fake-game')).toHaveText('Fake game ready');
    await expect(page.getByRole('tab', { name: 'Book of Tests' })).toBeVisible();

    await page.getByRole('tab', { name: 'Book of Tests' }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    await expect(page.locator('iframe[title="Second Test demo"]')).toBeHidden();
    await page.waitForTimeout(400);
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);
  });
});
