# Astro Portfolio Template

A cream-and-green portfolio with a compact profile, a Tech Stack card, project detail dialogs, and optional Spotify activity. All shipped profile information and projects are generic examples.

![Current generic desktop preview](docs/preview-desktop.png)

[Mobile preview](docs/preview-mobile.png) · [Projects preview](docs/preview-projects.png)

## Included

- Compact Portfolio 2.0: profile, static terminal quote, education, location, and interests on the left; technology categories on the right; full-width horizontal Spotify below; one social footer.
- One persistent Home/Projects interface at `/`, with coordinated 140ms exit and 220ms entry transitions. Panels never change the URL or browser history, reload the document, or replay Welcome.
- Contact scrolls to and focuses the existing footer. Reduced motion uses immediate scrolling.
- Fictional sample projects with responsive cards, technology badges, and accessible native detail dialogs.
- `welcome.` entrance with a blinking red period; a generic avatar and accessible photo lightbox.
- Ambient gradient shapes, pointer parallax, visible keyboard focus, and reduced-motion support.
- Optional server-side Spotify Now Playing. Disabled by default, with no API requests, fake LIVE activity, or progress.
- Self-hosted Space Grotesk, Inter, and IBM Plex Mono. The static quote widget has no command input or interactive terminal.

## Start locally

Install Node.js **22.19.0 or newer** and npm, then:

```sh
git clone https://github.com/Soupgorn/portfolio-template.git
cd portfolio-template
npm ci
npm run dev
```

Open the URL Astro prints, normally `http://localhost:4321`. Spotify setup is unnecessary for the default site.

## Customize

| File | What to change |
| --- | --- |
| [src/data/site.ts](src/data/site.ts) | Name, introduction, education, location, interests, quote, social links, Projects heading, metadata, avatar paths, optional Spotify flag |
| [src/data/techStack.ts](src/data/techStack.ts) | Languages, Web & Frameworks, Tools & Infrastructure; category order and technology badges |
| [src/data/projects.ts](src/data/projects.ts) | Replace the fictional examples with your own projects |
| [src/styles/](src/styles/) | Existing palette, typography, spacing, and motion |

Configuration interfaces are typed. Keep identifiers unique; leave optional values empty when they are unavailable. Empty technology categories disappear. An empty projects array displays an intentional empty state.

Social destinations default to `null`. Use full HTTPS profile URLs or `mailto:hello@example.com`. Missing or unsafe destinations remain disabled, with a “Not configured” tooltip. Social links open in a new tab; email opens the visitor's mail app.

Edit `site.quote.label`, `text`, and `footer` to customize the Soft Terminal Quote Widget. It remains a visual quote with a red cursor.

### Projects and detail dialogs

See [the project configuration guide](docs/projects.md). Required fields are `title`, `description`, and `technologies`; use a unique `slug` for each dialog. Optional fields include `longDescription`, `features`, `challenges`, `category`, `featured`, screenshots, and source/demo URLs.

The included projects are explicitly fictional. The example.com demo link is a placeholder. Replace it before publishing your work. GitHub buttons appear when you supply a valid `githubUrl` and `sourceVisibility: 'public'`; no invented repository is shipped. Invalid links and private-source links are omitted.

Cards open native dialogs with Enter, Space, or a click/tap. Dialogs support Escape, backdrop and close-button dismissal, focus containment/restoration, scroll locking, and reduced motion. Without JavaScript, both panels and project summaries remain readable inline; dialogs require JavaScript. There is no `/projects` route or redirect.

### Avatar and screenshots

Replace `public/images/avatar.svg` or configure `site.photo` and descriptive `site.photoAlt`. Optional `photoFull` loads a larger image only on first open; an empty value reuses the thumbnail. Missing images use a neutral fallback.

Project screenshots accept local public paths, alt text, and actual dimensions. `example-web.svg` and `example-tool.svg` are generic geometric illustrations, not product screenshots. To distribute a new image, review its content/metadata and add a specific `.gitignore` exception. **Every file in `public/` is copied to production, including ignored files.** Keep private media and recordings outside that directory. No audio is required.

### Single-page navigation

[PortfolioShell.astro](src/components/PortfolioShell.astro) keeps the navigation, background, footer, Home, and Projects mounted. The controller switches one content viewport as a group: exit, switch while invisible, then enter. Hidden panels are inert and excluded from keyboard navigation. Rapid requests use the latest destination; resizing or reduced-motion changes finish the current animation cleanly.

Navigation buttons change no pathname, fragment, query string, or browser history. Refresh starts at Home; Welcome is remembered for the current tab under `site.entryStorageKey`. Contact focuses and scrolls to the existing footer without opening another panel. See [the navigation guide](docs/navigation.md).

## Optional Spotify

Keep `site.music.enabled: false` for a fully static site with a graceful **UNCONFIGURED** card. No credentials are read and no browser Spotify requests are sent. The default build succeeds with no environment file.

To enable your own public listening activity:

1. Create a Spotify Developer App and check Spotify's current account/access requirements.
2. Register `http://127.0.0.1:4387/callback`.
3. Copy [.env.example](.env.example) to ignored `.env.local`, then fill your own Client ID and Client Secret.
4. Run `npm run spotify:authorize`. Open its authorization link yourself; the local helper saves the refresh token to `.env.local` without printing it.
5. Set `site.music.enabled: true`, restart development, and configure all three server secrets on your server-capable host before rebuilding.

Only `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN` are used. Never put them in public configuration, browser code, commits, or `PUBLIC_` variables. [.env.example](.env.example) contains names and empty values only.

Enabled mode supports LIVE, PAUSED, OFFLINE, UNAVAILABLE, and UNCONFIGURED, with real track links/artwork and approximate progress from confirmed snapshots. Missing credentials stop polling after one check. Hidden Home or a hidden tab suspends requests and progress timers. Stale/failed snapshots cannot claim LIVE. This is read-only activity, with no playback controls or autoplay.

Set `enabled` back to `false` and rebuild to disable Spotify. See [setup and troubleshooting](docs/spotify-now-playing.md), including token renewal and safe failure behavior.

## Check and build

```sh
npm run check
npx tsc --noEmit
npm test
npx playwright install chromium --no-shell
npm run test:browser
npm run build
npm run preview
```

Astro check includes Astro and TypeScript diagnostics; `tsc` also checks TypeScript independently. Unit tests use synthetic Spotify data. Browser tests exercise navigation, dialogs, Welcome, lightbox, polling lifecycle, responsive widths (375, 430, 768, 1280, 1440px), and reduced motion. Additional Spotify stress cases use narrower widths. Test-only fixtures are never registered by the production configuration. Mock tests do not verify your live Spotify authorization.

## Deploy your copy

With Spotify disabled, deploy `dist/` to any suitable static host after `npm run build`; `npm run preview` serves that output locally. No server function is needed.

For enabled Spotify, this configuration uses the [official Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/). Import your own repository in Vercel, select Astro and `npm run build`, leave the output override unset, and add the three server secrets. The adapter produces `.vercel/output/`. A static-only host cannot run the live endpoint. Use `npm run dev` for local API testing; this adapter does not support `astro preview`.

Set `site.seo.url` to your own deployed page URL for a canonical link. Custom subdirectory hosting also needs Astro's `base` configuration. Review profile content, sample projects, links, media permissions, and environment settings before publishing. Do not commit `.env.local` or `.vercel/`.

## Structure

```text
src/components/       Persistent shell, profile, tech stack, projects, dialogs, music
src/data/             Typed editable site, tech stack, and project content
src/layouts/          Document metadata, entry bootstrap, and shared styles
src/lib/              Asset/link validation, motion timings, public/server Spotify
src/pages/            Root page and optional Spotify endpoint
src/scripts/          Scoped browser controllers and lifecycle cleanup
src/styles/           Approved theme, responsive composition, and motion
public/images/        Generic avatar, favicon, and example illustrations
scripts/              Local Spotify authorization helper
tests/                Unit tests, browser checks, test-only fixtures
docs/                 Configuration guides and current generic previews
```

## License and credits

No project-wide license has been selected. Choose a license before offering unrestricted reuse; third-party font/icon notices do not license the entire project. See [ATTRIBUTIONS.md](ATTRIBUTIONS.md). Spotify metadata/artwork remain subject to Spotify's terms.

Dependency findings, their exposure assessment, and the audio build guard are documented in [the security review](docs/security.md).
