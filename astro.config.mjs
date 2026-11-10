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
    '/storage-organization': '/home-organization',
    '/everyday-how-to': '/home-maintenance',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
