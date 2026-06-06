export const THUMBNAIL_STORAGE_KEY = "showThumbnails";
export const PLAY_ARCHIVE_TO_END_STORAGE_KEY = "playArchiveToEnd";

// 旧バージョンが localStorage に残した個別キー。現行では読み込まず起動時に削除する。
export const LEGACY_PLAYBACK_SETTINGS_STORAGE_KEYS = Object.freeze([
    "showExperimentalPlaybackSettings",
    "showExperimentalPlaybackSettingsHiddenResetV1",
    "stopAtEndTime",
    "continuousPlayback",
    "loopPlayback"
]);

/** @type {{ readonly PERSISTED: "persisted", readonly PAGE: "page" }} */
export const PLAYBACK_SETTING_SCOPES = Object.freeze({
    PERSISTED: "persisted",
    PAGE: "page"
});

/** @type {{ readonly VISIBILITY: "visibility", readonly BEHAVIOR: "behavior" }} */
export const PLAYBACK_SETTING_KINDS = Object.freeze({
    VISIBILITY: "visibility",
    BEHAVIOR: "behavior"
});

export const INITIAL_PLAYBACK_SETTING_VALUES = Object.freeze({
    showThumbnails: false,
    showExperimentalPlaybackSettings: false,
    playArchiveToEnd: false,
    continuousPlayback: false,
    loopPlayback: false
});

/**
 * 再生設定の定義一覧を作成する。
 * 本番コードでは playback settings controller から使い、
 * 設定 metadata の境界条件を単体テストするため export している。
 * @returns {{
 *   pagePlaybackBehaviorDefinitions: PlaybackSettingDefinition[],
 *   archivePlaybackBehaviorDefinition: PlaybackSettingDefinition,
 *   experimentalPlaybackVisibilityDefinition: PlaybackSettingDefinition,
 *   thumbnailVisibilityDefinition: PlaybackSettingDefinition,
 *   playbackSettingDefinitions: PlaybackSettingDefinition[]
 * }}
 */
export function createPlaybackSettingDefinitions() {
    /** @type {PlaybackSettingDefinition} */
    const archivePlaybackBehaviorDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PERSISTED,
        kind: PLAYBACK_SETTING_KINDS.BEHAVIOR,
        interactive: true,
        stateKey: "playArchiveToEnd",
        elementKey: "playArchiveToEndToggle",
        storageKey: PLAY_ARCHIVE_TO_END_STORAGE_KEY,
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.playArchiveToEnd,
        restoreActivePlaybackOnChange: true
    };

    /** @type {PlaybackSettingDefinition[]} */
    const pagePlaybackBehaviorDefinitions = [
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

    /** @type {PlaybackSettingDefinition} */
    const experimentalPlaybackVisibilityDefinition = {
        scope: PLAYBACK_SETTING_SCOPES.PAGE,
        kind: PLAYBACK_SETTING_KINDS.VISIBILITY,
        stateKey: "showExperimentalPlaybackSettings",
        defaultValue: INITIAL_PLAYBACK_SETTING_VALUES.showExperimentalPlaybackSettings
    };

    /** @type {PlaybackSettingDefinition} */
    const thumbnailVisibilityDefinition = {
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
        archivePlaybackBehaviorDefinition,
        experimentalPlaybackVisibilityDefinition,
        ...pagePlaybackBehaviorDefinitions
    ];

    return {
        pagePlaybackBehaviorDefinitions,
        archivePlaybackBehaviorDefinition,
        experimentalPlaybackVisibilityDefinition,
        thumbnailVisibilityDefinition,
        playbackSettingDefinitions
    };
}
