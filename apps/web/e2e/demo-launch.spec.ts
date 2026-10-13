import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const FAKE_GAME_URL = 'https://example.com/fake-game';
const FAKE_GAME_HTML = `<!doctype html><html><body>
<p id="fake-game">Fake game ready</p>
<p id="raf-count">0</p>
<p id="interval-count">0</p>
<p id="visibility-state">unknown</p>
<script>
  var raf = 0;
  var ticks = 0;
  var rafNode = document.getElementById('raf-count');
  var tickNode = document.getElementById('interval-count');
  var visibilityNode = document.getElementById('visibility-state');
  function paintVisibility() { visibilityNode.textContent = document.visibilityState; }
  paintVisibility();
  document.addEventListener('visibilitychange', paintVisibility);
  setInterval(function () {
    ticks += 1;
    tickNode.textContent = String(ticks);
  }, 50);
  function frame() {
    raf += 1;
    rafNode.textContent = String(raf);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
</script>
</body></html>`;
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
  await page.goto('/casino');
  await expect(page.getByRole('heading', { level: 1, name: 'Casino' })).toBeVisible();
}

function gamePage(page: Page) {
  return page.locator('[data-game-page]');
}

function demoFrame(page: Page, title: string) {
  return page.frameLocator(`iframe[title="${title} demo"]`);
}

function gameFrame(page: Page, title: string) {
  return page.locator(`iframe[title="${title} demo"]`);
}

interface LiveSample {
  raf: number;
  interval: number;
  visibility: string;
}

async function readLive(page: Page, title: string): Promise<LiveSample> {
  const frame = demoFrame(page, title);
  const [raf, interval, visibility] = await Promise.all([
    frame.locator('#raf-count').innerText(),
    frame.locator('#interval-count').innerText(),
    frame.locator('#visibility-state').innerText(),
  ]);
  return { raf: Number(raf), interval: Number(interval), visibility };
}

async function frameSnapshot(page: Page, title: string) {
  return gameFrame(page, title).evaluate((element) => {
    const frame = element as HTMLIFrameElement;
    if (!frame.dataset.liveInstance) frame.dataset.liveInstance = `${Date.now()}-${Math.random()}`;
    const rect = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    let display = style.display;
    let visibility = style.visibility;
    let opacity = style.opacity;
    let current: Element | null = frame;
    while (current) {
      const ancestor = getComputedStyle(current);
      if (ancestor.display === 'none') display = 'none';
      if (ancestor.visibility === 'hidden' || ancestor.getPropertyValue('content-visibility') === 'hidden') {
        visibility = 'hidden';
      }
      if (ancestor.opacity === '0') opacity = '0';
      current = current.parentElement;
    }
    return {
      instance: frame.dataset.liveInstance ?? '',
      src: frame.getAttribute('src') ?? '',
      display,
      visibility,
      opacity,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      parked: Boolean(frame.closest('[data-game-parked], .game-live-parked')),
    };
  });
}

async function expectKeepsRunning(page: Page, title: string) {
  const before = await readLive(page, title);
  await expect
    .poll(async () => (await readLive(page, title)).raf, { timeout: 2_000 })
    .toBeGreaterThan(before.raf + 2);
  return readLive(page, title);
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

    const player = gamePage(page);
    await expect(player).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(player.getByRole('heading', { name: 'Book of Tests' })).toBeVisible();
    await expect(player.getByText('Test Provider').first()).toBeVisible();
    await expect(player.locator('.game-mode-chip')).toHaveText('Demo');
    const iframe = player.locator('iframe[title="Book of Tests demo"]');
    await expect(iframe).toBeVisible();
    const [headerBox, frameBox, barBox, footerBox, playerBox] = await Promise.all([
      page.locator('header').boundingBox(),
      iframe.boundingBox(),
      page.locator('[data-open-games]').boundingBox(),
      page.locator('footer').boundingBox(),
      player.boundingBox(),
    ]);
    expect(headerBox && frameBox && barBox && footerBox && playerBox).toBeTruthy();
    expect(frameBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
    expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(barBox!.y + 2);
    expect(footerBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    expect(routes.posts()).toBe(1);
  });

  test('keeps the loading indicator off the iframe', async ({ page }) => {
    const routes = await installLaunchRoutes(page, { frameDelayMs: 1_000 });
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();

    const player = gamePage(page);
    const iframe = player.locator('iframe[title="Book of Tests demo"]');
    await expect(player.getByText('Loading game…')).toBeVisible();
    await expect(iframe).toBeVisible();
    expect(await iframeIsHitTarget(iframe)).toBe(true);
    await expect(player.locator('.absolute.inset-0.grid.place-items-center')).toHaveCount(0);
    expect(routes.posts()).toBe(1);
  });

  test('shows the slow warning only after 45 seconds', async ({ page }) => {
    await page.clock.install();
    const routes = await installLaunchRoutes(page, { hangFrame: true });
    try {
      await openCasino(page);
      await page.getByRole('button', { name: BOOK_DEMO }).click();

      const player = gamePage(page);
      const iframe = player.locator('iframe[title="Book of Tests demo"]');
      await expect(player.getByText('Loading game…')).toBeVisible();

      await page.clock.fastForward(44_000);
      await expect(player.getByText('This is taking longer than usual')).toHaveCount(0);

      await page.clock.fastForward(2_000);
      await expect(player.getByText('This is taking longer than usual')).toBeVisible();
      await expect(player.getByRole('button', { name: 'Keep waiting' })).toBeVisible();
      await expect(player.getByRole('button', { name: 'Reload game' })).toBeVisible();
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

    const player = gamePage(page);
    await expect(player.getByText('Couldn’t start the demo')).toBeVisible();
    await expect(player.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Back to lobby' }).first()).toBeVisible();
    await expect(player.locator('iframe')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(routes.posts()).toBe(1);

    await player.getByRole('button', { name: 'Retry' }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    expect(routes.posts()).toBe(2);
  });

  test('Escape closes the dialog, keeps the lobby URL, and restores focus', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.keyboard.press('Escape');
    await expect(gamePage(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/casino$/);
    await expect(page.getByRole('button', { name: BOOK_DEMO })).toBeFocused();
    expect(routes.posts()).toBe(1);
  });

  test('Back to lobby closes the game page, keeps the lobby URL, and restores focus', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    const player = gamePage(page);
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await player.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(gamePage(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/casino$/);
    await expect(page.getByRole('button', { name: BOOK_DEMO })).toBeFocused();
    expect(routes.posts()).toBe(1);
  });

  test('browser back closes the dialog and stays on the casino lobby', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');

    await page.goBack();
    await expect(gamePage(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/casino$/);
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

      const player = document.querySelector('[data-game-page]');
      const back = Array.from(player?.querySelectorAll('button') ?? []).find((button) =>
        button.textContent?.includes('Back to lobby'),
      );
      const second = document.querySelector<HTMLButtonElement>(`button[aria-label="${secondName}"]`);
      if (!back || !second) throw new Error('missing history-race controls');
      back.click();
      second.click();
    }, SECOND_DEMO);

    expect(routes.posts()).toBe(1);
    await expect(gamePage(page)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __brandPopCount?: number }).__brandPopCount ?? 0))
      .toBe(1);

    await page.getByRole('button', { name: SECOND_DEMO }).click();
    const player = gamePage(page);
    await expect(player.getByRole('heading', { name: 'Second Test' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(player.getByRole('heading', { name: 'Second Test' })).toBeVisible();
    expect(routes.posts()).toBe(2);
  });

  test('does not launch a live game when demo is unavailable', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await page.goto('/live-casino');
    await expect(page.getByText('Demo unavailable')).toBeVisible();
    await page.getByRole('heading', { name: 'Test Blackjack' }).click({ force: true });
    await expect(gamePage(page)).toHaveCount(0);
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

  await page.locator('[data-open-games]').getByRole('button', { name: 'Add game' }).click();
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
  await page.goto('/casino?demoSoftMs=4000&demoStrongMs=8000');
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

    const player = gamePage(page);
    const iframe = player.locator('iframe[title="Book of Tests demo"]');
    await expect(iframe).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Back to lobby' })).toBeVisible();
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
    const parked = await frameSnapshot(page, 'Second Test');
    expect(parked.parked).toBe(true);
    expect(parked.display).not.toBe('none');
    expect(parked.visibility).not.toBe('hidden');
    expect(parked.opacity).toBe('0');
    expect(parked.width).toBeGreaterThan(100);
    await page.waitForTimeout(400);
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);
  });

  test('keeps the background game running and does not relaunch it', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    const book = await frameSnapshot(page, 'Book of Tests');
    await expectKeepsRunning(page, 'Book of Tests');

    await page.getByRole('button', { name: 'Add game' }).first().click();
    const whileChoosing = await frameSnapshot(page, 'Book of Tests');
    expect(whileChoosing.instance).toBe(book.instance);
    expect(whileChoosing.src).toBe(book.src);
    expect(whileChoosing.display).not.toBe('none');
    expect(whileChoosing.opacity).toBe('0');
    expect(whileChoosing.width).toBeGreaterThan(100);
    await expectKeepsRunning(page, 'Book of Tests');

    await page.getByRole('button', { name: SECOND_DEMO }).click();
    await expect(demoFrame(page, 'Second Test').locator('#fake-game')).toHaveText('Fake game ready');
    const bookBackground = await frameSnapshot(page, 'Book of Tests');
    expect(bookBackground.instance).toBe(book.instance);
    expect(bookBackground.src).toBe(book.src);
    expect(bookBackground.parked).toBe(true);
    expect(bookBackground.opacity).toBe('0');
    expect(bookBackground.display).not.toBe('none');
    const bookWhileHidden = await expectKeepsRunning(page, 'Book of Tests');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);

    await page.getByRole('tab', { name: 'Book of Tests' }).click();
    await expect(gameFrame(page, 'Book of Tests')).toBeVisible();
    const bookRestored = await frameSnapshot(page, 'Book of Tests');
    const secondParked = await frameSnapshot(page, 'Second Test');
    expect(bookRestored.instance).toBe(book.instance);
    expect(bookRestored.parked).toBe(false);
    expect(secondParked.parked).toBe(true);
    expect(secondParked.display).not.toBe('none');
    const bookAfterSwitch = await readLive(page, 'Book of Tests');
    expect(bookAfterSwitch.raf).toBeGreaterThan(bookWhileHidden.raf);
    expect(bookAfterSwitch.visibility).toBe('visible');
    await expectKeepsRunning(page, 'Second Test');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);

    await page.getByRole('button', { name: 'Close Second Test' }).click();
    await expect(gameFrame(page, 'Second Test')).toHaveCount(0);
    const bookAfterClose = await frameSnapshot(page, 'Book of Tests');
    expect(bookAfterClose.instance).toBe(book.instance);
    expect(bookAfterClose.src).toBe(book.src);
    await expectKeepsRunning(page, 'Book of Tests');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);
  });
});

test.describe('desktop background games stay live', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps autospin running while another game is open, floating, or closed', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    const book = await frameSnapshot(page, 'Book of Tests');
    expect(book.parked).toBe(false);
    await expectKeepsRunning(page, 'Book of Tests');

    await page.locator('[data-open-games]').getByRole('button', { name: 'Add game' }).click();
    const whileChoosing = await frameSnapshot(page, 'Book of Tests');
    expect(whileChoosing.instance).toBe(book.instance);
    expect(whileChoosing.src).toBe(book.src);
    expect(whileChoosing.parked).toBe(true);
    expect(whileChoosing.display).not.toBe('none');
    expect(whileChoosing.visibility).not.toBe('hidden');
    expect(whileChoosing.opacity).toBe('0');
    expect(whileChoosing.width).toBeGreaterThan(100);
    await expectKeepsRunning(page, 'Book of Tests');
    await expect(page.getByRole('button', { name: SECOND_DEMO })).toBeVisible();

    await page.getByRole('button', { name: SECOND_DEMO }).click();
    await expect(demoFrame(page, 'Second Test').locator('#fake-game')).toHaveText('Fake game ready');
    await expect(gameFrame(page, 'Second Test')).toBeVisible();
    const bookBackground = await frameSnapshot(page, 'Book of Tests');
    const second = await frameSnapshot(page, 'Second Test');
    expect(bookBackground.instance).toBe(book.instance);
    expect(bookBackground.src).toBe(book.src);
    expect(bookBackground.parked).toBe(true);
    expect(bookBackground.opacity).toBe('0');
    expect(bookBackground.display).not.toBe('none');
    expect(second.parked).toBe(false);
    const bookWhileHidden = await expectKeepsRunning(page, 'Book of Tests');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);

    await page.getByRole('tab', { name: 'Book of Tests' }).click();
    await expect(gameFrame(page, 'Book of Tests')).toBeVisible();
    const bookRestored = await frameSnapshot(page, 'Book of Tests');
    const secondBackground = await frameSnapshot(page, 'Second Test');
    expect(bookRestored.instance).toBe(book.instance);
    expect(bookRestored.src).toBe(book.src);
    expect(bookRestored.parked).toBe(false);
    expect(secondBackground.instance).toBe(second.instance);
    expect(secondBackground.parked).toBe(true);
    const bookAfterSwitch = await readLive(page, 'Book of Tests');
    expect(bookAfterSwitch.raf).toBeGreaterThan(bookWhileHidden.raf);
    expect(bookAfterSwitch.visibility).toBe('visible');
    await expectKeepsRunning(page, 'Second Test');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);

    await page.getByRole('tab', { name: 'Second Test' }).click();
    await page.getByRole('button', { name: 'Pop out Second Test into a floating window' }).click();
    await expect(gameFrame(page, 'Second Test')).toBeVisible();
    const bookAfterPop = await frameSnapshot(page, 'Book of Tests');
    const secondFloating = await frameSnapshot(page, 'Second Test');
    expect(bookAfterPop.instance).toBe(book.instance);
    expect(secondFloating.instance).toBe(second.instance);
    expect(secondFloating.parked).toBe(false);
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);

    await page.getByRole('button', { name: 'Minimize Second Test' }).click();
    const secondMinimized = await frameSnapshot(page, 'Second Test');
    expect(secondMinimized.instance).toBe(second.instance);
    expect(secondMinimized.parked).toBe(true);
    expect(secondMinimized.display).not.toBe('none');
    expect(secondMinimized.opacity).toBe('0');
    await expectKeepsRunning(page, 'Second Test');
    await expectKeepsRunning(page, 'Book of Tests');

    await page.getByRole('button', { name: 'Second Test artwork Second Test' }).click();
    const secondRestored = await frameSnapshot(page, 'Second Test');
    expect(secondRestored.instance).toBe(second.instance);
    expect(secondRestored.parked).toBe(false);

    await page.getByRole('tablist', { name: 'Open games' }).getByRole('button', { name: 'Close Second Test' }).click();
    await expect(gameFrame(page, 'Second Test')).toHaveCount(0);
    const bookAfterClose = await frameSnapshot(page, 'Book of Tests');
    expect(bookAfterClose.instance).toBe(book.instance);
    expect(bookAfterClose.src).toBe(book.src);
    await expectKeepsRunning(page, 'Book of Tests');
    expect(routes.posts()).toBe(2);
    expect(routes.frameHits()).toBe(2);
  });

  test('keeps the open games bar on other routes and returns without a new launch', async ({ page }) => {
    const routes = await installLaunchRoutes(page);
    await openCasino(page);
    await page.getByRole('button', { name: BOOK_DEMO }).click();
    await expect(demoFrame(page, 'Book of Tests').locator('#fake-game')).toHaveText('Fake game ready');
    const book = await frameSnapshot(page, 'Book of Tests');

    await page.getByRole('link', { name: 'Sports' }).first().click();
    await expect(page).toHaveURL(/\/sports/);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.locator('[data-open-games]')).toBeVisible();
    await expect(gamePage(page)).toHaveCount(0);
    const parked = await frameSnapshot(page, 'Book of Tests');
    expect(parked.instance).toBe(book.instance);
    expect(parked.parked).toBe(true);
    expect(parked.opacity).toBe('0');
    expect(parked.display).not.toBe('none');
    expect(parked.width).toBeGreaterThan(100);

    await page.getByRole('tab', { name: 'Book of Tests' }).click();
    await expect(gamePage(page)).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    const restored = await frameSnapshot(page, 'Book of Tests');
    expect(restored.instance).toBe(book.instance);
    expect(restored.parked).toBe(false);
    expect(routes.posts()).toBe(1);
    expect(routes.frameHits()).toBe(1);

    await page.getByRole('link', { name: 'Sports' }).first().click();
    await expect(page).toHaveURL(/\/sports/);
    await expect(gamePage(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'The book is open' })).toBeVisible();
    expect((await frameSnapshot(page, 'Book of Tests')).instance).toBe(book.instance);
    expect(routes.posts()).toBe(1);
    expect(routes.frameHits()).toBe(1);
  });
});
