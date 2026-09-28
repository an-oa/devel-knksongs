import type { YoutubeIframeApiGlobal, YoutubePlayerLike } from "../../app/lib/youtube/iframe-api.types";
import { YOUTUBE_PLAYER_STATE } from "../../app/lib/youtube/player-state.mts";

/** Player生成を記録し、生成後にテストからreadyを通知できるYouTube APIモックを作る。 */
export function createYoutubeIframeApiFixture() {
    const creations: {
        iframe: Element;
        player: YoutubePlayerLike;
        emitReady: () => void;
        options: ConstructorParameters<YoutubeIframeApiGlobal["Player"]>[1];
    }[] = [];
    const api: YoutubeIframeApiGlobal = {
        PlayerState: YOUTUBE_PLAYER_STATE,
        Player: class {
            private iframe: Element;

            /** 対象iframeと生成オプションを記録する。ready通知は生成から独立させる。 */
            constructor(iframe: Element, options: ConstructorParameters<YoutubeIframeApiGlobal["Player"]>[1]) {
                this.iframe = iframe;
                creations.push({
                    iframe,
                    options,
                    player: this,
                    /** このプレーヤーの読み込み完了をテストの指定時点で通知する。 */
                    emitReady: () => options.events?.onReady?.({ target: this })
                });
            }

            /** このプレーヤーに紐付けられたiframeを返す。 */
            getIframe() {
                return this.iframe;
            }
        }
    };
    return { api, creations };
}
