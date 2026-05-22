import test from "node:test";
import assert from "node:assert/strict";
import {
    SEARCH_STATE_CURRENT_VERSION,
    buildStoredSearchStatePayload,
    getStoredSearchStateVersion,
    isSearchStateV1DefaultFormats,
    normalizeStoredCollabRoleFilters,
    normalizeStoredSearchFormats,
    parseStoredSearchStatePayload
} from "../app/lib/storage/search-state-schema.mjs";

test("search state schema: builds current version payload", () => {
    const payload = buildStoredSearchStatePayload({
        query: "群青",
        relayOnly: true,
        harmonyOnly: false,
        collabHostOnly: true,
        collabGuestOnly: false,
        dateFrom: "2024",
        dateTo: "",
        formats: ["配信", "収録"]
    });

    assert.deepEqual(payload, {
        version: SEARCH_STATE_CURRENT_VERSION,
        query: "群青",
        relayOnly: true,
        harmonyOnly: false,
        collabHostOnly: true,
        collabGuestOnly: false,
        dateFrom: "2024",
        dateTo: "",
        formats: ["配信", "収録"]
    });
});

test("search state schema: treats missing or invalid versions as v1", () => {
    assert.equal(getStoredSearchStateVersion({}), 1);
    assert.equal(getStoredSearchStateVersion({ version: "2" }), 1);
    assert.equal(getStoredSearchStateVersion({ version: 2 }), 2);
});

test("search state schema: parses saved text into normalized current values", () => {
    const defaultFormats = ["配信", "歌みた", "ショート", "切り抜き", "収録"];

    assert.deepEqual(
        parseStoredSearchStatePayload(JSON.stringify({
            query: "群青",
            collabOnly: true,
            relayOnly: true,
            harmonyOnly: false,
            dateFrom: "2024-02-10",
            dateTo: "2024-03-05",
            formats: ["配信", "歌みた", "ショート", "切り抜き"]
        }), { defaultFormats }),
        {
            version: 1,
            query: "群青",
            relayOnly: true,
            harmonyOnly: false,
            collabHostOnly: true,
            collabGuestOnly: true,
            dateFrom: "2024-02-10",
            dateTo: "2024-03-05",
            formats: defaultFormats
        }
    );
});

test("search state schema: parses invalid saved fields into defaults", () => {
    const defaultFormats = ["配信", "歌みた"];

    assert.deepEqual(
        parseStoredSearchStatePayload(JSON.stringify({
            version: SEARCH_STATE_CURRENT_VERSION,
            query: 123,
            collabHostOnly: "",
            collabGuestOnly: 1,
            relayOnly: "",
            harmonyOnly: 1,
            dateFrom: false,
            dateTo: {},
            formats: ["存在しない形式"]
        }), { defaultFormats }),
        {
            version: SEARCH_STATE_CURRENT_VERSION,
            query: "",
            relayOnly: false,
            harmonyOnly: true,
            collabHostOnly: false,
            collabGuestOnly: true,
            dateFrom: "",
            dateTo: "",
            formats: defaultFormats
        }
    );
});

test("search state schema: migrates legacy collab fields to role filters", () => {
    assert.deepEqual(normalizeStoredCollabRoleFilters({ collabOnly: true }, 1), { host: true, guest: true });
    assert.deepEqual(normalizeStoredCollabRoleFilters({ frameScope: "host" }, 4), { host: true, guest: false });
    assert.deepEqual(normalizeStoredCollabRoleFilters({ frameScope: "guest" }, 4), { host: false, guest: true });
    assert.deepEqual(
        normalizeStoredCollabRoleFilters({ collabHostOnly: true, collabGuestOnly: false }, SEARCH_STATE_CURRENT_VERSION),
        { host: true, guest: false }
    );
});

test("search state schema: detects v1 default formats only when current defaults include recording", () => {
    const v1Formats = ["配信", "歌みた", "ショート", "切り抜き"];

    assert.equal(
        isSearchStateV1DefaultFormats(v1Formats, ["配信", "歌みた", "ショート", "切り抜き", "収録"]),
        true
    );
    assert.equal(
        isSearchStateV1DefaultFormats(v1Formats, ["配信", "歌みた", "ショート", "切り抜き"]),
        false
    );
});

test("search state schema: restores legacy all-on formats to current defaults", () => {
    const defaultFormats = ["配信", "歌みた", "ショート", "切り抜き", "収録"];

    assert.deepEqual(
        normalizeStoredSearchFormats(["配信", "歌みた", "ショート", "切り抜き"], {
            defaultFormats,
            searchStateVersion: 1
        }),
        defaultFormats
    );
});

test("search state schema: keeps current payload formats and falls back on invalid saved values", () => {
    const defaultFormats = ["配信", "歌みた", "ショート", "切り抜き", "収録"];

    assert.deepEqual(
        normalizeStoredSearchFormats(["配信", "歌みた", "ショート", "切り抜き"], {
            defaultFormats,
            searchStateVersion: SEARCH_STATE_CURRENT_VERSION
        }),
        ["配信", "歌みた", "ショート", "切り抜き"]
    );
    assert.deepEqual(
        normalizeStoredSearchFormats(["存在しない形式"], {
            defaultFormats,
            searchStateVersion: SEARCH_STATE_CURRENT_VERSION
        }),
        defaultFormats
    );
});
