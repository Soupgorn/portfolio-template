# Astro Portfolio Template

A minimal, animated, and customizable personal portfolio built with Astro, TypeScript, and Tailwind CSS.

## Project Overview

A cream-and-green portfolio for students, developers, and creatives who want a small personal space. Start with generic content, customize one configuration file, and publish your own site. No Spotify credentials are needed to run the default template.

## Features

- Responsive profile, education, location, and interests cards.
- Animated `welcome.` screen and **Enter my space** transition.
- Interactive profile photo lightbox with keyboard controls and lazy full-resolution loading.
- Soft Terminal Quote Widget with a customizable path, quote, and footer.
- Instagram, GitHub, LinkedIn, and Email icons with tooltips and hover effects.
- Ambient green blobs, mouse parallax, and reduced-motion support.
- Optional forest-green Spotify Now Playing card with artwork, track details, approximate playback progress, and LIVE / OFFLINE / UNAVAILABLE states.
- Decorative music note card, missing-image fallbacks, and readable content without JavaScript.

## Tech Stack

| Technology | Role |
| --- | --- |
| Astro 7.3.8 | Components and prerendered homepage |
| TypeScript 5.9 | Typed configuration and browser interactions |
| Tailwind CSS 4.3.3 | Styling through `@tailwindcss/vite` |
| `@astrojs/vercel` | Optional server function when Spotify is enabled |
| Node.js test runner, jsdom, Playwright | Unit and browser validation |
| Self-hosted fonts | Space Grotesk, Inter, and IBM Plex Mono |

## Preview

![Generic desktop portfolio preview](docs/preview-desktop.png)

[View the mobile preview](docs/preview-mobile.png). Both previews use the included SVG avatar and example content.

## Getting Started

Install **Node.js 22.12.0 or newer** and npm.

```sh
git clone https://github.com/Soupgorn/portfolio-template.git
cd portfolio-template
npm ci
npm run dev
```

Open the URL printed by Astro, normally `http://localhost:4321`.

```sh
npm run check                 # Astro and TypeScript validation
npm test                      # Unit tests with mock Spotify responses
npx playwright install chromium --no-shell
npm run test:browser          # Headless UI and responsive checks
npm run build                 # Production build
npm run preview               # Preview the default static build
```

With Spotify disabled, production files are written to `dist/`. When enabled, the Vercel adapter produces `.vercel/output/` with static files and the Spotify function; use `npm run dev` for local API testing because the adapter does not support `astro preview`.

## Customization

Edit [src/data/site.ts](src/data/site.ts). This excerpt shows the main profile fields; edit the existing object and keep its remaining fields:

```ts
export const site = {
  name: 'Your Name',
  subtitle: 'Example Full Name',
  tagline: 'Nickname',
  photo: '/images/avatar.svg',
  photoFull: '',
  photoAlt: 'Generic illustrated profile avatar',
  quote: {
    label: '~/example/notes',
    text: 'Your quote goes here.',
    footer: 'a work in progress',
  },
  // Keep the remaining information, music, seo, and contacts fields.
};
```

Edit `site.information` for your major, university, city, country, and interests. Set `site.music.tagline` for the decorative note and `site.seo` for the page title, description, and optional canonical URL.

To replace the avatar, place your image in `public/images/`, update `photo` and `photoAlt`, and optionally set `photoFull` for a larger lightbox image. URL paths omit `public/`. An empty `photoFull` reuses the thumbnail; missing images show a neutral fallback.

Custom images are ignored by default. To commit an image you have permission to distribute, review its content and metadata and add a specific `.gitignore` exception, such as `!/public/images/my-profile.webp`. **Astro copies every file in `public/` to production, even if Git ignores it.** Remove unused private media from that directory before building. The template needs no audio files.

Colors, typography, layout, and motion live in [src/styles/](src/styles/).

## Social Links

Edit the matching entry in `site.contacts`:

| Platform | `platform` | Destination |
| --- | --- | --- |
| Instagram | `instagram` | Full HTTPS profile URL |
| GitHub | `github` | Full HTTPS profile URL |
| LinkedIn | `linkedin` | Full HTTPS profile URL |
| Email | `email` | `mailto:hello@example.com` |

Destinations default to `null`. Empty, missing, or unsafe URLs render disabled icons with a “Not configured” tooltip. Configured social links open in a new tab with `noopener noreferrer`; Email opens the visitor's mail app. Discord and LINE icons are also supported.

## Spotify Now Playing — Optional

The default `site.music.enabled: false` shows a polished **OFFLINE** placeholder. It makes no Spotify requests, shows no fake track or LIVE badge, and needs no credentials.

To opt in:

1. Create your own Spotify Developer App and register `http://127.0.0.1:4387/callback` as its redirect URI.
2. Copy [.env.example](.env.example) to ignored `.env.local` and fill in your own Client ID and Client Secret.
3. Run `npm run spotify:authorize` and open the printed authorization URL yourself. The local helper requests only `user-read-currently-playing` and saves your refresh token directly to `.env.local` without printing it.
4. Set `site.music.enabled` to `true`, restart development, and add all three secrets to your own Vercel project before rebuilding.

Development Mode currently requires the app owner to have **Spotify Premium**. New apps are limited to one Client ID per developer and five authorized users; authorized accounts must be allowlisted. Existing apps may retain grandfathered limits. Check [Spotify's quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) and [migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) before setup.

The card refreshes about every 30 seconds while the page is visible. It interpolates valid API progress between snapshots, freezes paused progress, and clears stale LIVE data. Paused or absent playback shows **OFFLINE**; missing credentials, unsupported content, authorization failures, and network errors show **UNAVAILABLE**. Artwork failures keep the generic music icon. No playback controls, listening history, or playlist embedding are included.

Spotify refresh tokens now expire after six months. For expired/revoked authorization or token rotation, rerun the helper, replace the Vercel secret, and redeploy. See [Spotify's expiration guidance](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration) and the [setup and troubleshooting guide](docs/spotify-now-playing.md). Set `enabled` back to `false` and rebuild to disable the integration.

Enabling this feature publishes your current track metadata to site visitors. Only authorize an account whose current listening information you intend to share.

## Environment Variables

All variables are optional while Spotify is disabled.

| Variable | Purpose |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Your Spotify app's Client ID |
| `SPOTIFY_CLIENT_SECRET` | Your app's server-only Client Secret |
| `SPOTIFY_REFRESH_TOKEN` | Authorization for your own Spotify account |

Use `.env.local` locally and your hosting provider's environment settings in production. Never commit secrets, put them in `site.ts`, prefix them with `PUBLIC_`, or expose them in browser code. The authorization helper is local only and is not deployed as a callback endpoint.

## Deployment

1. Create your own GitHub repository from this template or clone it into a separate repository.
2. In Vercel, import that repository through the GitHub integration.
3. Select the **Astro** framework preset and `npm run build`; use the repository root and a supported Node.js version satisfying `package.json`.
4. For the default static template, use `dist` as the output directory. With Spotify enabled, leave Vercel's output override unset so the adapter's `.vercel/output/` is used, and add the three server environment variables.
5. Deploy. Future pushes to the connected production branch trigger automatic deployments.

Set `site.seo.url` to your deployed origin and rebuild for a canonical URL. Enabled Spotify requires a server-capable host; uploading only `dist/` does not provide the API. See [Astro's Vercel adapter documentation](https://docs.astro.build/en/guides/integrations-guide/vercel/).

## Project Structure

```text
src/
  assets/fonts/       Self-hosted fonts
  components/         Welcome, profile, lightbox, contacts, and music card
  data/site.ts        Main customization entry point
  layouts/            Document shell and metadata
  lib/                Asset helpers and Spotify model/service
  pages/index.astro   Prerendered homepage
  pages/api/spotify/  Optional Now Playing endpoint
  scripts/            Entry, parallax, lightbox, and music polling
  styles/             Shared layout, palette, and animations
public/
  images/             Generic SVG avatar and favicon
  fonts/licenses/     Original font license notices
scripts/              Local Spotify authorization helper
tests/                Unit tests and browser checks
docs/                 Generic previews and Spotify setup guide
.env.example          Empty optional environment configuration
```

## Accessibility

The welcome button and photo viewer support keyboard navigation. The native dialog supports Escape, backdrop dismissal, focus restoration, and scroll locking. Contact links have accessible labels, visible focus, and dismissible tooltips. Status changes are announced, artwork has text alternatives, and progress has an accessible value.

`prefers-reduced-motion` disables nonessential entrance, hover, parallax, and music animations. The main portfolio stays readable without JavaScript; the photo viewer and live updates require it.

## License

No project-wide license has been selected. A license decision is needed before offering this project for unrestricted reuse. Existing third-party notices apply to their respective assets and do not license the entire template.

## Credits

Font sources, icon credits, and retained licenses are listed in [ATTRIBUTIONS.md](ATTRIBUTIONS.md). The generic geometric avatar and favicon are included placeholders. Spotify metadata and artwork, when enabled, remain subject to Spotify's terms and attribution requirements.
