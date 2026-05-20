import test from "node:test";
import assert from "node:assert/strict";
import {
    STREAM_ROLE_GUEST,
    hasStreamRole,
    isGuestStreamRole,
    normalizeStreamRole
} from "../app/lib/stream-role.mjs";

test("stream role: normalizes raw values for comparison", () => {
    assert.equal(normalizeStreamRole(" ゲスト "), STREAM_ROLE_GUEST);
    assert.equal(normalizeStreamRole(null), "");
    assert.equal(normalizeStreamRole(undefined), "");
});

test("stream role: detects present roles and guest role", () => {
    assert.equal(hasStreamRole("ホスト"), true);
    assert.equal(hasStreamRole("  "), false);
    assert.equal(isGuestStreamRole(" ゲスト "), true);
    assert.equal(isGuestStreamRole("ホスト"), false);
});
