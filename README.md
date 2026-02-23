---
title: mekann - pi拡張機能コレクション
category: meta
audience: new-user, developer
last_updated: 2026-02-17
tags: [overview, mekann]
related: [docs/README.md, docs/01-getting-started/01-quick-start.md]
---

# mekann（ベータ版）

piコーディングエージェント用の拡張機能コレクション。エージェントオーケストレーション、インタラクティブツール、自律タスク実行、推論スケーリング機能を提供します。

## クイックスタート

```bash
# piのインストール
npm install -g @mariozechner/pi-coding-agent

# mekannをインストール（グローバル）
pi install https://github.com/Mekann2904/mekann

# プロジェクトローカルに入れる場合
pi install -l https://github.com/Mekann2904/mekann

# 詳細なインストール手順はこちら
→ [インストールガイド](docs/01-getting-started/02-installation.md)
```

### ワンライナー導入

```bash
pi install https://github.com/Mekann2904/mekann
```

### 管理コマンド

```bash
# インストール済み一覧
pi list

# 更新
pi update

# 削除
pi remove https://github.com/Mekann2904/mekann
```

## あなたは誰ですか？

| 役割 | スタート | 目的 |
|------|---------|------|
| **新規ユーザー** | [Getting Started](docs/01-getting-started/) | 5分で始めるインストールと基本操作 |
| **日常ユーザー** | [User Guide](docs/02-user-guide/) | 拡張機能の詳細な使い方 |
| **開発者** | [Developer Guide](docs/03-development/) | 拡張機能開発とAPIリファレンス |

## 拡張機能一覧

### コア拡張機能

| 拡張機能 | ファイル | 説明 | ドキュメント |
|---------|---------|------|------------|
| **question** | `question.ts` | インタラクティブUIでユーザー選択 | [→](docs/02-user-guide/02-question.md) |

| **loop_run** | `loop.ts` | 自律ループ実行 | [→](docs/02-user-guide/04-loop-run.md) |
| **abbr** | `abbr.ts` | 略語管理 | [→](docs/02-user-guide/06-abbr.md) |

### オーケストレーション

| 拡張機能 | ファイル | 説明 | ドキュメント |
|---------|---------|------|------------|
| **plan_*** | `plan.ts` | 計画管理とタスク追跡 | [→](docs/02-user-guide/07-plan.md) |
| **subagent_*** | `subagents.ts` | サブエージェントの作成・実行 | [→](docs/02-user-guide/08-subagents.md) |
| **agent_team_*** | `agent-teams.ts` | エージェントチームの作成・実行 | [→](docs/02-user-guide/09-agent-teams.md) |
| **ul-dual-mode** | `ul-dual-mode.ts` | デュアルモード強制実行 | [→](docs/02-user-guide/10-ul-dual-mode.md) |
| **ul-workflow** | `ul-workflow.ts` | Research-Plan-Annotate-Implement ワークフロー（計画承認必須） | [→](docs/02-user-guide/16-ul-workflow.md) |
| **cross-instance-runtime** | `cross-instance-runtime.ts` | 複数piインスタンス間の並列数自動調整（プロバイダー/モデル別） | 新規 |

### ユーティリティ

| 拡張機能 | ファイル | 説明 | ドキュメント |
|---------|---------|------|------------|
| **usage-tracker** | `usage-tracker.ts` | LLM使用状況の追跡 | [→](docs/02-user-guide/11-utilities.md) |
| **agent-usage-tracker** | `agent-usage-tracker.ts` | 拡張機能の使用統計 | [→](docs/02-user-guide/11-utilities.md) |
| **context-dashboard** | `context-usage-dashboard.ts` | コンテキスト使用量ダッシュボード | [→](docs/02-user-guide/11-utilities.md) |
| **agent-idle-indicator** | `agent-idle-indicator.ts` | エージェント実行状態の表示 | [→](docs/02-user-guide/11-utilities.md) |
| **kitty-status-integration** | `kitty-status-integration.ts` | kittyターミナル連携 | [→](docs/02-user-guide/11-utilities.md) |
| **skill-inspector** | `skill-inspector.ts` | スキル割り当て状況の表示 | [→](docs/02-user-guide/11-utilities.md) |
| **search** | `extensions/search/` | 高速コード検索（file_candidates, code_search, sym_index, sym_find） | [→](docs/02-user-guide/15-search-tools.md) |
| **dynamic-tools** | `dynamic-tools.ts` | 動的ツール生成・実行（create_tool, run_dynamic_tool, list_dynamic_tools, delete_dynamic_tool, tool_reflection） | [→](docs/02-user-guide/01-extensions.md#動的ツール) |
| **invariant-pipeline** | `invariant-pipeline.ts` | 形式仕様からインバリアント、テストコード自動生成（generate_from_spec, verify_quint_spec, generate_invariant_macros, generate_property_tests, generate_mbt_driver） | [→](docs/02-user-guide/14-invariant-pipeline.md) |
| **startup-context** | `startup-context.ts` | 初回プロンプト時のコンテキスト注入 | [→](docs/02-user-guide/01-extensions.md#スタートアップコンテキスト) |
| **self-improvement-reflection** | `self-improvement-reflection.ts` | 自己改善データ基盤（データ収集、分析、哲学的考察、アクション可能な洞察） | [→](.pi/docs/self-improvement-data-platform.md) |

### 共有ライブラリ

| ライブラリ | ファイル | 説明 |
|-----------|---------|------|
| **agent-runtime** | `agent-runtime.ts` | ランタイム負荷制御と実行カウンタ共有（内部使用） |
| **concurrency** | `lib/concurrency.ts` | 並列実行制限付きワーカープール（AbortSignal対応） |
| **plan-mode-shared** | `lib/plan-mode-shared.ts` | プランモードの共有機能と定数 |
| **retry-with-backoff** | `lib/retry-with-backoff.ts` | LLM失敗時の指数バックオフ付き再試行処理 |
| **storage-lock** | `lib/storage-lock.ts` | ファイルロックとアトミック書き込みヘルパー |
| **skill-registry** | `lib/skill-registry.ts` | スキル検出・解決・フォーマット |
| **agent-types** | `lib/agent-types.ts` | エージェント関連型定義 |
| **cross-instance-coordinator** | `lib/cross-instance-coordinator.ts` | 複数piインスタンス間の協調制御（新規） |
| **provider-limits** | `lib/provider-limits.ts` | プロバイダー/モデル別レート制限定義（新規） |
| **adaptive-rate-controller** | `lib/adaptive-rate-controller.ts` | 429エラーからの適応学習（新規） |
| **agent-utils** | `lib/agent-utils.ts` | エージェントユーティリティ |
| **error-utils** | `lib/error-utils.ts` | エラーハンドリングユーティリティ |
| **format-utils** | `lib/format-utils.ts` | フォーマットユーティリティ |
| **fs-utils** | `lib/fs-utils.ts` | ファイルシステムユーティリティ |
| **live-monitor-base** | `lib/live-monitor-base.ts` | ライブモニターベース |
| **live-view-utils** | `lib/live-view-utils.ts` | ライブビューユーティリティ |
| **model-timeouts** | `lib/model-timeouts.ts` | モデルタイムアウト設定 |
| **output-validation** | `lib/output-validation.ts` | 出力バリデーション |
| **runtime-utils** | `lib/runtime-utils.ts` | ランタイムユーティリティ |
| **storage-base** | `lib/storage-base.ts` | ストレージベース |
| **tui-utils** | `lib/tui-utils.ts` | TUIユーティリティ |
| **validation-utils** | `lib/validation-utils.ts` | バリデーションユーティリティ |
| **self-improvement-data-platform** | `lib/self-improvement-data-platform.ts` | 自己改善データ基盤（3層アーキテクチャ：データ・分析・気づき）（新規） |
| **comprehensive-logger** | `lib/comprehensive-logger.ts` | 包括的ログ収集（構造化ログ、ストリーミング、設定可能な出力） |
| **verification-workflow** | `lib/verification-workflow.ts` | Inspector/Challenger検証メカニズム（LLM出力品質検証） |
| **context-engineering** | `lib/context-engineering.ts` | コンテキストエンジニアリング（プロンプト最適化） |
| **execution-rules** | `lib/execution-rules.ts` | 実行ルール（タスク実行時の制約管理） |
| **semantic-memory** | `lib/semantic-memory.ts` | セマンティックメモリ（意味ベースの記憶管理） |
| **semantic-repetition** | `lib/semantic-repetition.ts` | セマンティック反復検出（重複内容の特定） |
| **intent-aware-limits** | `lib/intent-aware-limits.ts` | 意図別予算制限（タスク種別のリソース制御） |
| **run-index** | `lib/run-index.ts` | 実行インデックス管理（エージェント実行履歴の検索） |
| **pattern-extraction** | `lib/pattern-extraction.ts` | パターン抽出（実行履歴からの知識抽出） |
| **output-schema** | `lib/output-schema.ts` | 出力スキーマ（構造化出力の定義と検証） |
| **text-parsing** | `lib/text-parsing.ts` | テキスト解析（構造化テキスト処理） |
| **embeddings** | `lib/embeddings/` | エンベディングモジュール（ベクトル埋め込み生成） |

## スキル管理システム

このプロジェクトには、サブエージェントやチームメンバーに割り当て可能なスキル管理システムが含まれています。

### 利用可能なスキル（12個）

| カテゴリ | スキル | 説明 |
|---------|--------|------|
| **開発手法** | abdd | 実態駆動開発（意図記述と実態記述の往復レビュー） |
| **設計・レビュー** | clean-architecture | アーキテクチャ設計・レビュー |
| | code-review | コードレビュー |
| **エージェント** | agent-estimation | AIエージェント作業工数見積もり（ツール呼び出しラウンドベース） |
| | alma-memory | ALMAベースのメモリ設計（セマンティック検索、継続的学習） |
| | harness-engineering | ハーネスエンジニアリング（品質向上の手法論） |
| | dynamic-tools | タスク実行中の動的ツール生成・実行・管理 |
| **分析** | logical-analysis | 論理的テキスト分析（学術・技術・ビジネス文書） |
| **操作** | git-workflow | Git操作・ブランチ管理 |
| **検索** | search-tools | 高速コード検索ツール（file_candidates, code_search, sym_index, sym_find） |
| **形式手法** | invariant-generation | 形式仕様からインバリアント、テストコード自動生成（Quint、Rustマクロ、プロパティテスト、MBT） |
| **テスト** | test-engineering | 包括的テスト戦略（単体〜E2E、プロパティベース、モデルベース） |

### スキル運用方針

- **明示的割り当て**: スキルは自動ロードされず、明示的にエージェントに割り当てる必要があります
- **継承**: 親エージェントから子エージェントへのスキル継承をサポート
- **プロジェクト分離**: プロジェクトローカルスキルがグローバルスキルをオーバーライド

詳細は [`.pi/docs/skill-guide.md`](.pi/docs/skill-guide.md) を参照してください。

## プロジェクト構造

```
mekann/
├── .pi/
│   ├── extensions/          # 拡張機能の実装
│   │   ├── question.ts      # インタラクティブUI
│   │   ├── loop.ts          # 自律ループ実行
│   │   ├── abbr.ts          # 略語管理
│   │   ├── plan.ts          # 計画管理
│   │   ├── subagents.ts     # サブエージェント
│   │   ├── agent-teams.ts   # エージェントチーム
│   │   ├── ul-dual-mode.ts  # デュアルモード
│   │   ├── ul-workflow.ts   # Research-Plan-Annotate-Implement ワークフロー
│   │   ├── agent-runtime.ts # ランタイム制御（カウンタ共有）
│   │   ├── usage-tracker.ts # LLM使用状況追跡
│   │   ├── agent-usage-tracker.ts
│   │   ├── context-usage-dashboard.ts
│   │   ├── agent-idle-indicator.ts
│   │   ├── kitty-status-integration.ts  # kitty統合
│   │   ├── skill-inspector.ts           # スキル割り当て表示
│   ├── lib/                 # 共有ライブラリ
│   │   ├── concurrency.ts          # 並列実行制限付きワーカープール
│   │   ├── plan-mode-shared.ts     # プランモードの共有機能
│   │   ├── retry-with-backoff.ts   # リトライ処理ヘルパー
│   │   └── storage-lock.ts        # ファイルロックとアトミック書き込み
│   ├── agent-teams/         # エージェントチームの履歴
│   │   ├── runs/            # 実行履歴
│   │   ├── storage.json     # チーム定義（実行時データ）
│   │   └── definitions/     # チーム定義Markdown（新規）
│   ├── subagents/           # サブエージェントの履歴
│   │   ├── runs/            # 実行履歴
│   │   └── storage.json     # エージェント定義
│   ├── agent-loop/          # エージェントループの履歴（JSONL）
│   ├── plans/               # プランの履歴
│   ├── analytics/           # アナリティクスデータ
│   │   └── agent-usage-stats.json
│   ├── APPEND_SYSTEM.md     # プロジェクトレベルシステムプロンプト
│   ├── BASH_COMMAND_UNBLOCK_SUMMARY.md    # bashコマンドブロック解除サマリー
│   ├── PLAN_MODE_FIX_SUMMARY.md          # プランモード修正サマリー
│   ├── PLAN_MODE_RESTRICTIONS_REMOVED.md # プランモード制限解除記録
│   ├── test-bash.ts        # テストファイル
│   └── test.sh              # テストスクリプト
├── docs/                    # ドキュメント
│   ├── 01-getting-started/  # インストールと初回使用
│   │   ├── README.md
│   │   ├── 01-quick-start.md
│   │   ├── 02-installation.md
│   │   └── 03-first-steps.md
│   ├── 02-user-guide/       # ユーザーガイド
│   │   ├── README.md
│   │   ├── 01-extensions.md
│   │   ├── 02-question.md
│   ├── 03-development/      # 開発者ガイド
│   │   ├── README.md
│   │   └── 01-getting-started.md
│   ├── 04-reference/        # リファレンス
│   │   ├── README.md
│   │   ├── 01-configuration.md
│   │   ├── 02-data-storage.md
│   │   └── 03-troubleshooting.md
│   ├── 05-meta/             # メタ情報
│   │   ├── README.md
│   │   ├── 01-changelog.md
│   │   ├── 02-documentation-policy.md
│   │   ├── 03-roadmap.md
│   │   ├── 04-development-workflow.md
│   │   └── 99-archive/
│   ├── 06-code-review-report/ # コードレビューレポート
│   │   ├── README.md
│   │   ├── 01-summary.md
│   │   ├── 02-architecture-diagram.md
│   │   ├── 03-decision-flow.md
│   │   └── 04-recommendations.md
│   ├── _template.md         # ドキュメントテンプレート
│   └── README.md
├── scripts/                 # スクリプト
│   └── test-kitty-extension.sh
├── CHANGELOG.md             # 変更履歴
└── README.md                # このファイル
```

> **注**: 詳細な拡張機能ドキュメントは現在順次作成中です。すべての拡張機能の概要については [拡張機能ガイド](docs/02-user-guide/01-extensions.md) を参照してください。

## ドキュメント

すべてのドキュメントは [docs/](docs/) にあります。

- [ドキュメントホーム](docs/README.md)
- [Getting Started](docs/01-getting-started/) - インストールと初回使用
- [User Guide](docs/02-user-guide/) - 拡張機能の詳細ガイド
- [Developer Guide](docs/03-development/) - 拡張機能開発とAPI
- [Reference](docs/04-reference/) - 設定とトラブルシューティング
- [Meta](docs/05-meta/) - 変更履歴、ロードマップ、ドキュメントポリシー
- [コードレビューレポート](docs/06-code-review-report/) - アーキテクチャ分析、判断基準、改善推奨事項

### コードレビューレポート

プロジェクト全体のコードレビュー結果と改善推奨事項をまとめています。

- [コードレビュー統合レポート](docs/06-code-review-report/README.md) - インデックス
- [レビューサマリー](docs/06-code-review-report/01-summary.md) - 全体評価と品質スコア
- [アーキテクチャ図](docs/06-code-review-report/02-architecture-diagram.md) - Mermaid図による可視化
- [判断基準フロー](docs/06-code-review-report/03-decision-flow.md) - 開発時の意思決定基準
- [改善推奨事項](docs/06-code-review-report/04-recommendations.md) - 優先度別改善項目

## 前提条件

- **Node.js v20.18.1以上** - piと依存関係の実行要件
- **ターミナル実行環境**
- **kitty (オプション)** - kitty-status-integration拡張機能で使用

詳しくは [インストールガイド](docs/01-getting-started/02-installation.md) を参照してください。

## 主要機能

### 利用可能なコマンド

| カテゴリ | コマンド | 説明 |
|---------|---------|------|
| **UI** | `question` | インタラクティブな質問UI |
| **ループ** | `loop_run` | 自律ループ実行 |
| **略語** | `abbr` | 略語の管理 |
| **計画** | `plan_create` | プランの作成 |
| | `plan_show` | プランの詳細表示 |
| | `plan_add_step` | プランへのステップ追加 |
| | `plan_update_step` | ステップの状態更新 |
| | `plan_update_status` | プランの状態更新 |
| | `plan_list` | プラン一覧の表示 |
| | `plan_delete` | プランの削除 |
| | `plan_ready_steps` | 実行可能なステップの表示 |
| **サブエージェント** | `subagent_create` | サブエージェントの定義作成 |
| | `subagent_run` | サブエージェントの実行 |
| | `subagent_run_parallel` | サブエージェントの並列実行 |
| | `subagent_configure` | サブエージェント設定更新 |
| | `subagent_list` | 定義済みエージェント一覧 |
| | `subagent_status` | 実行中のエージェント状態 |
| | `subagent_runs` | 実行履歴の表示 |
| **エージェントチーム** | `agent_team_create` | エージェントチームの定義作成 |
| | `agent_team_run` | エージェントチームの実行 |
| | `agent_team_run_parallel` | エージェントチームの並列実行 |
| | `agent_team_configure` | チーム設定更新 |
| | `agent_team_list` | 定義済みチーム一覧 |
| | `agent_team_status` | 実行中のチーム状態 |
| | `agent_team_runs` | 実行履歴の表示 |
| **UL Dual-Orchestration** | `ulmode` | UL Dual-Orchestrationモードの切り替え |
| **UL Workflow** | `ul_workflow_start` | Research-Plan-Annotate-Implement ワークフロー開始 |
| | `ul_workflow_status` | ワークフローステータス表示 |
| | `ul_workflow_approve` | 現在のフェーズを承認 |
| | `ul_workflow_annotate` | plan.mdの注釈を適用 |
| | `ul_workflow_abort` | ワークフロー中止 |
| | `ul_workflow_resume` | 中止したワークフローを再開 |
| **ULプレフィックス** | `ul <task>` | ワークフローモードで実行 |
| | `ul fast <task>` | 高速委任モードで実行 |
| | `ul status` / `approve` / `annotate` / `abort` | ワークフロー操作 |
| **検索** | `file_candidates` | ファイル候補検索（あいまい検索） |
| | `code_search` | コード内容の全文検索 |
| | `sym_index` | シンボルインデックス構築 |
| | `sym_find` | シンボル定義・参照検索 |
| **動的ツール** | `create_tool` | 動的ツール生成 |
| | `run_dynamic_tool` | 動的ツール実行 |
| | `list_dynamic_tools` | 動的ツール一覧表示 |
| | `delete_dynamic_tool` | 動的ツール削除 |
| | `tool_reflection` | 実行後の反省とツール生成判定 |
| **クロスインスタンス** | `pi_instance_status` | 複数piインスタンスの状態確認 |
| | `pi_model_limits` | プロバイダー/モデル別レート制限確認 |
| **自己改善** | `self_reflect` | 自己改善データ基盤による振り返り（summary, insights, generate, perspectives, analyze） |
| **ユーティリティ** | `agent_usage_stats` | 拡張機能使用統計 |
| | `context-usage` | コンテキスト使用量表示 |
| | `skill_status` | スキル割り当て状況表示 |

## Runtime Load Guard

2026-02-11 以降、`subagent_run` / `subagent_run_parallel` / `agent_team_run` / `agent_team_run_parallel` には実行上限ガードが実装されています。

### デフォルト上限

| 項目 | デフォルト（Stable Profile） | 説明 |
|------|-----------------------------|------|
| 総同時実行（LLM数） | 4 | 同時に実行可能なLLMの最大数 |
| 総同時実行（request数） | 2 | 同時に実行可能なリクエストの最大数 |
| サブエージェント並列数 | 2 | 1リクエスト内のサブエージェント並列数 |
| チーム並列数 | 1 | 1リクエスト内のチーム並列数 |
| チーム内メンバー並列数 | 3 | 1チーム内のメンバー並列数 |

> **注**: このプロジェクトではStable Profileが有効になっています。環境変数で個別の上限値を上書きできます。

### 上限の確認

`subagent_status` と `agent_team_status` で、現在値と上限値を確認できます。

### 上限の調整

環境変数で上限を調整できます（Stable Profileのデフォルト値から上書きされます）。

```bash
PI_AGENT_MAX_TOTAL_LLM=4
PI_AGENT_MAX_TOTAL_REQUESTS=2
PI_AGENT_MAX_PARALLEL_SUBAGENTS=2
PI_AGENT_MAX_PARALLEL_TEAMS=1
PI_AGENT_MAX_PARALLEL_TEAMMATES=3
PI_AGENT_CAPACITY_WAIT_MS=30000      # 待機時間（デフォルト30秒）
PI_AGENT_CAPACITY_POLL_MS=250        # ポーリング間隔（デフォルト250ms）
```

### 上限到達時の動作

上限到達時は即失敗ではなく、一定時間まで順番待ちします（待機後も空かなければ失敗）。

## 貢献

貢献を歓迎します！開発ガイドは [Developer Guide](docs/03-development/) を参照してください。

### Delegation-First Policy

このプロジェクトでは、タスク実行において**Delegation-First（委任優先）ポリシー**を推奨しています。

**重要**: `.pi/APPEND_SYSTEM.md` では参照されていますが、ツールレベルでの強制は無効化されています（2026-02-11以降）。このポリシーは**ガイドライン**として機能します。

推奨されるアプローチ:
- 非自明なタスクは `subagent_run` または `subagent_run_parallel` を使用して委任する
- 独立したタスクトラックは `agent_team_run` または `agent_team_run_parallel` で並列実行する
- 単一エージェントによる直接実行は、小さな単一ステップの編集に限定する

詳細は [`.pi/APPEND_SYSTEM.md`](.pi/APPEND_SYSTEM.md) を参照してください。

### Plan Mode

Plan Mode（計画モード）は現在、制限なしで使用可能です。ツールレベルでのブロック機能は無効化されています。

### 定義済みサブエージェント

| エージェント | 説明 |
|------------|------|
| **researcher** | コードとドキュメントの調査専門家。広範な発見と事実収集に最適 |
| **architect** | 設計重視のヘルパー。分解、制約、移行計画の作成 |
| **implementer** | スコープ内のコーディングタスクと修正の実装ヘルパー |
| **reviewer** | リスクチェック、テスト、品質フィードバックの読み取り専用レビュー担当者 |
| **tester** | 再現可能なチェックと最小限のテスト計画に焦点を当てた検証ヘルパー |

### 定義済みエージェントチーム

| チーム名 | 説明 |
|---------|------|
| **core-delivery-team** | ほとんどのコーディングタスクに対応するバランスのとれたチーム（研究、実装、レビュー、設計、テスト、リスク） |
| **bug-war-room** | 競合する仮説、決定論的再現、最終的なコンセンサスを含む根本原因タスクフォース |
| **code-excellence-review-team** | 可読性、エレガンス、保守性、長期的な運用性のための包括的なコードレビューチーム |
| **design-discovery-team** | 創造的な作業を行う前に必ず実施する設計発見タスクフォース。要件収集、トレードオフ評価、設計策定・検証を行い、実装前の完全な設計仕様を確立 |
| **docs-enablement-team** | README、運用手順、例、簡潔な変更サマリーのドキュメントチーム |
| **file-organizer-team** | ファイル・フォルダの整理に特化したタスクフォース。現状分析、重複検出、整理計画策定、実行・検証を行い、デジタルワークスペースを整頓 |
| **mermaid-diagram-team** | コード視覚化タスクフォース。シーケンス図、フローチャート等のMermaid図を厳密なコード整合性で作成・検証 |
| **rapid-swarm-team** | 多数の並列ワーカーを持つスピード重視チーム。独立したスライスを攻撃的に展開する場合に使用 |
| **refactor-migration-team** | 影響分析、移行計画、実装戦略、互換性チェックのためのリファクタ重視チーム |
| **research-team** | データ分析・科学研究プロジェクトを効率的に遂行する専門チーム。研究計画から成果発表まで一貫したワークフローを提供 |
| **security-hardening-team** | 脅威分析、認証チェック、依存関係リスク監査、パッチレビューのためのセキュリティ重視チーム |
| **logical-analysis-team** | 論理的テキスト分析専門チーム。学術論文、技術文書、仕様書、契約書など幅広いテキストを対象に、構造・概念・論証の3軸で体系的に分析 |
| **doc-gardening-team** | ドキュメントガーデニングチーム。既存ドキュメントの整理、更新、整合性確認を行い、ドキュメントの健全性を維持 |
| **garbage-collection-team** | 技術的負債解消チーム。未使用コード、古い依存関係、廃止予定機能の特定と削除を実施 |
| **skill-creation-team** | スキル作成支援チーム。新規スキルの設計、実装、テスト、ドキュメント作成を一貫してサポート |
| **verification-phase-team** | 検証フェーズ専門チーム。Inspector/Challengerパターンによる出力品質検証と信頼性評価を実施 |

> **現在、16の定義済みチームが提供されています。**

## プロジェクトの特徴

### 完全な拡張機能セット

- **インタラクティブUI**: questionによる対話的選択
- **自律実行**: loop_runによるタスクループ
- **並列委任**: subagents, agent-teamsによるタスク分散
- **可視化**: context-dashboard, agent-idle-indicatorによる状態監視
- **ランタイム制御**: agent-runtimeによるカウンタ共有、concurrency.tsによる並列実行制限、storage-lock.tsによる同時実行保護

### 開発者向け

- TypeScriptで書かれた拡張機能の実例
- pi SDKのイベント、ツール、UIコンポーネントの活用
- 再読み込み可能な拡張機能（`/reload` コマンド）
- セッション永続化と状態管理のパターン

### トラッキング・分析

- LLM使用量の追跡（トークン、コスト）
- 拡張機能ごとの使用統計
- エージェント実行履歴のログ記録
- コンテキスト使用量の可視化

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください

## Version

**v0.3.1** (2026-02-15)

v0.3.0からの変更点:
- ULモード: 適応型委任モードへ刷新
  - フェーズ数はLLMの裁量（最小1、上限なし）
  - 完了前のreviewer実行を必須化
  - タスク規模に応じた推奨パターンを提示

**v0.2.1** (2026-02-14)

v0.2.0からの変更点:
- skill-inspector拡張機能の追加（skill_statusツール、/skill-statusコマンド）
- mermaid-diagram-team、research-teamの追加

**v0.2.0** (2026-02-12)

v0.1.0からの変更点:
- エージェントチーム定義のMarkdown外部化
- design-discovery-team、file-organizer-teamの追加
- plugin-dev.tsのドキュメント削除
- Runtime Load Guardのstable profileデフォルト値調整

---

**v0.1.0** (2026-02-11)

初期リリース - pi拡張機能コレクション

## リンク

- [GitHub Repository](https://github.com/Mekann2904/mekann)
- [pi Documentation](https://github.com/badlogic/pi-mono)
- [変更履歴](CHANGELOG.md)
- [ロードマップ](docs/05-meta/03-roadmap.md)
