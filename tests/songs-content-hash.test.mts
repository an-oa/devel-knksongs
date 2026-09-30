import test from "node:test";
import assert from "node:assert/strict";
import { createSongsContentHash } from "../scripts/songs-content-hash.mjs";

test("songs content hash: creates a sha256 hash from serialized songs", () => {
    assert.equal(
        createSongsContentHash([{ songKey: "archive-1::1" }]),
        "sha256:6edd2d27b066423969c01c59c8dfa27b978595dd7bea86bb3324a52f09646ad5"
    );
});

test("songs content hash: changes when song content changes", () => {
    assert.notEqual(
        createSongsContentHash([{ songKey: "archive-1::1" }]),
        createSongsContentHash([{ songKey: "archive-1::2" }])
    );
});
