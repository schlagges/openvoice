import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.OPENVOICE_E2E_BASE_URL ?? "http://localhost:55180";
const username = process.env.OPENVOICE_E2E_SITE_USER ?? "openvoice";
const password = process.env.OPENVOICE_E2E_SITE_PASSWORD ?? "keins";
const channel = process.env.OPENVOICE_E2E_BROWSER_CHANNEL ?? "chrome";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL,
    channel,
    httpCredentials: {
      password,
      username,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
