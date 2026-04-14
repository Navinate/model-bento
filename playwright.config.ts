import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4321',
  },
  webServer: {
    command: 'bun run dev',
    port: 4321,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
