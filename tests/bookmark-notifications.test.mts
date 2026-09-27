import test from "node:test";
import assert from "node:assert/strict";
import { createBookmarkNotificationController } from "../app/ui/bookmark/notifications.mts";
import { createSongFixture } from "./fixtures/song.mts";
import { installFakeDom, installFakeTimeouts, invokeListener } from "./test-helpers.mts";

/**
 * 通知テスト用の UI 状態を作る。
 * @returns {object}
 */
function createNotificationUiState() {
    const bookmarkNotificationRegion = document.createElement("div");
    document.body.appendChild(bookmarkNotificationRegion);
    return {
        el: {
            bookmarkNotificationRegion
        },
        lookup: {
            songMapByBookmarkKey: new Map<string, Song>(),
            songMapByKey: new Map<string, Song>(),
            songLookupSourceRef: null
        }
    };
}

/**
 * 通知テスト用の曲データを作る。
 * @returns {object}
 */
function createNotificationDataState() {
    return {
        allSongsRaw: [
            createSongFixture({
                songKey: "song-z",
                bookmarkSongKey: "bookmark-song-z",
                title: "透明な朝"
            })
        ],
        currentResults: [],
        displayLimit: 0,
        bookmarks: {},
        activeBookmark: null
    };
}

test("bookmark notifications: replaces toast and clears the previous timer", () => {
    const restoreDom = installFakeDom();
    const fakeTimeouts = installFakeTimeouts();
    const timers = fakeTimeouts.timeoutCalls;

    try {
        const ui = createNotificationUiState();
        const controller = createBookmarkNotificationController({
            data: createNotificationDataState(),
            ui,
            timeoutMs: 1200
        });

        controller.notifyBookmarkCreated("Morning");
        const firstToast = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast");
        assert.ok(firstToast);
        controller.notifySongSavedToBookmark("Morning", "bookmark-song-z");

        const secondMessage = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-message");
        assert.ok(secondMessage);
        assert.equal(firstToast.parentElement, null);
        assert.equal(secondMessage.textContent, "ブックマーク「Morning」に「透明な朝」を保存しました。");
        assert.equal(timers.length, 2);
        assert.equal(timers[0].unrefCalled, true);
        assert.equal(timers[1].delay, 1200);
        assert.deepEqual(timers.filter((timer) => timer.cleared), [timers[0]]);
    } finally {
        fakeTimeouts.cleanup();
        restoreDom();
    }
});

test("bookmark notifications: close button removes toast and clears timer", () => {
    const restoreDom = installFakeDom();
    const fakeTimeouts = installFakeTimeouts();
    const timers = fakeTimeouts.timeoutCalls;

    try {
        const ui = createNotificationUiState();
        const controller = createBookmarkNotificationController({
            data: createNotificationDataState(),
            ui
        });

        controller.notifyBookmarkCreated("Morning");
        const closeBtn = ui.el.bookmarkNotificationRegion.querySelector(".bookmark-toast-close");
        assert.ok(closeBtn);
        invokeListener(closeBtn, "click", {});

        assert.equal(ui.el.bookmarkNotificationRegion.childElementCount, 0);
        assert.deepEqual(timers.filter((timer) => timer.cleared), [timers[0]]);
    } finally {
        fakeTimeouts.cleanup();
        restoreDom();
    }
});
