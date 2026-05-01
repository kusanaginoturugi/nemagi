# CLI AIツール 設定・コマンド・オプション比較一覧

Claude Code, Codex, Gemini-cli の3つのツールについて、設定、実行中コマンド、起動時のオプションをまとめました。

## 1. 基本設定・環境の比較
| 項目             | Claude Code                   | Codex (OpenAI系)         | Gemini-cli                  |
|:---------------|:------------------------------|:------------------------|:----------------------------|
| 開発元            | Anthropic                     | OpenAI / コミュニティ         | Google / コミュニティ             |
| 主な設定ファイル       | ~/.claude.json / .claudecode/ | ~/.codexrc / ~/.config/ | ~/.gemini/.env / ~/.config/ |
| 環境変数 (API Key) | CLAUDE_API_KEY                | OPENAI_API_KEY          | GOOGLE_API_KEY              |
| 主な役割           | 自律型エージェント                     | コード補完・生成                | 解析・パイプ処理                    |
| デフォルトモデル       | claude-3-5-sonnet             | gpt-4o                  | gemini-1.5-pro / flash      |
| 設定の思想          | パーミッション・権限管理                  | トークン・温度管理               | システム命令・安全性                  |

## 2. 実行中のスラッシュコマンド (/) 比較
| 操作内容    | Claude Code    | Codex    | Gemini-cli   |
|:--------|:---------------|:---------|:-------------|
| ヘルプ     | /help          | /help    | /help        |
| 履歴消去    | /clear         | /clear   | /clear       |
| セッション再開 | /resume [name] | /resume  | /chat resume |
| モデル変更   | /model [id]    | /model   | (起動引数)       |
| 使用量確認   | /cost          | /status  | /stats       |
| ファイル参照  | @filename      | /mention | @filename    |
| 終了      | /exit          | /quit    | /quit        |

## 3. 起動オプション (CLI Flags) 比較
| 機能               | Claude Code       | Codex    | Gemini-cli     |
|:-----------------|:------------------|:---------|:---------------|
| モデル指定            | --model <id>      | -m <id>  | --model <id>   |
| システムプロンプト        | --prompt <str>    | -s <str> | --system <str> |
| 最大トークン           | --max-tokens      | -t <num> | --max-output   |
| 温度 (Temperature) | --temp            | --temp   | --temp         |
| 対話モード強制          | (デフォルト)           | -i       | --chat         |
| 非対話/一括実行         | -y (auto-approve) | (標準入力受取) | (標準入力受取)       |

--- 

### 運用のヒント (Arch Linux / CLI環境)
- **環境変数の管理**: `direnv` を使い、プロジェクトディレクトリごとに `CLAUDE_API_KEY` や `GOOGLE_API_KEY` を切り替えると事故が減ります。
- **Gemini-cli の強み**: 標準入力を受け取る設計が優れているため、 `cat log.txt | gemini-cli --system "要約しろ"` のようなワンライナーに向いています。
- **Claude Code の強み**: `/init` で `CLAUDE.md` を作成し、そこに「Arch Linux向けのビルドコマンド」などを覚えさせておくと、自律的に動いてくれます。
