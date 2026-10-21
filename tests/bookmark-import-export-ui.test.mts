import test from "node:test";
import assert from "node:assert/strict";
import {
    buildBookmarkExportFileName,
    buildBookmarkImportConfirmMessage,
    getBookmarkImportErrorMessage,
    readFileText
} from "../app/ui/bookmark/import-export.mts";

test("bookmark import export ui: builds dated export filenames", () => {
    const fileName = buildBookmarkExportFileName(new Date(2026, 3, 9));

    assert.equal(fileName, "knksongs-bookmarks-20260409.json");
});

test("bookmark import export ui: maps import results to user-facing messages", () => {
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_import_file_size", limit: 1_000_000 }),
        "インポートできるファイルは最大1 MBです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "invalid_json" }),
        "JSONとして読み込めないファイルです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "unsupported_version", version: 4 }),
        "このアプリより新しい形式のブックマークファイルは読み込めません。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "storage_write_failed" }),
        "インポートしたブックマークを保存できませんでした。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_bookmark_count", limit: 20 }),
        "インポートできるブックマークは最大20件です。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "max_bookmark_name_length", limit: 64 }),
        "ブックマーク名は最大64文字までです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false,
            reason: "max_songs_per_bookmark",
            limit: 120,
            bookmarkName: "Set List"
        }),
        "「Set List」は最大120曲までです。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "songs_not_ready" }),
        "曲データの読み込みが終わってから、もう一度お試しください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_bookmark_count", limit: 20, available: 3 }),
        "ブックマークは最大20件です。追加できるのはあと3件です。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_bookmark_count", limit: 20, available: 0 }),
        "ブックマークは最大20件です。追加するには、不要なブックマークを削除してください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "import_exceeds_total_size", limit: 1_000_000 }),
        "インポート後のブックマーク全体が1 MBを超えるため、インポートできません。選ぶブックマークを減らしてください。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "unsupported_storage_version", version: 4 }),
        "このアプリより新しい形式のブックマークが保存されているため、追加・上書きはできません。"
    );
    assert.equal(
        getBookmarkImportErrorMessage({ ok: false, reason: "storage_reload_required" }),
        "別のタブでブックマークが更新された可能性があります。画面を再読み込みしてから、もう一度お試しください。"
    );
});

test("bookmark import export ui: builds replacement confirmation text", () => {
    assert.equal(
        buildBookmarkImportConfirmMessage({ bookmarkCount: 2, songCount: 5 }),
        [
            "現在のブックマークを置き換えます。",
            "2件のブックマーク、5曲をインポートします。",
            "よろしいですか？"
        ].join("\n")
    );
});

test("bookmark import export ui: reads text from File-like objects", async () => {
    const text = await readFileText({
        text: async () => "{\"version\":2,\"bookmarks\":{}}"
    });

    assert.equal(text, "{\"version\":2,\"bookmarks\":{}}");
});
