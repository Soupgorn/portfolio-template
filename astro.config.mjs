import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { envField } from 'astro/config';
import { site } from './src/data/site';

export default defineConfig({
  // Keep the default template static; opt in to a Vercel function for Spotify.
  output: site.music.enabled ? 'server' : 'static',
  adapter: site.music.enabled ? vercel() : undefined,
  env: { schema: {
    SPOTIFY_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
    SPOTIFY_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    SPOTIFY_REFRESH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
  } },
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
});
