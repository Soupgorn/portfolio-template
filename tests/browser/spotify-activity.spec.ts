import { test, expect, type Page } from '@playwright/test';

const title = 'เพลงตัวอย่าง / Example Song / サンプル 🎵';
const artists = ['Example Artist', 'ศิลปินตัวอย่าง', '歌手 二'];
const artworkUrl = 'https://i.scdn.co/image/abc123';
const trackUrl = 'https://open.spotify.com/track/1234567890123456789012';

async function mockActivity(page: Page, state: string, longMetadata = false) {
  await page.route('**/', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace('data-spotify-enabled="false"', 'data-spotify-enabled="true"');
    await route.fulfill({ response, body });
  });
  await page.route(artworkUrl, route => route.fulfill({ contentType: 'image/svg+xml', body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#a7bda3"/><circle cx="60" cy="60" r="35" fill="#142c22"/><circle cx="60" cy="60" r="8" fill="#f7f1e3"/></svg>' }));
  await page.route('**/api/spotify/now-playing', route => {
    const track = state === 'playing' || state === 'paused' ? {
      title: longMetadata ? title.repeat(8) : title,
      artists: longMetadata ? artists.map(artist => artist.repeat(6)) : artists,
      // Singles can have identical album and track titles; only the track is visible.
      album: title, artworkUrl, spotifyUrl: trackUrl,
    } : null;
    return route.fulfill({ status: state === 'unavailable' ? 503 : 200, json: {
      status: state, track, progressMs: track ? 12000 : null, durationMs: track ? 180000 : null,
      fetchedAt: Date.now(), retryAfterSeconds: 30,
    } });
  });
}

async function enter(page: Page) {
  await page.goto('/');
  // Focus pauses the intentional idle breathe before Playwright's real click stability check.
  await page.getByRole('button', { name: 'Enter my space' }).focus();
  await page.getByRole('button', { name: 'Enter my space' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
}

for (const state of ['playing', 'paused', 'offline', 'unavailable', 'unconfigured']) {
  test(`activity ${state} has accurate copy and animations`, async ({ page }, info) => {
    await mockActivity(page, state);
    await enter(page);
    await expect(page.locator('[data-status-text]')).toHaveText(state === 'playing' ? 'LIVE' : state.toUpperCase());
    const active = state === 'playing' || state === 'paused';
    await expect(page.locator('[data-progress]')).toBeVisible({ visible: active });
    await expect(page.locator('[data-spotify-link]')).toBeVisible({ visible: active });
    await expect(page.locator('.live-dot')).toHaveCSS('animation-name', state === 'playing' ? 'live-pulse' : 'none');
    await expect(page.locator('.equalizer, [data-track-album], [data-activity-detail], .progress-hint, .progress-space')).toHaveCount(0);
    await expect(page.locator('[data-live-card]')).not.toContainText('Listening on Spotify');
    await expect(page.locator('[data-live-card]')).not.toContainText('read-only · near real-time');
    await expect(page.getByRole('heading', { name: 'On repeat' })).toBeVisible();
    if (active) {
      await expect(page.locator('[data-artwork]:not([data-outgoing] *)')).toBeVisible();
      await expect(page.locator('[data-track-artist]').last()).toHaveText(artists.join(', '));
      await expect(page.locator('[data-spotify-link]')).toHaveAttribute('href', trackUrl);
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
      await expect(page.locator('[data-track-title]').last()).toHaveCSS('font-size', '24px');
      await expect(page.locator('[data-track-title]').last()).toHaveCSS('font-weight', '600');
      await expect(page.locator('[data-track-artist]').last()).toHaveCSS('font-size', '19px');
      await expect(page.locator('[data-track-artist]').last()).toHaveCSS('font-weight', '500');
      await expect(page.locator('[data-track-artist]').last()).toHaveCSS('text-align', 'left');
      await expect(page.locator('[data-duration]')).toHaveText('3:00');
      const elapsed = await page.locator('[data-elapsed]').textContent();
      if (state === 'playing') {
        await expect.poll(() => page.locator('[data-elapsed]').textContent()).not.toBe(elapsed);
        await expect(page.locator('[data-progress-fill]')).toHaveCSS('transition-duration', '0.25s');
      } else {
        await page.waitForTimeout(1100);
        await expect(page.locator('[data-elapsed]')).toHaveText(elapsed!);
      }
    } else {
      await expect(page.locator('[data-track-title]').last()).toHaveText(state === 'offline' ? 'Not listening right now' : state === 'unconfigured' ? 'Your soundtrack starts here.' : 'Spotify is taking a break.');
      await expect(page.locator('[data-track-artist]').last()).toHaveText(state === 'offline' ? 'probably building something.' : state === 'unconfigured' ? 'Connect Spotify when you’re ready.' : 'please try again later.');
      const gap = await page.locator('[data-live-card]').evaluate(card => {
        const metadata = card.querySelector('.track-stage')!.getBoundingClientRect();
        const footer = card.querySelector('.spotify-footer')!.getBoundingClientRect();
        return footer.top - metadata.bottom;
      });
      expect(gap).toBeCloseTo(18, 0);
    }
    await page.screenshot({ path: info.outputPath(`activity-${state}.png`), fullPage: true });
  });
}

for (const width of [280, 320, 390, 768, 1440]) {
  test(`long Unicode activity fits ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockActivity(page, 'playing', true);
    await enter(page);
    await expect(page.locator('[data-status-text]')).toHaveText('LIVE');
    await expect(page.locator('[data-track-title]').last()).toContainText('サンプル');
    await expect(page.locator('[data-track-artist]').last()).toContainText('ศิลปินตัวอย่าง');
    for (const selector of ['[data-track-title]', '[data-track-artist]']) {
      const fits = await page.locator(selector).last().evaluate(element =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight + 1);
      expect(fits).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const image = await page.locator('[data-artwork]:not([data-outgoing] *)').boundingBox();
    expect(image).not.toBeNull();
    expect(image!.width).toBe(image!.height);
    await page.screenshot({ path: info.outputPath(`activity-${width}.png`), fullPage: true });
  });
}

test('reduced motion disables LIVE pulse and progress transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockActivity(page, 'playing');
  await enter(page);
  await expect(page.locator('[data-status-text]')).toHaveText('LIVE');
  await expect(page.locator('.live-dot')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[data-progress-fill]')).toHaveCSS('transition-duration', '0s');
});
