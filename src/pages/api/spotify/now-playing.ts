import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { site } from '../../../data/site';
import { createSpotifyService, remainingCacheSeconds } from '../../../lib/spotify-server';

// Inherits static rendering when disabled and on-demand rendering when enabled.
const spotify = createSpotifyService(() => ({
  clientId: getSecret('SPOTIFY_CLIENT_ID'),
  clientSecret: getSecret('SPOTIFY_CLIENT_SECRET'),
  refreshToken: getSecret('SPOTIFY_REFRESH_TOKEN'),
}), { enabled: () => site.music.enabled });

export const GET: APIRoute = async () => {
  const result = await spotify.get();
  const { data, httpStatus } = result;
  const cacheSeconds = remainingCacheSeconds(result);
  return new Response(JSON.stringify(data), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheSeconds}, must-revalidate`,
      'X-Content-Type-Options': 'nosniff',
      ...(httpStatus === 503 ? { 'Retry-After': String(data.retryAfterSeconds) } : {}),
    },
  });
};
