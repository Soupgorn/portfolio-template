# Optional Spotify Now Playing

Start with `site.music.enabled: false` in `src/data/site.ts`. This produces a static portfolio with a generic UNCONFIGURED card and no Spotify requests. All credentials belong to the person customizing the template.

## Create and authorize your app

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create your own app, and select Web API access.
2. Register the exact redirect URI `http://127.0.0.1:4387/callback`. Spotify permits HTTP for explicit loopback IP addresses; `localhost` is not accepted. See [redirect URI requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
3. Check account eligibility and allowlist your account under the app's user settings. Development Mode requires the owner to maintain Spotify Premium, allows up to five authorized users for new apps, and limits new developers to one Client ID. Existing limits may be grandfathered. See [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) and [the 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
4. Copy `.env.example` to `.env.local`. Add your app's Client ID and Client Secret; leave the Refresh Token empty initially.
5. Run `npm run spotify:authorize` from the project root. Open its printed Spotify authorization URL in your own browser and authorize your own account within five minutes.
6. The helper binds only to `127.0.0.1:4387`, verifies OAuth state, uses an S256 PKCE challenge, exchanges the code locally, and saves the refresh token to ignored `.env.local`. It does not print tokens or deploy a public OAuth callback. Keep that file private; file permissions depend on your operating system.
7. Set `site.music.enabled` to `true`, restart `npm run dev`, and start a track in your Spotify app. The card reads listening status; it never starts playback.

The only requested permission is [`user-read-currently-playing`](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track). No email, profile, history, playlist, or playback-control permissions are requested. The helper follows [Authorization Code](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) with PKCE protection; do not use third-party token generators or paste credentials into issues, chat, screenshots, or terminal commands.

## Production

Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN` to your own Vercel project's environment settings, selecting the environments where the widget should run. Rebuild after enabling it. The homepage remains prerendered; `/api/spotify/now-playing` becomes an on-demand Vercel function. Use the Astro preset and leave the output-directory override unset in enabled mode.

Only sanitized track title, artists, album, artwork URL, Spotify track link, status, and progress reach visitors. Tokens, device information, raw API errors, and user account fields stay server-side. Your current listening metadata becomes public when enabled. The integration uses a 15-second shared cache and request deduplication to limit upstream calls.

The default disabled mode builds to `dist/` and works with `npm run preview`. Enabled Vercel builds use `.vercel/output/`; test the API locally with `npm run dev` because `astro preview` is unsupported by this adapter. No production project is created by this repository's scripts.

Use Vercel's Git-based build for deployment. Local server bundles can contain Astro's build-directory metadata and machine environment paths; keep `dist/` and `.vercel/` ignored and never publish those server bundles as static assets. The public HTML and browser assets must be reviewed separately from server-only output.

## Status and recovery

| State | Behavior |
| --- | --- |
| Disabled | Generic UNCONFIGURED card; no polling, secret reads, or Spotify calls |
| Playing | LIVE, current artwork and track link; progress only for valid API values |
| Paused | PAUSED; paused metadata can remain and progress freezes |
| No playback / private session | OFFLINE placeholder without track metadata |
| Missing credentials | UNCONFIGURED; no fake track, polling stops until reload |
| Authorization / network errors | UNAVAILABLE; no fake LIVE indicator |
| Unsupported local track or episode | UNAVAILABLE instead of invented track data |

The browser polls about every 30 seconds while visible, pauses polling when hidden, honors `Retry-After`, and backs off after failures. Snapshots expire after 45 seconds, so stale results cannot retain LIVE. Artwork load failures show the existing music icon. Progress is approximate between API snapshots and reconciles on each response.

Access tokens refresh server-side. A failed authorization, missing scope, expired refresh token, or changed refresh token fails closed, avoiding repeated authorization requests in the same server instance. Reauthorize with `npm run spotify:authorize`, update the hosting secrets, and restart/redeploy. Spotify [expires refresh tokens after six months](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration); access-token refresh does not extend that lifetime. The helper replaces the old local refresh-token entry. The service does not persist rotated tokens automatically, so rotation also requires updating the durable secret.

For 403 errors, check Premium eligibility, app allowlisting, and the granted scope. For rate limits, let the retry period pass. For missing artwork, keep the placeholder rather than adding copyrighted artwork to the repository. For 401 or `invalid_grant`, reauthorize; do not repeatedly retry expired credentials. See [Spotify's refreshing-token guide](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).

To disable, set `enabled: false`, rebuild, and remove the production secrets if no longer needed. Do not add personal playlists, listening-history fixtures, access tokens, or audio files to the template.

## Verification

Run `npm run check`, `npx tsc --noEmit`, `npm test`, `npm run test:browser`, and `npm run build`. Tests use fabricated Spotify metadata and mocked HTTP responses; passing tests does not establish that your account is authorized. Verify your own account separately after setup, then inspect both source and production output before publishing.
