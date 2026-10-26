import { test, expect } from '@playwright/test';
import { openPortfolio, settled, switchTo } from './portfolio-helpers';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Home and Projects keep the shared social footer accessible (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: { status: 'unconfigured', track: null, fetchedAt: Date.now(), retryAfterSeconds: 30 } }));
    await openPortfolio(page);
    const before = await page.evaluate(() => {
      (window as any).originalContactFooter = document.querySelector('#contact');
      return { href: location.href, length: history.length, state: history.state };
    });
    for (const panel of ['home', 'projects', 'home'] as const) {
      await switchTo(page, panel);
      await settled(page, panel);
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button')).toHaveText(['Home', 'Projects']);
      await expect(page.locator('[data-panel-link="contact"]')).toHaveCount(0);
      await expect(page.locator('.contacts')).toHaveCount(1);
      await expect(page.locator('.contacts')).toBeVisible();
      expect(await page.evaluate(() => (window as any).originalContactFooter === document.querySelector('#contact'))).toBe(true);
      expect(await page.evaluate(() => ({ href: location.href, length: history.length, state: history.state }))).toEqual(before);
      const links = page.locator('a.contact-link');
      if (await links.count()) {
        await links.first().focus();
        await expect(links.first()).toBeFocused();
      } else {
        for (const link of await page.locator('.contact-disabled').all()) await expect(link).toHaveAttribute('aria-disabled', 'true');
      }
    }
  });
}
