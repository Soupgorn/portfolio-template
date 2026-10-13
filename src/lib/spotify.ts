export interface SpotifyPlaylist {
  id: string;
  url: string;
  embedUrl: string;
}

/** Accept only HTTPS playlist links on Spotify; never use input directly as an iframe source. */
export function parseSpotifyPlaylist(value: string): SpotifyPlaylist | null {
  const input = value.trim();
  if (!/^https:\/\/open\.spotify\.com\//i.test(input) || /[\s\\]/.test(input)) return null;

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' ||
        url.port || url.username || url.password) return null;

    // Spotify sharing links can include a locale prefix and tracking query parameters.
    const match = /^\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    if (!match) return null;

    const id = match[1];
    return {
      id,
      url: `https://open.spotify.com/playlist/${id}`,
      embedUrl: `https://open.spotify.com/embed/playlist/${id}`,
    };
  } catch {
    return null;
  }
}
