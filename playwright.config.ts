import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.GARDEN_E2E_PORT ?? 3100);

/**
 * Some sandboxes ship a pre-installed Chromium that does not match the browser
 * revision this Playwright release would download. Point at it when it exists
 * rather than fetching a second copy; fall back to Playwright's own otherwise.
 */
const PRE_INSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.GARDEN_CHROMIUM ??
  (existsSync(PRE_INSTALLED_CHROMIUM) ? PRE_INSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1500, height: 950 } } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the scripted provider so the suite never depends on a local model.
    env: { GARDEN_FORCE_MOCK_AI: "1" },
  },
});
