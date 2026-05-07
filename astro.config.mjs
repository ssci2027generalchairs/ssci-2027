import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || 'https://example.github.io/ssci2027';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  output: 'static',
});
