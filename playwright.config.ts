import { defineConfig } from "@playwright/test"

// Browser tests run against the real static build, served exactly as a static host would
// serve it. Build first: `npm run build`, then `npm run e2e`.
export default defineConfig({
  testDir: "e2e",
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3123",
    // The installed Chrome, locally and on GitHub's runners, so there is nothing to download.
    channel: "chrome",
  },
  webServer: {
    command: "python3 -m http.server 3123 --directory out",
    url: "http://localhost:3123",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "ignore",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 } } },
  ],
})
