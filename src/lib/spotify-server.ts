import { emptyPlayback, sanitizePlayback, type NowPlaying } from './spotify-now-playing';

export interface SpotifySecrets { clientId?: string; clientSecret?: string; refreshToken?: string }
type Dependencies = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number; enabled?: () => boolean };
type Result = { data: NowPlaying; httpStatus: number; cacheSeconds: number };

/** CDN hits must not extend the original upstream snapshot's cache lifetime. */
export function remainingCacheSeconds(result: Result, now = Date.now()): number {
  return Math.max(0, Math.min(result.cacheSeconds, Math.floor((result.data.fetchedAt + result.cacheSeconds * 1000 - now) / 1000)));
}
class SpotifyFailure extends Error {
  constructor(public retrySeconds = 60, public permanent = false) { super('Spotify unavailable'); }
}

export function retryAfterSeconds(value: string | null, now: number): number {
  if (!value) return 60;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - now) / 1000;
  return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 60;
}

/** Warm-instance cache + single-flight; Vercel's shared CDN cache is set by the route. */
export function createSpotifyService(readSecrets: () => SpotifySecrets, dependencies: Dependencies = {}) {
  const request = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  let cache: Result | null = null;
  let cacheUntil = 0;
  let inFlight: Promise<Result> | null = null;
  let accessToken = '';
  let tokenUntil = 0;
  let permanentlyUnavailable = false;
  let failures = 0;

  async function fetchTimed(url: string, init: RequestInit): Promise<Response> {
    return request(url, { ...init, signal: AbortSignal.timeout(dependencies.timeoutMs ?? 6_000) });
  }

  async function refresh(secrets: Required<SpotifySecrets>): Promise<void> {
    const response = await fetchTimed('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${secrets.clientId}:${secrets.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: secrets.refreshToken }),
    });
    if (response.status === 429) throw new SpotifyFailure(retryAfterSeconds(response.headers.get('Retry-After'), now()));
    if ([400, 401, 403].includes(response.status)) throw new SpotifyFailure(300, true);
    if (!response.ok) throw new SpotifyFailure();
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 30) throw new SpotifyFailure();
    if (typeof token.scope === 'string' && !token.scope.split(' ').includes('user-read-currently-playing')) throw new SpotifyFailure(300, true);
    // Environment secrets are durable; serverless memory is not. Fail closed on rotation
    // rather than relying on a replacement refresh token that disappears on cold start.
    if (token.refresh_token && token.refresh_token !== secrets.refreshToken) throw new SpotifyFailure(300, true);
    accessToken = token.access_token;
    tokenUntil = now() + (token.expires_in - 30) * 1000;
  }

  async function load(): Promise<Result> {
    if (dependencies.enabled && !dependencies.enabled()) {
      return { data: emptyPlayback('offline', now()), httpStatus: 200, cacheSeconds: 0 };
    }
    const secrets = readSecrets();
    if (!secrets.clientId || !secrets.clientSecret || !secrets.refreshToken || permanentlyUnavailable) {
      return { data: emptyPlayback('unavailable', now(), 300), httpStatus: 503, cacheSeconds: 60 };
    }
    try {
      const complete = secrets as Required<SpotifySecrets>;
      if (!accessToken || tokenUntil <= now()) await refresh(complete);
      const playback = () => fetchTimed('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: `Bearer ${accessToken}` } });
      let response = await playback();
      if (response.status === 401) {
        accessToken = '';
        await refresh(complete);
        response = await playback();
      }
      if (response.status === 429) throw new SpotifyFailure(retryAfterSeconds(response.headers.get('Retry-After'), now()));
      if ([401, 403].includes(response.status)) throw new SpotifyFailure(300, true);
      if (!response.ok) throw new SpotifyFailure();
      const data = response.status === 204 ? emptyPlayback('offline', now()) : sanitizePlayback(await response.json(), now());
      failures = 0;
      return { data, httpStatus: 200, cacheSeconds: 5 };
    } catch (error) {
      failures += 1;
      const failure = error instanceof SpotifyFailure ? error : new SpotifyFailure();
      permanentlyUnavailable = failure.permanent;
      const delay = Math.max(failure.retrySeconds, Math.min(300, 30 * 2 ** Math.min(failures, 4)));
      return { data: emptyPlayback('unavailable', now(), delay), httpStatus: 503, cacheSeconds: delay };
    }
  }

  return {
    async get(): Promise<Result> {
      if (cache && now() < cacheUntil) return cache;
      if (inFlight) return inFlight;
      inFlight = load().then(result => {
        cache = result;
        cacheUntil = now() + result.cacheSeconds * 1000;
        return result;
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
