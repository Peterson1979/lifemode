// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://lifemode.site',
  integrations: [mdx(), sitemap()],
  output: 'static',
  redirects: {
    // Consolidated home categories (permanent redirects to Home & Garden)
    '/home-maintenance': '/home-garden',
    '/cleaning-laundry': '/home-garden',
    '/home-organization': '/home-garden',
    '/smart-home': '/home-garden',
    // Legacy category aliases
    '/storage-organization': '/home-garden',
    '/everyday-how-to': '/home-garden',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
