import test from "node:test";
import assert from "node:assert/strict";
import {
    getPartialDateKeyRange,
    normalizePartialDateParts
} from "../_build/app/lib/partial-date.mjs";

test("partial date helpers: normalize precision and calculate leap-aware ranges", () => {
    const year = normalizePartialDateParts({ year: "2024" });
    const leapMonth = normalizePartialDateParts({ year: "2024", month: "2" });
    const commonMonth = normalizePartialDateParts({ year: "2025", month: "02" });
    const complete = normalizePartialDateParts({ year: "2024", month: "2", day: "29" });

    assert.deepEqual(getPartialDateKeyRange(year), { minKey: 20240101, maxKey: 20241231 });
    assert.deepEqual(getPartialDateKeyRange(leapMonth), { minKey: 20240201, maxKey: 20240229 });
    assert.deepEqual(getPartialDateKeyRange(commonMonth), { minKey: 20250201, maxKey: 20250228 });
    assert.deepEqual(getPartialDateKeyRange(complete), { minKey: 20240229, maxKey: 20240229 });
    assert.equal(normalizePartialDateParts({ year: "2025", month: "2", day: "29" }), null);
    assert.equal(normalizePartialDateParts({ year: "2025", month: "13" }), null);
});
