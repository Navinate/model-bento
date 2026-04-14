import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig({
  test: {
    env: loadEnv('test', process.cwd(), ''),
    exclude: ['tests/e2e/**', 'node_modules/**'],
    fileParallelism: false,
    environmentMatchGlobs: [
      ['tests/components/**', 'jsdom'],
    ],
  },
});
