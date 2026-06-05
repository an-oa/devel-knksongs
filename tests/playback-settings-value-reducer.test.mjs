import test from "node:test";
import assert from "node:assert/strict";
import {
    PLAYBACK_SETTING_KINDS,
    PLAYBACK_SETTING_SCOPES,
    createPlaybackSettingDefinitions
} from "../app/lib/playback-settings/definitions.mjs";
import {
    createInitialPlaybackBehaviorPageValues,
    getPlaybackBehaviorEffectiveValue,
    isPagePlaybackBehaviorDefinition,
    reducePlaybackSettingChange
} from "../app/lib/playback-settings/value-reducer.mjs";

test("playback settings reducer: initializes page behavior values from definitions", () => {
    const { pagePlaybackBehaviorDefinitions } = createPlaybackSettingDefinitions();
    const pageValues = createInitialPlaybackBehaviorPageValues(pagePlaybackBehaviorDefinitions);

    assert.equal(pagePlaybackBehaviorDefinitions.every(isPagePlaybackBehaviorDefinition), true);
    assert.deepEqual([...pageValues.entries()], [
        ["continuousPlayback", false],
        ["loopPlayback", false]
    ]);
});

test("playback settings definitions: expose archive playback metadata in the full list", () => {
    const {
        archivePlaybackBehaviorDefinition,
        playbackSettingDefinitions
    } = createPlaybackSettingDefinitions();

    assert.equal(archivePlaybackBehaviorDefinition.stateKey, "playArchiveToEnd");
    assert.equal(playbackSettingDefinitions.includes(archivePlaybackBehaviorDefinition), true);
});

test("playback settings reducer: hidden values override inactive experimental settings", () => {
    const definition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        stateKey: "continuousPlayback",
        defaultValue: false,
        hiddenValue: false
    };
    const pageValues = new Map([["continuousPlayback", true]]);

    assert.equal(getPlaybackBehaviorEffectiveValue(definition, false, pageValues), false);
    assert.equal(getPlaybackBehaviorEffectiveValue(definition, true, pageValues), true);
});

test("playback settings reducer: effectiveWhenHidden keeps page values active while hidden", () => {
    const definition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        stateKey: "playArchiveToEnd",
        defaultValue: false,
        effectiveWhenHidden: true
    };
    const pageValues = new Map([["playArchiveToEnd", false]]);

    const reduction = reducePlaybackSettingChange({
        definition,
        currentValue: false,
        nextValue: true,
        experimentalEnabled: false,
        pageValues
    });

    assert.equal(reduction.nextValue, true);
    assert.equal(reduction.changed, true);
    assert.equal(reduction.pageValues.get("playArchiveToEnd"), true);
});

test("playback settings reducer: inactive hidden behavior does not overwrite page preference", () => {
    const definition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        stateKey: "continuousPlayback",
        defaultValue: false,
        hiddenValue: false
    };
    const pageValues = new Map([["continuousPlayback", true]]);

    const reduction = reducePlaybackSettingChange({
        definition,
        currentValue: false,
        nextValue: false,
        experimentalEnabled: false,
        pageValues
    });

    assert.equal(reduction.nextValue, false);
    assert.equal(reduction.changed, false);
    assert.equal(reduction.pageValues.get("continuousPlayback"), true);
});
