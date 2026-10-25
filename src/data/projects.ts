/** A screenshot from your own project. Put local images in public/images/projects/. */
export interface ProjectScreenshot {
  /** Public path, such as /images/projects/my-project.webp. */
  src: string;
  /** Describe what the screenshot shows, rather than repeating the title. */
  alt: string;
  /** Use the image's actual dimensions to reserve space while it loads. */
  width: number;
  height: number;
}

export interface Project {
  /** Stable lowercase identifier, used by the gallery dialog. */
  slug?: string;
  title: string;
  description: string;
  longDescription?: string;
  screenshot?: ProjectScreenshot;
  screenshots?: readonly ProjectScreenshot[];
  technologies: readonly string[];
  githubUrl?: `https://github.com/${string}`;
  demoUrl?: `https://${string}`;
  category?: string;
  featured?: boolean;
  features?: readonly string[];
  challenges?: readonly string[];
  /** Private projects never expose source links. Do not add private content without review. */
  sourceVisibility?: 'public' | 'private';
}

/** Fictional examples only. Replace these with work you may share. */
export const projects: readonly Project[] = [
  {
    slug: 'example-web-app', title: 'Example Web Application', category: 'Fictional sample',
    description: 'An illustrative reading-list application showing how to present a web project.',
    longDescription: 'This fictional sample demonstrates the detail dialog. Imagine a reading list with saved articles, search, and topic filters. It is example content, not a shipped application or a claim about the template owner.',
    technologies: ['TypeScript', 'Astro', 'CSS'],
    features: ['Example article collections and topic filters.', 'A responsive reading-list layout.'],
    challenges: ['Describe a real design or engineering lesson here when replacing this sample.'],
    screenshot: { src: '/images/example-web.svg', alt: 'Generic reading-list layout illustration; not a product screenshot', width: 800, height: 500 },
    demoUrl: 'https://example.com/', featured: true,
  },
  {
    slug: 'example-developer-tool', title: 'Example Developer Tool', category: 'Fictional sample',
    description: 'An illustrative configuration checker showing a second project and technology set.',
    longDescription: 'This fictional developer tool demonstrates a second card and modal. Imagine a utility that checks configuration and reports useful feedback. Replace this sample with your own verified project and repository link.',
    technologies: ['JavaScript', 'Node.js'],
    features: ['Example configuration validation.', 'Clear, actionable example reports.'],
    screenshot: { src: '/images/example-tool.svg', alt: 'Generic configuration report illustration; not a product screenshot', width: 800, height: 500 },
  },
];
