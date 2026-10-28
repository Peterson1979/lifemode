// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://lifemode.life',
  integrations: [mdx(), sitemap()],
  output: 'static',
  redirects: {
    '/food-kitchen': '/tools',
    '/home-maintenance': '/checklists',
    '/guides': '/tools',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
