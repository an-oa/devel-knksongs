import "./startup-data.mjs";

// データ取得の完了は待たずに UI を読み込む。取得結果は startup-data module で共有する。
void import("./bootstrap.mjs").catch((error: unknown) => {
    console.error("アプリの読み込みに失敗しました", error);
});
