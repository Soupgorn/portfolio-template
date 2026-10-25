import { openPortfolio, switchTo } from './portfolio-helpers';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: {
    status: 'offline', track: null, progressMs: null, durationMs: null,
    fetchedAt: Date.now(), retryAfterSeconds: 30,
  } }));
});

test('Projects opens internally with verified cards; refresh returns Home without replaying Welcome', async ({ page }) => {
  await openPortfolio(page, 'projects');
  await expect(page).toHaveTitle('Projects — Your Name');
  await expect(page.getByRole('heading', { name: "Example projects." })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Example Web Application', exact: true }).first()).toBeVisible();
  await expect(page.locator('.project-card')).toHaveCount(2);
  await expect(page.locator('[data-welcome]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your Name', exact: true })).toBeVisible();
  await expect(page.locator('[data-welcome]')).toBeHidden();
  await expect(page).toHaveURL('http://127.0.0.1:4325/');
});

test('keyboard navigation stays in one document and does not replay Welcome', async ({ page }) => {
  await openPortfolio(page);
  const projects = page.getByRole('button', { name: 'Projects', exact: true });
  await page.keyboard.press('Tab');
  await projects.focus(); await expect(projects).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: "Example projects." })).toBeFocused();
  await switchTo(page, 'home');
  await expect(page.locator('[data-welcome]')).toBeHidden();
  await expect(page.locator('[data-contact]')).not.toHaveAttribute('inert');
});

test('panel navigation works when session storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await openPortfolio(page, 'projects'); await page.getByRole('button', { name: 'Contact', exact: true }).click(); await expect(page.locator('#contact')).toBeFocused(); await switchTo(page, 'home');
  await expect(page.getByRole('heading', { name: 'Your Name', exact: true })).toBeVisible();
  await expect(page.locator('[data-welcome]')).toBeHidden();
  // Storage is deliberately unavailable: a fresh document correctly shows Welcome again.
  await page.reload(); await expect(page.getByRole('button', { name: 'Enter my space' })).toBeVisible();
});

for (const width of [375, 430, 768, 1280, 1440]) {
  test(`all panels fit ${width}px and retain their palette`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await openPortfolio(page);
    for (const panel of ['home', 'projects'] as const) {
      await switchTo(page, panel);
      await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator(':root').evaluate(element => getComputedStyle(element).getPropertyValue('--color-cream').trim())).toBe('#F8F4E8');
      for (const link of await page.locator('.site-navigation button').all()) {
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: info.outputPath(`${panel}-${width}.png`), fullPage: true });
    }
  });
}

test('touch labels are visible and personal details precede music on phones', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: { status: 'offline', track: null, fetchedAt: Date.now(), retryAfterSeconds: 30 } }));
  await openPortfolio(page);
  await expect(page.locator('.contact-caption').filter({ hasText: 'GitHub' })).toBeVisible();
  const details = await page.locator('.profile-details').boundingBox();
  const music = await page.locator('.music').boundingBox();
  expect(details!.y + details!.height).toBeLessThan(music!.y);
  await context.close();
});

test('reduced motion and enlarged text keep the projects path usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await openPortfolio(page, 'projects');
  await expect(page.locator('.site-navigation button').first()).toHaveCSS('transition-duration', '0s');
  await page.locator('.projects-panel').evaluate(panel => {
    const sizes = [...panel.querySelectorAll<HTMLElement>('h1, h2, p, a')].map(element => [element, Number.parseFloat(getComputedStyle(element).fontSize) * 2] as const);
    sizes.forEach(([element, size]) => { element.style.fontSize = `${size}px`; });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Name', exact: true })).toBeVisible();
  await expect(page.locator('[data-welcome]')).toBeHidden();
});
