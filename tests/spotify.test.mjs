import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = ts.transpile(readFileSync(new URL('../src/lib/spotify.ts', import.meta.url), 'utf8'), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
});
const { parseSpotifyPlaylist } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
// Synthetic base62 identifier: URL syntax tests do not reference a real playlist.
const id = 'a'.repeat(22);
const url = `https://open.spotify.com/playlist/${id}`;

test('standard and sharing URLs produce only canonical Spotify destinations', () => {
  for (const input of [url, `${url}?si=sharing-token&utm_source=copy-link`, `${url}/`, `  ${url}  `,
    `https://open.spotify.com/intl-en/playlist/${id}?si=sharing-token`]) {
    assert.deepEqual(parseSpotifyPlaylist(input), { id, url, embedUrl: `https://open.spotify.com/embed/playlist/${id}` });
  }
});

test('empty, malformed and unsupported URLs cannot create an embed or external link', () => {
  for (const input of ['', ' ', 'not a URL', `spotify:playlist:${id}`, `//open.spotify.com/playlist/${id}`,
    `http://open.spotify.com/playlist/${id}`, `https://example.com/playlist/${id}`,
    `https://open.spotify.com.evil.test/playlist/${id}`, `https://open.spotify.com@evil.test/playlist/${id}`,
    `https://user:pass@open.spotify.com/playlist/${id}`, `https://open.spotify.com:8080/playlist/${id}`,
    `https://open.spotify.com/track/${id}`, `https://open.spotify.com/album/${id}`,
    `https://open.spotify.com/embed/playlist/${id}`, `${url}/extra`,
    `https:open.spotify.com/playlist/${id}`, `https:///open.spotify.com/playlist/${id}`,
    'https://open.spotify.com/playlist/PLAYLIST_ID', `${url.slice(0, -1)}`, `${url}0`,
    `${url.slice(0, -1)}-`, `${url.slice(0, -1)}%78`, `https://open.spotify.com/play\nlist/${id}`,
    `https://open.spotify.com\\@evil.test/playlist/${id}`, 'javascript:alert(1)']) {
    assert.equal(parseSpotifyPlaylist(input), null, input);
  }
});

test('query parameters and fragments cannot redirect either destination', () => {
  assert.deepEqual(parseSpotifyPlaylist(`${url}?redirect=https://evil.test&autoplay=1#evil`), {
    id, url, embedUrl: `https://open.spotify.com/embed/playlist/${id}`,
  });
});
