/** site のルートへ置く静的ファイルの source directory。 */
export const PUBLIC_ASSET_DIR = "public";
/**
 * site へそのまま置く静的ファイル。en/index.html は英語で共有するときの OGP 用のページで、
 * 開いた人をサイト本体へ英語の指定付きで移動させる。ogp-en.png はその OGP 画像。
 */
export const ROOT_ASSET_FILES = [
    "index.html",
    "styles.css",
    "ogp.png",
    "ogp-en.png",
    "favicon.svg",
    "favicon-32.png",
    "apple-touch-icon.png",
    "goggles.svg",
    "en/index.html"
];
export const DATA_ASSET_FILES = ["songs.json", "songs-meta.json"];
