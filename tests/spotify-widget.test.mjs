import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString('base64')}`;
const modelUrl = compile(readFileSync(new URL('../src/lib/spotify-now-playing.ts', import.meta.url), 'utf8'));
const { mountNowPlaying } = await import(compile(readFileSync(new URL('../src/scripts/spotify-now-playing.ts', import.meta.url), 'utf8')
  .replace("'../lib/spotify-now-playing'", JSON.stringify(modelUrl)).replace('import.meta.env.BASE_URL', "'/'")));
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const url = 'https://open.spotify.com/track/1234567890123456789012';
const data = () => ({ status: 'playing', track: { title: '<script>long title</script>', artists: ['Artist'], album: 'Album',
  artworkUrl: 'https://i.scdn.co/image/abc123', spotifyUrl: url }, progressMs: 12000, durationMs: 180000,
  fetchedAt: Date.now(), retryAfterSeconds: 30 });

function setup(context, fetchMock, enabled = true) {
  const component = readFileSync(new URL('../src/components/MusicPlayer.astro', import.meta.url), 'utf8');
  const html = component.slice(component.indexOf('<section'), component.indexOf('</section>') + 10).replace(/<Icon[^>]*\/>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost', pretendToBeVisual: true });
  context.mock.method(globalThis, 'fetch', fetchMock);
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  dom.window.matchMedia = () => ({ matches: true });
  const root = dom.window.document.querySelector('[data-now-playing]');
  root.dataset.spotifyEnabled = String(enabled);
  const cleanup = mountNowPlaying(root);
  context.after(() => {
    cleanup(); dom.window.close();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
  });
  return { dom, root, cleanup, get: selector => root.querySelector(selector) };
}

test('disabled template keeps placeholder and never requests data', async context => {
  let calls = 0;
  const h = setup(context, async () => { calls += 1; throw new Error('Unexpected request'); }, false);
  const original = h.root.innerHTML;
  context.mock.timers.tick(300_000);
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  await flush();
  assert.equal(calls, 0);
  assert.equal(h.root.innerHTML, original);
});

test('widget renders safe real metadata, artwork, track link and pause progress', async context => {
  let paused = false;
  const h = setup(context, async () => new Response(JSON.stringify({ ...data(), status: paused ? 'paused' : 'playing' })));
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
  assert.equal(h.get('[data-track-title]').textContent, '<script>long title</script>');
  assert.equal(h.root.querySelector('script'), null);
  assert.equal(h.get('[data-spotify-link]').href, url);
  assert.equal(h.get('[data-artwork]').getAttribute('src'), data().track.artworkUrl);
  h.get('[data-artwork]').dispatchEvent(new h.dom.window.Event('load'));
  assert.equal(h.get('[data-artwork]').hidden, false);
  context.mock.timers.tick(1000);
  assert.equal(h.get('[data-elapsed]').textContent, '0:13');
  paused = true;
  context.mock.timers.tick(29000); await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'OFFLINE');
  context.mock.timers.tick(5000);
  assert.equal(h.get('[data-elapsed]').textContent, '0:12');
});

test('failed artwork loads retain calm placeholder', async context => {
  const h = setup(context, async () => new Response(JSON.stringify(data())));
  await flush();
  h.get('[data-artwork]').dispatchEvent(new h.dom.window.Event('error'));
  assert.equal(h.get('[data-artwork]').hidden, true);
});

test('track changes retain old artwork until the new image loads, then remove the outgoing image', async context => {
  let changed = false;
  const h = setup(context, async () => {
    const snapshot = data();
    if (changed) snapshot.track = { ...snapshot.track, title: 'Next confirmed song', artworkUrl: 'https://i.scdn.co/image/def456' };
    return new Response(JSON.stringify(snapshot));
  });
  await flush();
  h.get('[data-artwork]').dispatchEvent(new h.dom.window.Event('load'));
  changed = true;
  context.mock.timers.tick(30000); await flush();
  assert.equal(h.get('[data-track-title]').textContent, 'Next confirmed song');
  assert.equal(h.get('[data-artwork-outgoing]').src, 'https://i.scdn.co/image/abc123');
  h.get('[data-artwork]').dispatchEvent(new h.dom.window.Event('load'));
  assert.equal(h.get('[data-artwork-outgoing]'), null);
  assert.equal(h.get('[data-artwork]').hidden, false);
});

test('offline and unavailable states hide progress and external track link', async context => {
  let status = 'offline';
  const h = setup(context, async () => new Response(JSON.stringify({ ...data(), status, track: null, progressMs: null, durationMs: null })));
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'OFFLINE');
  assert.equal(h.get('[data-progress]').hidden, true);
  assert.equal(h.get('[data-spotify-link]').hidden, true);
  status = 'unavailable';
  context.mock.timers.tick(30000); await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'UNAVAILABLE');
});

test('stale cached responses cannot show LIVE or interpolated progress', async context => {
  const h = setup(context, async () => new Response(JSON.stringify({ ...data(), fetchedAt: Date.now() - 46000 })));
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'UNAVAILABLE');
  assert.equal(h.get('[data-progress]').hidden, true);
});

test('visibility cancels requests, suppresses polling and resumes with backoff intact', async context => {
  let calls = 0;
  let signal;
  const h = setup(context, async (_url, init) => {
    calls++; signal = init.signal;
    if (calls === 1) return new Response(JSON.stringify(data()));
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  await flush(); context.mock.timers.tick(30000); await flush();
  Object.defineProperty(h.dom.window.document, 'hidden', { value: true, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  assert.equal(signal.aborted, true);
  await flush(); context.mock.timers.tick(60000);
  assert.equal(calls, 2);
  assert.equal(h.get('[data-live-card]').dataset.status, 'unavailable');
  Object.defineProperty(h.dom.window.document, 'hidden', { value: false, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  await flush(); assert.equal(calls, 3);
  h.cleanup();
  context.mock.timers.tick(300000); await flush();
  assert.equal(calls, 3);
});

test('returning to a visible page refreshes immediately instead of leaving UNAVAILABLE until the next poll', async context => {
  let calls = 0;
  const h = setup(context, async () => { calls++; return new Response(JSON.stringify(data())); });
  await flush();
  Object.defineProperty(h.dom.window.document, 'hidden', { value: true, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  context.mock.timers.tick(1000);
  Object.defineProperty(h.dom.window.document, 'hidden', { value: false, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  await flush();
  assert.equal(calls, 2);
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
});

test('cached playing data refreshes before its freshness deadline', async context => {
  let calls = 0;
  const h = setup(context, async () => {
    calls++;
    return new Response(JSON.stringify({ ...data(), fetchedAt: calls === 1 ? Date.now() - 20000 : Date.now() }));
  });
  await flush();
  context.mock.timers.tick(20000); await flush();
  assert.equal(calls, 2);
  context.mock.timers.tick(6000); await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
});

test('stale successful snapshots retry promptly without a long failure backoff', async context => {
  let calls = 0;
  const h = setup(context, async () => {
    calls++;
    return new Response(JSON.stringify({ ...data(), fetchedAt: calls === 1 ? Date.now() - 46000 : Date.now() }));
  });
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'UNAVAILABLE');
  context.mock.timers.tick(5000); await flush();
  assert.equal(calls, 2);
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
});

test('429 Retry-After survives visibility changes and exceeds normal backoff cap', async context => {
  let calls = 0;
  const h = setup(context, async () => {
    calls++;
    return new Response(JSON.stringify({ ...data(), status: 'unavailable', track: null, retryAfterSeconds: 900 }), { status: 503, headers: { 'Retry-After': '900' } });
  });
  await flush();
  Object.defineProperty(h.dom.window.document, 'hidden', { value: true, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  context.mock.timers.tick(100000);
  Object.defineProperty(h.dom.window.document, 'hidden', { value: false, configurable: true });
  h.dom.window.document.dispatchEvent(new h.dom.window.Event('visibilitychange'));
  context.mock.timers.tick(799000); await flush();
  assert.equal(calls, 1);
  context.mock.timers.tick(1000); await flush();
  assert.equal(calls, 2);
});

test('network failure immediately clears previous LIVE state', async context => {
  let calls = 0;
  const h = setup(context, async () => {
    if (++calls > 1) throw new Error('network unavailable');
    return new Response(JSON.stringify(data()));
  });
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
  context.mock.timers.tick(30000); await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'UNAVAILABLE');
  assert.equal(h.get('[data-progress]').hidden, true);
});

test('LIVE stops when a slow refresh makes the confirmed snapshot stale', async context => {
  let calls = 0;
  const h = setup(context, async (_url, init) => {
    if (++calls === 1) return new Response(JSON.stringify({ ...data(), fetchedAt: Date.now() - 20000 }));
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'LIVE');
  context.mock.timers.tick(25000); await flush();
  assert.equal(h.get('[data-status-text]').textContent, 'UNAVAILABLE');
  assert.equal(h.get('[data-progress]').hidden, true);
  assert.equal(h.get('[data-spotify-link]').hasAttribute('href'), false);
});

test('browser back-forward cache restoration remounts polling after cleanup', async context => {
  let calls = 0;
  const h = setup(context, async () => { calls++; return new Response(JSON.stringify(data())); });
  await flush();
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: false }));
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  context.mock.timers.tick(60000); await flush();
  assert.equal(calls, 1);
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  await flush();
  assert.equal(calls, 2);
  h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide', { persisted: false }));
});
