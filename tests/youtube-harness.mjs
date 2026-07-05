import { createYoutubeController } from "../_build/app/controllers/youtube.mjs";
import { YOUTUBE_PLAYER_STATE } from "../_build/app/lib/youtube/player-state.mjs";

export const YOUTUBE_PLAYER_STATES = YOUTUBE_PLAYER_STATE;

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
            youtubeNoCookieToggle: input.youtubeNoCookieToggle ?? null,
            playArchiveToEndToggle: input.playArchiveToEndToggle ?? null
        },
        search: {
            dataReady: input.dataReady ?? false
        },
        playback: {
            showThumbnails: input.showThumbnails ?? true,
            useYoutubeNoCookie: input.useYoutubeNoCookie ?? false,
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

/**
 * 状態と再生位置を変更できる YT.Player mock を登録する。
 * @param {{ initialState?: number, currentTime?: number, duration?: number, target?: *, onCreate?: Function, onStopVideo?: Function } | undefined} input
 * @returns {Array<*>}
 */
export function installStatefulYoutubePlayerMock(input = {}) {
    const instances = [];
    installYoutubePlayerConstructor(class {
        constructor(host, options) {
            this.iframe = attachMockPlayerIframe(host, options);
            this.currentState = input.initialState ?? YOUTUBE_PLAYER_STATES.UNSTARTED;
            this.currentTime = input.currentTime ?? 0;
            this.duration = input.duration ?? 0;
            this.stopCallCount = 0;
            instances.push(this);
            if (typeof input.onCreate === "function") {
                input.onCreate(this, { host, options });
            }
        }

        getIframe() {
            return this.iframe;
        }

        getPlayerState() {
            return this.currentState;
        }

        getCurrentTime() {
            return this.currentTime;
        }

        getDuration() {
            return this.duration;
        }

        stopVideo() {
            this.stopCallCount += 1;
            if (typeof input.onStopVideo === "function") {
                input.onStopVideo(this);
            }
        }

        destroy() {}
    }, {
        target: input.target
    });
    return instances;
}
