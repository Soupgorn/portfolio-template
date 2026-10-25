import type { Project, ProjectScreenshot } from '../data/projects';
import { hasPublicAsset } from './assets';

/** Optional actions must be safe, real HTTPS destinations. */
export function projectUrl(value: string | undefined, github = false): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && (!github || url.hostname === 'github.com') ? url.href : undefined;
  } catch { return undefined; }
}

export function projectSourceUrl(project: Project): string | undefined {
  return project.sourceVisibility === 'private' ? undefined : projectUrl(project.githubUrl, true);
}

export function projectImages(project: Project): readonly ProjectScreenshot[] {
  return [project.screenshot, ...(project.screenshots ?? [])].filter((image): image is ProjectScreenshot =>
    Boolean(image && image.src.startsWith('/') && hasPublicAsset(image.src) && image.alt.trim() && image.width > 0 && image.height > 0)
  ).filter((image, index, images) => images.findIndex(candidate => candidate.src === image.src) === index);
}
