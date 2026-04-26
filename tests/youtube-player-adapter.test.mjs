import test from "node:test";
import assert from "node:assert/strict";
import { YT_EMBED_HOST } from "../app/lib/youtube/embed.mjs";
import { createYoutubePlayerAdapter } from "../app/lib/youtube/player-adapter.mjs";
import { installFakeDom } from "./test-helpers.mjs";

/**
 * Promise を外側から解決・拒否できるテスト補助を作る。
 * @returns {{ promise: Promise<*>, resolve: Function, reject: Function }}
 */
function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}

/**
 * YT.Player adapter のテスト用状態を作る。
 * @param {{ ensureReady?: Function } | undefined} options
 * @returns {*}
 */
function createAdapterHarness(options = {}) {
    const sharedPlayback = {
        player: null,
        playerPromise: null,
        pendingAttach: null,
        iframe: null,
        parkingNode: null
    };
    const calls = {
        appliedIframes: [],
        debug: [],
        errors: [],
        sessions: [],
        stateChanges: [],
        sync: 0
    };
    const adapter = createYoutubePlayerAdapter({
        getSharedPlaybackState: () => sharedPlayback,
        setPendingAttach: (iframe, playbackSessionId) => {
            sharedPlayback.pendingAttach = { iframe, playbackSessionId };
        },
        setSessionId: (playbackSessionId) => {
            calls.sessions.push(playbackSessionId);
        },
        ensureReady: options.ensureReady || (() => Promise.resolve()),
        applyIframeAttributes: (iframe) => {
            calls.appliedIframes.push(iframe);
        },
        syncIframe: () => {
            calls.sync += 1;
            return sharedPlayback.iframe;
        },
        handleStateChange: (event, playbackSessionId) => {
            calls.stateChanges.push({ event, playbackSessionId });
        },
        handlePlayerError: (event, playbackSessionId) => {
            calls.errors.push({ event, playbackSessionId });
        },
        debug: (message, details) => {
            calls.debug.push({ message, details });
        }
    });
    return { adapter, calls, sharedPlayback };
}

test("youtube player adapter: creates a YT.Player for the pending iframe and bridges events", async () => {
    const cleanup = installFakeDom();
    try {
        const { adapter, calls, sharedPlayback } = createAdapterHarness();
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        const playerCalls = [];
        window.YT = {
            Player: class {
                constructor(host, options) {
                    playerCalls.push({ host, options });
                    this.iframe = host;
                    options.events.onReady({ target: this });
                }

                getIframe() {
                    return this.iframe;
                }
            }
        };

        const player = await adapter.attach(iframe, 7);

        assert.equal(player, sharedPlayback.player);
        assert.equal(sharedPlayback.playerPromise, null);
        assert.equal(playerCalls.length, 1);
        assert.equal(playerCalls[0].host, iframe);
        assert.equal(playerCalls[0].options.host, YT_EMBED_HOST);
        assert.deepEqual(calls.sessions, [7, 7]);
        assert.deepEqual(calls.appliedIframes, [iframe, iframe]);
        assert.equal(calls.sync, 1);

        const stateEvent = { data: 1 };
        const errorEvent = { data: 150 };
        playerCalls[0].options.events.onStateChange(stateEvent);
        playerCalls[0].options.events.onError(errorEvent);

        assert.deepEqual(calls.stateChanges, [{ event: stateEvent, playbackSessionId: 7 }]);
        assert.deepEqual(calls.errors, [{ event: errorEvent, playbackSessionId: 7 }]);
    } finally {
        cleanup();
    }
});

test("youtube player adapter: pending attach uses the latest iframe while player init is waiting", async () => {
    const cleanup = installFakeDom();
    try {
        const ready = createDeferred();
        const { adapter, sharedPlayback } = createAdapterHarness({
            ensureReady: () => ready.promise
        });
        const firstIframe = document.createElement("iframe");
        const secondIframe = document.createElement("iframe");
        document.body.append(firstIframe, secondIframe);
        const playerHosts = [];
        window.YT = {
            Player: class {
                constructor(host) {
                    playerHosts.push(host);
                    this.iframe = host;
                }

                getIframe() {
                    return this.iframe;
                }
            }
        };

        const firstAttach = adapter.attach(firstIframe, 1);
        const secondAttach = adapter.attach(secondIframe, 2);
        assert.equal(firstAttach, secondAttach);

        ready.resolve();
        const player = await firstAttach;

        assert.equal(playerHosts.length, 1);
        assert.equal(playerHosts[0], secondIframe);
        assert.equal(player, sharedPlayback.player);
    } finally {
        cleanup();
    }
});

test("youtube player adapter: ensureReady rejection clears playerPromise and rejects", async () => {
    const cleanup = installFakeDom();
    try {
        const expectedError = new Error("iframe api failed");
        const { adapter, sharedPlayback } = createAdapterHarness({
            ensureReady: () => Promise.reject(expectedError)
        });
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);

        await assert.rejects(adapter.attach(iframe, 1), expectedError);
        assert.equal(sharedPlayback.playerPromise, null);
        assert.equal(sharedPlayback.player, null);
    } finally {
        cleanup();
    }
});
