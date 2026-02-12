---
title: エージェント自走力とコーディング性能向上計画
category: meta
audience: developer, contributor
last_updated: 2026-02-11
tags: [improvement, autonomy, performance, roadmap]
related: [README.md, docs/05-meta/03-roadmap.md, docs/05-meta/04-development-workflow.md]
---

# エージェント自走力とコーディング性能向上計画

本計画は、mekann拡張機能を通じたコーディング性能とエージェント自走力の向上方法をまとめたものです。

## 概要

2026年2月11日〜12日に、7つのエージェントチームと3つのサブエージェントによる詳細な議論を行いました。

### 議論参加チーム

1. **core-delivery-team** - コアデリバリー（研究、実装、レビュー）
2. **code-excellence-review-team** - コード品質レビュー
3. **refactor-migration-team** - リファクタリングと移行
4. **security-hardening-team** - セキュリティ強化
5. **bug-war-room** - 根本原因分析と矛盾発見
6. **docs-enablement-team** - ドキュメント戦略
7. **rapid-swarm-team** - 高速実装計画
8. **architect** - アーキテクチャ設計
9. **implementer** - 実装計画詳細化
10. **reviewer** - リスク評価

## 既存機能の分析

### 現在提供されている拡張機能

| カテゴリ | 拡張機能 | 説明 |
|---------|---------|------|
| **コア** | question, rsa_solve, loop_run, fzf, abbr | UI、推論、自律ループ |
| **オーケストレーション** | plan_*, subagent_*, agent_team_* | 計画管理、サブエージェント、チーム |
| **可視化** | usage-tracker, context-dashboard, agent-idle-indicator | 使用状況監視 |
| **実行制御** | agent-runtime.ts, concurrency.ts | ランタイム制御、並列制限 |

### 定義済みエージェント

- **researcher** - コードとドキュメントの調査専門家
- **architect** - 設計重視のヘルパー
- **implementer** - スコープ内のコーディングタスク
- **reviewer** - リスクチェック、品質フィードバック
- **tester** - 再現可能なチェックと検証

### 定義済みチーム

| チーム名 | 説明 |
|---------|------|
| core-delivery-team | バランスのとれたチーム（研究、実装、レビュー、設計、テスト、リスク） |
| investigation-team | 競合する仮説と根本原因調査 |
| bug-war-room | 根本原因タスクフォース |
| security-hardening-team | 脅威分析、認証チェック、依存関係リスク監査 |
| docs-enablement-team | README、運用手順、例、変更サマリー |
| rapid-swarm-team | 多数の並列ワーカーを持つスピード重視チーム |
| refactor-migration-team | 影響分析、移行計画、実装戦略 |
| code-excellence-review-team | 可読性、エレガンス、保守性、長期的運用性 |

## 改善提案の統合

### 議論から発見された重要な点

1. **重複機能の排除**: 前チームの提案には既存機能と重複するものが多数
2. **ギャップの特定**: キャッシュ、チェックポイント、学習機能が不足
3. **統合の必要性**: 既存のagent-runtime.tsを中心とした統合アプローチ

### 重複排除された提案

| 提案 | 既存対応 | 統合状態 |
|------|---------|---------|
| agent-context-bridge | agent-runtime.ts（部分的） | agent-runtime.ts拡張で対応 |
| task-decomposer | plan.ts（ステップ管理あり） | plan.ts拡張で対応 |
| smart-scheduler | agent-runtime.ts（容量制御あり） | agent-runtime.ts統合 |
| goal-directed-loop | loop.ts（goal引数あり） | loop.ts拡張で対応 |
| self-critique-bridge | agent-teams.ts（judge機能あり） | 既存機能拡張で対応 |
| checkpoint-extension | loop.ts（ログ保存あり） | loop.ts拡張で対応 |

## 実装計画

### フェーズ1: 高優先度（2-3週間）

#### 1.1 task-cache.ts / result-cache.ts

**目的**: 重複タスクの検出と結果再利用によるAPIリクエスト削減

**実装計画**:
```typescript
// .pi/extensions/cache/task-cache.ts
interface TaskCacheEntry {
  key: string;              // タスクハッシュ
  taskPreview: string;
  agentId?: string;
  summary: string;
  result: string;
  cachedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  estimatedLatencyMs: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalLatencySavedMs: number;
}
```

**統合ポイント**:
- agent-runtime.ts にキャッシュ統計フィールド追加
- subagents.ts の `runSubagent()` 前にキャッシュチェック
- agent-teams.ts の `runTeamMember()` 前にキャッシュチェック

**期待効果**:
- キャッシュヒット率 > 30%
- 平均実行時間 -20%
- APIコスト削減

#### 1.2 checkpoint-extension (loop.ts拡張)

**目的**: ループ実行の再開可能なチェックポイント

**実装計画**:
```typescript
// loop.ts に追加
interface LoopCheckpoint {
  runId: string;
  iteration: number;
  timestamp: string;
  state: {
    previousOutput: string;
    validationFeedback: string[];
    goalStatus: LoopGoalStatus;
  };
}

async function saveCheckpoint(run: LoopRun): void
async function restoreFromCheckpoint(runId: string): Promise<LoopCheckpoint | null>
```

**期待効果**:
- 長時間実行タスクの回復性向上
- 異常終了時の再開時間 < 5秒

### フェーズ2: 中優先度（1-2週間）

#### 2.1 context-bridge-integration.ts

**目的**: エージェント間のコンテキスト共有と連携強化

**実装計画**:
```typescript
// agent-runtime.ts に追加
interface ContextBridge {
  get(key: string): any;
  set(key: string, value: any, ttl?: number): void;
  invalidate(pattern: string): number;
  getAllKeys(): string[];
}

export function getContextBridge(): ContextBridge
```

**統合ポイント**:
- subagents.ts で実行結果の共有
- agent-teams.ts でメンバー間のコンテキスト伝達
- loop.ts でイテレーション間の状態継承

#### 2.2 task-decomposer.ts (plan.ts拡張)

**目的**: タスクの自動階層分解とサブエージェント割り当て

**実装計画**:
```typescript
// .pi/extensions/task-decomposer.ts
interface DecompositionResult {
  originalTask: string;
  subtasks: Array<{
    id: string;
    title: string;
    description: string;
    agentId: string;
    estimatedComplexity: number;
    dependencies: string[];
  }>;
  suggestedPlanId?: string;
}
```

**期待効果**:
- タスク自動分解で自走力向上
- 適切なエージェント選択の自動化

### フェーズ3: 中〜低優先度（1-2週間）

#### 3.1 security-audit.ts

**目的**: 実行コマンドとファイル操作の安全性検証

**実装計画**:
```typescript
// .pi/extensions/security-audit.ts
interface SecurityCheck {
  tool: string;
  operation: string;
  risk: "low" | "medium" | "high" | "critical";
  issues: string[];
  suggestions: string[];
}

function auditBashCommand(command: string): SecurityCheck
```

#### 3.2 smart-scheduler.ts (agent-runtime.ts拡張)

**目的**: 容量制御と動的スケジューリングの統合

**注意点**: 既存の`checkRuntimeCapacity()`と競合しないよう、プラグイン機構で統合

```typescript
// agent-runtime.ts に追加
interface SchedulerPlugin {
  name: string;
  priority(input: TaskSchedulingInput): number;
  schedule(input: TaskSchedulingInput): SchedulingDecision;
}

export function registerSchedulerPlugin(plugin: SchedulerPlugin): void
```

#### 3.3 learning-extension.ts

**目的**: 実行履歴からのパターン学習と推奨

**実装計画**:
```typescript
// .pi/extensions/learning-extension.ts
interface LearningEntry {
  taskId: string;
  taskPreview: string;
  agentId: string;
  outcome: "success" | "partial" | "failure";
  latencyMs: number;
  timestamp: string;
  features: {
    taskLength: number;
    complexity: number;
    contextSize: number;
  };
}

function recommendAgentForTask(task: string): string
```

**期待効果**:
- 学習パターン蓄積 > 100
- エージェント選択推奨精度 > 70%

## 成功指標

### 性能指標

| 指標 | 現状 | 目標 | 測定方法 |
|------|------|------|---------|
| キャッシュヒット率 | 0% | >30% | キャッシュ統計 |
| 平均実行時間 | 基準 | -20% | 実行履歴比較 |
| 同時実行効率 | 基準 | +15% | スケジューラ統計 |
| チェックポイント復元時間 | N/A | <5秒 | 計測 |

### 自走力指標

| 指標 | 現状 | 目標 | 測定方法 |
|------|------|------|---------|
| 学習パターン蓄積数 | 0 | >100 | learning-extension |
| 推奨精度 | N/A | >70% | 推奨成功率 |
| セキュリティ違反検出率 | N/A | >90% | security-audit |
| 人間介入回数 | 基準 | -30% | セッションログ |

## リスクと緩和策

| リスク | 影響 | 緩和策 |
|-------|------|--------|
| agent-runtime.ts変更の破壊的影響 | 高 | 既存状態を維持、フラグで段階的導入 |
| キャッシュによる古い結果の使用 | 中 | TTL設定、バージョン管理 |
| スケジューリングの複雑化によるバグ | 中 | 既存FIFOフォールバック維持 |
| 学習データの肥大化 | 低 | データサイズ制限、圧縮 |

## ドキュメント戦略

### Runbook標準化（docs/06-runbooks/）

各新機能に対して標準化されたRunbookを作成：
- 01-agent-context-bridge.md
- 02-task-decomposer.md
- 03-task-cache.md
- 04-checkpoint.md
- 05-security-audit.md
- 06-learning-extension.md

### 統合ガイド

- docs/02-user-guide/12-advanced-orchestration.md - 機能統合パターン
- docs/04-reference/04-extension-relations.md - 拡張機能関係図

## 次のステップ

1. フェーズ1の実装開始
   - agent-runtime.ts拡張
   - task-cache.ts / result-cache.ts実装
   - loop.tsチェックポイント追加

2. ドキュメント作成
   - Runbookテンプレート作成
   - 機能統合ガイド作成

3. 統合テスト
   - 既存機能との互換性確認
   - 性能指標の測定

## 参考情報

- 議論実行履歴: `.pi/agent-teams/runs/`
- サブエージェント実行履歴: `.pi/subagents/runs/`
- 既存ドキュメント: `docs/`
