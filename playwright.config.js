const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node devServer.js',
    url: 'http://localhost:3333',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3333',
      NODE_ENV: 'development',
      TRANSIT_511_API_KEY: process.env.TRANSIT_511_API_KEY || 'playwright-test-key',
      TRANSIT_OPERATOR_ID: 'SF',
      TRANSIT_AGENCY_ID: 'SF',
      CORS_ORIGIN: '*',
    },
  },
});
