import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// karask.github.io redirects to the user-site custom domain kkarasavvas.com.
// When a dedicated custom domain is configured, set SITE to it and BASE to '/'.
export default defineConfig({
  site: process.env.SITE || 'https://kkarasavvas.com',
  base: process.env.BASE || '/bitcoin-tools',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
