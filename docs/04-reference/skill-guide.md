---
title: スキルガイド
category: reference
audience: developer, daily-user
last_updated: 2026-02-26
tags: [skills, reference, guide]
related: [../02-user-guide/11-utilities.md, ../README.md]
---

# スキルガイド

> パンくず: [Home](../README.md) > [リファレンス](./README.md) > スキルガイド

## 概要

pi拡張機能で利用可能なスキルの一覧と使用ガイドです。各スキルは特定のタスクやワークフローを支援するために設計されています。

## スキル一覧

### 開発・エンジニアリング

| スキル名 | 説明 | 主な用途 |
|---------|------|---------|
| [clean-architecture](../../.pi/skills/clean-architecture/) | アーキテクチャ設計・レビュー | コンポーネント設計、凝集度・結合度の評価 |
| [code-review](../../.pi/skills/code-review/) | コードレビュー | コード品質の継続的改善、レビュー観点の提供 |
| [test-engineering](../../.pi/skills/test-engineering/) | 包括的テスト戦略 | 単体〜E2Eテスト、PBT、MBT、契約テスト |
| [git-workflow](../../.pi/skills/git-workflow/) | Git操作・ブランチ管理 | コミット、マージ、リベース、コンフリクト解決 |
| [harness-engineering](../../.pi/skills/harness-engineering/) | ハーネスエンジニアリング | AIエージェントの品質と信頼性向上 |
| [invariant-generation](../../.pi/skills/invariant-generation/) | インバリアント生成 | 形式仕様からテスト自動生成 |

### 分析・調査

| スキル名 | 説明 | 主な用途 |
|---------|------|---------|
| [bug-hunting](../../.pi/skills/bug-hunting/) | バグ発見と根本原因特定 | 症状と原因の区別、因果チェーン分析 |
| [logical-analysis](../../.pi/skills/logical-analysis/) | 論理的テキスト分析 | 構造・概念・論証の3軸分析 |
| [search-tools](../../.pi/skills/search-tools/) | 検索ツール使用法 | file_candidates, code_search, sym_index, sym_find |
| [repograph-localization](../../.pi/skills/repograph-localization/) | コードローカライゼーション | SWE-bench手法による関連コード位置特定 |
| [task-planner](../../.pi/skills/task-planner/) | タスク分解とDAG実行 | 複雑なタスクの並列実行計画 |
| [agent-estimation](../../.pi/skills/agent-estimation/) | エージェント工数見積もり | ツール呼び出しラウンドベースの正確な見積もり |

### 自己改善・哲学

| スキル名 | 説明 | 主な用途 |
|---------|------|---------|
| [self-improvement](../../.pi/skills/self-improvement/) | 自己改善スキル | 7つの哲学的視座に基づく批判的実践 |
| [self-reflection](../../.pi/skills/self-reflection/) | 自己点検 | タスク前後の簡易チェックリスト |
| [inquiry-exploration](../../.pi/skills/inquiry-exploration/) | 問い駆動型探求 | 「完了への渇愛」から「探求への好奇心」へ転換 |
| [reasoning-bonds](../../.pi/skills/reasoning-bonds/) | Long CoT推論分析 | 推論の分子構造分析、委任フロー品質評価 |

### メモリ・学習

| スキル名 | 説明 | 主な用途 |
|---------|------|---------|
| [alma-memory](../../.pi/skills/alma-memory/) | ALMAメモリ設計 | 実行履歴からのパターン抽出、継続的学習 |

### ドキュメント・ツール

| スキル名 | 説明 | 主な用途 |
|---------|------|---------|
| [abdd](../../.pi/skills/abdd/) | ABDD（実態駆動開発） | 意図記述と実態記述の乖離検出、ドキュメント生成 |
| [dynamic-tools](../../.pi/skills/dynamic-tools/) | 動的ツール生成 | 実行中に必要なツールを動的に生成・実行 |
| [dyntaskmas](../../.pi/skills/dyntaskmas/) | 動的タスク割り当て | 重み計算、優先度スケジューリング、適応的ワークフロー |

## スキル使用方法

### 基本的な使い方

スキルを使用するには、タスク実行前に該当するスキルをロードします:

```
read tool: .pi/skills/<skill-name>/SKILL.md
```

### タスクに応じたスキル選択

| タスク種別 | 推奨スキル |
|-----------|-----------|
| アーキテクチャ設計 | clean-architecture |
| コードレビュー | code-review |
| テスト作成 | test-engineering |
| Git操作 | git-workflow |
| バグ調査 | bug-hunting, repograph-localization |
| タスク計画 | task-planner, agent-estimation |
| 自己改善 | self-improvement, self-reflection |
| ドキュメント作成 | abdd |

## カテゴリ別スキル詳細

### 開発・エンジニアリング

#### clean-architecture

コンポーネント設計・レビューのためのスキル。凝集度・結合度の原則に基づき、保守性の高い「ソフトな」システムを構築します。

**主な機能:**
- コンポーネントの凝集度・結合度評価
- 開発フェーズに応じた原則の重み付け
- アーキテクチャ違反の検出

**関連ファイル:**
- `.pi/skills/clean-architecture/SKILL.md`
- `.pi/skills/clean-architecture/references/principles-summary.md`
- `.pi/skills/clean-architecture/references/decision-flow.md`

#### code-review

エンジニアリングプラクティスに基づくコードレビュースキル。コードベースの健康状態を継続的に改善します。

**主な機能:**
- レビュー観点の提供
- コメントの書き方ガイド
- レビューチェックリスト

**関連ファイル:**
- `.pi/skills/code-review/SKILL.md`
- `.pi/skills/code-review/references/review-checklist.md`
- `.pi/skills/code-review/references/comment-templates.md`

#### test-engineering

包括的テスト戦略スキル。テストピラミッドに基づき、単体テスト〜E2Eテストまで全レイヤーの設計・実装を支援します。

**主な機能:**
- プロパティベーステスト（PBT）
- モデルベーステスト（MBT）
- 契約テスト
- カバレッジベストプラクティス

**関連ファイル:**
- `.pi/skills/test-engineering/SKILL.md`
- `.pi/skills/test-engineering/references/coverage-best-practices.md`
- `.pi/skills/test-engineering/references/property-patterns.md`
- `.pi/skills/test-engineering/references/test-templates.md`

### 分析・調査

#### bug-hunting

バグ発見と根本原因特定のための体系的スキル。症状と原因の区別、因果チェーン分析を通じて、真の原因を見逃さないための手法論を提供します。

**主な機能:**
- 症状と原因の区別
- 因果チェーン分析
- 抽象化レベルの階層化
- 認知バイアスの回避（第2理由問題、近接性バイアス）

#### task-planner

タスク分解スキル。複雑なタスクを依存関係を持つサブタスクのDAG（有向非巡回グラフ）に分解し、並列実行を可能にします。LLMCompiler論文の概念に基づきます。

**主な機能:**
- タスクのDAG分解
- 依存関係の明示化
- エージェント割り当て
- 並列実行の最適化

**出力フォーマット:**
```json
{
  "id": "plan-<unique-id>",
  "description": "Original task description",
  "tasks": [
    {
      "id": "task-1",
      "description": "Specific subtask description",
      "dependencies": [],
      "assignedAgent": "researcher",
      "priority": "high"
    }
  ],
  "metadata": {...}
}
```

#### agent-estimation

AIエージェントの作業工数を、人間の時間ではなくエージェント自身の操作単位（ツール呼び出しラウンド）で正確に見積もります。エージェントが人間の開発者のタイムラインにアンカーして過大評価する失敗を防ぎます。

**主な機能:**
- ラウンド数ベースの見積もり
- リスク要因の考慮
- 実時間への変換
- スコープ設定の支援

### 自己改善・哲学

#### self-improvement

7つの哲学的視座に基づく自己改善スキル。前提・固定観念を問題化し、批判的実践を促進します。

**哲学的視座:**
- 脱構築
- スキゾ分析
- 幸福論

**関連ファイル:**
- `.pi/skills/self-improvement/SKILL.md`
- `.pi/skills/self-improvement/love-ethics-critique.md`
- `.pi/skills/self-improvement/proposals/twelve-nidanas-proposal.md`

#### inquiry-exploration

問い駆動型探求スキル。「完了への渇愛」を「探求への好奇心」へ転換し、タスクを「答えを見つけること」ではなく「問いを深めること」として再定義します。

**主な機能:**
- 脱構築
- スキゾ分析
- 幸福論の7つの哲学的視座に基づく深い探求

### ドキュメント・ツール

#### abdd

ABDD（As-Built Driven Development）スキル。意図記述と実態記述の往復レビュー、乖離検出、ドキュメント生成を支援します。

**主な機能:**
- コードから自動生成されるMermaid図付きドキュメント
- 人間が定義する意図記述との比較
- 乖離の可視化・解消

**関連コマンド:**
- `pi abdd_generate` - 実態ドキュメント生成
- `pi abdd_jsdoc` - JSDoc生成
- `pi abdd_review` - 乖離分析

#### dynamic-tools

動的ツール生成・実行スキル。タスク実行中に必要なツールを動的に生成・実行・管理します。

**主な機能:**
- 実行時のツール生成
- ツールレジストリ管理
- 安全性チェック

## スキルの活用フロー

### 典型的なワークフロー

```
1. タスク定義
   ↓
2. 適切なスキルの選択とロード
   ↓
3. スキルの指示に従った実行
   ↓
4. 出力の検証
   ↓
5. 必要に応じて反復
```

### 複数スキルの組み合わせ

多くのタスクでは複数のスキルを組み合わせて使用します:

| タスク | スキルの組み合わせ |
|------|------------------|
| 新機能開発 | task-planner → clean-architecture → test-engineering → code-review |
| バグ修正 | bug-hunting → git-workflow |
| ドキュメント更新 | abdd → git-workflow |
| パフォーマンス改善 | bug-hunting → clean-architecture → test-engineering |
| 自己改善 | self-reflection → self-improvement |

## スキルの拡張

新しいスキルを作成するには、`.pi/skills/skill-template/SKILL.md`をテンプレートとして使用します。

### スキルテンプレートの構造

```yaml
---
name: skill-name
description: スキルの説明
license: MIT
tags: [tag1, tag2]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
---

# Skill Name

スキルの概要

## Purpose

スキルの目的

## When to Use

使用すべき状況

## Output Format

出力フォーマット

## Examples

使用例
```

## 関連トピック

- [ユーティリティガイド](../02-user-guide/11-utilities.md) - スキル使用の詳細
- [開発者ガイド](../03-development/) - スキル開発の詳細
- [拡張機能リファレンス](./04-pi-extensions.md) - pi拡張機能のドキュメント

## 次のトピック

[ → 設定リファレンス](./01-configuration.md)
[ → トラブルシューティング](./03-troubleshooting.md)
