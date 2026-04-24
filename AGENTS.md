# AGENTS

## Commit Log Style

- 1行目は英語の件名で、`type: summary` 形式にする。
  - `type` には Conventional Commits の種別を使う。
  - `type` は現状 `feat` `fix` `refactor` `docs` `chore` `test` が使われている。
- 2行目は空行にする。
- 3行目以降は日本語の箇条書きにする。
- 箇条書きは `- ` で始め、必要なら次行を2スペースでインデントして折り返す。
- 折り返しは語句を細かく分断せず、日本語として自然な意味のまとまりで行う。
- 1行目に説明の主文をある程度まとめ、2行目以降は補足や後半句を続ける形を優先する。
- 助詞の直後や短すぎる語句単位では改行しない。
- 本文は 2-3 項目程度で、変更内容を機能単位で簡潔に書く。
- PowerShell 経由で `git commit -m` を実行するときは、
  本文中に Markdown 用のバッククォート `` ` `` を入れない。
  制御文字として解釈され、ファイル名やコマンドが壊れることがある。
- PowerShell 経由で `git commit -m` を実行するときは、
  コミット本文の改行に `\n` という文字列を書かない。
- 本文の改行は、`-m` に渡す文字列の中で
  実際の改行文字をそのまま入れる。
- `\n` を文字として書くと、
  そのままコミット本文へ記録されることがある。
- コミット本文でファイル名やコマンドを書く必要がある場合は、
  バッククォートなしの素の文字列で書く。

### Commit Log Example

```text
feat: move settings into dedicated sidebar panel

- サイドメニューの表示設定を独立した設定パネルへ移し、
  ブックマークと同じ導線に揃えた。
- 設定パネルの開閉と Esc とフォーカス復帰を追加し、
  背面サイドバーを inert で制御するようにした。
- サイドメニュー内の表記を設定へ統一し、
  ブックマークの下に表示される順序へ調整した。
```

## JavaScript Function Docs

- 実装側の `.js` / `.mjs` では、関数の直前に `/** ... */` の JSDoc を置いて機能を説明する書き方が広く使われている。
- 特に `app/script.js` `app/ui/bookmark/ui.mjs` `app/controllers/search.mjs`
  `app/controllers/storage.mjs` `app/controllers/render.mjs`
  `app/controllers/youtube.mjs` では、この形式が主流になっている。
- 短い委譲関数や一部テスト補助関数では省略されている箇所もあるが、新しく JavaScript の関数を追加するときは、関数の先頭に JSDoc を付けて機能を説明する。
- 必要に応じて `@param` `@returns` を付け、既存コードの粒度に合わせて簡潔に書く。

## Verification

- `tests/` 配下に Node のテストがあるため、JavaScript を変更したときは `node --test tests/*.mjs` を基本の確認手順として実行する。
- YouTube 再生やサイドバー操作などブラウザ上の回帰に関わる変更では、
  `npm run test:e2e` も実行する。
- 構文だけを素早く確認したいときは `node --check <file>` を使い、その結果だけでテスト完了とは扱わない。
- コミット前後に確認結果を共有するときは、実行コマンドと pass/fail の件数を簡潔に残す。
- ファイル移動や import の一括更新を含む変更では、移動直後に `node --check` を対象ファイルへ段階的に実行し、
  最後に `node --test tests/*.mjs` を回してから完了扱いにする。

## Branch Diff Review

- `stable..branch` のようなブランチ差分調査では、単なる機能要約だけでなく、
  必要に応じて PR review 形式でリスク中心に整理する。
- その場合は findings を先に並べ、重大度順に file/line references を付ける。
- 要約は findings の後に短く添え、挙動差分・回帰リスク・未テスト箇所を優先して扱う。
- ユーザーが明示的に機能要約のみを求めた場合は、この形式を強制しない。

## Refactor Safety

- ディレクトリ再編や import パス変更のような広範囲リファクタリングでは、
  「ファイル移動」と「参照更新」を別ステップで進め、各段階で確認する。
- PowerShell の広域な文字列置換や正規表現置換で `.js` `.mjs` `.html` を一括変更しない。
  記号や識別子が壊れることがあるため、必要ならファイル単位で小さく適用する。
- 大規模変更時は `git diff` や `rg` で import / `src=` / `href=` の残存参照を確認し、
  切り替え漏れを残さない。

## Cache Busters

- キャッシュバスターの `v=...` は、UI / JavaScript に変更を加えるたびには更新しない。
- 公開反映や配布反映のためにブラウザキャッシュを切り替える必要があるタイミングで、`v=...` をまとめて更新する。
- 未公開の UI / JavaScript 変更が継続している間は、既存の `v=...` を維持する。
- 変更途中で `app/script.js` から読む ES Modules や、module 間の import / export に `?v=...` 付きの参照を追加・更新するときは、その時点の既存値へ揃え、新しい値にはしない。
- `index.html` の `styles.css?v=...` と `app/script.js?v=...` は必ず同じ値に揃える。
- `app/script.js` から読む ES Modules や、module 間の import / export に `?v=...` が付いている箇所も同じ値へ揃える。
- `v=...` を更新するときは、関連有無を自己判断せず、更新前の古い値を `rg -n "v=<old>|\\?v=<old>" -S .` で全検索して一斉に統一する。
- 更新後は `node --test tests/*.mjs` を実行し、pass/fail 件数を共有する。

## Encoding And Line Endings

- 2026-04-25 時点で確認した `.js` `.mjs` `.html` `.css` `.md` は、すべて `UTF-8 BOMなし` かつ `LF`。
- リポジトリ直下に `.gitattributes` と `.editorconfig` は現状存在しない。

| Path | Encoding | Line Ending |
| --- | --- | --- |
| `AGENTS.md` | UTF-8 BOMなし | LF |
| `DESIGN.md` | UTF-8 BOMなし | LF |
| `README.md` | UTF-8 BOMなし | LF |
| `WORKFLOW.md` | UTF-8 BOMなし | LF |
| `index.html` | UTF-8 BOMなし | LF |
| `styles.css` | UTF-8 BOMなし | LF |
| `app/**/*.js` / `app/**/*.mjs` | UTF-8 BOMなし | LF |
| `tests/**/*.mjs` | UTF-8 BOMなし | LF |
| `playwright.config.mjs` | UTF-8 BOMなし | LF |
