import { expect, type Page } from '@playwright/test';

export type Panel = 'home' | 'projects';

export async function settled(page: Page, panel: Panel) {
  await expect(page.locator('html')).toHaveAttribute('data-portfolio-view', panel);
  await expect(page.locator('[data-portfolio-shell]')).toHaveAttribute('data-panel-state', 'idle');
  await expect(page.locator(`#${panel}`)).not.toHaveAttribute('inert');
}

export async function switchTo(page: Page, panel: Panel) {
  await page.locator(`[data-panel-link="${panel}"]`).first().click();
  await settled(page, panel);
}

export async function openPortfolio(page: Page, panel: Panel = 'home') {
  await page.goto('/');
  if (await page.locator('html').getAttribute('data-entry') === 'welcome') {
    await page.getByRole('button', { name: 'Enter my space' }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
  await settled(page, 'home');
  if (panel !== 'home') await switchTo(page, panel);
}
