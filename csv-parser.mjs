import { normalizeForSearch, parseDateKey } from "./search.mjs";

/**
 * buildSongKey を実行する
 * @param {*} input
 */
function buildSongKey(input) {
    const { archiveId, archiveOrder, url } = input;
    const orderPart = Number.isFinite(archiveOrder) ? String(archiveOrder) : "";
    return [
        String(archiveId || "").trim(),
        orderPart,
        String(url || "").trim()
    ].join("::");
}

/**
 * parseArchiveOrder を実行する
 * @param {*} raw
 */
function parseArchiveOrder(raw) {
    if (!raw) return null;
    const value = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(value) ? value : null;
}

/**
 * parseCsvRFC4180 を実行する
 * @param {*} t
 */
function parseCsvRFC4180(t) {
    let res = [];
    let row = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (inQ) {
            if (c === '"' && t[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQ = false;
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQ = true;
            } else if (c === ',') {
                row.push(field);
                field = "";
            } else if (c === '\n' || c === '\r') {
                row.push(field);
                res.push(row);
                row = [];
                field = "";
                if (c === '\r' && t[i + 1] === '\n') i++;
            } else {
                field += c;
            }
        }
    }
    row.push(field);
    res.push(row);
    while (res.length > 0 && res[res.length - 1].every((v) => v === "")) {
        res.pop();
    }
    return res;
}

/**
 * parseCsvToSongs を実行する
 * @param {*} csvText
 */
export function parseCsvToSongs(csvText) {
    const rows = parseCsvRFC4180(csvText);
    const header = rows[0];
    const required = ["公開範囲", "#", "##", "曲名", "アーティスト名", "キョクメイ", "アーティストメイ", "配信日", "形態", "歌枠リレー？", "ハモリあり？", "URL", "メモ"];
    const missing = required.filter((name) => !header.includes(name));
    if (missing.length > 0) {
        throw new Error(`CSVヘッダ不足: ${missing.join(", ")}`);
    }
    const body = rows.slice(1);
    const idxMap = Object.fromEntries(header.map((name, index) => [name, index]));
    const idx = (n) => idxMap[n];
    const songs = [];
    for (let i = 0; i < body.length; i++) {
        const r = body[i];
        const memo = r[idx("メモ")] || "";
        const memoUpper = memo.toUpperCase();
        const memoAllows = !memoUpper.includes("URL") && !memoUpper.includes("URI");
        const url = r[idx("URL")] || "";
        const archiveId = (r[idx("#")] || "").trim();
        if (r[idx("公開範囲")] !== "全体" || archiveId === "" || !memoAllows || url.trim() === "") continue;
        const title = r[idx("曲名")];
        const artist = r[idx("アーティスト名")];
        const titleYomi = r[idx("キョクメイ")];
        const artistYomi = r[idx("アーティストメイ")];
        const archiveOrder = parseArchiveOrder(r[idx("##")]);
        songs.push({
            date: r[idx("配信日")],
            dateKey: parseDateKey(r[idx("配信日")]),
            archiveId,
            archiveOrder,
            sourceIndex: i,
            songKey: buildSongKey({ archiveId, archiveOrder, url }),
            format: r[idx("形態")],
            isRelay: r[idx("歌枠リレー？")] === "◯",
            isHarmony: r[idx("ハモリあり？")] === "◯",
            title,
            artist,
            titleYomi,
            artistYomi,
            url,
            titleNorm: normalizeForSearch(title),
            artistNorm: normalizeForSearch(artist),
            titleYomiNorm: normalizeForSearch(titleYomi),
            artistYomiNorm: normalizeForSearch(artistYomi)
        });
    }
    return songs;
}
