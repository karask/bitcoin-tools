import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// When a custom domain is configured, set SITE to it and BASE to '/'.
export default defineConfig({
  site: process.env.SITE || 'https://karask.github.io',
  base: process.env.BASE || '/bitcoin-tools',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
