// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://wahyudi.dev',
  trailingSlash: 'ignore',
  markdown: {
    shikiConfig: {
      theme: 'github-dark-high-contrast',
      wrap: false,
    },
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.includes('/blog/tags/') && !page.endsWith('/404'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
