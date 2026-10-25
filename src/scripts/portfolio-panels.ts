import { panelMotion } from '../lib/panel-motion';

type Panel = 'home' | 'projects';
type Phase = 'idle' | 'exiting' | 'switching' | 'entering';
const shell = document.querySelector<HTMLElement>('[data-portfolio-shell]');
const viewport = shell?.querySelector<HTMLElement>('[data-panel-viewport]');

if (shell && viewport) {
  const root = document.documentElement;
  const nav = shell.querySelector<HTMLElement>('.site-navigation')!;
  const contact = shell.querySelector<HTMLElement>('#contact')!;
  const panels = new Map([...shell.querySelectorAll<HTMLElement>('[data-portfolio-panel]')]
    .map(panel => [panel.dataset.portfolioPanel as Panel, panel]));
  const announcer = document.querySelector<HTMLElement>('[data-panel-announcer]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let active: Panel = 'home';
  let intended: Panel = active;
  let phase: Phase = 'idle';
  let skipMotion = false;
  let contactIntent = false;
  let tabIntent: { from: Element | null; backwards: boolean } | undefined;
  const animations = new Set<Animation>();

  function state(next: Phase) {
    phase = next;
    shell!.dataset.panelState = next;
    document.dispatchEvent(new CustomEvent('portfolio:state-change', { detail: { state: next, active, intended } }));
  }

  function select(panel: Panel, interactive: boolean) {
    root.dataset.portfolioView = panel;
    panels.forEach((element, name) => {
      const visible = name === panel;
      element.hidden = !visible;
      element.inert = !visible || !interactive;
      if (visible) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
    });
    nav.querySelectorAll<HTMLButtonElement>('[data-panel-link]').forEach(link => {
      if (link.dataset.panelLink === panel) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const title = panel === 'projects' ? shell!.dataset.projectsTitle! : shell!.dataset.homeTitle!;
    const description = panel === 'projects' ? shell!.dataset.projectsDescription! : shell!.dataset.homeDescription!;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }

  async function animate(frames: Keyframe[], timing: KeyframeAnimationOptions) {
    if (reduced.matches || skipMotion || typeof viewport!.animate !== 'function') return;
    const animation = viewport!.animate(frames, { ...timing, fill: 'both' });
    animations.add(animation);
    try { await animation.finished; } catch { /* Page departure/interruption must not strand a panel. */ }
    return animation;
  }

  function clearAnimations() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
    viewport!.style.removeProperty('height');
    viewport!.style.removeProperty('opacity');
    viewport!.style.removeProperty('transform');
  }

  async function transition() {
    try {
      do {
        document.dispatchEvent(new CustomEvent('portfolio:before-change', { detail: { from: active, to: intended } }));
        // Native dialogs release scroll locks before the single viewport becomes inert.
        if (viewport!.contains(document.activeElement)) nav.querySelector<HTMLButtonElement>(`[data-panel-link="${intended}"]`)?.focus({ preventScroll: true });
        panels.forEach(element => { element.inert = true; });
        viewport!.setAttribute('aria-busy', 'true');
        state('exiting');
        await animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }], panelMotion.exit);
        const oldHeight = viewport!.getBoundingClientRect().height;
        viewport!.style.opacity = '0';
        viewport!.style.height = `${oldHeight}px`;
        animations.forEach(animation => animation.cancel());
        animations.clear();
        state('switching');
        const previous = active;
        active = intended; // Only the latest request is kept; there is no destination queue.
        select(active, false);
        document.dispatchEvent(new CustomEvent('portfolio:panel-change', { detail: { from: previous, to: active } }));
        const newHeight = panels.get(active)!.getBoundingClientRect().height;
        state('entering');
        await Promise.all([
          animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], panelMotion.enter),
          animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], panelMotion.enter),
        ]);
        clearAnimations();
        select(active, true);
      } while (intended !== active);
    } finally {
      clearAnimations();
      select(active, true);
      viewport!.removeAttribute('aria-busy');
      state('idle');
      if (contactIntent) {
        focusContacts();
      } else if (tabIntent) {
        // Finish first, then honor the visitor's Tab in the destination's real tab order.
        const controls = [...shell!.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]')]
          .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert],dialog:not([open])'));
        const index = controls.indexOf(tabIntent.from as HTMLElement);
        controls[index + (tabIntent.backwards ? -1 : 1)]?.focus();
      } else if (nav.contains(document.activeElement) || viewport!.contains(document.activeElement) || document.activeElement === document.body) {
        const heading = panels.get(active)?.querySelector<HTMLElement>('h1');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
      tabIntent = undefined;
      contactIntent = false;
      skipMotion = false;
      announcer.textContent = active === 'projects' ? 'Projects' : 'Home';
    }
  }

  function request(panel: Panel) {
    intended = panel;
    contactIntent = false;
    if (phase === 'idle' && intended !== active) void transition();
  }

  function focusContacts() {
    contact.focus({ preventScroll: true });
    contact.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'end' });
  }

  select(active, true);
  shell.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLElement>('[data-panel-link]');
    if (!link) return;
    if (link.dataset.panelLink === 'contact') {
      event.preventDefault();
      if (phase === 'idle') focusContacts();
      else { contactIntent = true; skipMotion = true; finishAnimations(); }
      return;
    }
    if (!panels.has(link.dataset.panelLink as Panel)) return;
    event.preventDefault();
    request(link.dataset.panelLink as Panel);
  }, options);
  const finishAnimations = () => animations.forEach(animation => { try { animation.finish(); } catch {} });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || phase === 'idle' || event.ctrlKey || event.metaKey || event.altKey || !nav.contains(document.activeElement)) return;
    event.preventDefault();
    tabIntent = { from: document.activeElement, backwards: event.shiftKey };
    skipMotion = true;
    finishAnimations();
  }, { ...options, capture: true });
  reduced.addEventListener('change', () => { if (reduced.matches) finishAnimations(); }, options);
  window.addEventListener('resize', finishAnimations, { ...options, passive: true });
  window.addEventListener('pagehide', event => {
    finishAnimations();
    if (!event.persisted) controller.abort();
  }, options);
}
