import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import auth from 'auth-astro';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), auth()],
  security: {
    // Trust x-forwarded-* headers from Railway's edge proxy so Astro
    // constructs request URLs with the real public host, not localhost.
    allowedDomains: [
      { hostname: 'model-bento-production.up.railway.app', protocol: 'https' },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
