import { defineConfig } from 'astro/config';
import portfolioConfig from '../astro.config.mjs';

// This route exists only in the browser-test server, never in production builds.
export default defineConfig({
  ...portfolioConfig,
  integrations: [{
    name: 'section-test-fixtures',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({ pattern: '/__test/sections', entrypoint: './tests/fixtures/sections.astro', prerender: false });
      },
    },
  }],
});
