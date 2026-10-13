import { emptyPlayback, FRESHNESS_MS, isFresh, parseNowPlaying, playbackProgress, type NowPlaying } from '../lib/spotify-now-playing';

export function mountNowPlaying(root: HTMLElement): () => void {
  // Disabled templates keep their server-rendered placeholder without polling.
  if (root.dataset.spotifyEnabled !== 'true') return () => {};
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const card = element('[data-live-card]');
  const stage = element('[data-track-stage]');
  const status = element('[data-status-text]');
  const link = element<HTMLAnchorElement>('[data-spotify-link]');
  const progress = element('[data-progress]');
  const bar = element('[data-progress-bar]');
  const fill = element('[data-progress-fill]');
  const elapsed = element('[data-elapsed]');
  const duration = element('[data-duration]');
  let layer = element('[data-track-layer]');
  let snapshot: NowPlaying = emptyPlayback('unavailable', Date.now());
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | null = null;
  let disposed = false;
  let failures = 0;
  // A normal polling timer must not delay a visible-page refresh. Only an actual
  // failure / Retry-After imposes a deadline across tab visibility changes.
  let retryNotBefore = 0;
  let trackKey = '';
  const animations = new Set<Animation>();
  const formatTime = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

  function updateProgress() {
    if ((snapshot.status === 'playing' || snapshot.status === 'paused') && !isFresh(snapshot, Date.now())) {
      render(emptyPlayback('unavailable', Date.now()));
      return;
    }
    const fresh = isFresh(snapshot, Date.now()) && !document.hidden;
    card.dataset.status = fresh ? snapshot.status : 'unavailable';
    status.textContent = fresh ? snapshot.status === 'playing' ? 'LIVE' : snapshot.status === 'unavailable' ? 'UNAVAILABLE' : 'OFFLINE' : 'UNAVAILABLE';
    const value = fresh ? playbackProgress(snapshot, Date.now()) : null;
    progress.hidden = value === null;
    link.hidden = !fresh || !snapshot.track;
    if (!fresh) link.removeAttribute('href');
    if (value !== null && snapshot.durationMs) {
      const percent = value / snapshot.durationMs * 100;
      fill.style.width = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(percent)));
      bar.setAttribute('aria-valuetext', `${formatTime(value)} of ${formatTime(snapshot.durationMs)}, approximate`);
      elapsed.textContent = formatTime(value);
      duration.textContent = formatTime(snapshot.durationMs);
    }
  }

  function paintTrack(data: NowPlaying) {
    const key = JSON.stringify([data.track, data.track ? null : data.status]);
    if (key === trackKey) return;
    trackKey = key;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    stage.querySelectorAll('[data-outgoing]').forEach(node => node.remove());
    const previous = layer;
    const next = previous.cloneNode(true) as HTMLElement;
    next.querySelectorAll('[data-artwork-outgoing]').forEach(node => node.remove());
    next.removeAttribute('data-outgoing');
    next.removeAttribute('aria-hidden');
    const find = <T extends HTMLElement>(selector: string) => next.querySelector<T>(selector)!;
    const img = find<HTMLImageElement>('[data-artwork]');
    const oldImage = previous.querySelector<HTMLImageElement>('[data-artwork]');
    const outgoingImage = data.track?.artworkUrl && oldImage?.src && !oldImage.hidden ? oldImage.cloneNode(true) as HTMLImageElement : null;
    if (outgoingImage) {
      outgoingImage.removeAttribute('data-artwork');
      outgoingImage.dataset.artworkOutgoing = '';
      outgoingImage.alt = '';
      outgoingImage.setAttribute('aria-hidden', 'true');
      img.before(outgoingImage);
    }
    find('[data-track-title]').textContent = data.track?.title ?? 'A quiet moment';
    find('[data-track-title]').title = data.track?.title ?? '';
    find('[data-track-artist]').textContent = data.track?.artists.join(', ') ?? (data.status === 'offline' ? 'Nothing playing right now.' : 'Listening status is unavailable.');
    find('[data-track-artist]').title = data.track?.artists.join(', ') ?? '';
    const album = find('[data-track-album]');
    album.textContent = data.track?.album ?? '';
    // Reserve this line even in fallback states to keep crossfades stable.
    album.hidden = false;
    album.textContent ||= '\u00a0';
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = data.track ? `${data.track.album || data.track.title} album artwork` : '';
    if (data.track?.artworkUrl) {
      img.onload = () => {
        if (disposed || layer !== next) return;
        img.hidden = false;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof img.animate !== 'function') {
          outgoingImage?.remove(); return;
        }
        // Keep the old artwork until the new image has actually loaded, then crossfade.
        for (const [node, opacity] of [[img, [0, 1]], [outgoingImage, [1, 0]]] as const) {
          if (!node) continue;
          const animation = node.animate({ opacity: [...opacity] }, { duration: 250, easing: 'ease-in-out' });
          animations.add(animation);
          animation.finished.then(() => { if (node === outgoingImage) node.remove(); }).catch(() => {}).finally(() => animations.delete(animation));
        }
      };
      img.onerror = () => { img.hidden = true; outgoingImage?.remove(); };
      img.src = data.track.artworkUrl;
    }
    stage.append(next);
    layer = next;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof next.animate !== 'function') { previous.remove(); return; }
    previous.dataset.outgoing = '';
    previous.setAttribute('aria-hidden', 'true');
    for (const [node, opacity] of [[previous, [1, 0]], [next, [0, 1]]] as const) {
      const animation = node.animate({ opacity: [...opacity] }, { duration: 250, easing: 'ease-in-out' });
      animations.add(animation);
      animation.finished.then(() => { if (node === previous) node.remove(); }).catch(() => {}).finally(() => animations.delete(animation));
    }
  }

  function render(data: NowPlaying) {
    snapshot = isFresh(data, Date.now()) ? data : emptyPlayback('unavailable', data.fetchedAt, data.retryAfterSeconds);
    paintTrack(snapshot);
    if (snapshot.track) link.href = snapshot.track.spotifyUrl;
    else link.removeAttribute('href');
    updateProgress();
  }

  function schedule(delay: number) {
    clearTimeout(pollTimer);
    if (!disposed && !document.hidden) pollTimer = setTimeout(poll, delay);
  }

  async function poll() {
    if (disposed || document.hidden || controller) return;
    if (Date.now() < retryNotBefore) { schedule(retryNotBefore - Date.now()); return; }
    retryNotBefore = 0;
    const active = new AbortController();
    controller = active;
    const timeout = setTimeout(() => active.abort(), 10_000);
    let delay = 30_000;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/spotify/now-playing`, { signal: active.signal });
      const header = response.headers.get('Retry-After');
      const seconds = header ? Number(header) : 0;
      const headerDelay = header ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()) : 0;
      if (headerDelay > 0) {
        delay = Math.max(delay, headerDelay);
        // Record the deadline before reading the body so cancellation cannot bypass it.
        retryNotBefore = Math.max(retryNotBefore, Date.now() + headerDelay);
      }
      const data = parseNowPlaying(await response.json());
      if (!data || (!response.ok && data.status !== 'unavailable')) throw new Error('Invalid playback response');
      if (disposed || document.hidden || controller !== active) return;
      failures = data.status === 'unavailable' ? failures + 1 : 0;
      if (failures) delay = Math.max(delay, data.retryAfterSeconds * 1000);
      else {
        // Cached responses already used part of the 45-second freshness window.
        // Refresh with a five-second margin instead of letting LIVE expire first.
        const remaining = FRESHNESS_MS - (Date.now() - data.fetchedAt) - 5_000;
        delay = Math.max(5_000, Math.min(30_000, remaining), headerDelay || 0);
      }
      render(data);
    } catch {
      if (disposed || document.hidden || controller !== active) return;
      failures += 1;
      render(emptyPlayback('unavailable', Date.now()));
    } finally {
      clearTimeout(timeout);
      if (controller === active) {
        controller = null;
        delay = Math.max(delay, failures ? Math.min(300_000, 30_000 * 2 ** Math.min(failures, 4)) : 0);
        if (failures) retryNotBefore = Math.max(retryNotBefore, Date.now() + delay);
        schedule(Math.max(delay, retryNotBefore - Date.now()));
      }
    }
  }

  function visibility() {
    clearTimeout(pollTimer);
    clearInterval(progressTimer);
    controller?.abort();
    controller = null;
    render(emptyPlayback('unavailable', Date.now()));
    if (!document.hidden && !disposed) {
      progressTimer = setInterval(updateProgress, 1000);
      const remaining = retryNotBefore - Date.now();
      if (remaining > 0) schedule(remaining);
      else void poll();
    }
  }

  function cleanup(preserveRestore = false) {
    disposed = true;
    clearTimeout(pollTimer);
    clearInterval(progressTimer);
    controller?.abort();
    animations.forEach(animation => animation.cancel());
    animations.clear();
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('astro:before-swap', beforeSwap);
    window.removeEventListener('pagehide', pageHide);
    if (!preserveRestore) window.removeEventListener('pageshow', pageShow);
  }
  const beforeSwap = () => cleanup();
  const pageHide = (event: PageTransitionEvent) => cleanup(event.persisted);
  const pageShow = (event: PageTransitionEvent) => {
    if (event.persisted && disposed && root.isConnected) {
      window.removeEventListener('pageshow', pageShow);
      mountNowPlaying(root);
    }
  };
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('astro:before-swap', beforeSwap);
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  if (!document.hidden) { progressTimer = setInterval(updateProgress, 1000); void poll(); }
  return cleanup;
}
