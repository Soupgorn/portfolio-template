export interface TechCategory {
  id: string;
  title: string;
  icon?: 'code' | 'window' | 'terminal';
  technologies: readonly string[];
}

/** Editable example tools. Replace them with your own stack. Array order controls categories and badges. */
export const techStack: readonly TechCategory[] = [
  { id: 'languages', title: 'Languages', icon: 'code', technologies: ['TypeScript'] },
  { id: 'frameworks', title: 'Web & Frameworks', icon: 'window', technologies: ['Astro', 'Tailwind CSS'] },
  { id: 'tools', title: 'Tools & Infrastructure', icon: 'terminal', technologies: ['Git'] },
];
