import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: `npm run test:e2e` builds and starts the app locally, or set
 * E2E_BASE_URL to test a deployment (e.g. production).
 * Signed-in tests need a separate test account: E2E_EMAIL / E2E_PASSWORD.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AUTH_FILE = "playwright/.auth/user.json";
const phone = { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    timezoneId: "Asia/Tashkent",
    locale: "uz-UZ",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "mobile-360", testMatch: /shell\.spec\.ts/, use: phone },
    {
      name: "mobile-360-app",
      testMatch: /app\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...phone, storageState: AUTH_FILE },
    },
    { name: "desktop", testMatch: /shell\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: baseURL,
        timeout: 240_000,
        reuseExistingServer: true,
      },
});
