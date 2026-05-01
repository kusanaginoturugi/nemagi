# nemagi

`nemagi` は、同じプロンプトを `codex` / `claude` / `gemini` の 3 つの CLI に同時投入し、TUI 上で並べて表示しながら出力を収集するローカル実行ツールです。

現時点では 1 ターン実行、スクロール可能な TUI 表示、ログ保存まで実装済みです。Judge はローカル LLM (`Ollama`) を使って、要約・比較・多数派の可視化を行います。Judge が失敗した場合は heuristic fallback に切り替わります。

## 何ができるか

- 1 つのプロンプトを 3 つの LLM CLI に並列投入する
- TUI 上で `Prompt / Codex / Claude / Gemini / Judge` を同時に表示する
- 各ペインをスクロールして内容を確認できる
- フォーカス中のペインはタイトル先頭の `▶` と状態表示 (`[thinking...]`, `[finish]` など) で判別できる
- `sessions/` 配下にターンごとの `json / jsonl / txt` ログを保存する

## 実行条件

実行前に次を満たしている必要があります。

- Node.js と npm が使えること
- `codex`, `claude`, `gemini` の各 CLI がインストール済みかつ認証済みであること
- `Ollama` が起動していて、Judge 用モデルが取得済みであること
- `src/config/defaults.ts` の `cliPath` が自分の環境に合っていること

確認例:

```bash
node --version
npm --version
codex --version
claude --version
gemini --version
ollama list
```

## Quick Start

```bash
npm install
npm run build
npm link
nemagi
nemagi "FizzBuzz を Python で書いてください"
```

`npm link` 後は、どのディレクトリからでも `nemagi` コマンドで TUI を起動できます。引数がなければ UI 内で質問を入力できます。引数を付けた場合は、そのまま実行が始まります。

`npm link` が global prefix の権限で失敗する環境では、PATH 上のユーザー bin に直接 symlink して使えます。

```bash
ln -sfn "$(pwd)/dist/cli.js" ~/.local/bin/nemagi
```

開発中は従来どおり `npm start -- "FizzBuzz を Python で書いてください"` でも起動できます。

TUI の基本操作:

- `h` / `l` または `←` / `→`: ペイン移動
- `tab` / `Shift+tab`: 次 / 前のペインへ移動
- `1` `2` `3` `4`: `Codex / Claude / Gemini / Judge` に直接フォーカス
- `j` `k` または 矢印キー: スクロール
- `Ctrl-u` / `Ctrl-d`: 半ページスクロール
- `g` / `G`: 先頭 / 末尾へ移動
- `z`: 現在ペインを拡大 / 戻す
- `?`: ヘルプ表示
- `q`: 終了

## 設定

現時点では外部設定ファイルはなく、[src/config/defaults.ts](/home/onoue/src/nemagi/src/config/defaults.ts) を編集して再ビルドします。

主に触る項目:

- `agents.*.cliPath`: 各 CLI の実行パス
- `runtime.maxTurnWaitMs`: ターン全体の最大待機時間
- `agents.*.maxWaitMs`: エージェント別の最大待機時間
- `judge.baseUrl`: Ollama API の URL
- `judge.model`: Judge に使うローカルモデル
- `judge.enabled`: ローカル Judge を使うかどうか

絶対パスではなくコマンド名で運用したい場合は、`cliPath` を `"codex"` のように変更できます。

## ログ

実行結果は `sessions/` に保存されます。

- `session.json`: セッション情報
- `turn.json`: ターン情報
- `judge.json`: Judge 結果
- `*.jsonl`: チャンク単位ログ
- `*.txt`: 人間向けの整形済み全文

詳細なログ構造は [MANUAL.md](/home/onoue/src/nemagi/MANUAL.md) を参照してください。

## 現時点の制限

- Judge はローカル LLM の品質に依存するので、厳密な正誤判定ではなく「比較整理」として扱うべき
- TUI は 1 ターン表示向けで、連続対話フローはまだない
- 設定変更はコード編集前提

## ドキュメント

- 利用手順の詳細: [MANUAL.md](/home/onoue/src/nemagi/MANUAL.md)
- 設計の背景: [system-design.md](/home/onoue/src/nemagi/system-design.md)
