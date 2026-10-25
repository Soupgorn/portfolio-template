const photoMounts = new WeakSet<HTMLButtonElement>();
function mountProfilePhoto() {
  const trigger = document.querySelector<HTMLButtonElement>('[data-photo]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-photo-dialog]');
  const thumbnail = trigger?.querySelector<HTMLImageElement>('[data-photo-image]');
  const placeholder = trigger?.querySelector<HTMLElement>('[data-photo-placeholder]');
  const expanded = dialog?.querySelector<HTMLImageElement>('[data-photo-expanded]');
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-photo-close]');

  if (trigger && dialog && thumbnail && placeholder && expanded && closeButton && !photoMounts.has(trigger)) {
    photoMounts.add(trigger);
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let closeTimer = 0;
    let fullPhoto: HTMLImageElement | undefined;
    let restoreScroll: (() => void) | undefined;

    function fitPhoto(photo: HTMLImageElement) {
      if (photo.naturalWidth && photo.naturalHeight) expanded!.style.setProperty('--photo-ratio', String(photo.naturalWidth / photo.naturalHeight));
    }

    function lockScroll() {
      const root = document.documentElement;
      const body = document.body;
      const x = window.scrollX;
      const y = window.scrollY;
      const scrollbar = getComputedStyle(root).scrollbarGutter?.includes('stable') ? 0 : window.innerWidth - root.clientWidth;
      const padding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
      const changes: [HTMLElement, string, string][] = [
        [root, 'overflow', 'hidden'],
        [body, 'position', 'fixed'],
        [body, 'top', `-${y}px`],
        [body, 'left', `-${x}px`],
        [body, 'width', '100%'],
        [body, 'overflow', 'hidden'],
        [body, 'padding-right', `${padding + scrollbar}px`],
      ];
      const previous = changes.map(([element, property]) => [element, property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)] as const);
      changes.forEach(([element, property, value]) => element.style.setProperty(property, value));
      restoreScroll = () => {
        previous.forEach(([element, property, value, priority]) => {
          if (value) element.style.setProperty(property, value, priority);
          else element.style.removeProperty(property);
        });
        window.scrollTo({ left: x, top: y, behavior: 'instant' });
        restoreScroll = undefined;
      };
    }

    function finishClose() {
      window.clearTimeout(closeTimer);
      if (dialog!.open) dialog!.close();
      delete dialog!.dataset.closing;
      trigger!.setAttribute('aria-expanded', 'false');
      restoreScroll?.();
      if (trigger!.isConnected && !trigger!.disabled) trigger!.focus({ preventScroll: true });
    }

    function closePhoto() {
      if (!dialog!.open || dialog!.hasAttribute('data-closing')) return;
      if (reducedMotion.matches) finishClose();
      else {
        dialog!.dataset.closing = '';
        // Keep the native modal (and background inertness) until both exit animations finish.
        // animationend is authoritative; the timer recovers if rendering is interrupted.
        closeTimer = window.setTimeout(finishClose, 300);
      }
    }

    function recoverThumbnail() {
      thumbnail!.hidden = true;
      placeholder!.hidden = false;
      trigger!.disabled = true;
      if (dialog!.open) finishClose();
    }

    thumbnail.addEventListener('error', recoverThumbnail, { ...options, once: true });
    if (thumbnail.complete && thumbnail.naturalWidth === 0) recoverThumbnail();
    else trigger.disabled = typeof dialog.showModal !== 'function';

    trigger.addEventListener('click', () => {
      const entry = document.documentElement.dataset.entry;
      if (trigger.disabled || trigger.closest('[inert]') || (entry && entry !== 'entered') || dialog.open) return;
      // Show the cached thumbnail immediately; fetch the optional original only on first use.
      if (!expanded.hasAttribute('src')) {
        fitPhoto(thumbnail);
        expanded.src = thumbnail.currentSrc || thumbnail.src;
      }
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      lockScroll();
      if (!fullPhoto && expanded.dataset.fullSrc !== thumbnail.getAttribute('src')) {
        fullPhoto = new Image();
        fullPhoto.decoding = 'async';
        fullPhoto.addEventListener('load', () => {
          if (!controller.signal.aborted) {
            fitPhoto(fullPhoto!);
            expanded.src = fullPhoto!.src;
          }
        }, { ...options, once: true });
        // A failed full-resolution request leaves the working thumbnail visible.
        fullPhoto.src = expanded.dataset.fullSrc!;
      }
    }, options);

    expanded.addEventListener('load', () => fitPhoto(expanded), options);
    expanded.addEventListener('error', () => {
      if (expanded.getAttribute('src') !== thumbnail.getAttribute('src')) expanded.src = thumbnail.src;
      else recoverThumbnail();
    }, options);
    closeButton.addEventListener('click', closePhoto, options);
    expanded.addEventListener('animationend', (event) => {
      if (event.animationName === 'photo-zoom-out' && dialog.hasAttribute('data-closing')) finishClose();
    }, options);
    let backdropPressed = false;
    dialog.addEventListener('pointerdown', (event) => { backdropPressed = event.target === dialog; }, options);
    dialog.addEventListener('pointercancel', () => { backdropPressed = false; }, options);
    dialog.addEventListener('click', (event) => {
      // Do not dismiss on the photo, or on a drag that started on the photo.
      if (event.target === dialog && backdropPressed) closePhoto();
      backdropPressed = false;
    }, options);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closePhoto();
    }, options);
    dialog.addEventListener('close', () => {
      // Also recover cleanly if another caller closes the native dialog directly.
      if (!dialog.open && restoreScroll) finishClose();
    }, options);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches && dialog.hasAttribute('data-closing')) finishClose();
    }, options);

    function dispose() {
      if (dialog!.open || restoreScroll) finishClose();
      controller.abort();
      trigger!.disabled = true;
      photoMounts.delete(trigger!);
    }
    window.addEventListener('pagehide', (event) => {
      if (dialog.open || restoreScroll) finishClose();
      if (!event.persisted) dispose();
    }, options);
    document.addEventListener('portfolio:before-change', () => { if (dialog.open || restoreScroll) finishClose(); }, options);
  }

}
mountProfilePhoto();
