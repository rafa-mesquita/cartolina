import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * Sobe o servidor local (com a migração do D1) e o build de produção do site (sem bots),
 * e joga com navegadores de verdade. O build aponta pro servidor local por padrão.
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    { command: 'npm run dev:server', cwd: '..', port: 8787, reuseExistingServer: !CI, timeout: 120_000 },
    {
      command: 'npm run build -w web && npm run preview -w web -- --port 4173 --strictPort --host 127.0.0.1',
      cwd: '..',
      port: 4173,
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
