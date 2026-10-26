import { openPortfolio, settled, switchTo } from './portfolio-helpers';
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.route('**/', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('data-spotify-enabled="false"', 'data-spotify-enabled="true"') });
  });
});

async function offline(page: Page) {
  await page.route('**/api/spotify/now-playing', route => route.fulfill({ json: { status: 'offline', track: null, fetchedAt: Date.now(), retryAfterSeconds: 30 } }));
}
test('only the root entry exists and fresh documents start at Home', async ({ page }) => {
  await offline(page);
  const response = await page.request.get('/projects', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(response.headers().location).toBeUndefined();
  await openPortfolio(page, 'projects');
  await expect(page).toHaveURL('http://127.0.0.1:4325/');
  await expect(page).toHaveTitle('Projects — Your Name');
  await page.reload(); await settled(page, 'home');
  await expect(page.locator('[data-welcome]')).toBeHidden();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('Welcome retains its keyboard entrance and never replays during panel switching', async ({ page }) => {
  await offline(page); await page.goto('/');
  const enter = page.getByRole('button', { name: 'Enter my space' });
  await expect(enter).toBeVisible(); await enter.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-entry', 'entered');
  for (let i = 0; i < 3; i++) { await switchTo(page, 'projects'); await switchTo(page, 'home'); }
  await expect(enter).toBeHidden();
  await page.getByRole('button', { name: 'View larger profile photo' }).click();
  await page.keyboard.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('all panel switches preserve URL, history and every persistent DOM instance', async ({ page }) => {
  await offline(page); await openPortfolio(page);
  const before = await page.evaluate(() => {
    const state = window as any;
    state.selectors = ['[data-portfolio-shell]', '.site-navigation', '.contacts', '[data-ambient]', '#home', '#projects', '#contact', '[data-now-playing]'];
    state.identities = state.selectors.map((s: string) => document.querySelector(s));
    state.historyCalls = [];
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<History[typeof method]>) => { state.historyCalls.push(method); return Reflect.apply(original, history, args); };
    }
    return { href: location.href, pathname: location.pathname, hash: location.hash, length: history.length, state: history.state };
  });
  let documents = 0; page.on('request', request => { if (request.isNavigationRequest()) documents++; });
  for (const panel of ['projects', 'home', 'projects', 'home'] as const) {
    await switchTo(page, panel);
    expect(await page.evaluate(() => ({ href: location.href, pathname: location.pathname, hash: location.hash, length: history.length, state: history.state }))).toEqual(before);
  }
  expect(documents).toBe(0);
  expect(await page.evaluate(() => (window as any).identities.every((node: Element, i: number) => node.isConnected && document.querySelector((window as any).selectors[i]) === node))).toBe(true);
  expect(await page.evaluate(() => (window as any).historyCalls)).toEqual([]);
});

test('panel departure releases dialogs, restores scroll and clears stale modal state', async ({ page }) => {
  await offline(page); await page.setViewportSize({ width: 375, height: 667 });
  await openPortfolio(page, 'projects');
  const trigger = page.getByRole('button', { name: 'Explore Example Web Application', exact: true });
  for (let i = 0; i < 3; i++) {
    await trigger.click(); await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape'); await expect(page.locator('dialog[open]')).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await trigger.click();
  // Native modal inertness blocks user navigation; exercise controller cleanup programmatically.
  await page.locator('[data-panel-link="home"]').evaluate((button: HTMLButtonElement) => button.click());
  await settled(page, 'home');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await switchTo(page, 'home');
  await page.getByRole('button', { name: 'View larger profile photo' }).click();
  await page.locator('[data-panel-link="projects"]').evaluate((button: HTMLButtonElement) => button.click());
  await settled(page, 'projects');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  await trigger.click(); await page.getByRole('button', { name: 'Close Example Web Application details' }).click();
  await expect(trigger).toBeFocused();
});

test('keyboard and reduced motion switch immediately, announce the view and exclude hidden panels', async ({ page }) => {
  await offline(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await openPortfolio(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).focus(); await page.keyboard.press('Enter');
  await settled(page, 'projects'); await expect(page.locator('#projects h1')).toBeFocused();
  await expect(page.locator('#home')).toHaveAttribute('inert'); await expect(page.locator('#home')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-panel-announcer]')).toHaveText('Projects');
  expect(await page.locator('[data-panel-viewport]').evaluate(view => view.getAnimations().length)).toBe(0);
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Explore Example Web Application', exact: true })).toBeFocused();
  await page.keyboard.press('Space'); await expect(page.locator('dialog[open]')).toHaveCount(1); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Home', exact: true }).focus(); await page.keyboard.press('Enter'); await settled(page, 'home');
  await expect(page.locator('#projects')).toHaveAttribute('inert'); await expect(page.locator('#home h1')).toBeFocused();
});

test('latest intent wins rapid clicks and a 20-cycle stress test has no stale listeners or errors', async ({ page }) => {
  await offline(page); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await openPortfolio(page);
  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) document.querySelector<HTMLButtonElement>(`[data-panel-link="${i % 2 === 0 ? 'projects' : 'home'}"]`)!.click();
  });
  await settled(page, 'projects');
  for (let i = 0; i < 20; i++) { await switchTo(page, 'home'); await switchTo(page, 'projects'); }
  await page.getByRole('button', { name: 'Explore Example Developer Tool', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0); await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
  expect(errors).toEqual([]);
});

test('Tab during exit honors the destination navigation order', async ({ page }) => {
  await offline(page); await page.setViewportSize({ width: 375, height: 900 }); await openPortfolio(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-portfolio-shell]')).toHaveAttribute('data-panel-state', 'exiting');
  await page.keyboard.press('Tab'); await settled(page, 'projects');
  const firstProject = page.getByRole('button', { name: 'Explore Example Web Application', exact: true });
  await expect(firstProject).toBeFocused(); await expect(firstProject).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press('Space'); await expect(page.locator('dialog[open]')).toHaveCount(1); await page.keyboard.press('Escape');
});

test('Spotify retains its instance/progress, suspends timers, and aborts pending requests on hide', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as any; state.timers = new Set();
    const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.setInterval = ((fn: TimerHandler, delay?: number, ...args: any[]) => { const id = set(fn, delay, ...args); if (delay === 250) state.timers.add(id); return id; }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => { state.timers.delete(id); clear(id); }) as typeof window.clearInterval;
  });
  let requests = 0, failures = 0, release: (() => void) | undefined;
  page.on('requestfailed', request => { if (request.url().includes('/api/spotify')) failures++; });
  await page.route('**/api/spotify/now-playing', async route => {
    requests++; if (requests === 2) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { status: 'playing', track: { title: 'Persistent player fixture', artists: ['Test only'], album: '', artworkUrl: null, spotifyUrl: 'https://open.spotify.com/track/1234567890123456789012' }, fetchedAt: Date.now(), progressMs: 12000, durationMs: 180000, retryAfterSeconds: 30 } }).catch(() => {});
  });
  await openPortfolio(page); await expect(page.locator('[data-status-text]')).toHaveText('LIVE');
  await page.evaluate(() => { (window as any).musicNode = document.querySelector('[data-now-playing]'); (window as any).trackNode = document.querySelector('[data-track-layer]'); });
  await switchTo(page, 'projects'); expect(await page.evaluate(() => (window as any).timers.size)).toBe(0); expect(requests).toBe(1);
  await switchTo(page, 'home'); await expect.poll(() => requests).toBe(2); await expect(page.locator('[data-status-text]')).toHaveText('LIVE');
  await expect(page.locator('[data-spotify-link]')).toHaveAttribute('href', 'https://open.spotify.com/track/1234567890123456789012');
  expect(await page.evaluate(() => (window as any).musicNode === document.querySelector('[data-now-playing]') && (window as any).trackNode === document.querySelector('[data-track-layer]'))).toBe(true);
  expect(await page.evaluate(() => (window as any).timers.size)).toBe(1);
  await switchTo(page, 'projects'); await expect.poll(() => failures).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).timers.size)).toBe(0); release?.();
});

test('stale hidden playback cannot reappear LIVE while resume is pending', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); let requests = 0, release: (() => void) | undefined;
  await page.route('**/api/spotify/now-playing', async route => {
    requests++; if (requests > 1) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { status: 'playing', track: { title: 'Freshness fixture', artists: ['Test only'], album: '', artworkUrl: null, spotifyUrl: 'https://open.spotify.com/track/1234567890123456789012' }, fetchedAt: Date.now(), progressMs: 12000, durationMs: 180000, retryAfterSeconds: 30 } }).catch(() => {});
  });
  await openPortfolio(page); await expect(page.locator('[data-status-text]')).toHaveText('LIVE'); await switchTo(page, 'projects');
  await page.clock.setFixedTime(new Date(Date.now() + 46000)); await switchTo(page, 'home');
  await expect(page.locator('[data-status-text]')).toHaveText('UNAVAILABLE'); await expect(page.locator('[data-progress]')).toBeHidden();
  await switchTo(page, 'projects'); release?.();
});

test('resizing mid-transition leaves natural height, unclipped content and an operable gallery', async ({ page }) => {
  await offline(page); await openPortfolio(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('[data-portfolio-shell]')).toHaveAttribute('data-panel-state', 'entering');
  await page.setViewportSize({ width: 375, height: 667 }); await settled(page, 'projects');
  expect(await page.locator('[data-panel-viewport]').evaluate(view => (view as HTMLElement).style.height)).toBe('');
  await page.getByRole('button', { name: 'Explore Example Developer Tool', exact: true }).click(); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('without JavaScript all content is readable inline at the same root URL', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#home')).toBeVisible(); await expect(page.locator('#projects')).toBeVisible(); await expect(page.locator('#contact')).toBeVisible();
  await expect(page.locator('.site-navigation')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Example Web Application', exact: true })).toBeVisible();
  await expect(page.locator('a[href*="#"]')).toHaveCount(0);
  await expect(page).toHaveURL('http://127.0.0.1:4325/'); await context.close();
});

test('Home and Projects navigation preserves the keyboard accessible social links', async ({ page }) => {
  await offline(page); await openPortfolio(page);
  const original = await page.locator('.contact-link').evaluateAll(links => links.map(link => link.getAttribute('href')));
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button')).toHaveText(['Home', 'Projects']);
  await page.keyboard.press('Tab');
  await page.locator('#contact').focus();
  await settled(page, 'home'); await expect(page.locator('#contact')).toBeFocused();
  await expect(page.locator('#home')).toBeVisible(); await expect(page.locator('#projects')).toHaveAttribute('inert');
  await expect(page.locator('.contact-disabled')).toHaveCount(4);
  expect(await page.locator('.contact-link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(original);
  await switchTo(page, 'projects'); await expect(page.locator('.contacts')).toBeVisible();
  await settled(page, 'projects');
  await switchTo(page, 'home'); await expect(page.locator('.contacts')).toBeVisible();
});

test('Shift+Tab during a transition keeps the navigation order', async ({ page }) => {
  await offline(page); await openPortfolio(page);
  const projects = page.getByRole('button', { name: 'Projects', exact: true });
  await projects.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab');
  await settled(page, 'projects');
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeFocused();
});

for (const width of [375, 430, 768, 1280, 1440]) {
  test(`shared geometry and actual synchronized timelines at ${width}px`, async ({ page }, info) => {
    await offline(page); await page.setViewportSize({ width, height: 900 }); await openPortfolio(page); await settled(page, 'home');
    await page.evaluate(() => document.fonts.ready);
    const traces: any[] = [];
    for (const target of ['projects', 'home'] as const) {
      await page.evaluate(() => {
        const state = window as any;
        state.trace = { frames: [], phases: [], stop: false, shifts: [] };
        const trace = state.trace;
        const observer = new PerformanceObserver(list => trace.shifts.push(...list.getEntries().map((entry: any) => ({ value: entry.value, recentInput: entry.hadRecentInput }))));
        observer.observe({ type: 'layout-shift', buffered: false }); trace.observer = observer;
        const phases = (event: Event) => trace.phases.push({ ...(event as CustomEvent).detail, at: performance.now() });
        document.addEventListener('portfolio:state-change', phases); trace.listener = phases;
        const effective = (selector: string) => {
          let element = document.querySelector<HTMLElement>(selector), opacity = 1;
          while (element) { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden') return 0; opacity *= Number(style.opacity); element = element.parentElement; }
          return opacity;
        };
        const sample = () => {
          if (trace.stop) return;
          const shell = document.querySelector<HTMLElement>('[data-portfolio-shell]')!, view = document.querySelector<HTMLElement>('[data-panel-viewport]')!, footer = document.querySelector('.contacts')!;
          trace.frames.push({ at: performance.now(), state: shell.dataset.panelState, active: document.documentElement.dataset.portfolioView,
            shell: shell.getBoundingClientRect().toJSON(), navigation: document.querySelector('.site-navigation')!.getBoundingClientRect().toJSON(), footer: footer.getBoundingClientRect().toJSON(), viewport: view.getBoundingClientRect().toJSON(), scrollY,
            geometry: { padding: getComputedStyle(shell).padding, border: getComputedStyle(shell).borderWidth, radius: getComputedStyle(shell).borderRadius },
            home: ['.personal-column', '.tech-stack', '.music'].map(effective), projects: ['#projects h1', '.project-card:first-child', '.project-card:last-child'].map(effective), contact: ['.contact-copy', '.contact-grid'].map(effective),
            animations: view.getAnimations().map(animation => ({ start: animation.startTime, current: animation.currentTime, duration: animation.effect!.getTiming().duration, progress: animation.effect!.getComputedTiming().progress })) });
          requestAnimationFrame(sample);
        }; sample();
      });
      await switchTo(page, target);
      const trace = await page.evaluate(async () => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const trace = (window as any).trace; trace.stop = true; trace.observer.disconnect(); document.removeEventListener('portfolio:state-change', trace.listener);
        return { frames: trace.frames, phases: trace.phases, shifts: trace.shifts };
      });
      traces.push({ target, ...trace });
      const frames = trace.frames, x = frames.map((f: any) => f.shell.x), y = frames.map((f: any) => f.shell.y + f.scrollY);
      expect(Math.max(...x) - Math.min(...x)).toBeLessThan(0.1); expect(Math.max(...y) - Math.min(...y)).toBeLessThan(0.1);
      expect(new Set(frames.map((f: any) => f.shell.width)).size).toBe(1);
      expect(new Set(frames.map((f: any) => JSON.stringify(f.geometry))).size).toBe(1);
      expect(Math.max(...frames.map((f: any) => f.navigation.x)) - Math.min(...frames.map((f: any) => f.navigation.x))).toBeLessThan(0.1);
      expect(Math.max(...frames.map((f: any) => f.navigation.y + f.scrollY)) - Math.min(...frames.map((f: any) => f.navigation.y + f.scrollY))).toBeLessThan(0.1);
      expect(new Set(frames.map((f: any) => f.footer.x)).size).toBe(1);
      expect(new Set(frames.map((f: any) => f.footer.width)).size).toBe(1);
      const footerGap = frames.map((f: any) => f.footer.y - f.viewport.y - f.viewport.height);
      expect(Math.max(...footerGap) - Math.min(...footerGap)).toBeLessThan(10);
      expect(frames.some((f: any) => Math.max(...f.home) > 0.01 && Math.max(...f.projects) > 0.01)).toBe(false);
      for (const frame of frames) for (const group of [frame.home, frame.projects, frame.contact]) expect(Math.max(...group) - Math.min(...group)).toBeLessThan(0.00001);
      expect(trace.phases.map((p: any) => p.state)).toEqual(['exiting', 'switching', 'entering', 'idle']);
      const elapsed = trace.phases[3].at - trace.phases[0].at; expect(elapsed).toBeGreaterThanOrEqual(330); expect(elapsed).toBeLessThan(650);
      expect(new Set(frames.filter((f: any) => f.state === 'entering').map((f: any) => f.viewport.height)).size).toBeGreaterThan(3);
      expect(await page.locator('[data-panel-viewport]').evaluate(view => (view as HTMLElement).style.height)).toBe('');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${target}-${width}.png`), fullPage: true });
    }
    mkdirSync('tmp/persistent-shell/measurements', { recursive: true }); writeFileSync(`tmp/persistent-shell/measurements/${width}.json`, JSON.stringify(traces, null, 2));
  });
}
