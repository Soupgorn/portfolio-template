import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const publicDirectory = resolve('public');

/** Only local public assets are accepted; a missing optional asset never renders broken. */
export function hasPublicAsset(path: string): boolean {
  const file = resolve(publicDirectory, path.replace(/^\/+/, ''));
  return file.startsWith(publicDirectory + sep) && existsSync(file);
}

/** Honor Astro's base path when hosting in a subdirectory. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}
