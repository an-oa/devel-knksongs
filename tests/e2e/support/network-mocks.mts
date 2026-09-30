import type { Page } from "@playwright/test";
import { installSongsNetworkMocks } from "./songs-network.mts";
import { installYoutubeNetworkMocks } from "./mock-youtube.mts";

/** 曲データとYouTubeのモックを組み合わせ、画面全体の外部通信を差し替える。 */
export async function installNetworkMocks(page: Page): Promise<void> {
    await installSongsNetworkMocks(page);
    await installYoutubeNetworkMocks(page);
}
