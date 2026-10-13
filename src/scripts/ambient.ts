/** Pointer motion is scoped to three backgrounds, never the readable card. */
const system = document.querySelector<HTMLElement>('[data-ambient]');

if (system) {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let width = window.innerWidth;
  let height = window.innerHeight;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;
  let lastFrame = 0;
  let disposed = false;

  const enabled = () => !disposed && finePointer.matches && !reducedMotion.matches && !document.hidden;
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));

  function writePosition() {
    // Two scoped variable writes; CSS applies depths of 8px, 16px, and 24px.
    system!.style.setProperty('--pointer-x', `${currentX.toFixed(3)}px`);
    system!.style.setProperty('--pointer-y', `${currentY.toFixed(3)}px`);
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    targetX = targetY = currentX = currentY = 0;
    writePosition();
  }

  function easePointer(timestamp: number) {
    frame = 0;
    if (!enabled()) { reset(); return; }
    const elapsed = lastFrame ? Math.min(timestamp - lastFrame, 50) : 16;
    lastFrame = timestamp;
    const smoothing = 1 - Math.exp(-elapsed / 75);
    currentX += (targetX - currentX) * smoothing;
    currentY += (targetY - currentY) * smoothing;
    const settled = Math.abs(targetX - currentX) < 0.035 && Math.abs(targetY - currentY) < 0.035;
    if (settled) {
      currentX = targetX;
      currentY = targetY;
      lastFrame = 0;
    }
    writePosition();
    // No idle frame loop: resume only when another pointer event changes the target.
    if (!settled) frame = requestAnimationFrame(easePointer);
  }

  function schedule() {
    if (enabled() && !frame) frame = requestAnimationFrame(easePointer);
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || !enabled()) return;
    const nextX = clamp(event.clientX / width * 2 - 1) * 24;
    const nextY = clamp(event.clientY / height * 2 - 1) * 24;
    if (nextX === targetX && nextY === targetY) return;
    targetX = nextX;
    targetY = nextY;
    schedule();
  }, { ...options, passive: true });

  document.addEventListener('pointerout', (event) => {
    if (event.relatedTarget === null) {
      targetX = targetY = 0;
      schedule();
    }
  }, options);
  window.addEventListener('blur', reset, options);
  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
  }, { ...options, passive: true });

  const syncPreference = () => { if (!enabled()) reset(); };
  finePointer.addEventListener('change', syncPreference, options);
  reducedMotion.addEventListener('change', syncPreference, options);

  function syncVisibility() {
    document.documentElement.toggleAttribute('data-motion-paused', document.hidden);
    if (document.hidden) reset();
  }
  document.addEventListener('visibilitychange', syncVisibility, options);
  window.addEventListener('pageshow', syncVisibility, options);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    reset();
    controller.abort();
    document.documentElement.removeAttribute('data-motion-paused');
  };
  window.addEventListener('pagehide', (event) => {
    reset();
    if (!event.persisted) dispose();
  }, options);
  document.addEventListener('astro:before-swap', dispose, options);
  syncVisibility();
}
