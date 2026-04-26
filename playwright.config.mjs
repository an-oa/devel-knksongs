import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: {
        timeout: 5_000
    },
    fullyParallel: true,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        headless: true,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"]
            }
        }
    ],
    webServer: {
        command: "python3 -m http.server 4173 --bind 127.0.0.1",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true
    }
});
