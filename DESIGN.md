# 鐘輝かう 歌サーチ 設計書（概要）

## 目的
公開スプレッドシートの歌データを検索・絞り込みし、YouTube動画へアクセスしやすくする。

## 対象ユーザー
- 配信/歌みた/ショート/切り抜きを探したい視聴者
- PC/スマホの両方から利用するユーザー

## 全体構成
- 静的フロントエンドのみ（HTML/CSS/JS, ES Modules）
- データ取得：公開スプレッドシートのCSV
- 実行時の同梱外部ライブラリ依存：なし
- 埋め込み再生まわりでは YouTube Iframe API を動的に利用
- 開発時テスト：Node.js 標準 `node:test` と Playwright Chromium smoke を利用

## テスト方針（現状）
- 対象: 検索ロジック、日付フィルタ、ブックマーク検索、描画/再生/保存/サイドバーまわりの回帰
- 重点ケース: ブックマーク表示時のみ有効なドラッグ並び替えと、並び順の永続化、YouTube 継続再生の失敗復旧
- テストファイル:
  - `tests/bookmark-storage-schema.test.mjs`
  - `tests/bookmark-ui.test.mjs`
  - `tests/csv-parser.test.mjs`
  - `tests/data-loader.test.mjs`
  - `tests/dom-utils.test.mjs`
  - `tests/search-date.test.mjs`
  - `tests/format-filter.test.mjs`
  - `tests/playback-sequence.test.mjs`
  - `tests/playback-session-controller.test.mjs`
  - `tests/render-drag-reorder.test.mjs`
  - `tests/render-layout.test.mjs`
  - `tests/render-masonry-layout.test.mjs`
  - `tests/sidebar-ui.test.mjs`
  - `tests/storage-bookmark-limit.test.mjs`
  - `tests/ui-storage-compat.test.mjs`
  - `tests/ui-sync.test.mjs`
  - `tests/youtube-controller.test.mjs`
  - `tests/youtube-embed.test.mjs`
  - `tests/youtube-playback-start-attempt.test.mjs`
  - `tests/youtube-playback-state.test.mjs`
  - `tests/youtube-player-adapter.test.mjs`
  - `tests/youtube-shared-playback.test.mjs`
  - `tests/youtube-thumbnail.test.mjs`
  - `tests/youtube-unconfirmed-playback-start.test.mjs`
  - `tests/layout-anchor.test.mjs`
  - `tests/results-scroll.test.mjs`
  - `tests/e2e/youtube-smoke.spec.mjs`
- 実行コマンド:
  - `node --test tests/*.mjs`
  - `npm run test:e2e`

## 主要機能
- 検索（曲名/アーティスト名/読み、複数キーワード）
- 絞り込み（形態/リレー/ハモリ/日付範囲）
- ブックマーク（作成/名称変更/削除/曲の追加・削除/選択/表示中の曲順並び替え）
- おすすめ表示（条件未指定時）
- 段階表示（追加読み込み）
- サムネイル表示と埋め込み再生
- 実験的な再生設定（曲の終わりで停止する / 終了後、次の曲を再生 / リピート再生）
- テーマ切替（ダーク/ライト）

## UI構成
- **サイドバー**：検索・絞り込み・設定
  - 検索入力
  - 日付選択（年/月/日セレクト、From/To）
  - 形態フィルタ（配信/オリ曲/歌みた/ショート/切り抜き。UI上はオリ曲/歌みたを1項目として扱う）
  - リレー/ハモリ
  - ブックマーク導線（専用パネルを開く）
  - 設定導線（専用パネルを開く）
- **サイドバー内設定パネル**：表示設定と実験的な再生設定
  - 表示
    - サムネイル表示
    - ダークモード切替
    - 実験的な機能を表示
  - 再生（サムネイル表示ONかつ実験的な機能を表示した場合のみ表示・有効化）
    - 曲の終わりで停止する
    - 終了後、次の曲を再生
    - リピート再生
- **サイドバー内ブックマークパネル**：ブックマーク一覧と曲追加
  - 一覧の選択/名称変更/削除
  - 曲カードの `+` 押下時は同パネル上で既存ブックマーク選択または新規作成して追加
- **メイン**：検索結果一覧（カード）
  - 曲名/アーティスト
  - 日付
  - タグ（形態/リレー/ハモリ）
  - ブックマーク操作（追加/選択中ブックマークから削除）
  - ブックマーク表示中のみドラッグハンドルを表示し、ハンドル操作でカード順を並び替え
  - YouTubeリンク

## データフロー
1. CSVを取得（`PUBLIC_CSV_URL`）
2. CSVをパースし、`SongRow` に正規化
3. （ブックマーク選択中なら）ブックマーク内の曲集合を解決
4. 条件未指定ならおすすめ結果を解決し、通常時は検索条件を取得してフィルタ
5. 結果一覧を描画し、通常検索/ブックマーク検索時のみ段階表示を有効化

```mermaid
flowchart TD
    A[公開CSVを取得] --> B[CSVをパース]
    B --> C[SongRowへ正規化]
    C --> D{ブックマーク選択中?}
    D -- Yes --> E[ブックマーク内の曲集合を解決]
    D -- No --> F[全曲を対象にする]
    E --> G{条件未指定?}
    F --> G
    G -- Yes --> H[おすすめ結果を解決]
    G -- No --> I[検索条件でフィルタ]
    H --> J[結果一覧を描画]
    I --> J
    J --> K[段階表示を有効化]
```

## データモデル（概要）
`SongRow`
- date / dateKey / archiveId / archiveOrder / sourceIndex
- videoId / songKey / bookmarkSongKey / legacySongKey / format / videoOrientation / isRelay / isHarmony
- title / artist / titleYomi / artistYomi
- endSeconds
- titleNorm / artistNorm / titleYomiNorm / artistYomiNorm
- url

### 曲参照キーの役割分担
- `songKey`: `archiveId::archiveOrder` を使う内部参照キー。カード再利用、描画更新、既存の画面内処理で利用する。
- `bookmarkSongKey`: `videoId::archiveOrder` を優先するブックマーク保存用キー。`videoId` を抽出できない場合は `songKey` へフォールバックする。
- ブックマーク検索では `bookmarkSongKey` を優先して曲行へ解決し、旧ブックマークの `songKey` / `legacySongKey` / 数値 index も移行対象として読み取る。

## 検索・絞り込みロジック
- 検索語：正規化＋AND検索（スペース区切り）
- 形態：選択セットに含むか。`オリ曲` はUI上 `歌みた` と同じ項目で扱う
- リレー/ハモリ：チェック時のみ条件を追加
- 日付：From/To の範囲一致（部分入力は範囲に補正）

## おすすめ表示の方針
- 条件未指定時におすすめ表示
- おすすめは CSV を再読み込みするまで固定し、条件変更でおすすめ表示を離脱して戻っても同じ並びを再利用する

## おすすめの状態遷移

### 状態
- **Recommended**: おすすめ表示中（条件未指定）
- **Filtered**: フィルタ/検索によりおすすめ条件から外れた状態

### 条件判定（「未指定」の定義）
- キーワードが空（検索ボックスが空）
- 日付が未指定（From/To ともに年・月・日が未選択）
- 形態フィルタ4項目がすべてON（配信 / オリ曲/歌みた / ショート / 切り抜き）
- リレー/ハモリがOFF
- ブックマークが未選択

### 遷移ルール
- **Recommended → Filtered**
  - キーワード入力
  - 日付の指定（年/月/日いずれか）
  - 形態のチェックを外す
  - リレー/ハモリをON
- **Filtered → Recommended**
  - 上記の条件をすべて解除して「未指定」に戻したとき

### 並びの扱い
- **Recommended 状態は同条件なら固定**
- **条件を変えて元に戻しても並びは維持**
- **CSV再読み込み時のみおすすめが再抽出される**

### 表示の扱い
- Recommended では「おすすめを表示中」の状態テキストを表示
- Filtered では「n件がヒット」の状態テキストを表示
- ブックマーク選択中は「ブックマーク名 + 件数」を状態テキストに表示
- どちらの状態でも検索条件の変更は即時に反映される

```mermaid
stateDiagram-v2
    [*] --> Recommended: 初期表示
    Recommended --> Filtered: 条件変更
    Filtered --> Recommended: 条件解除
    Recommended --> Recommended: 未指定で再表示
```

- 図中の「条件変更」は、キーワード入力・日付指定・形態の絞り込み・リレー/ハモリONをまとめた表記。
- 図中の「条件解除」は、上記の条件をすべて外して未指定に戻すことを指す。
- CSV再読み込み時はおすすめキャッシュを破棄し、おすすめ一覧を再抽出する。

## おすすめ抽出の具体ロジック

### 対象母集団
- CSVから読み込んだ全曲データ（`data.allSongsRaw`）
- ブックマーク未選択かつ、形態/リレー/ハモリ/日付/キーワードの条件がすべて未指定のときのみ「おすすめモード」

### 除外条件
- 形態/リレー/ハモリ/日付/キーワードのいずれかが未指定条件から外れた場合は、おすすめモード自体を解除
- おすすめ候補の集計対象は `配信` / `歌みた`（`オリ曲` を含む） / `ショート` のみとし、`切り抜き` は集計対象外
- 通常は同一曲が一定回数以上歌われている場合のみ、おすすめ候補に含める
- ただし `オリ曲` を含む曲は1回でもおすすめ候補に含める
- 同一曲・同一アーカイブの重複候補は、`archiveOrder` と `sourceIndex` を用いて代表行へ集約する

### シャッフルタイミング
- CSVを再読み込みしたタイミングでおすすめを再抽出・再シャッフル
- 条件を変更しておすすめから離脱→条件を元に戻す場合は、同じおすすめ並びを維持

### キャッシュの扱い
- おすすめ一覧は `ui.search.recommendedCache` に保持
- 条件変更ではキャッシュを破棄しない
- CSV再読み込み時のみキャッシュを破棄

## 関連関数の責務一覧（おすすめ）
- `pickRecommended()`：おすすめ候補の抽出とシャッフル、キャッシュ利用の中心
- `scheduleSearch()`：検索/絞り込みの実行をデバウンスして呼び出す
- `search()`：条件取得→フィルタ→表示までの入口
- `updateDisplay()`：結果のカード表示と「おすすめ/ヒット件数」表示の切替
- `applyLoadedCsv()`：CSV読込後の初期化（おすすめキャッシュのリセット含む）
## 状態管理
`state`
- `data`：全曲/結果/表示件数/ブックマーク情報/選択中ブックマーク
- `ui`：検索/日付/再生/描画/設定パネル/ブックマークパネルなどの画面状態
- `youtube`：API準備/プレイヤー管理

```mermaid
flowchart LR
    state[state]
    state --> data[data]
    state --> ui[ui]
    state --> youtube[youtube]
    data --> d1[全曲]
    data --> d2[結果]
    data --> d3[表示件数]
    data --> d4[ブックマーク情報]
    ui --> u1[search: フィルタ状態とrecommendedCache]
    ui --> u2[playback: サムネ表示と再生設定]
    ui --> u3[render: カード再利用Map]
    ui --> u4[settings/bookmark panel: 一時状態]
    youtube --> y1[API準備]
    youtube --> y2[プレイヤー管理]
```

## 永続化
ローカルストレージ保存：
- テーマ
- サムネ表示
- 実験的な機能の表示状態
- 再生設定（曲の終わりで停止する / 終了後、次の曲を再生 / リピート再生）
  - サムネイル表示OFFまたは実験的な機能が非表示の間は、保存値を保持しつつ実効値はOFFとして扱う
- CSVキャッシュ
- 検索条件（キーワード・日付・形態など）
- ブックマーク情報（ブックマーク名・曲参照/順序・作成日時）
- ブックマーク保存 payload は `version` を持ち、旧参照形式は CSV 読み込み後に現行の `bookmarkSongKey` へ保存し直す

## YouTube埋め込み
- `youtube.com` の標準埋め込みを使用
- サムネイル表示ON時にクリックで埋め込み再生し、`×` でサムネイルへ戻す
- `曲の終わりで停止する` がONの場合は CSV の `endSeconds` を埋め込み条件へ反映する
- 手動再生でカード上端がヘッダー下に隠れる場合は、再生開始後に見える位置まで補正スクロールする
- 曲名リンクは元の `row.url` を別タブで開く
- 縦動画はサムネイル時は横レイアウトのまま表示し、埋め込み再生時のみ縦向き表示へ切り替える
- `終了後、次の曲を再生` がONの場合は `data.currentResults` の順序で次曲候補を決める
- `リピート再生` は `終了後、次の曲を再生` OFF では現在の曲、ON では結果全体を繰り返す
- 再生終了後の継続再生フローは `playback-session.mjs` が担当し、候補選定・再生開始・追従スクロールをまとめて扱う

## アクセシビリティ
- サイドバーを `dialog` として扱う
- フォーカストラップとフォーカス復帰
- `aria-label` / `aria-modal` / `aria-hidden`

## パフォーマンス
- CSVのキャッシュ
- 段階表示（追加読み込み）
  - 通常検索・ブックマーク検索ともに `INCREMENT_COUNT` 単位で追加表示
- サムネ遅延読み込み（IntersectionObserver）

## 制約・注意点
- iOSでは埋め込み再生に制約あり
- Safari等でCSSキャッシュが残ることがあるため更新時はバスター推奨
- `index.html` の `styles.css?v=...` と `app/script.js?v=...` は同じ値で運用する
  - UI/JS変更ごとには上げず、公開反映や配布反映の直前にまとめて値を上げる
- `app/script.js` から読む ES Modules を更新した場合は、対応する import の `?v=...` も上げる
  - 変更途中は既存値へ揃え、公開時に全体を同じ値へ切り替える
- 日付入力はセレクト方式（ブラウザ互換性優先）
