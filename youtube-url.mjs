/**
 * YouTube URLから `videoId` と開始秒数を抽出する。
 * @param {*} url
 */
export function extractYoutubeInfo(url) {
    try {
        const u = new URL(url);
        const isShorts = /\/shorts\/[^/?#]+/.test(u.pathname);
        const id = u.hostname === "youtu.be"
            ? u.pathname.slice(1)
            : (u.searchParams.get("v") || u.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || u.pathname.match(/\/live\/([^/?#]+)/)?.[1]);
        const t = u.searchParams.get("t") || u.searchParams.get("start") || "0";
        return { videoId: id, startSeconds: parseInt(t, 10) || 0, isVertical: isShorts };
    } catch {
        return { videoId: "", startSeconds: 0, isVertical: false };
    }
}
