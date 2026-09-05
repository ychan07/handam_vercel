import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser", fullyParallel: false, workers: 1, timeout: 30000,
  outputDir: "output/playwright/results",
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4187", channel: "msedge", headless: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "node tests/static-server.cjs", port: 4187, reuseExistingServer: false },
});
