import test from "node:test";
import assert from "node:assert/strict";
import { createFrameScopeFilterController } from "../app/ui/frame-scope/filter.mjs";
import { FRAME_SCOPE_ALL, FRAME_SCOPE_GUEST, FRAME_SCOPE_OWN } from "../app/lib/frame-scope-filter.mjs";
import { installFakeDom } from "./test-helpers.mjs";

function createFrameScopeInput(value, checked = false) {
    const listeners = [];
    return {
        value,
        checked,
        addEventListener: (type, listener) => {
            assert.equal(type, "change");
            listeners.push(listener);
        },
        dispatchChange: () => {
            listeners.forEach((listener) => listener({ type: "change" }));
        }
    };
}

function createControllerWithInputs(inputs) {
    const container = {
        querySelectorAll: (selector) => {
            assert.equal(selector, 'input[name="frameScope"]');
            return inputs;
        }
    };
    return createFrameScopeFilterController({
        ui: {
            el: {
                frameScopeOptions: container
            }
        }
    });
}

test("createFrameScopeFilterController: renders frame scope options from shared definitions", () => {
    const restoreDom = installFakeDom();
    try {
        const frameScopeOptions = document.createElement("div");
        const controller = createFrameScopeFilterController({
            ui: {
                el: {
                    frameScopeOptions
                }
            }
        });

        controller.renderFrameScopeOptions();
        controller.renderFrameScopeOptions();

        const inputs = Array.from(frameScopeOptions.querySelectorAll("input"));
        const labels = Array.from(frameScopeOptions.querySelectorAll("span")).map((span) => span.textContent);
        assert.deepEqual(inputs.map((input) => input.value), [FRAME_SCOPE_ALL, FRAME_SCOPE_OWN, FRAME_SCOPE_GUEST]);
        assert.deepEqual(labels, ["すべて", "ホスト", "ゲスト"]);
        assert.equal(inputs[0].checked, true);
        assert.equal(inputs[1].checked, false);
        assert.equal(inputs[2].checked, false);
        assert.equal(frameScopeOptions.childElementCount, 3);
    } finally {
        restoreDom();
    }
});

test("createFrameScopeFilterController: reads and applies normalized frame scope values", () => {
    const inputs = [
        createFrameScopeInput(FRAME_SCOPE_ALL, false),
        createFrameScopeInput(FRAME_SCOPE_OWN, false),
        createFrameScopeInput(FRAME_SCOPE_GUEST, true)
    ];
    const controller = createControllerWithInputs(inputs);

    assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_GUEST);

    controller.applyFrameScopeValue(FRAME_SCOPE_OWN);
    assert.equal(inputs[0].checked, false);
    assert.equal(inputs[1].checked, true);
    assert.equal(inputs[2].checked, false);

    controller.applyFrameScopeValue("unknown");
    assert.equal(inputs[0].checked, true);
    assert.equal(inputs[1].checked, false);
    assert.equal(inputs[2].checked, false);
});

test("createFrameScopeFilterController: falls back to default when no input is selected", () => {
    const inputs = [
        createFrameScopeInput(FRAME_SCOPE_ALL, false),
        createFrameScopeInput(FRAME_SCOPE_OWN, false)
    ];
    const controller = createControllerWithInputs(inputs);

    assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_ALL);
});

test("createFrameScopeFilterController: registers change listeners on frame scope inputs", () => {
    const inputs = [
        createFrameScopeInput(FRAME_SCOPE_ALL),
        createFrameScopeInput(FRAME_SCOPE_OWN),
        createFrameScopeInput(FRAME_SCOPE_GUEST)
    ];
    const controller = createControllerWithInputs(inputs);
    let changeCount = 0;

    controller.addChangeListener(() => {
        changeCount += 1;
    });
    inputs[0].dispatchChange();
    inputs[2].dispatchChange();

    assert.equal(changeCount, 2);
});

test("createFrameScopeFilterController: tolerates a missing frame scope container", () => {
    const controller = createFrameScopeFilterController({
        ui: {
            el: {
                frameScopeOptions: null
            }
        }
    });

    assert.equal(controller.getSelectedFrameScopeValue(), FRAME_SCOPE_ALL);
    assert.doesNotThrow(() => controller.applyFrameScopeValue(FRAME_SCOPE_OWN));
    assert.doesNotThrow(() => controller.addChangeListener(() => {}));
});
