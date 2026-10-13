import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Owner-only provisioning utility. No OAuth callback or credentials are deployed.
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in ignored .env.local first.');
  process.exit(1);
}
const redirectUri = 'http://127.0.0.1:4387/callback';
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(64).toString('base64url');
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
  scope: 'user-read-currently-playing', state, code_challenge_method: 'S256',
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), show_dialog: 'true' }).toString();
let exchanging = false;
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  const url = new URL(request.url ?? '/', redirectUri);
  if (request.method !== 'GET' || url.pathname !== '/callback' || request.headers.host !== '127.0.0.1:4387') {
    response.writeHead(404).end('Not found.'); return;
  }
  const incoming = Buffer.from(url.searchParams.get('state') ?? '');
  const expected = Buffer.from(state);
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    response.writeHead(400).end('Invalid authorization state.'); return;
  }
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.has('error')) {
    response.writeHead(400).end('Authorization was not completed. Rerun the helper.'); server.close(); return;
  }
  if (exchanging) { response.writeHead(409).end('Authorization is already being processed.'); return; }
  exchanging = true;
  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }),
    });
    if (!tokenResponse.ok) throw new Error('Authorization exchange failed');
    const token = await tokenResponse.json();
    if (typeof token.refresh_token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token.refresh_token) ||
        !token.scope?.split(' ').includes('user-read-currently-playing')) throw new Error('Invalid authorization response');
    const path = new URL('../.env.local', import.meta.url);
    const previous = await readFile(path, 'utf8').catch(() => '');
    const cleaned = previous.split(/\r?\n/).filter(line => !/^\s*SPOTIFY_REFRESH_TOKEN\s*=/.test(line)).join('\n').trimEnd();
    await writeFile(path, `${cleaned}\nSPOTIFY_REFRESH_TOKEN=${token.refresh_token}\n`, { mode: 0o600 });
    response.end('Authorization saved securely in .env.local. You may close this tab.');
    console.log('Refresh token saved in ignored .env.local. Add it to your Vercel project environment settings; never share it publicly.');
  } catch {
    response.writeHead(502).end('Authorization could not be saved. Rerun the helper and check your app settings.');
    console.error('Spotify authorization failed. No credentials were printed.');
    process.exitCode = 1;
  } finally { clearTimeout(expiry); server.close(); }
});
server.on('error', () => { console.error('Cannot bind Spotify callback to 127.0.0.1:4387. Close another helper using this port.'); process.exitCode = 1; });
const expiry = setTimeout(() => { console.error('Authorization timed out. Rerun the helper.'); server.close(); }, 5 * 60_000);
expiry.unref();
server.listen(4387, '127.0.0.1', () => {
  console.log('Register this exact redirect URI in your Spotify app: http://127.0.0.1:4387/callback');
  console.log('Open this Spotify authorization URL yourself (expires in five minutes):');
  console.log(authorize.toString());
});
