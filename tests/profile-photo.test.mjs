import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpile(readFileSync(new URL('../src/scripts/profile-photo.ts', import.meta.url), 'utf8'), {
  target: ts.ScriptTarget.ES2022,
});

// Exercise the controller's lifecycle without adding a DOM/browser dependency.
// Native dialog focus trapping and visual layout still require browser verification.
function fixture({ entry = 'entered', missing = false, supported = true, full = '/images/full.webp' } = {}) {
  let active;
  const timers = new Map();
  let timerId = 0;
  const scrolls = [];
  const preloads = [];
  class Style {
    values = new Map();
    getPropertyValue(key) { return this.values.get(key)?.[0] || ''; }
    getPropertyPriority(key) { return this.values.get(key)?.[1] || ''; }
    setProperty(key, value, priority = '') { this.values.set(key, [value, priority]); }
    removeProperty(key) { this.values.delete(key); }
  }
  class Element extends EventTarget {
    attributes = new Map();
    dataset = {};
    style = new Style();
    hidden = false;
    disabled = true;
    isConnected = true;
    inertParent = false;
    open = false;
    complete = true;
    naturalWidth = missing ? 0 : 1200;
    naturalHeight = missing ? 0 : 800;
    focus() { active = this; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    hasAttribute(key) { return key === 'data-closing' ? 'closing' in this.dataset : this.attributes.has(key); }
    closest() { return this.inertParent ? this : null; }
    get src() { return this.getAttribute('src'); }
    set src(value) { this.setAttribute('src', value); }
    showModal() { this.open = true; closeButton.focus(); }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const root = new Element();
  root.dataset.entry = entry;
  root.clientWidth = 1180;
  const body = new Element();
  body.style.setProperty('padding-right', '7px', 'important');
  const trigger = new Element();
  const thumbnail = new Element();
  thumbnail.src = '/images/thumb.webp';
  const placeholder = new Element();
  placeholder.hidden = true;
  const expanded = new Element();
  expanded.dataset.fullSrc = full;
  const closeButton = new Element();
  const dialog = new Element();
  if (!supported) dialog.showModal = undefined;
  const document = new EventTarget();
  document.documentElement = root;
  document.body = body;
  document.querySelector = (selector) => ({ '[data-photo]': trigger, '[data-photo-dialog]': dialog })[selector];
  trigger.querySelector = (selector) => ({ '[data-photo-image]': thumbnail, '[data-photo-placeholder]': placeholder })[selector];
  dialog.querySelector = (selector) => ({ '[data-photo-expanded]': expanded, '[data-photo-close]': closeButton })[selector];
  const motion = new EventTarget();
  motion.matches = false;
  const window = new EventTarget();
  Object.assign(window, {
    scrollX: 0, scrollY: 260, innerWidth: 1200,
    matchMedia: () => motion,
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    scrollTo: (position) => scrolls.push(position),
  });
  vm.runInNewContext(source, {
    document, window, AbortController,
    getComputedStyle: () => ({ paddingRight: '7px' }),
    Image: class extends Element { constructor() { super(); preloads.push(this); } },
  });
  const fire = (element, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
    element.dispatchEvent(event);
    return event;
  };
  return {
    trigger, thumbnail, placeholder, dialog, expanded, closeButton, root, body, window, document, motion, scrolls, timers, preloads, fire,
    active: () => active,
    open: () => fire(trigger, 'click'),
    finish: () => fire(expanded, 'animationend', { animationName: 'photo-zoom-out' }),
    backdrop: () => { fire(dialog, 'pointerdown'); fire(dialog, 'click'); },
  };
}

test('welcome and entry transition block the viewer, including programmatic activation', () => {
  for (const entry of ['welcome', 'exiting']) {
    const f = fixture({ entry });
    f.open();
    assert.equal(f.dialog.open, false);
  }
  const f = fixture();
  f.trigger.inertParent = true;
  f.open();
  assert.equal(f.dialog.open, false);
});

test('open shows the cached image, focuses close, and locks scrolling', () => {
  const f = fixture();
  f.open();
  assert.equal(f.dialog.open, true);
  assert.equal(f.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(f.expanded.src, f.thumbnail.src);
  assert.equal(f.expanded.style.getPropertyValue('--photo-ratio'), '1.5');
  assert.equal(f.active(), f.closeButton);
  assert.equal(f.body.style.getPropertyValue('position'), 'fixed');
  assert.equal(f.body.style.getPropertyValue('top'), '-260px');
  assert.equal(f.body.style.getPropertyValue('padding-right'), '27px');
  assert.equal(f.root.style.getPropertyValue('overflow'), 'hidden');
});

test('close button retains modality until the exit animation ends, then restores focus and styles', () => {
  const f = fixture();
  f.open();
  f.fire(f.closeButton, 'click');
  assert.equal(f.dialog.open, true);
  assert.equal(f.dialog.hasAttribute('data-closing'), true);
  f.finish();
  assert.equal(f.dialog.open, false);
  assert.equal(f.active(), f.trigger);
  assert.equal(f.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(f.body.style.getPropertyValue('position'), '');
  assert.equal(f.root.style.getPropertyValue('overflow'), '');
  assert.equal(f.body.style.getPropertyValue('padding-right'), '7px');
  assert.equal(f.body.style.getPropertyPriority('padding-right'), 'important');
  assert.equal(f.scrolls[0].top, 260);
  assert.equal(f.timers.size, 0);
});

test('Escape defers the native close and repeated requests do not create extra timers', () => {
  const f = fixture();
  f.open();
  assert.equal(f.fire(f.dialog, 'cancel').defaultPrevented, true);
  f.fire(f.dialog, 'cancel');
  f.fire(f.closeButton, 'click');
  f.open();
  assert.equal(f.dialog.open, true);
  assert.equal(f.timers.size, 1);
  f.finish();
  for (let i = 0; i < 5; i++) { f.open(); f.backdrop(); f.finish(); }
  assert.equal(f.dialog.open, false);
  assert.equal(f.preloads.length, 1);
  assert.equal(f.timers.size, 0);
});

test('photo clicks and drags starting on the photo stay open; backdrop clicks close', () => {
  const f = fixture();
  f.open();
  f.fire(f.dialog, 'pointerdown', { target: f.expanded });
  f.fire(f.dialog, 'click', { target: f.expanded });
  assert.equal(f.dialog.hasAttribute('data-closing'), false);
  f.fire(f.dialog, 'pointerdown', { target: f.expanded });
  f.fire(f.dialog, 'click');
  assert.equal(f.dialog.hasAttribute('data-closing'), false);
  f.backdrop();
  assert.equal(f.dialog.hasAttribute('data-closing'), true);
});

test('reduced motion closes immediately and changes during closing finish cleanup', () => {
  const f = fixture();
  f.motion.matches = true;
  f.open(); f.backdrop();
  assert.equal(f.dialog.open, false);
  assert.equal(f.timers.size, 0);
  f.motion.matches = false;
  f.open(); f.backdrop();
  f.motion.matches = true;
  f.fire(f.motion, 'change');
  assert.equal(f.dialog.open, false);
  assert.equal(f.timers.size, 0);
});

test('missing or failed thumbnail preserves the placeholder and disables activation', () => {
  const missing = fixture({ missing: true });
  assert.equal(missing.thumbnail.hidden, true);
  assert.equal(missing.placeholder.hidden, false);
  assert.equal(missing.trigger.disabled, true);
  missing.open();
  assert.equal(missing.dialog.open, false);
  const f = fixture();
  f.open();
  f.fire(f.thumbnail, 'error');
  assert.equal(f.dialog.open, false);
  assert.equal(f.trigger.disabled, true);
  assert.equal(f.placeholder.hidden, false);
  const unsupported = fixture({ supported: false });
  unsupported.open();
  assert.equal(unsupported.dialog.open, false);
  unsupported.fire(unsupported.thumbnail, 'error');
  assert.equal(unsupported.placeholder.hidden, false);
});

test('optional full image loads only on first open and failure retains the thumbnail', () => {
  const f = fixture();
  assert.equal(f.preloads.length, 0);
  f.open();
  f.fire(f.preloads[0], 'error');
  assert.equal(f.expanded.src, f.thumbnail.src);
  f.preloads[0].naturalWidth = 800;
  f.preloads[0].naturalHeight = 1200;
  f.fire(f.preloads[0], 'load');
  assert.equal(f.expanded.src, '/images/full.webp');
  assert.equal(f.expanded.style.getPropertyValue('--photo-ratio'), String(2 / 3));
  f.fire(f.expanded, 'error');
  assert.equal(f.expanded.src, f.thumbnail.src);
  const same = fixture({ full: '/images/thumb.webp' });
  same.open();
  assert.equal(same.preloads.length, 0);
});

test('external close, interrupted animation, and page departure all release scroll lock', () => {
  const f = fixture();
  f.open(); f.dialog.close();
  assert.equal(f.body.style.getPropertyValue('position'), '');
  f.open(); f.backdrop();
  [...f.timers.values()][0]();
  assert.equal(f.dialog.open, false);
  f.open(); f.fire(f.window, 'pagehide', { persisted: true });
  assert.equal(f.dialog.open, false);
  f.open();
  assert.equal(f.dialog.open, true);
  f.fire(f.document, 'portfolio:before-change');
  assert.equal(f.dialog.open, false);
  // The persistent photo controller remains usable on return to Home.
  f.open();
  assert.equal(f.dialog.open, true);
  f.fire(f.window, 'pagehide', { persisted: false });
  assert.equal(f.dialog.open, false);
  f.open();
  assert.equal(f.dialog.open, false);
  assert.equal(f.trigger.disabled, true);
  f.fire(f.preloads[0], 'load');
  assert.equal(f.expanded.src, f.thumbnail.src);
});
