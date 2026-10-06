import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4179', headless: true, viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) } },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4179', url: 'http://127.0.0.1:4179/sidepanel.html', reuseExistingServer: false },
});
