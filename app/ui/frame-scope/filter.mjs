import {
    DEFAULT_FRAME_SCOPE,
    FRAME_SCOPE_ALL,
    FRAME_SCOPE_GUEST,
    FRAME_SCOPE_OWN,
    normalizeFrameScope
} from "../../lib/frame-scope-filter.mjs?v=18";

const FRAME_SCOPE_INPUT_SELECTOR = 'input[name="frameScope"]';
const FRAME_SCOPE_OPTIONS = [
    { value: FRAME_SCOPE_ALL, label: "すべて" },
    { value: FRAME_SCOPE_OWN, label: "ホスト" },
    { value: FRAME_SCOPE_GUEST, label: "ゲスト" }
];

/**
 * 配信での立場フィルタの radio UI 操作をまとめるコントローラーを作成する。
 * @param {{ ui: { el: { frameScopeOptions?: Element | null } } }} input
 */
export function createFrameScopeFilterController({ ui }) {
    /**
     * 配信での立場フィルタの radio UI を未構築なら描画する。
     */
    function renderFrameScopeOptions() {
        const container = ui.el.frameScopeOptions;
        if (!container || container.childElementCount > 0) return;
        FRAME_SCOPE_OPTIONS.forEach((option) => {
            const label = document.createElement("label");
            label.className = "segmented-control-item";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "frameScope";
            input.value = option.value;
            input.checked = option.value === DEFAULT_FRAME_SCOPE;
            const text = document.createElement("span");
            text.textContent = option.label;
            label.append(input, text);
            container.appendChild(label);
        });
    }

    /**
     * 配信での立場フィルタの radio input 一覧を返す。
     * @returns {HTMLInputElement[]}
     */
    function getFrameScopeInputs() {
        const container = ui.el.frameScopeOptions;
        if (!container) return [];
        return Array.from(container.querySelectorAll(FRAME_SCOPE_INPUT_SELECTOR));
    }

    /**
     * 現在選択中の配信での立場フィルタ値を返す。
     * @returns {string}
     */
    function getSelectedFrameScopeValue() {
        const selected = getFrameScopeInputs().find((input) => input.checked);
        return normalizeFrameScope(selected ? selected.value : DEFAULT_FRAME_SCOPE);
    }

    /**
     * 配信での立場フィルタを指定値へ同期する。
     * @param {unknown} rawValue
     */
    function applyFrameScopeValue(rawValue) {
        const frameScope = normalizeFrameScope(rawValue);
        getFrameScopeInputs().forEach((input) => {
            input.checked = input.value === frameScope;
        });
    }

    /**
     * 配信での立場フィルタを既定値へ戻す。
     */
    function setFrameScopeToDefault() {
        applyFrameScopeValue(DEFAULT_FRAME_SCOPE);
    }

    /**
     * 配信での立場フィルタの各 radio input へ change listener を登録する。
     * @param {EventListener} listener
     */
    function addChangeListener(listener) {
        getFrameScopeInputs().forEach((input) => {
            input.addEventListener("change", listener);
        });
    }

    return {
        renderFrameScopeOptions,
        getSelectedFrameScopeValue,
        applyFrameScopeValue,
        setFrameScopeToDefault,
        addChangeListener
    };
}
