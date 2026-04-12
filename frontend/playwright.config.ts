import { defineConfig, devices } from "@playwright/test";

/**
 * Sovereign Watch — Playwright E2E configuration.
 *
 * Tests target a locally-running dev server (pnpm dev) or the preview build.
 * CI: set BASE_URL env var to point at a running instance.
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the Vite dev server automatically when running E2E locally.
  // Disabled in CI — the server is expected to already be running.
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
