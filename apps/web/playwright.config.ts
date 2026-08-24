import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Points at an already-running stack (docker compose up) rather than
 * starting its own server: the dashboard is meaningless without the API, the
 * database and the seeded scenario behind it.
 *
 *   docker compose up -d
 *   cd apps/web && npx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-PE",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/coer.json",
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      // The mobile tree is a different component set (bottom tab bar, no rail),
      // so it gets its own spec rather than a squeezed desktop one.
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"], storageState: "e2e/.auth/coer.json" },
    },
  ],
});
