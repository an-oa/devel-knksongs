import test from "node:test";
import assert from "node:assert/strict";
import { getFormatFilterLabel } from "../_build/app/lib/format-filter.mjs";

test("format filter label: 歌みた is shown as オリ曲/歌みた", () => {
    assert.equal(getFormatFilterLabel("歌みた"), "オリ曲/歌みた");
});

test("format filter label: other formats keep their original label", () => {
    assert.equal(getFormatFilterLabel("配信"), "配信");
    assert.equal(getFormatFilterLabel("収録"), "収録");
    assert.equal(getFormatFilterLabel("ショート"), "ショート");
    assert.equal(getFormatFilterLabel("切り抜き"), "切り抜き");
});
