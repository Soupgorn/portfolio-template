# Optional Spotify Now Playing

The default template uses `site.music.enabled: false`. It builds as static files with no credentials, reads no secrets, makes no browser Spotify requests, and displays UNCONFIGURED without artwork, progress, or a track link.

## Enable your own account

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Check the current [quota/account requirements](https://developer.spotify.com/documentation/web-api/concepts/quota-modes); visitors never authorize this app.
2. Register exactly `http://127.0.0.1:4387/callback` as a redirect URI. Use the explicit loopback address. See [Spotify redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
3. Copy `.env.example` to ignored `.env.local`; fill your own `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
4. Run `npm run spotify:authorize`, open the printed link yourself, and authorize your account. The local helper uses the [Authorization Code flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow), PKCE, and validated random state. It requests only `user-read-currently-playing`, listens on the loopback address, and expires after five minutes.
5. The helper writes `SPOTIFY_REFRESH_TOKEN` to ignored `.env.local` without printing it. Set `site.music.enabled: true` and restart development.
6. On your own Vercel project, add all three server environment values and rebuild. Enabled mode selects server output and the Vercel adapter; the root homepage remains prerendered. Use the adapter output, not a static-only upload.

Never put secrets in site data, `PUBLIC_` variables, client JavaScript, source control, logs, or screenshots. Only authorize listening activity you intend to publish. This site exposes a sanitized current-track snapshot; it cannot control playback.

## States and lifecycle

| State | Behavior |
| --- | --- |
| LIVE | Confirmed playback with real title, artists, artwork/link, and approximate progress |
| PAUSED | Confirmed track, with frozen progress |
| OFFLINE | No active item; no track or progress |
| UNAVAILABLE | Sanitized failure or stale/unsupported data; no fake activity |
| UNCONFIGURED | Disabled or missing credentials; no repeated polling |

The enabled browser polls about every 30 seconds while Home and the document are visible. A snapshot older than 45 seconds cannot claim LIVE. Progress interpolates only valid confirmed playback values. Hidden Home/document cancels requests and progress timers. Resume preserves fresh metadata and retry deadlines. Disabled pages never poll; enabled missing-credential pages stop after one configuration check until reload.

The server uses a 15-second sanitized snapshot cache with single-flight requests per warm instance. CDN caching receives only the remaining snapshot lifetime. It does not cache raw account responses or credentials. Failures back off and respect `Retry-After`, including long rate-limit delays. Cold instances and regions can still make independent upstream requests.

## Troubleshooting and renewal

- UNCONFIGURED: either keep Spotify intentionally disabled, or set the flag and all three server values, restart/rebuild, then reload.
- UNAVAILABLE: check your app's account access, scopes, authorization, rate limits, and hosting configuration without logging credentials. Unsupported/private playback and malformed responses fail closed.
- Expired or revoked authorization: rerun the helper, replace the host's secret, and rebuild. Check Spotify's current token policy rather than assuming authorization lasts indefinitely.
- A replacement refresh token returned by Spotify fails closed; this implementation does not pretend serverless memory is durable secret storage. Reauthorize and update the configured value.
- Disable: set `site.music.enabled: false` and rebuild. No environment setup or OAuth is needed in this mode.

## Verify

Run the README checks and production build with no credentials for the default mode. Unit/browser tests use synthetic Spotify responses for states, safe URLs, stale snapshots, interpolation, caching, retries, and timer cleanup. They do not prove live authorization.

After enabling your own credentials, manually play/pause a track and inspect its real artwork/link and progress. See the [Vercel adapter guide](https://docs.astro.build/en/guides/integrations-guide/vercel/) for server deployment. `astro preview` is for the default static output; use development or an appropriate server preview for enabled mode.
