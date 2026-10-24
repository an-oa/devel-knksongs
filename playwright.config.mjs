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
        // 曲名の表記はブラウザの言語で初期値が変わる。既存のテストは日本語表記を前提にするため、日本語のブラウザとして動かす。
        // 言語ごとの初期表記は tests/e2e/song-names.spec.mts で locale を指定して検証する。
        locale: "ja-JP",
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
        },
        {
            name: "webkit",
            use: {
                ...devices["Desktop Safari"]
            }
        }
    ],
    webServer: {
        command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory _site",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true
    }
});
