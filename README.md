---
title: mekann - pi拡張機能コレクション
category: meta
audience: new-user, developer
last_updated: 2026-03-08
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
| **task_*** | `task.ts` | 軽量タスク管理 | `.pi/INDEX.md` |
| **task-flow** | `task-flow.ts` | タスク委任と plan 連携 | `.pi/NAVIGATION.md` |
| **ul-dual-mode** | `ul-dual-mode.ts` | デュアルモード強制実行 | [→](docs/02-user-guide/10-ul-dual-mode.md) |
| **ul-workflow** | `ul-workflow.ts` | Research-Plan-Annotate-Implement ワークフロー（計画承認必須） | [→](docs/02-user-guide/16-ul-workflow.md) |
| **cross-instance-runtime** | `cross-instance-runtime.ts` | 複数piインスタンス間の並列数自動調整（プロバイダー/モデル別） | [→](docs/02-user-guide/12-cross-instance-runtime.md) |
| **autonomy-policy** | `autonomy-policy.ts` | permission bundle と gatekeeper を持つ高度自律実行 policy | README内の「Autonomy Policy」 |
| **background-process** | `background-process.ts` | 長時間実行プロセスの起動、追跡、停止、ready判定 | README内の「Background Process Support」 |
| **long-running-supervisor** | `long-running-supervisor.ts` | root task journal、crash-resume、unattended preflight、orphan sweep | README内の「Long-Running Supervisor」 |
| **workspace-verification** | `workspace-verification.ts` | 書き込み後の自動検証、runtime/UI smoke check、完了ゲート | README内の「Workspace Verification」 |

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
| **dynamic-tools** | `dynamic-tools.ts` | 動的ツール生成・実行（create_tool, run_dynamic_tool, list_dynamic_tools, delete_dynamic_tool, tool_reflection） | [→](docs/02-user-guide/13-dynamic-tools.md) |
| **invariant-pipeline** | `invariant-pipeline.ts` | 形式仕様からインバリアント、テストコード自動生成（generate_from_spec, verify_quint_spec, generate_invariant_macros, generate_property_tests, generate_mbt_driver） | [→](docs/02-user-guide/14-invariant-pipeline.md) |
| **startup-context** | `startup-context.ts` | 初回プロンプト時のコンテキスト注入 | [→](docs/02-user-guide/01-extensions.md#スタートアップコンテキスト) |
| **task-auto-executor** | `task-auto-executor.ts` | アイドル時のタスク自動実行 | `.pi/NAVIGATION.md` |
| **web-ui** | `extensions/web-ui/` | ブラウザ監視UI | `.pi/extensions/web-ui/README.md` |
| **live-monitor-base** | `lib/live-monitor-base.ts` | ライブモニターベース（エージェント/チームのリアルタイム監視） | [→](docs/02-user-guide/19-live-monitoring.md) |
| **enhanced-read** | `enhanced-read.ts` | シンタックスハイライト・行番号付きファイル読み込み | - |
| **github-agent** | `github-agent/` | GitHub CLI連携（ghコマンドラッパー、リポジトリ探索） | - |
| **playwright-cli** | `playwright-cli.ts` | Playwright CLIによるブラウザ自動化（ページ操作、スクリーンショット） | `.pi/skills/playwright-cli/SKILL.md` |
| **trajectory-reduction** | `trajectory-reduction.ts` | AgentDiet論文ベースの軌跡圧縮（トークンコスト削減） | `.pi/skills/trajectory-reduction/SKILL.md` |
| **abdd** | `abdd.ts` | ABDD（実態駆動開発）ツール統合（ドキュメント生成、JSDoc生成、乖離分析） | `.pi/skills/abdd/SKILL.md` |
| **mcp-client** | `mcp-client.ts` | MCPサーバー接続とツール実行（StreamableHTTP/SSE/WebSocket対応） | - |
| **view-code** | `code-viewer.ts` | シンタックスハイライト付きコード表示 | - |

### 分析・監査

| 拡張機能 | ファイル | 説明 | ドキュメント |
|---------|---------|------|------------|
| **repo-audit** | `repo-audit-orchestrator.ts` | RepoAuditスタイルの3層コード監査（Initiator/Explorer/Validator） | `.pi/skills/bug-hunting/SKILL.md` |
| **tool-compiler** | `tool-compiler.ts` | LLMCompiler論文ベースのツール融合・並列実行（トークン節約） | - |
| **mediator** | `mediator.ts` | 意図解釈・明確化レイヤー（LiC現象防止） | - |

### 共有ライブラリ

| ライブラリ | ファイル | 説明 |
|-----------|---------|------|
| **agent-runtime** | `agent-runtime.ts` | ランタイム負荷制御と実行カウンタ共有（内部使用） |
| **concurrency** | `lib/concurrency.ts` | 並列実行制限付きワーカープール（AbortSignal対応） |
| **plan-mode-shared** | `lib/plan-mode-shared.ts` | プランモードの共有機能と定数 |
| **retry-with-backoff** | `lib/retry-with-backoff.ts` | LLM失敗時の指数バックオフ付き再試行処理 |
| **skill-registry** | `lib/skill-registry.ts` | スキル検出・解決・フォーマット |
| **provider-limits** | `lib/provider-limits.ts` | プロバイダー/モデル別レート制限定義 |
| **adaptive-rate-controller** | `lib/adaptive-rate-controller.ts` | 429エラーからの適応学習 |
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
| **semantic-memory** | `lib/storage/semantic-memory.ts` | セマンティックメモリ（意味ベースの記憶管理） |
| **run-index** | `lib/storage/run-index.ts` | 実行インデックス管理（エージェント実行履歴の検索） |
| **pattern-extraction** | `lib/storage/pattern-extraction.ts` | パターン抽出（実行履歴からの知識抽出） |
| **comprehensive-logger** | `lib/comprehensive-logger.ts` | 包括的ログ収集（構造化ログ、ストリーミング、設定可能な出力） |
| **verification-workflow** | `lib/verification-workflow.ts` | Inspector/Challenger検証メカニズム（LLM出力品質検証） |
| **context-engineering** | `lib/context-engineering.ts` | コンテキストエンジニアリング（プロンプト最適化） |
| **execution-rules** | `lib/execution-rules.ts` | 実行ルール（タスク実行時の制約管理） |
| **semantic-repetition** | `lib/semantic-repetition.ts` | セマンティック反復検出（重複内容の特定） |
| **intent-aware-limits** | `lib/intent-aware-limits.ts` | 意図別予算制限（タスク種別のリソース制御） |
| **output-schema** | `lib/output-schema.ts` | 出力スキーマ（構造化出力の定義と検証） |
| **text-parsing** | `lib/text-parsing.ts` | テキスト解析（構造化テキスト処理） |
| **trajectory-reduction** | `lib/trajectory-reduction/` | AgentDiet論文ベースの軌跡圧縮（トークンコスト削減） |
| **mcp** | `lib/mcp/` | MCPプロトコル実装（接続管理、ツールブリッジ、認証） |
| **awo** | `lib/awo/` | AWO（Agent Workflow Optimization）メタツール生成・最適化 |
| **verification** | `lib/verification/` | 検証ワークフロー（high-stakes/simple/CI対応） |
| **dag** | `lib/dag/` | DAG実行エンジン（タスク依存関係管理、重み計算） |
| **agent** | `lib/agent/` | エージェントコア（実行管理、状態追跡） |
| **subagents** | `lib/subagents/` | サブエージェント管理（ストレージ、実行） |
| **memory** | `lib/memory/` | メモリシステム（記憶管理、検索） |
| **skills** | `lib/skills/` | スキル管理（検出、読み込み、作成） |
| **boundary-enforcer** | `lib/boundary-enforcer.ts` | 境界強制（許可/拒否リスト管理） |
| **circuit-breaker** | `lib/circuit-breaker.ts` | サーキットブレーカー（障害検出時の自動遮断） |
| **checkpoint-manager** | `lib/checkpoint-manager.ts` | チェックポイント管理（状態保存・復元） |
| **tool-compiler** | `lib/tool-compiler-types.ts` | ツールコンパイラ型定義（融合・並列実行） |
| **tool-fuser** | `lib/tool-fuser.ts` | ツール融合（類似ツールの統合） |
| **tool-executor** | `lib/tool-executor.ts` | ツール実行（並列/順次実行管理） |
| **sbfl** | `lib/sbfl.ts` | SBFL（Spectrum-Based Fault Localization）バグ位置特定 |
| **reasoning-bonds** | `lib/reasoning-bonds.ts` | 推論ボンド分析（Deep Reasoning/Self-Reflection/Self-Exploration） |
| **intent-mediator** | `lib/intent-mediator.ts` | 意図仲介（ユーザー入力の解釈・明確化） |
| **mediator-types** | `lib/mediator-types.ts` | メディエーター型定義 |
| **mediator-history** | `lib/mediator-history.ts` | メディエーター履歴管理 |
| **mediator-integration** | `lib/mediator-integration.ts` | メディエーター統合 |
| **mediator-lic-rules** | `lib/mediator-lic-rules.ts` | メディエーターLiC（Loss of Intent in Conversation）ルール |
| **mediator-prompt** | `lib/mediator-prompt.ts` | メディエータープロンプト生成 |
| **frontmatter** | `lib/frontmatter.ts` | YAMLフロントマターパーサー |
| **deep-exploration** | `lib/deep-exploration/` | 深層探索（自己改善、哲学的視座） |
| **philosophy** | `lib/philosophy/` | 哲学モジュール（脱構築、スキゾ分析、幸福論） |
| **invariant** | `lib/invariant/` | インバリアント生成（Quint、Rust、テスト） |

## Autonomy Policy

自律実行ポリシー。profile（manual/balanced/high/yolo）、mode（build/plan）、gatekeeper（off/deterministic）の3層構造。

`autonomy_preflight`、`autonomy_resume`、`autonomy_journal`、`autonomy_supervisor` は、内部では long-running supervisor の durable backend を使う互換エイリアスです。

詳細: `.pi/extensions/autonomy-policy.ts` | ツール: `autonomy_policy`, `autonomy_preflight`, `autonomy_resume`, `autonomy_journal`, `autonomy_supervisor`

## Background Process Support

長時間実行プロセスの管理。開発サーバー、APIサーバー等の起動・追跡・停止。

詳細: `.pi/extensions/background-process.ts` | ツール: `background_process_start`, `background_process_stop`

## Long-Running Supervisor

長時間自走の統合回復層。root task 全体の journal / checkpoint を `.pi/long-running/` に保存し、session crash 後の replay、unattended preflight、orphan background process の sweep をまとめて扱う。

詳細: `.pi/extensions/long-running-supervisor.ts`, `.pi/lib/long-running-supervisor.ts` | ツール: `long_running_status`, `long_running_preflight`, `long_running_resume`, `long_running_supervisor`

推奨運用: `docs/05-meta/08-autonomous-harness-playbook.md`

## Workspace Verification

コード変更後の自動検証。lint/typecheck/test/build/runtime/uiの標準レイヤー。

web app / site を検出した場合は、adaptive defaults により `runtime` と `ui` を自動で有効化します。

既定で `autoRunOnTurnEnd`、proof review、review artifact、failure replan を強めに使います。

UI 検証では `console error` を失敗扱いにします。

詳細: `.pi/extensions/workspace-verification.ts` | ツール: `workspace_verify`

## スキル管理システム

サブエージェントやチームメンバーに割り当て可能な24個のスキル（開発手法、設計・レビュー、エージェント、分析、操作、検索、計画、形式手法、テスト、最適化）。

詳細: `.pi/skills/` | ガイド: `.pi/docs/skill-guide.md`

## プロジェクト構造

```
mekann/
├── .pi/
│   ├── extensions/          # 拡張機能（19個の主要ツール + サブモジュール）
│   ├── lib/                 # 共有ライブラリ（13個のコアモジュール）
│   ├── skills/              # スキル定義（24個）
│   └── APPEND_SYSTEM.md     # プロジェクトレベルシステムプロンプト
├── docs/                    # ドキュメント
├── scripts/                 # スクリプト
├── CHANGELOG.md
└── README.md
```

詳細: [拡張機能ガイド](docs/02-user-guide/01-extensions.md)

## ドキュメント

すべてのドキュメントは [docs/](docs/) にあります。

- [ドキュメントホーム](docs/README.md)
- [Getting Started](docs/01-getting-started/) - インストールと初回使用
- [User Guide](docs/02-user-guide/) - 拡張機能の詳細ガイド
- [Developer Guide](docs/03-development/) - 拡張機能開発とAPI
- [Reference](docs/04-reference/) - 設定とトラブルシューティング
- [Meta](docs/05-meta/) - 変更履歴、ロードマップ、ドキュメントポリシー
- [自走ハーネス運用ガイド](docs/05-meta/08-autonomous-harness-playbook.md) - 小反復と強いフィードバックループの標準運用
- [コードレビューレポート](docs/06-code-review-report/) - アーキテクチャ分析、判断基準、改善推奨事項

### コードレビューレポート

プロジェクト全体のコードレビュー結果と改善推奨事項をまとめています。

- [コードレビュー統合レポート](docs/06-code-review-report/README.md) - インデックス
- [レビューサマリー](docs/06-code-review-report/01-summary.md) - 全体評価と品質スコア
- [アーキテクチャ図](docs/06-code-review-report/02-architecture-diagram.md) - Mermaid図による可視化
- [判断基準フロー](docs/06-code-review-report/03-decision-flow.md) - 開発時の意思決定基準
- [改善推奨事項](docs/06-code-review-report/04-recommendations.md) - 優先度別改善項目

## 前提条件

- **Node.js 22.x（推奨: 22.12.0）** - pi が使う Node ABI と `better-sqlite3` を一致させるため
- **ターミナル実行環境**
- **kitty (オプション)** - kitty-status-integration拡張機能で使用

詳しくは [インストールガイド](docs/01-getting-started/02-installation.md) を参照してください。

### Node / SQLite の重要な注意

`mekann` は `better-sqlite3` を使います。

`pi` 本体が Node 22 で動いている環境では、依存関係も Node 22 で install / rebuild する必要があります。

Node 24 など別 major で `npm install` すると、`better-sqlite3` が別 ABI でビルドされ、起動時に SQLite が壊れます。

推奨手順:

```bash
nvm use 22.12.0
npm install
```

ABI 不一致を直すとき:

```bash
nvm use 22.12.0
npm run rebuild:better-sqlite3
```

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
| | `plan_run_next` | 次の ready step を `in_progress` に移す |
| | `plan_update_status` | プランの状態更新 |
| | `plan_list` | プラン一覧の表示 |
| | `plan_delete` | プランの削除 |
| | `plan_ready_steps` | 実行可能なステップの表示 |
| **サブエージェント** | `subagent_create` | サブエージェントの定義作成 |
| | `subagent_run` | サブエージェントの実行 |
| | `subagent_run_parallel` | サブエージェントの並列実行 |
| | `subagent_run_dag` | DAGベースの依存関係並列実行 |
| | `subagent_configure` | サブエージェント設定更新 |
| | `subagent_list` | 定義済みエージェント一覧 |
| | `subagent_status` | 実行中のエージェント状態 |
| | `subagent_runs` | 実行履歴の表示 |
| **長時間自走** | `long_running_status` | 最新の durable replay / checkpoint / warnings を表示 |
| | `long_running_preflight` | unattended 実行の blocker、permission、verification gate を表示 |
| | `long_running_resume` | 最新の root replay / checkpoint / verification resume を表示 |
| | `long_running_supervisor` | stale session / orphan process の recovery sweep を実行または確認 |
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
| | `code_search` | コード内容の全文検索（ripgrep） |
| | `sym_index` | シンボルインデックス構築（ctags） |
| | `sym_find` | シンボル定義・参照検索 |
| | `search_class` | クラス定義検索 |
| | `search_method` | メソッド定義検索 |
| | `search_history` | 検索履歴管理 |
| **コード分析** | `ast_summary` | AST構造表示 |
| | `call_graph_index` | 呼び出しグラフインデックス |
| | `find_callers` | 呼び出し元検索 |
| | `find_callees` | 呼び出し先検索 |
| | `context_explore` | コンテキスト探索チェーン |
| | `merge_results` | 検索結果マージ |
| **ローカライゼーション** | `repograph_index` | RepoGraphインデックス構築 |
| | `repograph_query` | RepoGraphクエリ |
| | `locagent_index` | LocAgentインデックス構築 |
| | `locagent_query` | LocAgentクエリ（異種グラフ） |
| | `fault_localize` | SBFLバグ位置特定 |
| **セマンティック** | `semantic_index` | セマンティックインデックス構築 |
| | `semantic_search` | セマンティック検索（自然言語） |
| **動的ツール** | `create_tool` | 動的ツール生成 |
| | `run_dynamic_tool` | 動的ツール実行 |
| | `list_dynamic_tools` | 動的ツール一覧表示 |
| | `delete_dynamic_tool` | 動的ツール削除 |
| | `tool_reflection` | ツールの品質分析と改善提案 |
| **クロスインスタンス** | `pi_instance_status` | 複数piインスタンスの状態確認 |
| | `pi_model_limits` | プロバイダー/モデル別レート制限確認 |
| **ユーティリティ** | `agent_usage_stats` | 拡張機能使用統計 |
| | `context-usage` | コンテキスト使用量表示 |
| | `skill_status` | スキル割り当て状況表示 |
| **GitHub** | `gh_agent` | GitHub CLI連携エージェント（gh コマンドラッパー） |

## Runtime Load Guard

`subagent_run` / `subagent_run_parallel` の実行上限ガード。同時実行数と並列数を制限し、レート制限エラーを防止。

詳細: `.pi/extensions/agent-runtime.ts` | ツール: `subagent_status`

## 貢献

貢献を歓迎します！開発ガイドは [Developer Guide](docs/03-development/) を参照してください。

### Delegation-First Policy

このプロジェクトでは、タスク実行において**Delegation-First（委任優先）ポリシー**を推奨しています。

**重要**: `.pi/APPEND_SYSTEM.md` では参照されていますが、ツールレベルでの強制は無効化されています（2026-02-11以降）。このポリシーは**ガイドライン**として機能します。

推奨されるアプローチ:
- 非自明なタスクは `subagent_run_dag` を使用して委任する
- 単一エージェントによる直接実行は、小さな単一ステップの編集に限定する

詳細は [`.pi/APPEND_SYSTEM.md`](.pi/APPEND_SYSTEM.md) を参照してください。

### Plan Mode

Plan Mode（計画モード）は `Spec-first read-only` です。

有効中は `edit` / `write` / `patch` と write-capable な `bash` を止めます。

通常モードでも、複雑変更の mutation は execution-ready な plan がないと止まります。

### 定義済みサブエージェント
| エージェント | 説明 |
|------------|------|
| **researcher** | コードとドキュメントの調査専門家。広範な発見と事実収集に最適 |
| **architect** | 設計重視のヘルパー。分解、制約、移行計画の作成 |
| **implementer** | スコープ内のコーディングタスクと修正の実装ヘルパー |
| **reviewer** | リスクチェック、テスト、品質フィードバックの読み取り専用レビュー担当者 |
| **tester** | 再現可能なチェックと最小限のテスト計画に焦点を当てた検証ヘルパー |
## プロジェクトの特徴

### 完全な拡張機能セット

- **インタラクティブUI**: questionによる対話的選択
- **自律実行**: loop_runによるタスクループ
- **並列委任**: subagent_run_dagによるタスク分散（DAGベース並列実行）
- **可視化**: context-dashboard, agent-idle-indicatorによる状態監視
- **ランタイム制御**: agent-runtimeによるカウンタ共有、concurrency.tsによる並列実行制限

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
  - 完了前に verification gate を閉じる運用へ更新
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
