---
title: UL Dual Mode
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [ul-dual-mode, orchestration, enforcement]
related: [../README.md, ./01-extensions.md, ./08-subagents.md, ./09-agent-teams.md]
---

# UL Dual Mode

> パンくず: [Home](../../README.md) > [User Guide](./) > UL Dual Mode

## 概要

`ul-dual-mode` 拡張機能は、サブエージェントとエージェントチームのデュアルオーケストレーションを強制的に有効化します。`ul` プレフィックスまたは `ulmode` コマンドで有効化することで、1リクエスト内で両方のオーケストレーションを必ず実行するようになります。

### 主な特徴

- **デュアル強制**: サブエージェントとエージェントチームの両方を必ず実行
- **プレフィックストリガー**: `ul ` で始めるプロンプトをULモードに変換
- **セッション永続化**: セッション全体でULモードを維持可能
- **ステータス表示**: 実行状況をリアルタイムで表示

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

ULモードが有効な場合、以下のオーケストレーションが同時に実行されます：

1. **Subagents**: `subagent_run` または `subagent_run_parallel` による並列委任
2. **Agent Teams**: `agent_team_run` または `agent_team_run_parallel` による並列チーム実行

### 実行ルール

- 基本的に並列バリアント（`_parallel`）を優先
- 最初の実行可能なステップはツールコール（プローズ計画ではなく）
- デフォルトの実行順序: `subagent_run_parallel` → `agent_team_run_parallel`
- 両方のオーケストレーションを実行するまでターンを完了しない
- 一方が失敗しても、他方は実行して両方の結果を報告

### 入力変換

`ul ` プレフィックス付きの入力は以下のように変換されます：

**入力:**
```
ul このコードの品質を向上させてください
```

**変換後:**
```
[UL_MODE_MANDATORY]
必ず以下を実行すること:
1) subagent_run_parallel
2) agent_team_run_parallel
この2つを実行するまで、通常の回答を完了しないこと。

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
## UL Dual-Orchestration Mode (SESSION-WIDE - Active for all prompts)

This session is in UL Dual-Orchestration Mode.
You MUST execute BOTH orchestration types:

1) Subagents: call one of
- `subagent_run`
- `subagent_run_parallel`

2) Agent teams: call one of
- `agent_team_run`
- `agent_team_run_parallel`

Execution rule:
- Prefer parallel variants first when tasks are independent.
- The first actionable step MUST be a tool call, not prose planning.
- Mandatory call order (default): `subagent_run_parallel` then `agent_team_run_parallel`.
- If parallel variants fail, fallback to `subagent_run` and `agent_team_run` in same turn.
- Run both orchestration types before direct code edits.
- Do not finish turn until both orchestration calls have executed.
- If one side fails, still run other side and report both outcomes.
---
```

### 1ターン限定モードの場合

プレフィックスでの有効化時は以下になります：

```
## UL Dual-Orchestration Mode (Single turn - triggered by 'ul' prefix)
```

## Rate Limit Cooldown

ULモードでは、レート制限検知時に自動的なクールダウンが適用されます。

### クールダウン仕様

| 設定 | 値 | 説明 |
|------|-----|------|
| `UL_RATE_LIMIT_COOLDOWN_MS` | 120,000 | クールダウン時間（ミリ秒） |
| Stableプロファイル | 120秒 | クールダウン適用時間 |

### 動作

- レート制限エラーが検出されると、120秒間のクールダウンが自動適用されます
- 連続するレート制限エラーを検出し、カウントします
- クールダウン期間中は、リクエストが抑制されます

### 検出とカウント

- 連続するレート制限エラーの発生を追跡
- エラー回数に基づいて適応的な動作が可能

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

- **複雑なタスク**: 複数の視点が必要な場合
- **品質重視**: 多角的なレビューが必要な場合
- **調査タスク**: 広範な発見と深掘りが両方必要な場合

### いつULモードを使わないべきか

- **小さな編集**: 1ステップの修正やコメント追加
- **緊急の修正**: 速度が最優先で、並列実行のオーバーヘッドを避けたい場合
- **単純な質問**: 事実確認のみの場合

### 実行順序の最適化

デフォルトでは `subagent_run_parallel` → `agent_team_run_parallel` ですが、タスクに応じて最適な順序を選択できます：

- 研究優先: 先にサブエージェントで情報収集
- 統合優先: 先にエージェントチームで多角的な分析

### セッション全体モード vs 1ターンモード

| モード | 有効化方法 | 範囲 | 主な用途 |
|------|----------|------|----------|
| セッション全体 | `/ulmode` または `--ul` | セッション中の全リクエスト | 複雑なタスクに集中するセッション |
| 1ターン限定 | `ul ` プレフィックス | 現在のリクエストのみ | たまにULモードが必要な場合 |

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

- **ブロッキング無効**: 現在の実装では、ULモード要件が満たされなくてもブロックしません（警告のみ表示）
- **ツール制限なし**: 以前の実装ではサブエージェント/エージェントチーム以外のツール使用を制限していましたが、現在は制限されません
- **エラー時の継続**: 片方が失敗しても、他方は実行を継続します

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - 全拡張機能の概要
- [subagents](./08-subagents.md) - サブエージェントの詳細
- [agent-teams](./09-agent-teams.md) - エージェントチームの詳細
