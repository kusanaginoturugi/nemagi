# 寝間着システム 設計書

## 1. 目的

寝間着システムは、複数の LLM CLI (`codex`, `claude`, `gemini`) に対して同一入力を同時投入し、各出力をリアルタイムに観測しつつ、メイン画面で比較・要約・評価できるローカル実行システムである。

主目的は次の 3 点。

- 同一プロンプトを複数エージェントへ一斉送信する
- 各エージェントの出力を収集・保存・再表示する
- ローカル LLM が全結果を受けて比較・要約・採点する

## 2. 要求整理

### 必須要件

- メイン画面から入力したテキストを全エージェント端末へ送信できる
- `codex`, `claude`, `gemini` の個別出力を取得できる
- 出力をメイン画面に集約表示できる
- 集約した出力をローカル LLM に渡して比較・評価できる

### 実質要件

- 端末表示は常時見えること
- 対話のターン単位で履歴管理できること
- エージェントごとの応答遅延・失敗を扱えること
- CLI ごとの差異を吸収できること

### 非機能要件

- ローカル実行
- 低依存でセットアップしやすい
- 特定ベンダの CLI 実装差分に耐える
- 将来的にエージェント追加が容易

## 3. 設計方針

### 結論

`tmux` を表示レイヤ兼プロセスホストとして使い、その上に専用のオーケストレータを載せる構成を第一候補とする。

理由:

- 端末を常時可視化しやすい
- 各 CLI を独立 pane/window で保持できる
- `send-keys` や `capture-pane` で入出力制御しやすい
- 障害時の再接続や手動介入が容易

ただし `tmux` をコアロジックに密結合させず、アーキテクチャ上は「Terminal Backend」を抽象化する。これにより将来 `wezterm`, 独自 PTY 管理, Web UI バックエンドへ切り替え可能にする。

## 4. 全体アーキテクチャ

### コンポーネント

1. `Controller UI`
- ユーザーが入力するメイン画面
- 実行ターンの開始、停止、再送、比較指示を行う

2. `Session Orchestrator`
- 全体制御
- 入力配信、出力収集、状態管理、永続化を担当

3. `Terminal Backend`
- 実際の端末管理層
- 初期実装は `tmux adapter`

4. `Agent Runner`
- `codex`, `claude`, `gemini` ごとの接続定義
- 送信方式、プロンプト整形、準備コマンド、状態判定を担当

5. `Output Collector`
- 各 pane の出力を差分収集
- ANSI エスケープシーケンス除去と正規化を担当
- turn marker による対象区間の切り出しを担当
- ターン単位でログをまとめる

6. `Judge/Aggregator`
- ローカル LLM に全出力を渡し、要約・比較・採点を行う

7. `Storage`
- セッション、ターン、発話、評価結果を保存

### 論理構成図

```text
User
  |
  v
Controller UI
  |
  v
Session Orchestrator
  |-----------------------|
  |                       |
  v                       v
Terminal Backend      Storage
  |
  |-------------------------------|
  |               |               |
  v               v               v
Agent Runner    Agent Runner    Agent Runner
(codex)         (claude)        (gemini)
  |               |               |
  v               v               v
Terminal/Panes  Terminal/Panes  Terminal/Panes

Collected outputs
  |
  v
Judge/Aggregator -> Local LLM
  |
  v
Comparison / Summary / Scores
```

## 5. 実行モデル

### セッション

1 回の利用単位。tmux セッションや保存先ディレクトリと対応する。

### ターン

ユーザー入力 1 回に対する、複数エージェントの応答収集単位。

### MVP の実行方針

MVP では各エージェントを「長寿命の対話セッション」ではなく「ターンごとのワンショット実行」として扱う。

理由:

- 完了判定をプロセス終了ベースで扱いやすい
- CLI ごとの対話状態に依存しにくい
- pane が壊れた場合の再試行が単純

文脈維持が必要な場合は、Orchestrator が直近の要約または会話履歴を次ターンのプロンプトへ付与する。

MVP では履歴引き継ぎを「前ターンの Judge 要約を次ターン先頭に付与する」のみに限定する。全履歴再注入や自動要約圧縮は MVP 外とする。

### イベント

内部処理はイベント駆動で扱う。

- `session.created`
- `agent.ready`
- `turn.started`
- `prompt.sent`
- `output.delta`
- `output.completed`
- `turn.judged`
- `agent.error`

この粒度にしておくと、CLI 表示とログ保存と評価処理を疎結合に保てる。

## 6. tmux ベース設計

### セッション構成案

- 1 つの tmux session を寝間着システム用に作る
- pane 例:
  - Pane 0: status viewer
  - Pane 1: codex
  - Pane 2: claude
  - Pane 3: gemini
  - Pane 4: judge output

MVP では Main UI を tmux pane 内に固定しない。Controller UI は通常の端末プロセスとして起動し、外部から tmux session を制御する第一案とする。

理由:

- tmux 内 TUI のリサイズや入力遅延リスクを避けやすい
- ネストした tmux でも扱いやすい
- 先に制御系を安定させられる

### tmux の利用方法

- 起動: `tmux new-session`, `split-window`, `select-layout`
- 入力送信: `tmux send-keys -t <pane> <text> Enter`
- 出力取得: `tmux capture-pane -p -t <pane>`
- 状態取得: `tmux list-panes`, `display-message`

### 注意点

- CLI によっては複数行入力や paste mode が必要
- `send-keys` は制御文字やクオートを安全に扱う必要がある
- `capture-pane` 全量取得は重いので、最終取得行番号を保持し差分回収する
- `capture-pane -p` の結果は Collector 側で ANSI 除去してから保存・評価に回す
- pane 残存出力との混同を避けるため、各ターンで `start_marker` / `end_marker` を出力し、その区間だけを収集対象にする

## 7. 代替案比較

### A. tmux ベース

利点:

- 実装が最も現実的
- 画面可視性が高い
- 手動デバッグしやすい

欠点:

- 端末制御の精度は tmux 機能に依存
- pane 出力差分取得がやや面倒

### B. 独自 PTY 管理

利点:

- 端末制御を完全に自前管理できる
- 出力ストリームを直接取得しやすい

欠点:

- UI と端末描画の実装負荷が高い
- マルチ pane 表示まで含めると大きい

### C. Web UI + PTY バックエンド

利点:

- 見た目や比較 UI を柔軟に作れる
- 保存済みログの再表示が容易

欠点:

- 初期構築が重い
- MVP としては過剰

### 推奨

MVP は A。将来的に内部の `TerminalBackend` 抽象を通じて B/C に移行可能にする。

## 8. ドメインモデル

```text
Session
- id
- created_at
- status
- agents[]

Agent
- id
- name
- pane_id
- command
- state

Turn
- id
- session_id
- prompt
- started_at
- completed_at
- status

Response
- id
- turn_id
- agent_id
- raw_text
- stream_chunks[]
- started_at
- completed_at
- status

Judgement
- id
- turn_id
- summary
- comparison
- scores
- recommended_agent
```

## 9. インターフェース設計

### Agent Adapter Interface

各 CLI の差異を隠蔽するための共通インターフェースを定義する。

```ts
interface AgentAdapter {
  name: string;
  startupCommand(): string;
  buildPrompt(input: UserTurnInput): string;
  run(input: UserTurnInput): Promise<RunHandle>;
  completionPolicy(): CompletionPolicy;
}
```

### Terminal Backend Interface

```ts
interface TerminalBackend {
  createSession(sessionId: string): Promise<void>;
  createPane(name: string, command: string): Promise<TerminalRef>;
  sendText(ref: TerminalRef, text: string): Promise<void>;
  capture(ref: TerminalRef, cursor?: CaptureCursor): Promise<CaptureResult>;
  list(): Promise<TerminalRef[]>;
}
```

この 2 層を分けることで、`codex` 固有事情と `tmux` 固有事情が混ざらない。

### CompletionPolicy

完了判定は agent ごとの設定で上書き可能にする。

```ts
interface CompletionPolicy {
  mode: "process_exit" | "idle_pattern" | "silence_timeout";
  idlePattern?: string;
  silenceTimeoutMs?: number;
  maxWaitMs: number;
}
```

MVP では `process_exit` を第一選択とし、対話型 CLI を扱う場合のみ `idle_pattern + silence_timeout` を補助的に使う。

## 10. 入出力フロー

### 起動時

1. `main.ts` が Controller UI と Orchestrator を同一プロセスで起動
2. Orchestrator がユニークな tmux session 名で session を生成
3. Agent ごとに pane を作成し CLI を起動
4. ready 判定後、入力受付開始

### 1 ターン実行時

1. ユーザーが Main UI に入力
2. Orchestrator が Turn を生成
3. 全 Agent Adapter に同一入力を配信
4. Collector が各 pane の出力差分をポーリング
5. 各 agent は `process_exit` または agent 別完了判定で close する
6. Turn 全体は「全 agent 完了」または「全体最大待機時間到達」で close する
7. 完了分の出力だけを Judge/Aggregator に渡す
8. 要約・比較・採点結果を Main UI に表示
9. Storage に保存

## 11. 応答完了判定

CLI ごとに終了条件が違うため、単純な「一定時間出力なし」で終えると誤判定しやすい。完了判定は agent ごとのポリシーで扱う。

優先順:

- プロセス終了
- プロンプト復帰パターン
- 一定時間無出力
- 全体最大時間

### MVP 方針

- ワンショット実行できる CLI は `プロセス終了 = 完了`
- 対話型でしか扱えない CLI は `idle_pattern + silence_timeout + max_wait`
- `idle_pattern` と待機時間は per-agent 設定で上書き可能

設定例:

```toml
[agents.claude]
mode = "idle_pattern"
idle_pattern = "^> $"
silence_timeout_ms = 5000
max_wait_ms = 120000

[agents.codex]
mode = "process_exit"
max_wait_ms = 180000
```

長い無出力区間を含む生成を想定し、`silence_timeout` 単独では完了扱いしない。`idle_pattern` または `process_exit` と組み合わせる。

## 12. Output Collector 設計

Collector は tmux 差分収集の専用責務を持つ。

### 責務

- `capture-pane -p` による差分回収
- `start_marker` / `end_marker` による対象区間の抽出
- ANSI エスケープシーケンス除去
- 改行・制御文字の正規化
- チャンク列の保存

### ポーリング間隔

- 既定値は `500ms`
- 設定で変更可能
- 将来的には「応答中 250ms / 待機中 1000ms」の適応型へ拡張可能

CPU 負荷と体感遅延のバランス上、MVP は固定 500ms とする。

## 13. ローカル LLM Judge 設計

### 入力

- 元ユーザープロンプト
- `codex`, `claude`, `gemini` の生出力
- 任意でメタ情報:
  - 応答時間
  - 出力長
  - エラー有無

### 出力

- 全体要約
- 各回答の長所・短所
- 事実性・実用性・具体性・簡潔性の観点別評価
- 推奨回答

### Judge 用プロンプト例

```text
次のユーザー要求に対する3つの回答を比較評価せよ。
観点: 正確性、具体性、実行可能性、簡潔性。
必ず以下を返すこと:
1. 3回答の要約
2. 各回答の長所短所
3. 5点満点の採点
4. 最も採用すべき回答と理由
```

### ローカル LLM 候補

- Ollama 経由のローカルモデル
- llama.cpp サーバ
- OpenAI 互換 API を持つローカル推論サーバ

Judge は抽象化しておき、初期実装は HTTP API 互換クライアント 1 つで十分。

### Judge 起動条件

Judge は次の条件で起動する。

- 全 agent が完了した
- または turn 全体の `max_turn_wait_ms` に到達した

つまり「最大待機時間を設け、完了分だけで評価する」方式を採用する。

タイムアウトした agent については、Judge 入力に以下のいずれかを明示的に含める。

- 部分出力
- 出力なし
- timeout / error の状態

これにより、Judge は欠損を認識した上で比較できる。

## 14. 永続化設計

MVP ではファイル保存で十分。

### 保存形式案

- `sessions/<session-id>/session.json`
- `sessions/<session-id>/turns/<turn-id>.json`
- `sessions/<session-id>/turns/<turn-id>/codex.jsonl`
- `sessions/<session-id>/turns/<turn-id>/claude.jsonl`
- `sessions/<session-id>/turns/<turn-id>/gemini.jsonl`
- `sessions/<session-id>/turns/<turn-id>/codex.txt`
- `sessions/<session-id>/turns/<turn-id>/claude.txt`
- `sessions/<session-id>/turns/<turn-id>/gemini.txt`
- `sessions/<session-id>/turns/<turn-id>/judge.json`

利点:

- 調査しやすい
- 差分確認しやすい
- ストリーム過程を後から再生しやすい
- DB 不要

利用頻度が上がったら SQLite に移行する。

`jsonl` にはチャンク単位でタイムスタンプと連番を保存し、`.txt` は人間向けの整形済み全文とする。

## 15. 障害設計

### 想定障害

- CLI が未インストール
- CLI がログイン切れ
- pane が落ちる
- 出力取得が詰まる
- 1 エージェントだけ応答しない

### 方針

- Agent ごとに独立失敗させる
- 2/3 が生きていれば turn 全体は継続可能
- Main UI に agent 別ステータス表示
- 再起動コマンドを提供

## 16. セキュリティ・安全性

- プロンプト・応答ログはローカル保存のみを前提
- API キーは環境変数から参照
- ログに秘密情報が出る可能性を前提に保存先権限を絞る
- `send-keys` で危険コマンドを流さないよう、通常は各 CLI の対話入力欄にのみ送る

## 17. MVP 範囲

### MVP に含める

- tmux session 自動作成
- 3 agent pane 起動
- メイン入力の一斉配信
- pane 出力の差分収集
- ターン単位ログ保存
- ローカル LLM による比較要約

### MVP で捨てる

- 高度な Web UI
- ストリームの完全同期描画
- 自動再試行戦略
- 評価ルーブリックの高度化

ただし per-agent 完了ポリシー、ANSI 除去、`500ms` ポーリング、`max_turn_wait_ms` は MVP に含める。

## 18. 推奨実装スタック

実装速度を優先するなら Node.js/TypeScript。

理由:

- `tmux` 操作を子プロセスで扱いやすい
- TUI ライブラリ候補が多い
- JSON ログ保存が容易
- 将来 Web UI にも展開しやすい

候補:

- Runtime: Node.js
- Language: TypeScript
- TUI: `blessed` または `ink`
- Process execution: `execa` or `child_process`
- Validation: `zod`
- Storage: JSON files

Python でも可能だが、TUI と将来拡張のバランスでは TypeScript がやや有利。

## 19. ディレクトリ構成案

```text
nemagi/
  memo.md
  system-design.md
  src/
    main.ts
    app/
      orchestrator.ts
      session-store.ts
      event-bus.ts
    terminal/
      backend.ts
      tmux-backend.ts
    agents/
      adapter.ts
      codex.ts
      claude.ts
      gemini.ts
    collector/
      output-collector.ts
    judge/
      judge-client.ts
      judge-service.ts
    ui/
      main-screen.ts
      layout.ts
    config/
      defaults.ts
      schema.ts
    types/
      session.ts
      turn.ts
      response.ts
```

## 20. 設定方針

MVP では型付き TypeScript 設定を正とする。理由は、初期段階で parser 依存を増やさず、実装を前へ進めるためである。

- `config/defaults.ts`: 既定値
- `config/schema.ts`: 型と読み出し入口

外部設定ファイル化 (`toml`, `json`) は MVP 後に追加する。

## 21. 設定ファイル案（将来拡張）

```toml
[runtime]
poll_interval_ms = 500
max_turn_wait_ms = 180000

[agents.codex]
mode = "process_exit"
max_wait_ms = 180000

[agents.claude]
mode = "idle_pattern"
idle_pattern = "^> $"
silence_timeout_ms = 5000
max_wait_ms = 120000

[agents.gemini]
mode = "process_exit"
max_wait_ms = 120000
```

## 22. 実装順序

1. tmux backend を作る
2. pane 作成と send/capture を確認する
3. 1 agent で turn 実行を完成させる
4. ANSI 除去つき Collector を実装する
5. 1 agent を `process_exit` で完了判定する
6. 3 agent 並列化
7. `max_turn_wait_ms` を含む Judge 連携
8. `jsonl` ログ保存
9. Main UI を整備する

この順序なら、早い段階で「本当に CLI に入力できるか」を検証できる。

## 23. 追加で詰めるべき点

- 各 CLI への最適な入力方式
- 各 CLI の `idle_pattern` 候補の実測
- Main UI を純 TUI にするか、CLI コマンド駆動にするか
- local LLM judge のモデル選定
- 1 ターン中の中断・再送仕様

## 24. 最終提案

最初の実装は以下で進めるのが妥当。

- `tmux` を採用
- Node.js/TypeScript で実装
- `TerminalBackend` と `AgentAdapter` を分離
- MVP はワンショット実行を基本にする
- 完了判定は per-agent 設定にする
- Judge は `max_turn_wait_ms` 到達時点で完了分だけ評価する
- ターン単位のイベント駆動
- 保存は `jsonl + txt + json`
- Judge はローカル LLM API を後段接続

つまり「見える端末」と「制御ロジック」を分離した、軽量なマルチエージェント比較実験基盤として設計する。

この構成なら MVP を小さく作れ、失敗しにくく、後から UI と判定器だけ差し替えやすい。
