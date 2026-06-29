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
- 特に `app/bootstrap.mjs` `app/ui/bookmark/ui.mjs` `app/controllers/search.mjs`
  `app/controllers/storage.mjs` `app/controllers/render.mjs`
  `app/controllers/youtube.mjs` では、この形式が主流になっている。
- 短い委譲関数や一部テスト補助関数では省略されている箇所もあるが、新しく JavaScript の関数を追加するときは、関数の先頭に JSDoc を付けて機能を説明する。
- 必要に応じて `@param` `@returns` を付け、既存コードの粒度に合わせて簡潔に書く。
- JSDoc の `@param {*} ` は既存コードでは残っているが、新規関数や触った関数では可能な範囲で具体的な型へ寄せる。
  例: `Element | null | undefined`、`string`、`number`、`Record<string, *>`。
- DOM 要素を受け取る関数では、呼び出し元だけに依存せず、
  必要に応じて `isHtmlElement` などの実行時チェックで境界を守る。
- module 内 helper を単体テストで直接検証するために export する場合は、`__test__` へ分けず通常の named export のままにしてよい。
  その場合は JSDoc に、本番コードでは同じ module 内または上位 API 経由で使う helper であり、
  境界条件を単体テストするために export していることを簡潔に残す。

## JavaScript Type References

- アプリ内の特定 module が所有する状態やデータ構造の型は、可能な限りその実装 module の近くに
  JSDoc `@typedef` として置き、利用側では `import("./path/to/module.mjs").TypeName` 形式で参照元を明示する。
- `types/**/*.d.ts` の ambient 宣言は、ブラウザ API の拡張や複数 module にまたがる共有ドメイン型など、
  所有 module を自然に決めにくい型に限定する。
- 実装に所有者がある型を ambient に追加しない。やむを得ず追加する場合は、どの実装領域の型なのか、
  なぜ ambient に置く必要があるのかをコメントや近接する型名で分かるようにする。
- 型参照の記述量を減らすことより、依存方向が読めることを優先する。
  循環参照や所有境界の曖昧さに気づけるよう、型だけの参照でも参照元を隠さない。
- `AppState` や UI slice など実装の初期化・更新処理と強く結びつく型は、
  `types/*.d.ts` へ遠ざける前に、実装 module 側へ寄せられないか検討する。

## TypeScript Emit During Migration

- `.mts` は移行中の TypeScript source として扱い、ブラウザ・テスト・既存 import は隣接生成された `.mjs` を読む。
- `.mts` と同名の `.mjs` がある場合、手編集は `.mts` 側へ行い、`.mjs` は `npm run build:ts` で更新する。
- 生成 `.mjs` の先頭には `npm run build:ts` が手編集禁止ヘッダーを付ける。
  ヘッダー付き `.mjs` をレビューするときは、実装意図の確認元を同名 `.mts` に置く。
- `.mts` または生成 `.mjs` を変更したときは、`npm run check:ts-emit` で生成物の同期漏れがないことを確認する。
- `tsconfig.build.json` は `app/**/*.mts` だけを emit 対象にし、`allowJs: false` のまま保つ。
  既存 `.mjs` を TypeScript emit 対象へ巻き込むと、入力ファイル上書き防止で失敗しやすい。
- `npm run build` は `build:ts` 後の静的 site を `_build` へ作り、`.ts` / `.mts` source を含めない。
- Pages artifact は `_build` を入力元にして `_site` を作り、cache buster を付与する。

## Naming

- boolean は true の意味がそのまま読める肯定形で命名し、否定形フラグによる二重否定を避ける。
- boolean state は、片方が常にもう片方の反転で導出できる場合は二重に保持せず、現在の UI/ドメイン上の肯定形だけを source of truth とする。

## Verification

- 初回または `node_modules` がない環境では、README.md の開発者向け準備に従い
  `npm install` を実行してから検証する。
- JavaScript や型定義を変更したときは、静的解析として `npm run typecheck` と
  `npm run lint` を基本の確認手順として実行する。
- `.mts` または生成 `.mjs` を変更したときは、`npm run check:ts-emit` も実行する。
- TypeScript build や Pages artifact の入力経路に関わる変更では、`npm run build` も実行する。
- `tests/` 配下に Node のテストがあるため、JavaScript を変更したときは
  `npm run test:unit` も基本の確認手順として実行する。
- 曲データや生成/検証スクリプトに関わる変更では、`npm run validate:songs-json` も実行する。
- YouTube 再生やサイドバー操作などブラウザ上の回帰に関わる変更では、
  `npm run test:e2e` も実行する。
- 構文だけを素早く確認したいときは `node --check <file>` を使い、その結果だけでテスト完了とは扱わない。
- コミット前後に確認結果を共有するときは、実行コマンドと lint/test の pass/fail 件数を簡潔に残す。
- ファイル移動や import の一括更新を含む変更では、移動直後に `node --check` を対象ファイルへ段階的に実行し、
  最後に `npm run typecheck`、`npm run lint`、`npm run test:unit` を回してから完了扱いにする。

## Branch Diff Review

- `stable..branch` のようなブランチ差分調査では、単なる機能要約だけでなく、
  必要に応じて PR review 形式でリスク中心に整理する。
- その場合は findings を先に並べ、重大度順に file/line references を付ける。
- 要約は findings の後に短く添え、挙動差分・回帰リスク・未テスト箇所を優先して扱う。
- ユーザーが明示的に機能要約のみを求めた場合は、この形式を強制しない。

## Complexity Reassessment

- 実装中に pending state、timeout、cancel、stale event guard などが増え始めたら、
  保守性コストが高い兆候として扱い、一度方針比較に戻る。
- 既存の仕組みを温存するための補正が複雑になる場合は、
  再生成・再初期化・破棄作り直しなど、構造的に単純な案も再評価する。
- iframe や外部 API の状態イベントに依存する実装では、
  表示制御で整合性を取る案が状態機械化しやすい。
  手動操作、自動処理、同一対象、別対象への切替を含めて、
  事前に分岐数とテスト量を見積もる。

## Refactor Safety

- ディレクトリ再編や import パス変更のような広範囲リファクタリングでは、
  「ファイル移動」と「参照更新」を別ステップで進め、各段階で確認する。
- PowerShell の広域な文字列置換や正規表現置換で `.js` `.mjs` `.html` を一括変更しない。
  記号や識別子が壊れることがあるため、必要ならファイル単位で小さく適用する。
- 大規模変更時は `git diff` や `rg` で import / `src=` / `href=` の残存参照を確認し、
  切り替え漏れを残さない。

## Persisted State Migration

- localStorage / IndexedDB などに保存する状態の schema や default の意味を変える場合は、
  既存 payload を暗黙の定数名だけで判定せず、必要に応じて明示的な version を持たせる。
- migration 条件は、意図した旧 version に限定する。
  将来の version まで巻き込む理由がない場合は `< CURRENT_VERSION` のような広い条件にしない。
- 旧 version 専用の helper を残す場合は、JSDoc やコメントで migration 用であることと、
  互換を打ち切るタイミングで削除可能であることを明記する。
- 「旧 default の全選択」と「新 schema でユーザーが明示的に選択した状態」は区別し、
  migration では保存済みユーザー意図を壊さない。

## Encoding And Line Endings

- 2026-04-25 時点で確認した `.js` `.mjs` `.html` `.css` `.md` は、すべて `UTF-8 BOMなし` かつ `LF`。
- 2026-04-29 時点で確認した `.github/workflows/*.yml` は、`UTF-8 BOMなし` かつ `LF`。
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
| `.github/workflows/*.yml` | UTF-8 BOMなし | LF |
| `playwright.config.mjs` | UTF-8 BOMなし | LF |
