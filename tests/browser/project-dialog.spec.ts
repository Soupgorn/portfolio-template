import { openPortfolio } from './portfolio-helpers';
import { test, expect, type Page } from '@playwright/test';

const fixture = '/__test/sections';
const triggerName = 'Explore Fixture only: screenshot and links';
async function open(page: Page) {
  const trigger = page.getByRole('button', { name: triggerName, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Fixture only: screenshot and links', exact: true });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

test('fictional samples have generic illustrations and no invented source repositories', async ({ page }) => {
  await openPortfolio(page, 'projects');
  await expect(page.locator('.project-card')).toHaveCount(2);
  for (const title of ['Example Web Application', 'Example Developer Tool']) {
    await page.getByRole('button', { name: `Explore ${title}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog.getByRole('link', { name: /View on GitHub/ })).toHaveCount(0);
    await expect(dialog.locator('.project-image img')).toBeVisible();
    await expect(dialog).toContainText('fictional');
    if (title === 'Example Web Application') await expect(dialog.getByRole('link', { name: /Live Demo/ })).toHaveAttribute('href', 'https://example.com/');
    else await expect(dialog.getByRole('link', { name: /Live Demo/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: `Close ${title} details` }).click();
    await expect(dialog).toBeHidden();
  }
});

test('cards open with pointer and close button restores focus and scroll styles', async ({ page }) => {
  await page.goto(fixture);
  await page.evaluate(() => { document.body.style.paddingRight = '7px'; });
  // The whole card surface opens the same native button action.
  await page.locator('.project-card').first().click({ position: { x: 30, y: 30 } });
  const dialog = page.getByRole('dialog', { name: 'Fixture only: screenshot and links' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'About the project' })).toBeVisible();
  await expect(dialog.locator('.detail-technologies li')).toHaveText(['TypeScript', 'Astro']);
  await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'Abstract test fixture cover');
  for (const link of await dialog.getByRole('link').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await dialog.getByRole('button', { name: /Close .* details/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: triggerName, exact: true })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('padding-right', '7px');
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
});

test('Enter and Space open; native focus stays contained; Escape closes', async ({ page }) => {
  await page.goto(fixture);
  const trigger = page.getByRole('button', { name: triggerName, exact: true });
  for (const key of ['Enter', 'Space']) {
    await trigger.focus();
    await expect(trigger).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press(key);
    const dialog = page.getByRole('dialog', { name: 'Fixture only: screenshot and links' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Close .* details/ })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.hasAttribute('open'))).toBe(true);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test('inside clicks do not dismiss; backdrop click closes and restores focus', async ({ page }) => {
  await page.goto(fixture);
  const { trigger, dialog } = await open(page);
  await dialog.getByRole('heading', { name: 'About the project' }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('missing optional data, invalid URLs, and private-source links are safely omitted', async ({ page }) => {
  for (const state of ['missing', 'private']) {
    await page.goto(`${fixture}?state=${state}`);
    await page.locator('[data-project-open]').first().click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByRole('link', { name: /View on GitHub/ })).toHaveCount(0);
    if (state === 'missing') {
      await expect(dialog.locator('img, a')).toHaveCount(0);
      await expect(dialog.locator('.project-image-placeholder')).toHaveCount(1);
      await expect(dialog.getByRole('heading', { name: 'Tech Stack' })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('empty gallery keeps its original intentional empty state', async ({ page }) => {
  await page.goto(`${fixture}?state=empty`);
  await expect(page.getByRole('heading', { name: 'No projects added yet.' })).toBeVisible();
  await expect(page.locator('.project-card, dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
});

test('failed screenshot requests use the neutral fallback without a broken image', async ({ page }) => {
  await page.route('**/images/example-web.svg', route => route.abort());
  await page.goto(fixture);
  const { dialog } = await open(page);
  await expect(dialog.locator('.project-image img')).toBeHidden();
  await expect(dialog.locator('.placeholder-copy')).toBeVisible();
});

test('enlarged dialog text keeps the close control and long content accessible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${fixture}?state=long`);
  const { dialog } = await open(page);
  await dialog.evaluate(element => {
    const nodes = [...element.querySelectorAll<HTMLElement>('h2,h3,p,li,a')];
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize) * 2);
    nodes.forEach((node, index) => { node.style.fontSize = `${sizes[index]}px`; });
    element.scrollTop = element.scrollHeight;
  });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: /Close .* details/ })).toBeInViewport();
  await dialog.getByRole('button', { name: /Close .* details/ }).click();
  await expect(dialog).toBeHidden();
});

for (const width of [375, 430, 768, 1280, 1440]) {
  test(`gallery and scrollable long modal fit ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 812 });
    await openPortfolio(page, 'projects');
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.locator('.project-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
    if (width >= 900) { expect(boxes[0].y).toBe(boxes[1].y); expect(boxes[0].height).toBeCloseTo(boxes[1].height, 0); }
    else expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    await page.screenshot({ path: info.outputPath(`gallery-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Explore Example Web Application', exact: true }).click();
    const realDialog = page.getByRole('dialog', { name: 'Example Web Application', exact: true });
    await page.keyboard.press('Shift+Tab');
    await expect(realDialog.getByRole('link', { name: /Live Demo/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(realDialog.getByRole('button', { name: 'Close Example Web Application details' })).toBeFocused();
    await realDialog.evaluate(dialog => { dialog.scrollTop = 0; });
    expect(await page.locator('dialog[open] .dialog-media').evaluate(media => {
      const bounds = media.getBoundingClientRect();
      const frame = media.querySelector('.project-image')!.getBoundingClientRect();
      const copy = media.querySelector('.project-image img')!.getBoundingClientRect();
      return frame.width <= bounds.width + 1 && copy.right <= frame.right + 1 && copy.left >= frame.left - 1;
    })).toBe(true);
    await page.screenshot({ path: info.outputPath(`example-modal-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.goto(`${fixture}?state=long`);
    const { dialog } = await open(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole('button', { name: /Close .* details/ })).toBeInViewport();
    await expect(dialog.getByRole('link', { name: /View on GitHub/ })).toBeInViewport();
    expect(await dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`long-modal-bottom-${width}.png`) });
    await dialog.getByRole('button', { name: /Close .* details/ }).click();
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('repeated opens, reduced motion, resize, and browser history release modal state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fixture);
  for (let i = 0; i < 6; i++) {
    const { dialog, trigger } = await open(page);
    await expect(dialog).toHaveCSS('animation-name', 'none');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  const { dialog } = await open(page);
  await page.setViewportSize({ width: 375, height: 600 });
  expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(568);
  await openPortfolio(page, 'projects');
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await page.goBack();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await open(page);
  await page.keyboard.press('Escape');
});

test('touch opening and scrolling reach links while the close control stays available', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${fixture}?state=long`);
  await page.getByRole('button', { name: triggerName, exact: true }).tap();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  // Scroll the native dialog; the tap/close path uses emulated touch input.
  await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('link', { name: /View on GitHub/ })).toBeInViewport();
  await dialog.getByRole('button', { name: /Close .* details/ }).tap();
  await expect(dialog).toBeHidden();
  await context.close();
});
