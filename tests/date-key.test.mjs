import test from "node:test";
import assert from "node:assert/strict";
import { dateKeyToParts, isWithinDateRange, parseDateKey } from "../_build/app/lib/date-key.mjs";

test("parseDateKey: valid and invalid dates", () => {
    assert.equal(parseDateKey("2024-02-29"), 20240229);
    assert.equal(parseDateKey("2024/2/9"), 20240209);
    assert.equal(parseDateKey("2024-02-30"), null);
    assert.equal(parseDateKey("abc"), null);
});

test("isWithinDateRange: inclusive bounds", () => {
    const row = { dateKey: 20240115 };
    assert.equal(isWithinDateRange(row, null, null), true);
    assert.equal(isWithinDateRange(row, 20240115, 20240115), true);
    assert.equal(isWithinDateRange(row, 20240116, null), false);
    assert.equal(isWithinDateRange(row, null, 20240114), false);
});

test("date key helpers: parse, split, and range checks", () => {
    assert.equal(parseDateKey("2024-02-29"), 20240229);
    assert.equal(parseDateKey("2024-02-30"), null);
    assert.deepEqual(dateKeyToParts(20240209), { year: 2024, month: 2, day: 9 });
    assert.equal(isWithinDateRange({ dateKey: 20240209 }, 20240201, 20240210), true);
    assert.equal(isWithinDateRange({ dateKey: 20240209 }, 20240210, null), false);
});
