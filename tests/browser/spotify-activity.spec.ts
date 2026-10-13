import { test, expect, type Page } from '@playwright/test';

const title = '音楽と小さな世界 🎵 A very long Unicode song title '.repeat(8);
const artworkUrl = 'https://i.scdn.co/image/abc123';
const trackUrl = 'https://open.spotify.com/track/1234567890123456789012';

async function mockActivity(page: Page, state: string) {
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
      title, artists: ['Example Artist', '歌手 二'], album: 'An Example Album', artworkUrl, spotifyUrl: trackUrl,
    } : null;
    return route.fulfill({ status: state === 'unavailable' ? 503 : 200, json: {
      status: state, track, progressMs: track ? 12000 : null, durationMs: track ? 180000 : null,
      fetchedAt: Date.now(), retryAfterSeconds: 30,
    } });
  });
}

async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter my space' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
}

for (const state of ['playing', 'paused', 'offline', 'unavailable']) {
  test(`activity ${state} has accurate copy and animations`, async ({ page }, info) => {
    await mockActivity(page, state);
    await enter(page);
    await expect(page.locator('[data-status-text]')).toHaveText(state === 'playing' ? 'LIVE' : state.toUpperCase());
    const active = state === 'playing' || state === 'paused';
    await expect(page.locator('[data-progress]')).toBeVisible({ visible: active });
    await expect(page.locator('[data-spotify-link]')).toBeVisible({ visible: active });
    await expect(page.locator('.live-dot')).toHaveCSS('animation-name', state === 'playing' ? 'live-pulse' : 'none');
    await expect(page.locator('.equalizer')).toHaveCSS('visibility', state === 'playing' ? 'visible' : 'hidden');
    if (active) {
      await expect(page.locator('[data-artwork]:not([data-outgoing] *)')).toBeVisible();
      await expect(page.locator('[data-track-artist]').last()).toHaveText('Example Artist, 歌手 二');
      await expect(page.locator('[data-spotify-link]')).toHaveAttribute('href', trackUrl);
      await expect(page.locator('[data-activity-detail]')).toHaveText(state === 'playing' ? 'Listening on Spotify' : 'Playback paused');
    } else {
      await expect(page.locator('[data-track-title]').last()).toHaveText(state === 'offline' ? 'Not listening right now' : 'Spotify is taking a break.');
      await expect(page.locator('[data-track-artist]').last()).toHaveText(state === 'offline' ? 'probably building something.' : 'please try again later.');
    }
    await page.screenshot({ path: info.outputPath(`activity-${state}.png`), fullPage: true });
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`long Unicode activity fits ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockActivity(page, 'playing');
    await enter(page);
    await expect(page.locator('[data-status-text]')).toHaveText('LIVE');
    await expect(page.locator('[data-track-title]').last()).toContainText('音楽');
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
