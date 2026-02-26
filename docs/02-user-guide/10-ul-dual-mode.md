---
title: UL Dual Mode
category: user-guide
audience: daily-user
last_updated: 2026-02-15
tags: [ul-dual-mode, orchestration, adaptive]
related: [../README.md, ./01-extensions.md, ./08-subagents.md, ./09-agent-teams.md]
---

# UL Dual Mode

> パンくず: [Home](../../README.md) > [User Guide](./) > UL Dual Mode

## 概要

`ul-dual-mode` 拡張機能は、サブエージェントとエージェントチームを使った**委任優先・効率的な実行**を提供します。LLMの裁量でフェーズ数を決定し、reviewerによる品質チェックが可能です。

### 主な特徴

- **適応型実行**: フェーズ数はLLMの裁量（最小1、上限なし）
- **委任優先**: subagent_run_parallel / agent_team_run 等を積極的に活用
- **品質保証オプション**: reviewerサブエージェントによる品質レビューが利用可能（デフォルトでは有効になっていません）
- **柔軟なパターン**: タスク規模に応じて最適な実行パターンを選択

## 使用方法

### 基本的な使い方

```bash
# ULモードの有効化（セッション全体）
/ulmode

# ULモードの無効化
/ulmode off

# プレフィックスで有効化（1ターンのみ）
ul このプロジェクトの品質を向上させてください

# ヘルプ
ul help
```

### ULモードの有効化方法

| 方法 | 説明 | 範囲 |
|------|------|------|
| `/ulmode` | スラッシュコマンドで切り替え | セッション全体 |
| `--ul` フラグ | pi起動時のCLIフラグ | セッション全体 |
| `ul ` プレフィックス | 入力の先頭に `ul ` を追加 | 1ターンのみ |

## 動作

ULモードが有効な場合、以下のポリシーで実行されます：

### 実行ポリシー

1. **委任優先**: subagent_run_parallel / agent_team_run 等を必要に応じて使用
2. **フェーズ数はLLM裁量**: 最小1フェーズ、上限なし（タスク規模に合わせて最適化）
3. **品質保証（オプション）**: reviewerサブエージェントによる品質レビューが可能（デフォルトでは無効）

### Reviewerガードレールの設定

Reviewerガードレールはデフォルトで無効になっています。品質レビューを必須にする場合は、以下の環境変数を設定します：

```bash
export UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL=true
```

または、`.pi/extensions/ul-dual-mode.ts` の設定を直接変更します：

```typescript
const UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL = true;
```

**注意**: 有効にすると、完了前に必ずreviewerが実行されます。これにより実行時間が長くなる可能性があります。

### 推奨パターン

| タスク規模 | 推奨パターン |
|-----------|-------------|
| 小規模 | `subagent_run` または直接実行 |
| 中規模 | `subagent_run_parallel(subagentIds: researcher, architect, implementer)` |
| 大規模 | `agent_team_run(teamId: core-delivery-team, strategy: parallel)` |

### 実行ルール

- Reviewerガードレールが有効な場合、完了と判断する前に必ず reviewer を実行
- 完了条件が明確な場合は `loop_run` を使用
- 明示的にreviewerを実行することも可能：

```typescript
await subagent_run({
  subagentId: "reviewer",
  task: "実装の品質と正確性をレビューしてください"
})
```

### 入力変換

`ul ` プレフィックス付きの入力は以下のように変換されます：

**入力:**
```
ul このコードの品質を向上させてください
```

**変換後:**
```
[UL_MODE_ADAPTIVE]
委任優先で効率的に実行すること。

実行ルール:
- subagent_run_parallel / agent_team_run 等を必要に応じて使用する。
- フェーズ数はLLMの裁量（最小1、上限なし）。タスク規模に合わせて最適化する。
- 完了と判断する前に必ず subagent_run(subagentId: reviewer) を実行し、品質を確認すること。
...

タスク:
このコードの品質を向上させてください
```

## パラメータ/オプション

### CLIフラグ

| フラグ | 説明 | デフォルト |
|------|------|----------|
| `--ul` | ULモードをセッション全体で有効化 | `false` |

### コマンド

| コマンド | 説明 |
|---------|------|
| `/ulmode` | ULモードを切り替え |

## ステータス表示

ULモードが有効な場合、ステータスバーに以下が表示されます：

```
UL mode | subagent:✓ team:…
```

各項目の意味：

| 項目 | 説明 |
|------|------|
| `subagent:✓` | サブエージェント実行完了 |
| `subagent:…` | サブエージェント未実行 |
| `team:✓` | エージェントチーム実行完了 |
| `team:…` | エージェントチーム未実行 |

## 使用例

### 例1: セッション全体でULモード有効

```bash
/ulmode
# → "ULモード: セッション全体で有効です。"
```

その後の全てのプロンプトでULモードが適用されます。

### 例2: プレフィックスで1ターンのみ有効

```bash
ul この機能を実装してください
```

このリクエストのみULモードで実行されます。

### 例3: セッション全体有効 + CLIフラグ

```bash
pi --ul
```

piの起動からセッション終了までULモードが有効になります。

### 例4: 指定のツールを使用したULモード

ULモードが有効な場合、自動的に以下が実行されます：

```json
{
  "subagentIds": ["researcher", "architect", "implementer"],
  "task": "..."
}
```

```json
{
  "teamId": "core-delivery-team",
  "task": "..."
}
```

### 例5: 未達成時の警告

片方しか実行されなかった場合：

```
ULモード未達: agent_team_run / agent_team_run_parallel が未実行です。
```

## セッション間の状態永続化

ULモードの状態はセッションエントリに保存され、復元されます。

```bash
# セッション1: ULモード有効
/ulmode

# セッション2: 状態を復元
pi --continue  # 前回のセッションから継続
# → ULモードが自動的に有効
```

## 出力フォーマット

### システムプロンプトへの追加

ULモードが有効な場合、以下がシステムプロンプトに追加されます：

```
---
## UL Adaptive Mode

Execution policy (delegation-first, efficient, high quality):
- Use subagent_run_parallel, agent_team_run, etc. as needed.
- Phase count is at LLM's discretion (minimum 1, no maximum).
- Quality check with reviewer is available when UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL is true.

Recommended patterns:
1. Simple tasks: single `subagent_run` or direct execution
2. Multi-perspective tasks: `subagent_run_parallel(subagentIds: researcher, architect, implementer)`
3. Complex implementation: `agent_team_run(teamId: core-delivery-team, strategy: parallel)`

Optional quality check:
- Run `subagent_run(subagentId: "reviewer")` before finishing to ensure quality
---
```

**注意**: `UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL` 環境変数が `true` に設定されている場合のみ、reviewerの実行が必須になります。デフォルトでは `false` です。

## CLEAR_GOAL_SIGNAL

ULモードでは、明確な達成条件が検出された際に「ゴールループ（goal loop）」モードへ自動的に切り替わります。

### 検知パターン

以下のパターンを検知した場合、ゴールループモードに切り替わります：

| パターン種別 | 検知文字列 |
|-------------|-----------|
| 達成条件 | 達成条件 |
| 完了条件 | 完了条件 |
| 成功条件 | 成功条件 |
| テスト | テスト.*通る |
| Lint | lint.*通る |
| Build | build.*成功 |
| Exit code | exit code 0 |

### 動作

- 明確な達成条件（「テストが通る」「lintが通る」「exit code 0」など）を検知
- 目標ループ（goal loop）モードへ自動切り替え
- 検知された条件を満たすまで反復実行

### 使用例

```
ul テストが通るようにコードを修正してください
→ ゴールループモードで実行
→ テストが通るまで反復
```

```
ul buildが成功するように設定を修正してください
→ ゴールループモードで実行
→ build成功条件を満たすまで反復
```

## 使用上のヒント

### いつULモードを使うべきか

- **効率的な実行が必要な場合**: タスク規模に応じて最適なツールを選択
- **品質保証が必要な場合**: 完了前のreviewerチェックで品質を担保（環境変数設定で有効化）
- **複雑なタスク**: 複数の視点や多角的な実装が必要な場合

### 推奨パターンの選び方

| タスク | 推奨パターン |
|-------|-------------|
| バグ修正 | `subagent_run(researcher)` → 直接修正 → `reviewer` |
| 機能追加 | `subagent_run_parallel(researcher, architect, implementer)` → `reviewer` |
| リファクタリング | `agent_team_run(core-delivery-team)` → `reviewer` |
| ドキュメント作成 | `subagent_run(implementer)` → `reviewer` |

### セッション全体モード vs 1ターンモード

| モード | 有効化方法 | 範囲 | 主な用途 |
|------|----------|------|----------|
| セッション全体 | `/ulmode` または `--ul` | セッション中の全リクエスト | 継続的な開発作業 |
| 1ターン限定 | `ul ` プレフィックス | 現在のリクエストのみ | 特定タスクでのみULモードが必要な場合 |

## トラブルシューティング

### ULモードが有効にならない

- `/ulmode` が正しく入力されているか確認
- `ul ` プレフィックスにスペースが含まれているか確認
- `--ul` フラグが正しく指定されているか確認

### 実行が遅い

ULモードは2つのオーケストレーションを並列で実行するため、以下を確認：

- ランタイム制限に達していないか（`subagent_status` / `agent_team_status` で確認）
- `memberParallelLimit` などを調整して並列数を最適化

### 未達成の警告が出る

以下を確認：

- 両方のツールが実行されているか
- 片方が失敗していないか
- 誤ったツール名を使用していないか

### 無効化できない

```bash
/ulmode off
```

または新しいpiセッションを開始してください。

## 制限事項

- **ブロッキング無効**: 現在の実装では、要件が満たされなくてもブロックしません（警告のみ表示）
- **reviewerガードレール**: デフォルトでは無効（`UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL=false`）
- **エラー時の継続**: 一部のツールが失敗しても、他のツールは実行を継続します

### Reviewerガードレールの動作

| 設定 | 動作 |
|------|------|
| `false` (デフォルト) | reviewerの実行は任意。明示的に呼び出した場合のみ実行 |
| `true` | 完了前に必ずreviewerが実行されます。実行されない場合は警告が表示されます |

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
- [subagents](./08-subagents.md) - サブエージェントの詳細
- [agent-teams](./09-agent-teams.md) - エージェントチームの詳細
