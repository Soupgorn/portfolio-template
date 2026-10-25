import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const localAudio = /\.(?:mp3|wav|m4a|ogg|flac|aac|opus)$/i;

/** Spotify needs no local audio. Refuse to release accidentally copied media. */
export function checkBuildAssets(roots) {
  const found = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (localAudio.test(entry.name)) found.push(path);
    }
  }
  const available = roots.filter(existsSync);
  if (!available.length) throw new Error('No static build output found. Run Astro build first.');
  available.forEach(visit);
  if (found.length) throw new Error(`Local audio found in static build output. Keep original media outside public/: ${found.join(', ')}`);
  return available.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkBuildAssets(['dist', '.vercel/output/static']);
  console.log('Build asset check passed: no local audio in static output.');
}
