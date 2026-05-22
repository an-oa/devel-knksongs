export const SEARCH_STATE_CURRENT_VERSION = 5;
export const SEARCH_STATE_V1 = 1;
export const SEARCH_STATE_V4 = 4;

const SEARCH_STATE_V1_DEFAULT_FORMATS = ["配信", "歌みた", "ショート", "切り抜き"];
const SEARCH_STATE_FRAME_SCOPE_HOST = "host";
const SEARCH_STATE_FRAME_SCOPE_GUEST = "guest";

/**
 * 現行形式の検索状態保存 payload を組み立てる。
 * payload schema version は localStorage key 名の searchStateV1 とは独立して更新する。
 * @param {{
 *   query?: string,
 *   relayOnly?: boolean,
 *   harmonyOnly?: boolean,
 *   collabHostOnly?: boolean,
 *   collabGuestOnly?: boolean,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   formats?: string[]
 * }} input
 * @returns {{ version: number, query: string, relayOnly: boolean, harmonyOnly: boolean, collabHostOnly: boolean, collabGuestOnly: boolean, dateFrom: string, dateTo: string, formats: string[] }}
 */
export function buildStoredSearchStatePayload(input) {
    return {
        version: SEARCH_STATE_CURRENT_VERSION,
        query: typeof input.query === "string" ? input.query : "",
        relayOnly: Boolean(input.relayOnly),
        harmonyOnly: Boolean(input.harmonyOnly),
        collabHostOnly: Boolean(input.collabHostOnly),
        collabGuestOnly: Boolean(input.collabGuestOnly),
        dateFrom: typeof input.dateFrom === "string" ? input.dateFrom : "",
        dateTo: typeof input.dateTo === "string" ? input.dateTo : "",
        formats: Array.isArray(input.formats) ? input.formats.slice() : []
    };
}

/**
 * 保存済み検索状態の JSON 文字列を解析し、現行 UI へ渡せる値へ正規化する。
 * schema migration の境界条件を単体テストするため export している。
 * @param {string} text
 * @param {{ defaultFormats?: string[] }} options
 * @returns {{ version: number, query: string, relayOnly: boolean, harmonyOnly: boolean, collabHostOnly: boolean, collabGuestOnly: boolean, dateFrom: string, dateTo: string, formats: string[] }}
 */
export function parseStoredSearchStatePayload(text, options = {}) {
    const parsed = JSON.parse(text);
    const payload = parsed && typeof parsed === "object" ? parsed : {};
    const searchStateVersion = getStoredSearchStateVersion(payload);
    const collabRoleFilters = normalizeStoredCollabRoleFilters(payload, searchStateVersion);
    return {
        version: searchStateVersion,
        query: typeof payload.query === "string" ? payload.query : "",
        relayOnly: Boolean(payload.relayOnly),
        harmonyOnly: Boolean(payload.harmonyOnly),
        collabHostOnly: collabRoleFilters.host,
        collabGuestOnly: collabRoleFilters.guest,
        dateFrom: typeof payload.dateFrom === "string" ? payload.dateFrom : "",
        dateTo: typeof payload.dateTo === "string" ? payload.dateTo : "",
        formats: normalizeStoredSearchFormats(payload.formats, {
            defaultFormats: options.defaultFormats || [],
            searchStateVersion
        })
    };
}

/**
 * 保存 payload の旧参加形式値を現行のコラボ種別フィルタへ正規化する。
 * v3 以前の `own` は「ゲスト以外」だったため、コラボ(ホスト)へは
 * 安全に移せず未選択へ戻す。migration 用で、v4 互換を打ち切るときに削除可能。
 * 境界条件を単体テストするため export している。
 * @param {Record<string, unknown> | null | undefined} payload
 * @param {number} searchStateVersion
 * @returns {{ host: boolean, guest: boolean }}
 */
export function normalizeStoredCollabRoleFilters(payload, searchStateVersion) {
    const source = payload && typeof payload === "object" ? payload : {};
    if (searchStateVersion > SEARCH_STATE_V4) {
        return {
            host: Boolean(source.collabHostOnly),
            guest: Boolean(source.collabGuestOnly)
        };
    }

    const collabOnly = Boolean(source.collabOnly);
    const frameScope = source.frameScope;
    if (collabOnly) {
        return {
            host: true,
            guest: true
        };
    }
    if (frameScope === SEARCH_STATE_FRAME_SCOPE_HOST) {
        return {
            host: true,
            guest: false
        };
    }
    if (frameScope === SEARCH_STATE_FRAME_SCOPE_GUEST) {
        return {
            host: false,
            guest: true
        };
    }
    return {
        host: false,
        guest: false
    };
}

/**
 * 保存済み検索状態の schema version を返す。version 未定義の既存 payload は v1 とみなす。
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {number}
 */
export function getStoredSearchStateVersion(payload) {
    const version = payload && payload.version;
    if (Number.isInteger(version) && version >= SEARCH_STATE_V1) return version;
    return SEARCH_STATE_V1;
}

/**
 * 検索状態 v1 の既定フォーマット一式として保存された値か判定する。
 * v1 payload migration 用で、v1 互換を打ち切るタイミングで削除可能。
 * v1 での「すべてON」を、現行 version でも「すべてON」として復元するために使う。
 * 境界条件を単体テストするため export している。
 * @param {unknown[]} formats
 * @param {string[]} defaultFormats
 * @returns {boolean}
 */
export function isSearchStateV1DefaultFormats(formats, defaultFormats) {
    if (!defaultFormats.includes("収録")) return false;
    if (formats.length !== SEARCH_STATE_V1_DEFAULT_FORMATS.length) return false;
    const formatSet = new Set(formats);
    if (formatSet.size !== SEARCH_STATE_V1_DEFAULT_FORMATS.length) return false;
    return SEARCH_STATE_V1_DEFAULT_FORMATS.every((format) => formatSet.has(format));
}

/**
 * 保存 payload のフォーマット値を現行の選択状態へ正規化する。
 * @param {unknown} rawFormats
 * @param {{ defaultFormats: string[], searchStateVersion?: number }} options
 * @returns {string[]}
 */
export function normalizeStoredSearchFormats(rawFormats, options) {
    const defaultFormats = Array.isArray(options.defaultFormats) ? options.defaultFormats : [];
    const formats = Array.isArray(rawFormats) ? rawFormats : [];
    const searchStateVersion = Number.isInteger(options.searchStateVersion)
        ? options.searchStateVersion
        : SEARCH_STATE_CURRENT_VERSION;
    if (searchStateVersion === SEARCH_STATE_V1 && isSearchStateV1DefaultFormats(formats, defaultFormats)) {
        return defaultFormats.slice();
    }
    const allowed = new Set(defaultFormats);
    const selectedFormats = [];
    const seen = new Set();
    formats.forEach((format) => {
        if (!allowed.has(format) || seen.has(format)) return;
        selectedFormats.push(format);
        seen.add(format);
    });
    if (selectedFormats.length === 0) return defaultFormats.slice();
    return selectedFormats;
}
