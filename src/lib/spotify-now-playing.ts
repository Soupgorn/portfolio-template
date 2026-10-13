/** Public contract only. This module is safe to share with the browser. */
export const FRESHNESS_MS = 45_000;
export interface NowPlaying {
  status: 'playing' | 'paused' | 'offline' | 'unavailable';
  track: {
    title: string;
    artists: string[];
    album: string;
    artworkUrl: string | null;
    spotifyUrl: string;
  } | null;
  progressMs: number | null;
  durationMs: number | null;
  fetchedAt: number;
  retryAfterSeconds: number;
}

export function spotifyTrackUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https:\/\/open\.spotify\.com\//.test(value) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const match = /^\/track\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    return url.hostname === 'open.spotify.com' && !url.port && !url.username && !url.password && match
      ? `https://open.spotify.com/track/${match[1]}` : null;
  } catch { return null; }
}

export function spotifyArtworkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/.test(value)) return null;
  return value;
}

export function emptyPlayback(status: 'offline' | 'unavailable', now: number, retryAfterSeconds = 30): NowPlaying {
  return { status, track: null, progressMs: null, durationMs: null, fetchedAt: now, retryAfterSeconds };
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 300) : '';
const milliseconds = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Allowlist fields rather than passing a private Spotify response to visitors. */
export function sanitizePlayback(value: unknown, now: number): NowPlaying {
  if (!value || typeof value !== 'object') return emptyPlayback('unavailable', now);
  const data = value as Record<string, any>;
  if (data.device?.is_private_session === true) return emptyPlayback('offline', now);
  if (typeof data.is_playing !== 'boolean') return emptyPlayback('unavailable', now);
  if (!data.item) return emptyPlayback(data.is_playing ? 'unavailable' : 'offline', now);
  const item = data.item;
  if (data.currently_playing_type !== 'track' || item.type !== 'track' || item.is_local === true) return emptyPlayback('unavailable', now);
  const url = spotifyTrackUrl(item.external_urls?.spotify);
  const title = text(item.name);
  const artists = Array.isArray(item.artists) ? item.artists.map((artist: any) => text(artist?.name)).filter(Boolean).slice(0, 12) : [];
  if (!url || !title || !artists.length) return emptyPlayback('unavailable', now);
  const validProgress = milliseconds(data.progress_ms) && milliseconds(item.duration_ms) && item.duration_ms > 0 && data.progress_ms <= item.duration_ms;
  const artwork = Array.isArray(item.album?.images) ? item.album.images.map((image: any) => spotifyArtworkUrl(image?.url)).find(Boolean) : null;
  return {
    status: data.is_playing ? 'playing' : 'paused',
    track: { title, artists, album: text(item.album?.name), artworkUrl: artwork ?? null, spotifyUrl: url },
    progressMs: validProgress ? data.progress_ms : null,
    durationMs: validProgress ? item.duration_ms : null,
    // Spotify's timestamp is the last state change, not when this snapshot was read.
    fetchedAt: now,
    retryAfterSeconds: 30,
  };
}

export function isFresh(data: NowPlaying, now: number): boolean {
  return Number.isFinite(data.fetchedAt) && data.fetchedAt <= now + 5_000 && now - data.fetchedAt < FRESHNESS_MS;
}

export function playbackProgress(data: NowPlaying, now: number): number | null {
  if (!isFresh(data, now) || !data.track || !milliseconds(data.progressMs) || !milliseconds(data.durationMs) || data.durationMs <= 0 || data.progressMs > data.durationMs) return null;
  if (data.status !== 'playing' && data.status !== 'paused') return null;
  return Math.min(data.durationMs, data.progressMs + (data.status === 'playing' ? Math.max(0, now - data.fetchedAt) : 0));
}

/** Validate the public API again at the browser boundary. */
export function parseNowPlaying(value: unknown): NowPlaying | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as NowPlaying;
  if (!['playing', 'paused', 'offline', 'unavailable'].includes(data.status) || !Number.isFinite(data.fetchedAt) ||
      !Number.isFinite(data.retryAfterSeconds) || data.retryAfterSeconds < 0) return null;
  if (data.status === 'offline' || data.status === 'unavailable') return emptyPlayback(data.status, data.fetchedAt, data.retryAfterSeconds);
  if (!data.track || !text(data.track.title) || !Array.isArray(data.track.artists) || !data.track.artists.length ||
      !data.track.artists.every(artist => typeof artist === 'string') || !spotifyTrackUrl(data.track.spotifyUrl)) return null;
  return { ...data, track: { title: text(data.track.title), artists: data.track.artists.map(text).slice(0, 12), album: text(data.track.album),
    spotifyUrl: spotifyTrackUrl(data.track.spotifyUrl)!, artworkUrl: spotifyArtworkUrl(data.track.artworkUrl) } };
}
