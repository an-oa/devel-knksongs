import { createYoutubeController } from "../app/controllers/youtube.mjs";

export const YOUTUBE_PLAYER_STATES = {
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2
};

export const DEFAULT_YOUTUBE_CONTROLLER_CONSTANTS = {
    YT_IFRAME_API_SRC: "https://www.youtube.com/iframe_api",
    YT_IFRAME_API_SELECTOR: 'script[data-yt-iframe-api="true"]',
    YT_IFRAME_READY_POLL_MS: 50,
    STOP_PLAYBACK_ON_SCROLL_OUT: false
};

/**
 * youtube 系テスト用の UI 状態を作る。
 * @param {*} input
 * @returns {*}
 */
export function createYoutubeUiState(input = {}) {
    return {
        el: {
            thumbToggle: input.thumbToggle ?? null,
            playArchiveToEndToggle: input.playArchiveToEndToggle ?? null
        },
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            playArchiveToEnd: input.playArchiveToEnd ?? false,
            continuousPlayback: input.continuousPlayback ?? false,
            loopPlayback: input.loopPlayback ?? false,
            activeThumb: input.activeThumb ?? null,
            scrollObserver: null
        }
    };
}

/**
 * youtube コントローラーが共有するテスト用状態を作る。
 * @param {*} overrides
 * @returns {*}
 */
export function createYoutubeState(overrides = {}) {
    return {
        apiPromise: null,
        players: new WeakMap(),
        ...overrides
    };
}

/**
 * youtube コントローラーと周辺状態をまとめて作る。
 * @param {{ ui?: *, youtube?: *, constants?: * } | undefined} input
 * @returns {{ ui: *, youtube: *, constants: *, controller: * }}
 */
export function createYoutubeControllerHarness(input = {}) {
    const ui = input.ui ?? createYoutubeUiState();
    const youtube = input.youtube ?? createYoutubeState();
    const constants = {
        ...DEFAULT_YOUTUBE_CONTROLLER_CONSTANTS,
        ...(input.constants ?? {})
    };
    const controller = createYoutubeController({
        ui,
        youtube,
        constants
    });
    return { ui, youtube, constants, controller };
}

/**
 * テスト用の YT.Player モックで、既存 iframe をそのまま利用する。
 * @param {*} host
 * @param {*} options
 * @returns {*}
 */
export function attachMockPlayerIframe(host, options) {
    const iframe = host && host.tagName === "IFRAME"
        ? host
        : document.createElement("iframe");
    if (iframe !== host && host && typeof host.appendChild === "function") {
        host.appendChild(iframe);
    }
    if (options && options.events && typeof options.events.onReady === "function") {
        options.events.onReady({
            target: {
                getIframe() {
                    return iframe;
                }
            }
        });
    }
    return iframe;
}

/**
 * localStorage の最小モックを作る。
 * @returns {{ getItem: Function, setItem: Function, removeItem: Function }}
 */
export function createFakeLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(String(key), String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

/**
 * window.YT に指定した Player 実装を登録する。
 * @param {Function} Player
 * @param {{ target?: * } | undefined} options
 * @returns {*}
 */
export function installYoutubePlayerConstructor(Player, options = {}) {
    const target = options.target ?? globalThis.window;
    target.YT = {
        PlayerState: { ...YOUTUBE_PLAYER_STATES },
        Player
    };
    return target.YT;
}
