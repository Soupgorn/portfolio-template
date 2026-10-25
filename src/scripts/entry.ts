export {};

const root = document.documentElement;
const welcome = document.querySelector<HTMLElement>('[data-welcome]');
const contact = document.querySelector<HTMLElement>('[data-contact]');
const enter = document.querySelector<HTMLButtonElement>('[data-enter]');

if (root.dataset.entry === 'welcome' && welcome && contact && enter) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state: 'welcome' | 'exiting' | 'entered' = 'welcome';
  let exitTimer = 0;
  let completionTimer = 0;

  contact.inert = true;
  contact.setAttribute('aria-hidden', 'true');

  function completeEntry() {
    if (state !== 'exiting') return;
    window.clearTimeout(exitTimer);
    window.clearTimeout(completionTimer);
    state = 'entered';
    try { sessionStorage.setItem(root.dataset.entryStorageKey ?? 'portfolio:entered', 'true'); } catch {}
    root.dataset.entry = state;
    // All staggers have finished. Removing their class prevents preference changes from replaying them.
    root.classList.remove('entry-reveal');
    welcome!.hidden = true;
    contact!.inert = false;
    contact!.removeAttribute('aria-hidden');
    root.classList.remove('entry-pending');
    contact!.focus({ preventScroll: true });
  }

  enter.addEventListener('click', () => {
    if (state !== 'welcome') return;
    state = 'exiting';
    root.dataset.entry = state;
    root.classList.add('entry-reveal');
    enter.disabled = true;
    welcome.inert = true;

    if (reducedMotion.matches) completeEntry();
    else {
      exitTimer = window.setTimeout(() => { welcome.hidden = true; }, 500);
      // The last contact enters at 1030ms and finishes at 1430ms.
      completionTimer = window.setTimeout(completeEntry, 1450);
    }
  }, options);

  // If the preference changes during the transition, finish without leaving controls inert.
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) completeEntry();
  }, options);

  window.addEventListener('pagehide', (event) => {
    if (state === 'exiting') completeEntry();
    if (!event.persisted) controller.abort();
  }, options);
  document.addEventListener('portfolio:before-change', () => {
    if (state === 'welcome') state = 'exiting';
    completeEntry();
  }, options);

  document.dispatchEvent(new Event('entry:ready'));
}
