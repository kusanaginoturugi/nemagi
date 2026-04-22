# 寝間着システム 操作マニュアル

## 概要

寝間着システム (nemagi) は、同一のプロンプトを **Codex / Claude / Gemini** の 3 つの LLM CLI に同時投入し、各出力を tmux ペインに表示しながら収集・保存するツールです。

```
あなたの端末
   │
   ▼
nemagi (Node.js プロセス)
   │
   ├─ tmux session (可視化)
   │    ├─ [status] ペイン
   │    ├─ [judge]  ペイン
   │    ├─ [Codex]  ペイン  ← codex CLI が動く
   │    ├─ [Claude] ペイン  ← claude CLI が動く
   │    └─ [Gemini] ペイン  ← gemini CLI が動く
   │
   └─ sessions/ ディレクトリ (ターンごとにログを保存)
```

---

## 必須環境

| ツール | 確認コマンド | 備考 |
|--------|-------------|------|
| Node.js 18 以上 | `node --version` | |
| npm | `npm --version` | |
| tmux | `tmux -V` | |
| codex CLI | `codex --version` | 認証済みであること |
| claude CLI | `claude --version` | 認証済みであること |
| gemini CLI | `gemini --version` | 認証済みであること |
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

### 3. CLI パスを確認する

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

### 基本的な使い方 — 1 回のターンを実行する

```bash
npm start -- "質問や依頼をここに書く"
```

**例:**

```bash
npm start -- "FizzBuzz を Python で書いてください"
```

実行すると以下が起こります。

1. tmux セッションが自動で作成される
2. 3 つのエージェントペインが起動し、それぞれの CLI が同じプロンプトを受け取る
3. 各エージェントの応答完了（またはタイムアウト）を待つ
4. 結果が標準出力に JSON で出力される
5. ログが `sessions/` 以下に保存される

**出力例:**

```json
{
  "session": "nemagi-20260415120000-ab3xyz",
  "turn": {
    "id": "turn-1713180000000-cd4pqr",
    "prompt": "FizzBuzz を Python で書いてください",
    "startedAt": "2026-04-15T12:00:00.000Z",
    "completedAt": "2026-04-15T12:00:45.123Z",
    "status": "completed"
  },
  "responses": {
    "codex":  { "status": "completed", "chars": 512, "exitCode": 0 },
    "claude": { "status": "completed", "chars": 480, "exitCode": 0 },
    "gemini": { "status": "completed", "chars": 390, "exitCode": 0 }
  }
}
```

---

### tmux セッションの中身を見る

nemagi は実行中に tmux セッションを作成します。別の端末から確認できます。

```bash
# セッション一覧を表示
tmux ls

# セッションにアタッチ（セッション名は nemagi-... の形式）
tmux attach -t nemagi-20260415120000-ab3xyz
```

アタッチすると 5 つのペインが tiled レイアウトで並んでいます。

```
┌─────────────┬─────────────┐
│   status    │    judge    │
├─────────────┼─────────────┤
│    Codex    │    Claude   │
├─────────────┴─────────────┤
│           Gemini          │
└───────────────────────────┘
```

---

### セッションだけ作成する (--bootstrap-only)

エージェントを起動せずに tmux セッションの作成と確認だけ行うデバッグモードです。

```bash
npm start -- --bootstrap-only
```

出力例:

```json
{
  "session": "nemagi-20260415120000-ab3xyz",
  "panes": {
    "status": "%0",
    "judge":  "%1",
    "codex":  "%2",
    "claude": "%3",
    "gemini": "%4"
  }
}
```

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
  "summary": "プロンプトと完了エージェントの一覧",
  "comparison": "各エージェントのステータスと文字数",
  "recommendedAgent": "claude",
  "scores": { "codex": 2, "claude": 2, "gemini": 1 }
}
```

> **注意:** 現時点の Judge は出力文字数ベースのスコアリングです。
> ローカル LLM との接続は未実装のため、内容に基づく評価は行われません。

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

### `tmux command failed` エラー

tmux がインストールされていないか、PATH が通っていません。

```bash
which tmux
tmux -V
```

### `codex` / `claude` / `gemini` コマンドが見つからない

```bash
which codex
which claude
which gemini
```

見つからない場合は各 CLI をインストールするか、`src/config/defaults.ts` の `cliPath` に絶対パスを指定して再ビルドしてください。

### エージェントが認証エラーで失敗する

各 CLI の認証状態を個別に確認してください。nemagi の tmux ペインには各 CLI の出力がそのまま表示されるため、エラーメッセージも見えます。

```bash
# 認証確認の例
claude --version
codex --version
gemini --version
```

### セッションが残り続ける

nemagi は終了時に tmux セッションを自動削除しません。不要なセッションは手動で削除してください。

```bash
# セッション一覧
tmux ls

# セッション削除
tmux kill-session -t nemagi-20260415120000-ab3xyz

# nemagi 系セッションを全部削除
tmux ls | grep '^nemagi-' | cut -d: -f1 | xargs -I{} tmux kill-session -t {}
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
  pollIntervalMs: 500,       // ポーリング間隔 (ms)
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
}
```

---

## 既知の制限事項

- **Judge はスタブ実装です。** 現時点では出力文字数でスコアを計算するだけで、ローカル LLM による比較・要約は行いません。
- **連続ターン実行の API はありません。** 現時点では 1 回のコマンド実行が 1 ターンに対応します。連続対話は将来の機能です。
- **TUI (対話型インターフェース) はありません。** 入力はコマンドライン引数、出力は JSON です。
