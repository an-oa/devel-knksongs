import type { PlaybackSettingsUiSlice } from "../../state.types";

export const THUMBNAIL_STORAGE_KEY = "showThumbnails";
export const USE_YOUTUBE_NOCOOKIE_STORAGE_KEY = "useYoutubeNoCookie";
export const PLAY_ARCHIVE_TO_END_STORAGE_KEY = "playArchiveToEnd";

// 旧バージョンが localStorage に残した個別キー。現行では読み込まず起動時に削除する。
export const LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS = Object.freeze([
    "showExperimentalPlaybackSettings",
    "showExperimentalPlaybackSettingsHiddenResetV1",
    "stopAtEndTime",
    "continuousPlayback",
    "loopPlayback"
]);

export const PLAYBACK_SETTING_SCOPES = Object.freeze({
    PERSISTED: "persisted",
    PAGE: "page"
});

export const PLAYBACK_SETTING_KINDS = Object.freeze({
    VISIBILITY: "visibility",
    BEHAVIOR: "behavior"
});

export const INITIAL_PLAYBACK_SETTING_VALUES = Object.freeze({
    showThumbnails: false,
    showExperimentalPlaybackSettings: false,
    useYoutubeNoCookie: false,
    playArchiveToEnd: false,
    continuousPlayback: false,
    loopPlayback: false
});

export type PlaybackSettingElementKey =
    "thumbToggle" |
    "youtubeNoCookieToggle" |
    "playArchiveToEndToggle" |
    "continuousPlaybackToggle" |
    "loopPlaybackToggle";

export type PlaybackSettingScope = "persisted" | "page";

export type PlaybackSettingKind = "visibility" | "behavior";

/**
 * 再生設定 1 件の定義。
 */
export type PlaybackSettingDefinition = {
    scope: PlaybackSettingScope;
    kind: PlaybackSettingKind;
    stateKey: keyof PlaybackSettingsUiSlice;
    elementKey?: PlaybackSettingElementKey;
    storageKey?: string;
    defaultValue: boolean;
    hiddenValue?: boolean;
    effectiveWhenHidden?: boolean;
    interactive?: boolean;
    restoreActivePlaybackOnChange?: boolean;
};

type PlaybackSettingDefinitionSet = {
    pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[];
    youtubeNoCookieDefinition: PlaybackSettingDefinition;
    archivePlaybackBehaviorDefinition: PlaybackSettingDefinition;
    experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition;
    thumbnailVisibilityDefinition: PlaybackSettingDefinition;
    playbackSettingDefinitions: PlaybackSettingDefinition[];
};

/*
 * 以下の JSDoc typedef は emit 後の .mjs に残し、
 * 移行途中の JavaScript 側でも型の参照元を読めるようにする。
 */
/**
 * @typedef {import("../../state.types").PlaybackSettingsUiSlice} PlaybackSettingsUiSlice
 * @typedef {"thumbToggle" | "youtubeNoCookieToggle" | "playArchiveToEndToggle" | "continuousPlaybackToggle" | "loopPlaybackToggle"} PlaybackSettingElementKey
 * @typedef {"persisted" | "page"} PlaybackSettingScope
 * @typedef {"visibility" | "behavior"} PlaybackSettingKind
 */

/**
 * 再生設定 1 件の定義。
 * @typedef {{
 *   scope: PlaybackSettingScope,
 *   kind: PlaybackSettingKind,
 *   stateKey: keyof PlaybackSettingsUiSlice,
 *   elementKey?: PlaybackSettingElementKey,
 *   storageKey?: string,
 *   defaultValue: boolean,
 *   hiddenValue?: boolean,
 *   effectiveWhenHidden?: boolean,
 *   interactive?: boolean,
 *   restoreActivePlaybackOnChange?: boolean
 * }} PlaybackSettingDefinition
 */

/**
 * 再生設定の定義一覧を作成する。
 * 本番コードでは playback settings controller から使い、
 * 設定 metadata の境界条件を単体テストするため export している。
 * @returns {{
 *   pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[],
 *   youtubeNoCookieDefinition: PlaybackSettingDefinition,
 *   archivePlaybackBehaviorDefinition: PlaybackSettingDefinition,
 *   experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition,
 *   thumbnailVisibilityDefinition: PlaybackSettingDefinition,
 *   playbackSettingDefinitions: PlaybackSettingDefinition[]
 * }}
 */
export function createPlaybackSettingDefinitions(): PlaybackSettingDefinitionSet {
    const youtubeNoCookieDefinition: PlaybackSettingDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PERSISTED,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        interactive: true,
        stateKey: "useYoutubeNoCookie",
        elementKey: "youtubeNoCookieToggle",
        storageKey: USE_YOUTUBE_NOCOOKIE_STORAGE_KEY,
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.useYoutubeNoCookie,
        restoreActivePlaybackOnChange: true
    };

    const archivePlaybackBehaviorDefinition: PlaybackSettingDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PERSISTED,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        interactive: true,
        stateKey: "playArchiveToEnd",
        elementKey: "playArchiveToEndToggle",
        storageKey: PLAY_ARCHIVE_TO_END_STORAGE_KEY,
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.playArchiveToEnd,
        restoreActivePlaybackOnChange: true
    };

    const pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[] = [
        {
            scope: PLAYBACK_SETTING_SCOPES.PAGE,
            kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
            stateKey: "continuousPlayback",
            elementKey: "continuousPlaybackToggle",
            defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.continuousPlayback,
            hiddenValue: false
        },
        {
            scope: PLAYBACK_SETTING_SCOPES.PAGE,
            kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
            stateKey: "loopPlayback",
            elementKey: "loopPlaybackToggle",
            defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.loopPlayback,
            hiddenValue: false
        }
    ];

    const experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.VISIBILITY,
        stateKey: "showExperimentalPlaybackSettings",
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.showExperimentalPlaybackSettings
    };

    const thumbnailVisibilityDefinition: PlaybackSettingDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PERSISTED,
        kind: PLAYBACK_SETTING_KINDS.VISIBILITY,
        interactive: true,
        stateKey: "showThumbnails",
        elementKey: "thumbToggle",
        storageKey: THUMBNAIL_STORAGE_KEY,
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.showThumbnails
    };

    const playbackSettingDefinitions = [
        thumbnailVisibilityDefinition,
        youtubeNoCookieDefinition,
        archivePlaybackBehaviorDefinition,
        experimentalPlaybackVisibilityDefinition,
        ...pagePlaybackBehaviorDefinitions
    ];

    return {
        pagePlaybackBehaviorDefinitions,
        youtubeNoCookieDefinition,
        archivePlaybackBehaviorDefinition,
        experimentalPlaybackVisibilityDefinition,
        thumbnailVisibilityDefinition,
        playbackSettingDefinitions
    };
}
