import { defineConfig, devices } from "@playwright/test";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://rivaltide:rivaltide@localhost:5432/rivaltide_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    { command: "node tests/fixtures/site.mjs", url: "http://127.0.0.2:4599/robots.txt", reuseExistingServer: true, timeout: 20_000 },
    {
      command: "npx next dev -p 3100",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { DATABASE_URL: E2E_DB, APP_URL: "http://localhost:3100", MONITOR_ALLOW_PRIVATE_HOSTS: "127.0.0.2", MONITOR_DOMAIN_INTERVAL_MS: "0", EMAIL_PROVIDER: "log", AI_PROVIDER: "none" },
    },
  ],
});
