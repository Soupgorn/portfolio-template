import { test, expect } from '@playwright/test';
import { openPortfolio, settled, switchTo } from './portfolio-helpers';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Contact scrolls/focuses the existing footer without URL/history changes (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: { status: 'unconfigured', track: null, fetchedAt: Date.now(), retryAfterSeconds: 30 } }));
    await openPortfolio(page);
    await page.evaluate(() => {
      const state = window as any;
      state.auditBefore = { href: location.href, length: history.length, state: history.state };
      state.auditScroll = [];
      state.auditFooter = document.querySelector('#contact');
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function(options) { state.auditScroll.push(options); return original.call(this, options); };
    });
    for (const panel of ['home', 'projects'] as const) {
      await switchTo(page, panel);
      await page.getByRole('button', { name: 'Contact', exact: true }).focus();
      await page.keyboard.press('Enter');
      await settled(page, panel);
      await expect(page.locator('#contact')).toBeFocused();
      await expect(page.locator('#contact')).toBeInViewport();
      expect(await page.evaluate(() => ({ href: location.href, length: history.length, state: history.state }))).toEqual(await page.evaluate(() => (window as any).auditBefore));
      expect(await page.evaluate(() => (window as any).auditFooter === document.querySelector('#contact'))).toBe(true);
      expect(await page.evaluate(() => (window as any).auditScroll.at(-1).behavior)).toBe(reducedMotion === 'reduce' ? 'instant' : 'smooth');
      await expect(page.locator('.contacts')).toHaveCount(1);
      await expect(page.locator('[data-panel-link="contact"]')).not.toHaveAttribute('aria-current');
    }
  });
}

test('Contact during panel exit finishes navigation and focuses the persistent footer', async ({ page }) => {
  await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: { status: 'offline', track: null, fetchedAt: Date.now(), retryAfterSeconds: 30 } }));
  await openPortfolio(page);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-panel-link="projects"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-panel-link="contact"]')!.click();
  });
  await settled(page, 'projects');
  await expect(page.locator('#contact')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
