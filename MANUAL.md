# 寝間着システム 操作マニュアル

この文書は詳細手順用です。概要、実行条件、最短手順は [README.md](/home/onoue/src/nemagi/README.md) を参照してください。

## 概要

寝間着システム (nemagi) は、同一のプロンプトを **Codex / Claude / Gemini** の 3 つの LLM CLI に同時投入し、各出力を TUI 上に表示しながら収集・保存するツールです。

```
あなたの端末
   │
   ▼
nemagi (Node.js プロセス)
   │
   ├─ blessed TUI
   │    ├─ [Prompt]
   │    ├─ [Codex]
   │    ├─ [Claude]
   │    ├─ [Gemini]
   │    └─ [Judge]
   │
   └─ sessions/ ディレクトリ (ターンごとにログを保存)
```

---

## 必須環境

| ツール | 確認コマンド | 備考 |
|--------|-------------|------|
| Node.js 18 以上 | `node --version` | |
| npm | `npm --version` | |
| codex CLI | `codex --version` | 認証済みであること |
| claude CLI | `claude --version` | 認証済みであること |
| gemini CLI | `gemini --version` | 認証済みであること |
| Ollama | `ollama list` | Judge 用モデルが取得済みであること |
| TypeScript コンパイラ | 依存に含まれるため不要 | |

---

## セットアップ

### 1. 依存パッケージをインストールする

```bash
cd /path/to/nemagi
npm install
```

### 2. ビルドする

```bash
npm run build
```

`dist/` ディレクトリが生成されたら成功です。

### 3. `nemagi` コマンドを登録する

```bash
npm link
```

これでローカル環境の PATH に `nemagi` コマンドが登録されます。

`npm link` が `/usr/lib/node_modules` などの権限で失敗する場合は、PATH 上のユーザー bin に直接 symlink します。

```bash
ln -sfn "$(pwd)/dist/cli.js" ~/.local/bin/nemagi
```

```bash
nemagi --help
```

### 4. CLI パスを確認する

現時点の実装は `src/config/defaults.ts` の `cliPath` をそのまま使います。
このリポジトリでは現在、各 CLI に絶対パスが入っています。自分の環境でパスが異なる場合は編集して再ビルドしてください。

```typescript
// src/config/defaults.ts の抜粋
agents: {
  codex:  { cliPath: "/usr/bin/codex", ... },
  claude: { cliPath: "/home/onoue/.local/bin/claude", ... },
  gemini: { cliPath: "/usr/bin/gemini", ... },
}
```

PATH 上のコマンド名を使いたい場合は、次のように書き換えても構いません。

```typescript
agents: {
  codex:  { cliPath: "codex", ... },
  claude: { cliPath: "claude", ... },
  gemini: { cliPath: "gemini", ... },
}
```

---

## 使い方

### 基本的な使い方 - TUI を起動する

```bash
nemagi
```

起動後に TUI 内の prompt ダイアログで質問を入力します。

### 引数つきでそのまま実行する

```bash
nemagi "質問や依頼をここに書く"
```

**例:**

```bash
nemagi "FizzBuzz を Python で書いてください"
```

開発中は従来どおり `npm start -- "質問や依頼をここに書く"` でも起動できます。

実行すると以下が起こります。

1. TUI が起動する
2. 3 つのエージェントが同じプロンプトを受け取る
3. 各エージェントの出力がリアルタイムで各ペインに流れる
4. ペインタイトルに `▶` と状態 (`[thinking...]`, `[finish]`, `[failed]`) が出る
5. Judge 結果が表示される
6. ログが `sessions/` 以下に保存される

### TUI の見た目

```
┌──────────────────────────────────────────────┐
│ Prompt                                       │
├──────────────────────┬───────────────────────┤
│ Codex                │ Claude                │
├──────────────────────┼───────────────────────┤
│ Gemini               │ Judge                 │
└──────────────────────┴───────────────────────┘
```

### TUI の操作

- `h` / `l` または `←` / `→`: ペイン移動
- `tab` / `Shift+tab`: 次 / 前のペインへ移動
- `1` / `2` / `3` / `4`: `Codex / Claude / Gemini / Judge` に直接移動
- `j` / `k` または上下キー: スクロール
- `Ctrl-u` / `Ctrl-d`: 半ページスクロール
- `g` / `G`: 先頭 / 末尾へ移動
- `z`: 現在ペインを拡大 / 戻す
- `?`: ヘルプ表示
- `q`: 終了

---

## ログの確認

各ターンのログは `sessions/` ディレクトリに保存されます。

```
sessions/
└── nemagi-20260415120000-ab3xyz/       ← セッションごと
    ├── session.json                     ← セッション情報
    ├── latest-judge.txt                 ← 直近の評価結果 (人間用)
    └── turns/
        └── turn-1713180000000-cd4pqr/  ← ターンごと
            ├── turn.json               ← ターン情報
            ├── judge.json              ← 評価・採点結果
            ├── codex.txt               ← Codex の出力 (人間用)
            ├── codex.jsonl             ← Codex のチャンク列 (タイムスタンプ付き)
            ├── claude.txt
            ├── claude.jsonl
            ├── gemini.txt
            └── gemini.jsonl
```

### 各ファイルの内容

**`turn.json`**

```json
{
  "id": "turn-...",
  "prompt": "入力したプロンプト",
  "startedAt": "...",
  "completedAt": "...",
  "status": "completed"   // completed | timed_out | failed
}
```

**`judge.json`**

```json
{
  "summary": "回答全体の要約",
  "comparison": "各回答の比較",
  "consensusAnswer": "多数派として採れる結論",
  "supportingAgents": ["codex", "claude"],
  "dissentingAgents": ["gemini"],
  "consensusStrength": "mixed",
  "majorityApplicable": true,
  "needsHumanReview": false,
  "judgeReason": "多数派の根拠と少数派の扱い",
  "recommendedAgent": "claude",
  "scores": { "codex": 4, "claude": 5, "gemini": 3 },
  "provider": "ollama"
}
```

> **注意:** Judge はローカル LLM による比較整理です。明確な事実問題では多数派判定が有効ですが、意見や設計論では `majorityApplicable: false` になることがあります。

**`*.jsonl`** — チャンク単位の生ログ

```jsonl
{"seq":0,"ts":"2026-04-15T12:00:10.000Z","chunk":"def fizzbuzz..."}
{"seq":1,"ts":"2026-04-15T12:00:12.500Z","chunk":"    for i in..."}
```

---

## タイムアウトの挙動

各エージェントには最大待機時間が設定されています (デフォルト値):

| エージェント | 最大待機時間 |
|------------|------------|
| codex       | 180 秒     |
| claude      | 120 秒     |
| gemini      | 120 秒     |
| ターン全体   | 180 秒     |

タイムアウトしたエージェントのステータスは `"timed_out"` となり、その時点までの部分出力が保存されます。残りのエージェントが完了していれば、それらを対象に Judge が実行されます。

---

## トラブルシューティング

### `codex` / `claude` / `gemini` コマンドが見つからない

```bash
which codex
which claude
which gemini
```

見つからない場合は各 CLI をインストールするか、`src/config/defaults.ts` の `cliPath` に絶対パスを指定して再ビルドしてください。

### エージェントが認証エラーで失敗する

各 CLI の認証状態を個別に確認してください。nemagi の TUI には各 CLI の出力がそのまま表示されるため、エラーメッセージも見えます。

```bash
# 認証確認の例
claude --version
codex --version
gemini --version
```

### ビルド前に実行してしまった場合

```
Error: Cannot find module '...'
```

というエラーが出た場合は `npm run build` を先に実行してください。

---

## 設定の変更

現時点では `src/config/defaults.ts` を直接編集してから `npm run build` で再ビルドする必要があります。

主な設定項目:

```typescript
runtime: {
  maxTurnWaitMs: 180000,     // ターン全体の最大待機時間 (ms)
  workspaceDir: process.cwd(), // ログ保存先ルート
},
agents: {
  codex: {
    mode: "process_exit",    // 完了判定モード
    maxWaitMs: 180000,       // このエージェントの最大待機時間 (ms)
    cliPath: "codex",        // CLI コマンドのパス
  },
  // claude / gemini も同様
},
judge: {
  enabled: true,                    // ローカル Judge を使う
  baseUrl: "http://127.0.0.1:11434", // Ollama API
  model: "gemma3:latest",           // Judge 用モデル
  timeoutMs: 30000,                 // Judge の最大待機時間 (ms)
}
```

---

## 既知の制限事項

- **Judge は補助的な比較器です。** 多数派を可視化しますが、最終的な正解判定器ではありません。
- **連続ターン実行の API はありません。** 現時点では 1 回の起動が 1 ターンに対応します。連続対話は将来の機能です。
