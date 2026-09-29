import { transform } from "esbuild";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { MockVideoBehavior } from "./youtube-iframe-api.mts";

let iframeApiMockPromise: Promise<string> | undefined;

/** APIが要求された時点でブラウザ用モックをJS化し、同じworker内では変換結果を共有する。 */
function getIframeApiMockScript(): Promise<string> {
    return iframeApiMockPromise ??= readFile(new URL("./youtube-iframe-api.mts", import.meta.url), "utf8")
        .then((source) => transform(source, { loader: "ts", format: "iife", target: "es2024" }))
        .then((result) => result.code);
}

/** YouTube API・埋め込み・サムネイル画像の通信をローカル応答へ差し替える。 */
export async function installYoutubeNetworkMocks(page: Page): Promise<void> {
    await page.route("https://www.youtube.com/iframe_api", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/javascript; charset=utf-8",
            body: await getIframeApiMockScript()
        });
    });
    await page.route("https://www.youtube.com/embed/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: "<!doctype html><title>mock youtube embed</title>"
        });
    });
    await page.route("https://i.ytimg.com/**", async (route) => {
        await route.fulfill({
            status: 204,
            body: ""
        });
    });
}

/**
 * YouTube API mock の利用可能化を待つ。
 */
export async function waitForMockYoutube(page: Page) {
    const { expect } = await import("@playwright/test");
    await expect.poll(async () => {
        return page.evaluate(() => typeof window.__knkMockYoutube === "object");
    }).toBe(true);
}

/**
 * モック YouTube プレーヤーの動画別ふるまいを設定する。
 */
export async function setMockVideoBehavior(page: Page, videoId: string, behavior: MockVideoBehavior) {
    await waitForMockYoutube(page);
    await page.evaluate(({ videoId, behavior }) => {
        if (!window.__knkMockYoutube) throw new Error("YouTube mock is unavailable");
        window.__knkMockYoutube.setBehavior(videoId, behavior);
    }, { videoId, behavior });
}

/** 最後に生成したPlayerを再生開始・終了の順で通知し、継続再生の判定を起動する。 */
export async function endLatestMockPlayback(page: Page): Promise<void> {
    await page.evaluate(() => {
        const mock = window.__knkMockYoutube;
        if (!mock) throw new Error("YouTube mock is unavailable");
        const playerIndex = mock.latestIndex();
        if (playerIndex < 0) throw new Error("No mock Player has been created");
        mock.emit(playerIndex, window.YT.PlayerState.PLAYING);
        mock.emit(playerIndex, window.YT.PlayerState.ENDED);
    });
}
