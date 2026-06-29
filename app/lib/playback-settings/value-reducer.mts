import {
    PLAYBACK_SETTING_KINDS,
    PLAYBACK_SETTING_SCOPES
} from "./definitions.mjs";
import type { PlaybackSettingDefinition } from "./definitions.mjs";

type PagePlaybackBehaviorDefinition = PlaybackSettingDefinition & {
    scope: "page";
    kind: "behavior";
};

type PlaybackSettingChangeInput = {
    definition: PlaybackSettingDefinition;
    currentValue: boolean;
    nextValue: boolean;
    experimentalEnabled: boolean;
    pageValues: ReadonlyMap<string, boolean>;
};

type PlaybackSettingChangeResult = {
    previousValue: boolean;
    nextValue: boolean;
    changed: boolean;
    pageValues: Map<string, boolean>;
};

/*
 * 以下の JSDoc typedef は emit 後の .mjs に残し、
 * 移行途中の JavaScript 側でも型の参照元を読めるようにする。
 */
/** @typedef {import("./definitions.mjs").PlaybackSettingDefinition} PlaybackSettingDefinition */
/** @typedef {PlaybackSettingDefinition & { scope: "page", kind: "behavior" }} PagePlaybackBehaviorDefinition */
/** @typedef {{
 *   definition: PlaybackSettingDefinition,
 *   currentValue: boolean,
 *   nextValue: boolean,
 *   experimentalEnabled: boolean,
 *   pageValues: ReadonlyMap<string, boolean>
 * }} PlaybackSettingChangeInput
 */
/** @typedef {{
 *   previousValue: boolean,
 *   nextValue: boolean,
 *   changed: boolean,
 *   pageValues: Map<string, boolean>
 * }} PlaybackSettingChangeResult
 */

/**
 * ページ内だけで保持する再生挙動設定かを返す。
 * @param {PlaybackSettingDefinition} definition
 * @returns {definition is PagePlaybackBehaviorDefinition}
 */
export function isPagePlaybackBehaviorDefinition(
    definition: PlaybackSettingDefinition
): definition is PagePlaybackBehaviorDefinition {
    return definition.scope === PLAYBACK_SETTING_SCOPES.PAGE
        && definition.kind === PLAYBACK_SETTING_KINDS.BEHAVIOR;
}

/**
 * ページ内再生挙動設定の初期値 Map を作る。
 * 本番コードでは controller 初期化から使い、
 * reducer 的な値計算を単体テストしやすくするため export している。
 * @param {PlaybackSettingDefinition[]} definitions
 * @returns {Map<string, boolean>}
 */
export function createInitialPlaybackBehaviorPageValues(
    definitions: PlaybackSettingDefinition[]
): Map<string, boolean> {
    return new Map(definitions.map((definition) => [
        definition.stateKey,
        Boolean(definition.defaultValue)
    ]));
}

/**
 * 表示状態に応じた再生設定の実効値を返す。
 * @param {PlaybackSettingDefinition} definition
 * @param {boolean} experimentalEnabled
 * @param {ReadonlyMap<string, boolean>} pageValues
 * @returns {boolean}
 */
export function getPlaybackBehaviorEffectiveValue(
    definition: PlaybackSettingDefinition,
    experimentalEnabled: boolean,
    pageValues: ReadonlyMap<string, boolean>
): boolean {
    if (experimentalEnabled || definition.effectiveWhenHidden) {
        return Boolean(pageValues.get(definition.stateKey));
    }
    return Boolean(definition.hiddenValue);
}

/**
 * トグル入力から、UI へ反映する実効値と次の page value を計算する。
 * @param {PlaybackSettingChangeInput} input
 * @returns {PlaybackSettingChangeResult}
 */
export function reducePlaybackSettingChange(
    input: PlaybackSettingChangeInput
): PlaybackSettingChangeResult {
    const {
        definition,
        currentValue,
        nextValue,
        experimentalEnabled,
        pageValues
    } = input;
    const previousValue = Boolean(currentValue);
    const nextPageValues = new Map(pageValues);
    if (isPagePlaybackBehaviorDefinition(definition)) {
        if (experimentalEnabled || definition.effectiveWhenHidden) {
            nextPageValues.set(definition.stateKey, Boolean(nextValue));
        }
        const effectiveValue = getPlaybackBehaviorEffectiveValue(definition, experimentalEnabled, nextPageValues);
        return {
            previousValue,
            nextValue: effectiveValue,
            changed: previousValue !== effectiveValue,
            pageValues: nextPageValues
        };
    }
    const normalizedNextValue = Boolean(nextValue);
    return {
        previousValue,
        nextValue: normalizedNextValue,
        changed: previousValue !== normalizedNextValue,
        pageValues: nextPageValues
    };
}
