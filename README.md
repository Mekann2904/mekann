---
title: mekann - pi拡張機能コレクション
category: meta
audience: new-user, developer
last_updated: 2026-02-26
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
| **cross-instance-coordinator** | `lib/cross-instance-coordinator.ts` | 複数piインスタンス間の協調制御 |
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
| **embeddings** | `lib/embeddings/` | エンベディングモジュール（ベクトル埋め込み生成） |

## Autonomy Policy

`autonomy-policy` を追加した。  

この policy は 3 層です。  

`profile` は `manual / balanced / high / yolo` の4段階です。  

`mode` は `build / plan` の2段階です。  

`gatekeeper` は `off / deterministic` の2段階です。  

設計の意図:

- Kilo のような permission bundle を持つ
- Codex のように mode で実行範囲を切り替える
- Droid のように危険操作には hard stop を残す
- OpenCode のように config 保存で継続利用できる

既定値:

- `yolo`
- `build`
- `gatekeeper=off`

`yolo` は全 capability を `allow` にする master toggle です。  

人間の介入を減らすため、初期状態では gatekeeper も `off` です。  

安全側に戻したい場合だけ `manual` や `balanced`、または `gatekeeper on` を使います。  

操作方法:

- `/autonomy-policy show`
- `/autonomy-policy manual`
- `/autonomy-policy balanced`
- `/autonomy-policy high`
- `/autonomy-policy yolo`
- `/autonomy-policy build`
- `/autonomy-policy plan`
- `/autonomy-policy gatekeeper on`
- `/autonomy-policy gatekeeper off`

LLM ツールからは `autonomy_policy` で同じ設定を変更できます。  

## Background Process Support

`background-process` は、pi のセッション終了後も残せる長時間実行プロセスを扱います。  

主な用途:

- 開発サーバーの起動
- ローカルAPIの常駐
- 後続テストまで維持したい補助サービス

特徴:

- ワークスペース単位で `enabled` を設定できる
- SQLite に状態を保存する
- 危険コマンドと明らかな無限ループをブロックする
- `readyPort` または `readyPattern` で起動完了を待てる
- `stop_all` で一括終了できる

主なツール:

- `background_process_config`
- `background_process_start`
- `background_process_list`
- `background_process_log`
- `background_process_stop`
- `background_process_stop_all`

最初に有効化:

```text
background_process_config(action="update", enabled=true)
```

開発サーバーの起動例:

```text
background_process_start(
  command="npm run dev",
  readyPort=3000,
  startupTimeoutMs=20000
)
```

## Workspace Verification

`workspace-verification` は、コード変更後の検証を標準ループに戻す拡張です。  

狙いは単純です。  

`edit` / `write` / `patch` が成功したらワークスペースを `dirty` にします。  

その後、ターン終了時に runbook を解決して自動検証を走らせます。  

直近の書き込みより新しい成功検証がない場合は、`task_complete` と `plan_update_step(status=completed)` を止めます。  

同じ失敗が繰り返された場合は、`workspace_verify_replan` で修復方針を記録するまで mutation も止めます。

この拡張は `package.json`、`AGENTS.md`、`README.md`、`plans/*.md` を読んで runbook を推定します。  

次を自動抽出します。  

- `lint` / `typecheck` / `test` / `build` のコマンド
- `dev server` の起動コマンド
- `localhost` / `127.0.0.1` の URL
- acceptance criteria と validation commands

profile も自動推定します。  

- `web-app`
- `library`
- `backend`
- `cli`

`web-app` と判定された場合は、runtime と UI を連鎖させやすい形で runbook を組みます。  

標準の検証レイヤー:

- `lint`
- `typecheck`
- `test`
- `build`
- `runtime`: `background-process` で dev server を起動し、`readyPort` / `readyPattern` で待つ
- `ui`: `playwright-cli` で `open` / `snapshot` などの smoke check を行う

各検証 run の証跡は `.pi/verification-runs/` に保存されます。  

保存内容:

- `summary.json`
- `summary.md`
- step ごとの `.log`

繰り返し失敗したケースは `.pi/evals/workspace-verification/` に保存されます。

継続ループ用の状態は `.pi/workspace-verification/continuity.json` に保存されます。

完了ゲートは 3 段階です。  

- `soft`: 完了ブロックなし
- `strict`: 未検証の変更があれば完了を止める
- `release`: `strict` に加え、要求された runtime / UI 成功も必須にする

主なツール:

- `workspace_verify`
- `workspace_verify_status`
- `workspace_verify_plan`
- `workspace_verify_ack`
- `workspace_verify_review`
- `workspace_verify_review_ack`
- `workspace_verify_replan`
- `workspace_verification_config`

初期状態の確認:

```text
workspace_verify_status()
workspace_verify_plan()
workspace_verification_config(action="show")
```

`workspace_verify_plan` は、現在のワークスペースから解決した runbook をそのまま返します。  

runtime を有効化する例:

```text
workspace_verification_config(
  action="update",
  enableRuntime=true,
  runtimeCommand="npm run dev",
  runtimeReadyPort=3000
)
```

UI smoke check を有効化する例:

```text
workspace_verification_config(
  action="update",
  enableUi=true,
  uiBaseUrl="http://127.0.0.1:3000",
  uiCommands=["open ${baseUrl}", "snapshot"]
)
```

release 相当の厳格モードへ上げる例:

```text
workspace_verification_config(
  action="update",
  gateMode="release",
  artifactRetentionRuns=30
)
```

anti-loop と eval corpus を有効にしたまま threshold を変える例:

```text
workspace_verification_config(
  action="update",
  requireReplanOnRepeatedFailure=true,
  enableEvalCorpus=true,
  antiLoopThreshold=3
)
```

review artifact を必須にする例:

```text
workspace_verification_config(
  action="update",
  requireReviewArtifact=true
)
```

この設定では、成功 verification のあとに review artifact を生成し、`workspace_verify_review_ack` まで完了しないと task completion を止めます。

既定では `autoRequireReviewArtifact=true` です。

そのため `requireReviewArtifact=true` を手で入れなくても、`review notes` が推論された高リスク変更では review gate が自動で閉じます。

対象は `security`、`auth`、`api`、`schema`、`migration`、`workflow`、`build/package` 影響などです。

CI から同じ runbook を実行する例:

```bash
npm run verify:workspace
```

この script は changed files を見て、CI では近い verification から先に回します。

たとえば lint は changed TS/JS files を優先し、typecheck / test / build は変更種類に応じて relevant steps だけを残します。

GitHub Actions では `quality-gates` job がこの script を実行し、`.pi/verification-runs/`、`.pi/evals/workspace-verification/`、`.pi/workspace-verification/continuity.json` を artifact として残します。

`main` / `master` を保護する場合は、required status checks に少なくとも `quality-gates` と `security` を入れてください。

自動推定ではなく固定 profile で運用する例:

```text
workspace_verification_config(
  action="update",
  profile="web-app",
  autoDetectRunbook=true
)
```

## 計画運用

このリポジトリでは、既存の `plan_*` と外部エージェント運用を組み合わせる二層計画を採用できます。  

短い進捗は live todo で持ちます。  

長い判断と受け入れ条件は `plans/*.md` に残します。  

`plan_create` は durable な `plans/*.md` を自動生成します。  

`plan_update_step` は 1 件だけ `in_progress` を保ちます。  

完了時は次の ready step を前に出せます。  

`plan_run_next` は ready な次ステップを atomic に開始します。  

追加した足場:

- `AGENTS.md`: 計画運用ポリシー
- `.factory/droids/planner.md`: 仕様と受け入れ条件の作成担当
- `.factory/droids/executor.md`: 承認済み計画の実装担当
- `.factory/droids/verifier.md`: 計画と実装の整合確認担当
- `plans/feature-template.md`: 長い計画文書のテンプレート

基本の流れ:

1. `planner` が仕様、受け入れ条件、実装順序を固める
2. live todo は 5〜9 件で維持し、`in_progress` は常に 1 件だけにする
3. 長い判断は `plans/*.md` に残す
4. `executor` が承認済み計画に従って実装する
5. `verifier` が受け入れ条件ベースで確認する

この運用は、既存の `plan_*` を置き換えません。  

`plan_*` は作業計画の保存と状態更新に使い、`plans/*.md` は durable な仕様書として使います。  

## スキル管理システム

このプロジェクトには、サブエージェントやチームメンバーに割り当て可能なスキル管理システムが含まれています。

### 利用可能なスキル（20個）

| カテゴリ | スキル | 説明 |
|---------|--------|------|
| **開発手法** | abdd | 実態駆動開発（意図記述と実態記述の往復レビュー） |
| **設計・レビュー** | clean-architecture | アーキテクチャ設計・レビュー |
| | code-review | コードレビュー |
| **エージェント** | agent-estimation | AIエージェント作業工数見積もり（ツール呼び出しラウンドベース） |
| | alma-memory | ALMAベースのメモリ設計（セマンティック検索、継続的学習） |
| | harness-engineering | ハーネスエンジニアリング（品質向上の手法論） |
| | dynamic-tools | タスク実行中の動的ツール生成・実行・管理 |
| | dyntaskmas | DynTaskMAS論文に基づく動的タスク割り当て・並列実行スキル |
| **分析** | logical-analysis | 論理的テキスト分析（学術・技術・ビジネス文書） |
| | bug-hunting | バグ発見と根本原因特定 |
| | reasoning-bonds | Long CoT推論の分子構造分析 |
| | inquiry-exploration | 問い駆動型探求 |
| **操作** | git-workflow | Git操作・ブランチ管理 |
| **検索** | search-tools | 高速コード検索ツール（file_candidates, code_search, sym_index, sym_find） |
| | repograph-localization | RepoGraph手法に基づくコードローカライゼーション（SWE-benchで+32.8%改善） |
| **計画** | task-planner | タスク分解とDAG依存関係管理（LLMCompiler論文ベース） |
| **形式手法** | invariant-generation | 形式仕様からインバリアント、テストコード自動生成（Quint、Rustマクロ、プロパティテスト、MBT） |
| **自己改善** | self-improvement | 7つの哲学的視座に基づく自己点検プロセス |
| | self-reflection | タスク前後での自己点検（簡易チェックリスト） |
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
| | `repograph_search` | 依存関係グラフを使用したバグローカライゼーション（RepoGraph） |
| **動的ツール** | `create_tool` | 動的ツール生成 |
| | `run_dynamic_tool` | 動的ツール実行 |
| | `list_dynamic_tools` | 動的ツール一覧表示 |
| | `delete_dynamic_tool` | 動的ツール削除 |
| | `tool_reflection` | ツールの品質分析と改善提案 |
| | `get_tool_audit_log` | ツール操作の監査ログ取得 |
| **クロスインスタンス** | `pi_instance_status` | 複数piインスタンスの状態確認 |
| | `pi_model_limits` | プロバイダー/モデル別レート制限確認 |
| **自己改善** | `self_reflect` | 自己改善データ基盤による振り返り（summary, insights, generate, perspectives, analyze） |
| **ユーティリティ** | `agent_usage_stats` | 拡張機能使用統計 |
| | `context-usage` | コンテキスト使用量表示 |
| | `skill_status` | スキル割り当て状況表示 |
| **GitHub** | `gh_agent` | GitHub CLI連携エージェント（gh コマンドラッパー） |

## Runtime Load Guard

2026-02-11 以降、`subagent_run` / `subagent_run_parallel` には実行上限ガードが実装されています。

### デフォルト上限

| 項目 | デフォルト（Stable Profile） | 説明 |
|------|-----------------------------|------|
| 総同時実行（LLM数） | 4 | 同時に実行可能なLLMの最大数 |
| 総同時実行（request数） | 2 | 同時に実行可能なリクエストの最大数 |
| サブエージェント並列数 | 2 | 1リクエスト内のサブエージェント並列数 |

> **注**: このプロジェクトではStable Profileが有効になっています。環境変数で個別の上限値を上書きできます。

### 上限の確認

`subagent_status` で、現在値と上限値を確認できます。

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
| **invariant-generation-team** | 形式仕様からインバリアント、テストコード自動生成専門チーム（Quint、Rustマクロ、プロパティテスト、MBT） |
| **test-engineering-team** | 包括的テスト戦略専門チーム。単体〜E2E、プロパティベース、モデルベーステストの設計・実装 |
| **self-improvement-deep-dive-team** | 7つの哲学的視座による深い自己改善ループ。脱構築、スキゾ分析、幸福論等をリゾーム的に展開 |

> **現在、19の定義済みチームが提供されています。**

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
