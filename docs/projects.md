# Configure your projects and technology stack

Edit `src/data/projects.ts`. Both included projects are fictional examples with generic geometric illustrations; replace their content before presenting your own work.

```ts
{
  slug: 'my-project',
  title: 'My project',
  description: 'A short, accurate summary.',
  technologies: ['TypeScript', 'Astro'],
  longDescription: 'What the project does and what you contributed.',
  features: ['A verified feature'],
  // Add only your own real, public destinations:
  // githubUrl: 'https://github.com/your-account/your-repository',
  // sourceVisibility: 'public',
}
```

Keep slugs unique. `featured: true` sorts first; other array ordering is preserved. Optional `category`, `challenges`, and `demoUrl` enrich the dialog. Omit unavailable fields. `sourceVisibility: 'private'` suppresses source links but does not make descriptions or images private. Emptying the array shows the intentional empty state.

Set `screenshot` or `screenshots` to local public assets with `src`, descriptive `alt`, and actual `width` and `height`. Review content and metadata, optimize image size, and add specific `.gitignore` exceptions. Missing files and failed requests use a labelled neutral placeholder. The shipped illustrations are not application screenshots.

The same typed record feeds `ProjectCard` and `ProjectDialog`. The card button opens the native dialog; valid source/demo actions appear inside it. GitHub URLs must use HTTPS on github.com. Generic examples omit invented GitHub repositories; one has an explicitly documented example.com placeholder demo link.

The controller supports keyboard activation, focus containment/restoration, Escape, close button, backdrop dismissal, scroll locking, and cleanup on panel departure. Long content scrolls beneath an available close control. Reduced motion disables modal animation. With JavaScript disabled, summaries and available GitHub links remain readable; dialogs require JavaScript.

Edit `src/data/techStack.ts` to reorder categories and badges. Category fields are `id`, `title`, `technologies`, and optional `icon` (`code`, `window`, or `terminal`). Empty categories are omitted; an empty stack lets the profile use the upper row's full width.

Project panel labels/headings and metadata come from `site.projects` and `site.name` in `src/data/site.ts`. No identity is embedded in the shared controller.

Run all checks in the README after editing. Browser fixtures cover empty, missing, private-source, long-text, failed-image, and many-badge states. These fixtures exist only in the test server, never in the production route set.
