import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.getByRole('button', { name: 'Enter my space' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
  await expect(page.getByRole('button', { name: 'View larger profile photo' })).toBeEnabled();
}

test('welcome, keyboard lightbox, safe empty socials, and disabled music', async ({ page }) => {
  const errors: string[] = [];
  const broken: string[] = [];
  const musicRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) broken.push(response.url()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/spotify/now-playing' || /(?:spotify\.com|scdn\.co)$/.test(url.hostname)) musicRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'welcome.' })).toBeVisible();
  await expect(page.locator('.welcome-word')).toHaveCSS('animation-name', 'quick-text-fade');
  await expect(page.locator('.welcome-period')).toHaveCSS('animation-name', 'period-blink');
  await enter(page);
  await expect(page.getByText('Your Name', { exact: true })).toBeVisible();
  await expect(page.locator('[data-status-text]')).toHaveText('UNCONFIGURED');
  await expect(page.locator('[data-artwork]')).toBeHidden();
  await expect(page.locator('[data-progress]')).toBeHidden();
  await expect(page.locator('[data-spotify-link]')).toBeHidden();
  expect(await page.locator('.contact-grid a').count()).toBe(0);
  expect(await page.locator('.contact-disabled[aria-disabled="true"]').count()).toBe(4);
  await page.locator('.contact-item').first().hover();
  await expect(page.locator('.contact-tooltip').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.contact-tooltip').first()).toHaveCSS('opacity', '0');
  const photo = page.getByRole('button', { name: 'View larger profile photo' });
  await photo.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Profile photo' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-photo-expanded]')).toHaveJSProperty('naturalWidth', 600);
  await expect(page.getByRole('button', { name: 'Close photo' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(photo).toBeFocused();
  expect(await page.locator('img[src]').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
  expect(broken).toEqual([]);
  expect(musicRequests).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`layout fits ${width}px and preserves ambient shapes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await enter(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.music')).toBeVisible();
    await expect(page.locator('[data-photo-image]')).toBeVisible();
    expect(await page.locator('[data-ambient]').count()).toBe(1);
    if (width === 1440) {
      await page.mouse.move(1400, 200);
      await expect.poll(() => page.locator('[data-ambient]').evaluate(element => parseFloat((element as HTMLElement).style.getPropertyValue('--pointer-x')))).toBeGreaterThan(0);
      await page.screenshot({ path: 'test-results/preview-desktop.png', fullPage: true, animations: 'disabled' });
    }
    if (width === 390) await page.screenshot({ path: 'test-results/preview-mobile.png', fullPage: true, animations: 'disabled' });
  });
}

test('reduced motion disables ambient parallax and dialog animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await enter(page);
  await page.mouse.move(1100, 100);
  expect(await page.locator('[data-ambient]').evaluate(element => parseFloat((element as HTMLElement).style.getPropertyValue('--pointer-x')) || 0)).toBe(0);
  await expect(page.locator('.ambient-one')).toHaveCSS('translate', /^(none|0px(?: 0px)?)$/);
  await expect(page.locator('.ambient-one')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'View larger profile photo' }).click();
  await expect(page.locator('.photo-expanded')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('content is readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4325');
  await expect(page.getByText('Your Name', { exact: true })).toBeVisible();
  await expect(page.locator('[data-status-text]')).toHaveText('UNCONFIGURED');
  await context.close();
});

for (const status of ['playing', 'paused', 'offline', 'unavailable'] as const) {
  test(`mock Spotify ${status} state renders safely`, async ({ page }) => {
    // Opt in only in the intercepted test document; repository defaults stay disabled.
    await page.route('http://127.0.0.1:4325/', async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace('data-spotify-enabled="false"', 'data-spotify-enabled="true"');
      await route.fulfill({ response, body: html });
    });
    await page.route('**/api/spotify/now-playing', async route => {
      const track = status === 'playing' || status === 'paused' ? {
        title: 'Example Track', artists: ['Example Artist'], album: 'Example Album', artworkUrl: null,
        spotifyUrl: 'https://open.spotify.com/track/1234567890123456789012',
      } : null;
      await route.fulfill({ status: status === 'unavailable' ? 503 : 200, json: {
        status, track, progressMs: track ? 12000 : null, durationMs: track ? 180000 : null,
        fetchedAt: Date.now(), retryAfterSeconds: 30,
      } });
    });
    await page.goto('/');
    await enter(page);
    await expect(page.locator('[data-status-text]')).toHaveText(status === 'playing' ? 'LIVE' : status.toUpperCase());
    if (status === 'playing' || status === 'paused') {
      await expect(page.locator('[data-track-title]').last()).toHaveText('Example Track');
      await expect(page.locator('[data-progress]')).toBeVisible();
      await expect(page.locator('[data-spotify-link]')).toHaveAttribute('href', 'https://open.spotify.com/track/1234567890123456789012');
    } else {
      await expect(page.locator('[data-progress]')).toBeHidden();
      await expect(page.locator('[data-spotify-link]')).toBeHidden();
    }
  });
}
