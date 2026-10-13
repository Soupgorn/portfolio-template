import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function compile(path, replacements = []) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString('base64')}`;
}
export const publicModule = compile('../src/lib/spotify-now-playing.ts');
const { sanitizePlayback, emptyPlayback, playbackProgress, isFresh, parseNowPlaying, spotifyTrackUrl } = await import(publicModule);
const { createSpotifyService, retryAfterSeconds, remainingCacheSeconds } = await import(compile('../src/lib/spotify-server.ts', [["'./spotify-now-playing'", JSON.stringify(publicModule)]]));
export const trackUrl = 'https://open.spotify.com/track/1234567890123456789012';
export const fixture = {
  is_playing: true, currently_playing_type: 'track', progress_ms: 12_000, timestamp: 1,
  device: { id: 'PRIVATE_DEVICE', email: 'private@example.test' }, access_token: 'PRIVATE_TOKEN',
  item: { type: 'track', name: 'A real test song', artists: [{ name: 'Artist' }], duration_ms: 180_000,
    external_urls: { spotify: trackUrl }, album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/abc123' }] } },
};
const credentials = { clientId: 'MOCK_CLIENT_ID', clientSecret: 'MOCK_CLIENT_SECRET', refreshToken: 'MOCK_REFRESH_TOKEN' };
const token = { access_token: 'MOCK_ACCESS_TOKEN', expires_in: 3600, scope: 'user-read-currently-playing' };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function harness(responses, secrets = credentials) {
  let time = 1_000_000;
  const calls = [];
  const service = createSpotifyService(() => secrets, { now: () => time, fetch: async (...args) => {
    calls.push(args);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, 'unexpected upstream request');
    return response;
  } });
  return { service, calls, advance: ms => { time += ms; } };
}

test('sanitized playing data contains only allowlisted public fields', () => {
  const data = sanitizePlayback(fixture, 100_000);
  assert.equal(data.status, 'playing');
  assert.equal(data.track.title, fixture.item.name);
  assert.equal(data.track.artworkUrl, fixture.item.album.images[0].url);
  assert.equal(data.fetchedAt, 100_000);
  assert.equal(data.progressMs, 12_000);
  assert.equal(JSON.stringify(data).includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(data).sort(), ['status', 'track', 'progressMs', 'durationMs', 'fetchedAt', 'retryAfterSeconds'].sort());
});

test('progress interpolates, reconciles, freezes on pause and stops when stale', () => {
  const data = sanitizePlayback(fixture, 100_000);
  assert.equal(playbackProgress(data, 105_000), 17_000);
  assert.equal(playbackProgress({ ...data, progressMs: 3_000, fetchedAt: 105_000 }, 105_000), 3_000);
  assert.equal(playbackProgress({ ...data, status: 'paused' }, 105_000), 12_000);
  assert.equal(playbackProgress(data, 145_000), null);
  assert.equal(isFresh(data, 145_000), false);
  assert.equal(playbackProgress({ ...data, progressMs: 179_000 }, 110_000), 180_000);
  assert.equal(playbackProgress(emptyPlayback('offline', 100_000), 100_000), null);
});

test('invalid progress and unsupported/private content never fabricate a LIVE track', () => {
  for (const progress_ms of [null, -1, NaN, 200_000, '12000', Infinity]) {
    assert.equal(sanitizePlayback({ ...fixture, progress_ms }, 100_000).progressMs, null);
  }
  for (const data of [null, {}, { ...fixture, is_playing: 'true' }, { ...fixture, item: null },
    { ...fixture, currently_playing_type: 'episode' }, { ...fixture, item: { ...fixture.item, is_local: true } },
    { ...fixture, item: { ...fixture.item, type: 'episode' } }]) {
    assert.equal(sanitizePlayback(data, 100_000).status, 'unavailable');
  }
  assert.equal(sanitizePlayback({ ...fixture, item: null, is_playing: false }, 100_000).status, 'offline');
  assert.equal(sanitizePlayback({ ...fixture, device: { is_private_session: true } }, 100_000).track, null);
});

test('unsafe track/artwork URLs and malformed browser responses are rejected', () => {
  for (const value of ['javascript:alert(1)', 'https://evil.test/track/1234567890123456789012',
    'https://open.spotify.com@evil.test/track/1234567890123456789012', trackUrl.replace('/track/', '/playlist/'),
    trackUrl.replace('https:', 'http:'), trackUrl.replace('open.spotify.com', 'user:password@open.spotify.com')]) {
    assert.equal(spotifyTrackUrl(value), null);
  }
  assert.equal(spotifyTrackUrl(`${trackUrl}?si=secret#fragment`), trackUrl);
  const unsafe = structuredClone(fixture);
  unsafe.item.album.images[0].url = 'https://evil.test/tracking.png';
  assert.equal(sanitizePlayback(unsafe, 100_000).track.artworkUrl, null);
  assert.equal(parseNowPlaying({ ...sanitizePlayback(fixture, 100_000), track: { spotifyUrl: 'javascript:alert(1)' } }), null);
  assert.equal(parseNowPlaying({ ...sanitizePlayback(fixture, 100_000), fetchedAt: '100000' }), null);
});

test('missing configuration does not contact Spotify', async () => {
  const h = harness([], {});
  const result = await h.service.get();
  assert.equal(result.httpStatus, 200);
  assert.equal(result.data.status, 'unconfigured');
  assert.equal(h.calls.length, 0);
});

test('token refresh uses server credentials and shared cache deduplicates visitors', async () => {
  const h = harness([json(token), json(fixture), json({ ...fixture, is_playing: false })]);
  const [first, concurrent] = await Promise.all([h.service.get(), h.service.get()]);
  assert.strictEqual(first, concurrent);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0][0], 'https://accounts.spotify.com/api/token');
  assert.equal(h.calls[0][1].body.get('grant_type'), 'refresh_token');
  assert.equal(h.calls[1][0], 'https://api.spotify.com/v1/me/player/currently-playing');
  assert.equal(h.calls[1][1].headers.Authorization, 'Bearer MOCK_ACCESS_TOKEN');
  await h.service.get();
  assert.equal(h.calls.length, 2);
  h.advance(15_001);
  assert.equal((await h.service.get()).data.status, 'paused');
  assert.equal(h.calls.length, 3);
});

test('server and CDN caches share one snapshot expiry instead of stacking cache lifetimes', async () => {
  const h = harness([json(token), json(fixture), json({ ...fixture, is_playing: false })]);
  const first = await h.service.get();
  assert.equal(remainingCacheSeconds(first, 1_000_000), 15);
  h.advance(14_500);
  const cached = await h.service.get();
  assert.strictEqual(cached, first);
  assert.equal(remainingCacheSeconds(cached, 1_014_500), 0);
  assert.equal(remainingCacheSeconds(cached, 1_015_100), 0);
  assert.equal(h.calls.length, 2);
  h.advance(501);
  const refreshed = await h.service.get();
  assert.equal(refreshed.data.status, 'paused');
  assert.equal(remainingCacheSeconds(refreshed, 1_015_001), 15);
});

test('HTTP 204 yields an offline placeholder without private metadata', async () => {
  const h = harness([json(token), new Response(null, { status: 204 })]);
  assert.deepEqual((await h.service.get()).data, emptyPlayback('offline', 1_000_000));
});

test('HTTP 401 refreshes once and retries playback once', async () => {
  const h = harness([json(token), json({}, 401), json({ ...token, access_token: 'RENEWED' }), json(fixture)]);
  assert.equal((await h.service.get()).data.status, 'playing');
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[3][1].headers.Authorization, 'Bearer RENEWED');
});

test('persistent auth failures, expired refresh token and rotation fail closed without retry storms', async () => {
  for (const responses of [
    [json({ error: 'invalid_grant', detail: 'PRIVATE' }, 400)],
    [json({ ...token, refresh_token: 'ROTATED_TOKEN' })],
    [json({ ...token, scope: 'user-read-email' })],
    [json(token), json({}, 403)],
    [json(token), json({}, 401), json(token), json({}, 401)],
  ]) {
    const h = harness(responses);
    const result = await h.service.get();
    assert.equal(result.data.status, 'unavailable');
    assert.equal(result.data.track, null);
    assert.equal(JSON.stringify(result).includes('TOKEN'), false);
    const count = h.calls.length;
    h.advance(600_000);
    assert.equal((await h.service.get()).data.status, 'unavailable');
    assert.equal(h.calls.length, count);
  }
});

test('token and player 429 honor Retry-After beyond the normal backoff cap', async () => {
  for (const responses of [[json({}, 429, { 'Retry-After': '900' })], [json(token), json({ error: { reason: 'QUOTA_EXCEEDED' } }, 429, { 'Retry-After': '900' })]]) {
    const h = harness(responses);
    const result = await h.service.get();
    assert.equal(result.data.retryAfterSeconds, 900);
    h.advance(899_000);
    await h.service.get();
    assert.equal(responses.length, 0);
    assert.equal(h.calls.length <= 2, true);
  }
  assert.equal(retryAfterSeconds(new Date(1_900_000).toUTCString(), 1_000_000), 900);
});

test('upstream timeout, server error and invalid JSON are sanitized and backed off', async () => {
  for (const response of [new Error('PRIVATE timeout'), json({}, 500), new Response('{bad json')]) {
    const h = harness([json(token), response]);
    const result = await h.service.get();
    assert.equal(result.httpStatus, 503);
    assert.equal(result.data.status, 'unavailable');
    assert.ok(result.data.retryAfterSeconds >= 60);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
});

test('access token expiry refreshes before using expired credentials', async () => {
  const h = harness([json(token), json(fixture), json(token), json(fixture)]);
  await h.service.get();
  h.advance(3_600_000);
  await h.service.get();
  assert.equal(h.calls.length, 4);
});

test('disabled integration never reads secrets or contacts Spotify', async () => {
  const service = createSpotifyService(() => { throw new Error('Secrets must not be read'); }, {
    enabled: () => false, now: () => 100_000, fetch: async () => { throw new Error('Unexpected request'); },
  });
  const result = await service.get();
  assert.equal(result.data.status, 'unconfigured');
  assert.equal(result.data.track, null);
});

test('Unicode titles, multiple artists, optional album and missing metadata are handled', () => {
  const longTitle = '音楽🎵'.repeat(150);
  const data = sanitizePlayback({ ...fixture, item: { ...fixture.item, name: longTitle,
    artists: [{ name: 'Artist One' }, { name: '歌手 二' }], album: null } }, 100_000);
  assert.equal(Array.from(data.track.title).length, 300);
  assert.ok(!/[\uD800-\uDBFF]$/.test(data.track.title));
  assert.deepEqual(data.track.artists, ['Artist One', '歌手 二']);
  assert.equal(data.track.album, '');
  assert.equal(data.track.artworkUrl, null);
  for (const item of [{ ...fixture.item, name: '' }, { ...fixture.item, artists: [] }, { ...fixture.item, external_urls: null }]) {
    assert.equal(sanitizePlayback({ ...fixture, item }, 100_000).status, 'unavailable');
  }
  assert.equal(sanitizePlayback({ is_playing: false }, 100_000).status, 'unavailable');
  assert.equal(sanitizePlayback({ is_playing: false, item: null, currently_playing_type: 'ad' }, 100_000).status, 'unavailable');
});

test('invalid durations hide progress; browser boundary drops extra private fields', () => {
  for (const duration_ms of [0, -1, '180000', null, Infinity]) {
    const data = sanitizePlayback({ ...fixture, item: { ...fixture.item, duration_ms } }, 100_000);
    assert.equal(data.durationMs, null);
    assert.equal(playbackProgress(data, 101_000), null);
  }
  const data = sanitizePlayback(fixture, 100_000);
  const parsed = parseNowPlaying({ ...data, privateAccount: 'PRIVATE', progressMs: -5 });
  assert.equal(parsed.progressMs, null);
  assert.equal(parsed.durationMs, null);
  assert.equal(JSON.stringify(parsed).includes('PRIVATE'), false);
  assert.equal(parseNowPlaying({ ...data, track: { ...data.track, artists: [''] } }), null);
});
