import test from "node:test";
import assert from "node:assert/strict";
import {
    buildBookmarkExportFileName,
    buildBookmarkExportSelectionState,
    buildBookmarkImportConfirmMessage,
    buildBookmarkImportOption,
    buildBookmarkImportResultMessage,
    buildBookmarkImportSelectionState,
    buildBookmarkReplaceMessage,
    buildBookmarkReplaceResultMessage,
    getBookmarkImportErrorMessage,
    getBookmarkMergeBlockerMessage,
    readFileText
} from "../app/ui/bookmark/import-export.mts";
import type { BookmarkImportPreviewEntry, BookmarkImportRelation } from "../app/lib/storage/bookmark-transfer.mts";

/**
 * 確認画面の選択肢テスト用に、ファイル内のブックマーク 1 件分の照合結果を作る。
 * @param overrides 既定値から変える項目
 * @param relation 手元との関係。上書きのときは変更内容も渡す
 */
function createPreviewEntry(
    overrides: Partial<Pick<BookmarkImportPreviewEntry, "id" | "name" | "songCount" | "hasSameNameBookmark">> = {},
    relation: BookmarkImportRelation = { status: "new", changes: null }
): BookmarkImportPreviewEntry {
    return {
        id: "p_1",
        name: "Set List",
        songCount: 3,
        hasSameNameBookmark: false,
        ...overrides,
        ...relation
    };
}

/** 上書きの選択肢テストで使う、曲の増減がある変更内容。 */
const SONG_CHANGES = { addedSongCount: 1, removedSongCount: 0, orderChanged: false, previousName: null };

test("bookmark import export ui: builds dated export filenames", () => {
    const fileName = buildBookmarkExportFileName(new Date(2026, 3, 9));

    assert.equal(fileName, "knksongs-bookmarks-20260409.json");
});

test("bookmark import export ui: maps import results to user-facing messages", () => {
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_import_file_size", limit: 1_000_000 }, "ja"),
        "インポートできるファイルは最大1 MBです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "invalid_json" }, "ja"),
        "JSONとして読み込めないファイルです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "unsupported_version", version: 4 }, "ja"),
        "このアプリより新しい形式のブックマークファイルは読み込めません。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "storage_write_failed" }, "ja"),
        "インポートしたブックマークを保存できませんでした。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_bookmark_count", limit: 20 }, "ja"),
        "インポートできるブックマークは最大20件です。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_bookmark_name_length", limit: 64 }, "ja"),
        "ブックマーク名は最大64文字までです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false,
            reason: "max_songs_per_bookmark",
            limit: 120,
            bookmarkName: "Set List"
        }, "ja"),
        "「Set List」は最大120曲までです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "songs_not_ready" }, "ja"),
        "曲データの読み込みが終わってから、もう一度お試しください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_bookmark_count", limit: 20, available: 3 }, "ja"),
        "ブックマークは最大20件です。追加できるのはあと3件です。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_bookmark_count", limit: 20, available: 0 }, "ja"),
        "ブックマークは最大20件です。追加するには、不要なブックマークを削除してください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_total_size", limit: 1_000_000 }, "ja"),
        "インポート後のブックマーク全体が1 MBを超えるため、インポートできません。選ぶブックマークを減らしてください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "unsupported_storage_version", version: 4 }, "ja"),
        "このアプリより新しい形式のブックマークが保存されているため、追加・上書きはできません。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "storage_reload_required" }, "ja"),
        "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。"
    );
});

test("bookmark import export ui: builds replacement confirmation text with the deleted count", () => {
    assert.equal(
        buildBookmarkImportConfirmMessage({ bookmarkCount: 2, songCount: 5, currentBookmarkCount: 12 }, "ja"),
        [
            "現在のブックマークをすべて削除し、ファイルの内容で置換します。",
            "削除するブックマーク：12件",
            "置換後のブックマーク：2件（5曲）",
            "よろしいですか？"
        ].join("\n")
    );
    assert.equal(
        buildBookmarkImportConfirmMessage({ bookmarkCount: 1, songCount: 3, currentBookmarkCount: 0 }, "ja"),
        [
            "現在のブックマークをすべて削除し、ファイルの内容で置換します。",
            "置換後のブックマーク：1件（3曲）",
            "よろしいですか？"
        ].join("\n")
    );
});

test("bookmark import export ui: describes the whole replacement before and after it runs", () => {
    assert.equal(
        buildBookmarkReplaceMessage({ bookmarkCount: 4, currentBookmarkCount: 3 }, "ja"),
        "今ある3件を削除し、ファイルの4件で置換します。"
    );
    assert.equal(buildBookmarkReplaceMessage({ bookmarkCount: 4, currentBookmarkCount: 0 }, "ja"), "ファイルの4件で置換します。");
    assert.equal(buildBookmarkReplaceResultMessage(4, "ja"), "ブックマークを、ファイルの4件で置換しました。");
});

test("bookmark import export ui: describes new, overwritten, and unchanged bookmarks as options", () => {
    assert.deepEqual(buildBookmarkImportOption(createPreviewEntry({ hasSameNameBookmark: true }), false, "ja"), {
        id: "p_1",
        name: "Set List",
        badge: "新規",
        details: ["3曲", "同じ名前のブックマークがあります"],
        checked: true,
        disabled: false
    });
    assert.deepEqual(buildBookmarkImportOption(createPreviewEntry({ songCount: 4 }, {
        status: "update",
        changes: { addedSongCount: 2, removedSongCount: 1, orderChanged: true, previousName: "Old List" }
    }), false, "ja"), {
        id: "p_1",
        name: "Set List",
        badge: "上書き",
        badgeIsCaution: true,
        details: ["4曲（2曲追加、1曲削除、並び順の変更）", "名前が「Old List」から変わります"],
        checked: true,
        disabled: false
    });
    assert.deepEqual(buildBookmarkImportOption(createPreviewEntry({}, {
        status: "update",
        changes: { addedSongCount: 0, removedSongCount: 0, orderChanged: false, previousName: "Old List" }
    }), false, "ja").details, ["3曲", "名前が「Old List」から変わります"]);
    assert.deepEqual(buildBookmarkImportOption(createPreviewEntry({}, { status: "unchanged", changes: null }), false, "ja"), {
        id: "p_1",
        name: "Set List",
        badge: "変更なし",
        details: ["3曲"],
        checked: false,
        disabled: true
    });
});

test("bookmark import export ui: disables every option while the stored data blocks merging", () => {
    const option = buildBookmarkImportOption(createPreviewEntry(), true, "ja");

    assert.equal(option.checked, false);
    assert.equal(option.disabled, true);
    assert.equal(
        getBookmarkMergeBlockerMessage({ ok: false, reason: "unsupported_storage_version", version: 4 }, "ja"),
        "このアプリより新しい形式のブックマークが保存されているため、追加・上書きはできません。「インポート」の ▼ から「ブックマーク全体を置換」を選ぶと、ファイルの内容で置換できます。"
    );
    assert.equal(
        getBookmarkMergeBlockerMessage({ ok: false, reason: "storage_reload_required" }, "ja"),
        "別のタブでブックマークが更新された可能性があります。追加・上書きするには、画面を再読み込みしてから、もう一度お試しください。"
    );
    assert.equal(
        getBookmarkMergeBlockerMessage({ ok: false, reason: "storage_write_failed" }, "ja"),
        "ブックマークを保存できない状態のため、追加・上書きはできません。ブラウザのストレージ設定をご確認ください。"
    );
});

test("bookmark import export ui: counts selected additions and overwrites against the bookmark limit", () => {
    const preview = {
        entries: [
            createPreviewEntry({ id: "new-1" }),
            createPreviewEntry({ id: "new-2" }),
            createPreviewEntry({ id: "update-1" }, { status: "update", changes: SONG_CHANGES }),
            createPreviewEntry({ id: "same-1" }, { status: "unchanged", changes: null })
        ],
        currentBookmarkCount: 19,
        maxBookmarkCount: 20,
        mergeBlocker: null
    } satisfies Parameters<typeof buildBookmarkImportSelectionState>[0];

    assert.deepEqual(buildBookmarkImportSelectionState(preview, ["new-1", "update-1", "same-1"], "ja"), {
        message: "1件を追加・1件を上書き",
        isError: false,
        canSubmit: true
    });
    assert.deepEqual(buildBookmarkImportSelectionState(preview, ["update-1"], "ja"), {
        message: "1件を上書き",
        isError: false,
        canSubmit: true
    });
    assert.deepEqual(buildBookmarkImportSelectionState(preview, ["new-1", "new-2"], "ja"), {
        message: "ブックマークは最大20件です。追加できるのはあと1件です。",
        isError: true,
        canSubmit: false
    });
    assert.deepEqual(buildBookmarkImportSelectionState(preview, ["same-1"], "ja"), {
        message: "インポートするブックマークを選んでください。",
        isError: false,
        canSubmit: false
    });
    assert.deepEqual(buildBookmarkImportSelectionState({
        ...preview,
        mergeBlocker: { ok: false, reason: "storage_reload_required" }
    }, ["new-1"], "ja"), {
        message: "",
        isError: false,
        canSubmit: false
    });
});

test("bookmark import export ui: summarizes export selections and import results", () => {
    assert.deepEqual(buildBookmarkExportSelectionState(["p_1", "p_2"], "ja"), {
        message: "2件を選択中",
        isError: false,
        canSubmit: true
    });
    assert.deepEqual(buildBookmarkExportSelectionState([], "ja"), {
        message: "エクスポートするブックマークを選んでください。",
        isError: false,
        canSubmit: false
    });
    assert.equal(buildBookmarkImportResultMessage({ addedCount: 2, updatedCount: 1 }, "ja"), "ブックマークを2件追加し、1件上書きしました。");
    assert.equal(buildBookmarkImportResultMessage({ addedCount: 2, updatedCount: 0 }, "ja"), "ブックマークを2件追加しました。");
    assert.equal(buildBookmarkImportResultMessage({ addedCount: 0, updatedCount: 1 }, "ja"), "ブックマークを1件上書きしました。");
    assert.equal(buildBookmarkImportResultMessage({ addedCount: 0, updatedCount: 0 }, "ja"), "ブックマークに変更はありませんでした。");
});

test("bookmark import export ui: reads text from File-like objects", async () => {
    const text = await readFileText({
        text: async () => "{\"version\":2,\"bookmarks\":{}}"
    });

    assert.equal(text, "{\"version\":2,\"bookmarks\":{}}");
});
