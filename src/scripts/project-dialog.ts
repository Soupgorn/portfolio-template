const mounts = new WeakMap<HTMLElement, () => void>();

/** Native modal focus containment, with reversible scroll locking and scoped listeners. */
export function mountProjectDialogs(root: HTMLElement): () => void {
  const existing = mounts.get(root);
  if (existing) return existing;
  const controller = new AbortController();
  const { signal } = controller;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dialogs = [...root.querySelectorAll<HTMLDialogElement>('[data-project-dialog]')];
  const triggers = [...root.querySelectorAll<HTMLButtonElement>('[data-project-open]')];
  let active: HTMLDialogElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let restoreScroll: (() => void) | undefined;
  let backdropPointer = false;
  let restoreFocus = true;

  function lockScroll() {
    const x = window.scrollX;
    const y = window.scrollY;
    const properties = [
      [document.documentElement, 'overflow'],
      [document.body, 'position'], [document.body, 'top'], [document.body, 'left'],
      [document.body, 'width'], [document.body, 'padding-right'],
    ] as const;
    const previous = properties.map(([element, property]) => ({ element, property,
      value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) }));
    const scrollbar = getComputedStyle(document.documentElement).scrollbarGutter?.includes('stable') ? 0 : Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const padding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    document.documentElement.style.overflow = 'hidden';
    Object.assign(document.body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', paddingRight: `${padding + scrollbar}px` });
    return () => {
      previous.forEach(({ element, property, value, priority }) => value ? element.style.setProperty(property, value, priority) : element.style.removeProperty(property));
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }

  function cleanup() {
    clearTimeout(timer);
    timer = undefined;
    active?.removeAttribute('data-closing');
    trigger?.setAttribute('aria-expanded', 'false');
    restoreScroll?.();
    restoreScroll = undefined;
    const previousTrigger = trigger;
    active = undefined;
    trigger = undefined;
    backdropPointer = false;
    if (restoreFocus && previousTrigger?.isConnected) previousTrigger.focus({ preventScroll: true });
  }

  function finishClose() {
    if (active?.open) active.close();
    // Native close dispatch is asynchronous; finish scroll/focus restoration now.
    cleanup();
  }

  function requestClose() {
    if (!active || active.hasAttribute('data-closing')) return;
    if (motion.matches) { finishClose(); return; }
    active.dataset.closing = '';
    timer = setTimeout(finishClose, 240);
  }

  const outside = (dialog: HTMLDialogElement, event: MouseEvent) => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };

  root.addEventListener('click', event => {
    const target = event.target as Element;
    const button = target.closest<HTMLButtonElement>('[data-project-open]');
    if (button && root.contains(button) && !button.closest('[inert], [hidden]') && !button.disabled && !active && !document.querySelector('dialog[open]')) {
      const dialog = document.getElementById(button.dataset.projectOpen ?? '') as HTMLDialogElement | null;
      if (!dialog || !root.contains(dialog) || typeof dialog.showModal !== 'function') return;
      restoreFocus = true;
      trigger = button;
      active = dialog;
      try {
        dialog.scrollTop = 0;
        dialog.showModal();
        restoreScroll = lockScroll();
        button.setAttribute('aria-expanded', 'true');
      } catch { cleanup(); }
    }
    if (target.closest('[data-project-close]')) requestClose();
  }, { signal });

  dialogs.forEach(dialog => {
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || dialog !== active) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(control => !control.closest('[hidden]') && control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (first && last && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }, { signal });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (dialog === active) requestClose(); }, { signal });
    dialog.addEventListener('close', () => { if (dialog === active && !dialog.open) cleanup(); }, { signal });
    dialog.addEventListener('animationend', event => {
      if (dialog === active && event.target === dialog && event.animationName === 'project-dialog-out') finishClose();
    }, { signal });
    dialog.addEventListener('pointerdown', event => { backdropPointer = event.target === dialog && outside(dialog, event); }, { signal });
    dialog.addEventListener('click', event => {
      if (dialog === active && backdropPointer && event.target === dialog && outside(dialog, event)) requestClose();
      backdropPointer = false;
    }, { signal });
  });
  motion.addEventListener('change', () => { if (motion.matches && active?.hasAttribute('data-closing')) finishClose(); }, { signal });
  triggers.forEach(button => { button.disabled = typeof HTMLDialogElement.prototype.showModal !== 'function'; });

  function dispose() {
    restoreFocus = false;
    finishClose();
    controller.abort();
    mounts.delete(root);
  }
  window.addEventListener('pagehide', event => {
    restoreFocus = false;
    if (event.persisted) finishClose();
    else dispose();
  }, { signal });
  document.addEventListener('portfolio:before-change', () => {
    restoreFocus = false;
    finishClose();
  }, { signal });
  mounts.set(root, dispose);
  return dispose;
}
