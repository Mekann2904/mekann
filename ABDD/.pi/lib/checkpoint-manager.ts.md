---
title: checkpoint-manager.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [checkpoint, persistence, recovery, task-scheduler]
related: [task-scheduler.ts, agent-runtime.ts]
---

# checkpoint-manager.ts

長時間実行タスクのチェックポイント管理。TTLベースのクリーンアップを含む。

## 概要

プリエンプションと再開のためのタスク状態永続化と復旧を可能にする。チェックポイントはファイルシステムに保存され、設定可能なTTLで自動クリーンアップされる。

## 型定義

### CheckpointSource

```typescript
type CheckpointSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel"
```

チェックポイント対象タスクのソース種別。`task-scheduler.ts`の`TaskSource`と一致する必要がある。

### CheckpointPriority

```typescript
type CheckpointPriority = "critical" | "high" | "normal" | "low" | "background"
```

チェックポイント順序付け用のタスク優先度。

### Checkpoint

```typescript
interface Checkpoint {
  id: string;
  taskId: string;
  source: CheckpointSource;
  provider: string;
  model: string;
  priority: CheckpointPriority;
  state: unknown;
  progress: number;
  createdAt: number;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}
```

長時間実行タスクのチェックポイント状態。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | `string` | 一意チェックポイントID |
| `taskId` | `string` | 関連タスクID |
| `source` | `CheckpointSource` | 作成ツール |
| `provider` | `string` | プロバイダ名 |
| `model` | `string` | モデル名 |
| `priority` | `CheckpointPriority` | 優先度 |
| `state` | `unknown` | タスク固有状態（JSON） |
| `progress` | `number` | 進捗（0.0〜1.0） |
| `createdAt` | `number` | 作成タイムスタンプ |
| `ttlMs` | `number` | TTL（ミリ秒） |
| `metadata` | `Record?` | オプションのメタデータ |

### CheckpointSaveResult

```typescript
interface CheckpointSaveResult {
  success: boolean;
  checkpointId: string;
  path: string;
  error?: string;
}
```

チェックポイント保存操作の結果。

### PreemptionResult

```typescript
interface PreemptionResult {
  success: boolean;
  checkpointId?: string;
  error?: string;
  resumedFromCheckpoint?: boolean;
}
```

プリエンプション操作の結果。

### CheckpointManagerConfig

```typescript
interface CheckpointManagerConfig {
  checkpointDir: string;
  defaultTtlMs: number;
  maxCheckpoints: number;
  cleanupIntervalMs: number;
}
```

チェックポイントマネージャの設定。

### CheckpointStats

```typescript
interface CheckpointStats {
  totalCount: number;
  totalSizeBytes: number;
  oldestCreatedAt: number | null;
  newestCreatedAt: number | null;
  bySource: Record<CheckpointSource, number>;
  byPriority: Record<CheckpointPriority, number>;
  expiredCount: number;
}
```

チェックポイント統計情報。

## 定数

### DEFAULT_CONFIG

```typescript
const DEFAULT_CONFIG: CheckpointManagerConfig = {
  checkpointDir: ".pi/checkpoints",
  defaultTtlMs: 86_400_000,  // 24 hours
  maxCheckpoints: 100,
  cleanupIntervalMs: 3_600_000,  // 1 hour
}
```

デフォルト設定値。

## 関数

### 初期化

#### initCheckpointManager

チェックポイントマネージャを初期化する。他のチェックポイント操作の前に呼び出す必要がある。

```typescript
function initCheckpointManager(
  configOverrides?: Partial<CheckpointManagerConfig>
): void
```

#### getCheckpointManager

チェックポイントマネージャインスタンスを取得する（必要に応じて初期化）。

```typescript
function getCheckpointManager(): {
  save: (checkpoint: Omit<Checkpoint, "id" | "createdAt"> & { id?: string }) => Promise<CheckpointSaveResult>;
  load: (taskId: string) => Promise<Checkpoint | null>;
  delete: (taskId: string) => Promise<boolean>;
  listExpired: () => Promise<Checkpoint[]>;
  cleanup: () => Promise<number>;
  getStats: () => CheckpointStats;
}
```

#### isCheckpointManagerInitialized

チェックポイントマネージャが初期化されているか確認する。

```typescript
function isCheckpointManagerInitialized(): boolean
```

#### resetCheckpointManager

チェックポイントマネージャの状態をリセットする（テスト用）。

```typescript
function resetCheckpointManager(): void
```

### ユーティリティ

#### getCheckpointDir

チェックポイントディレクトリパスを取得する。

```typescript
function getCheckpointDir(): string
```

#### getCheckpointConfigFromEnv

環境変数からチェックポイントマネージャ設定を取得する。

```typescript
function getCheckpointConfigFromEnv(): Partial<CheckpointManagerConfig>
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `PI_CHECKPOINT_DIR` | チェックポイントディレクトリ |
| `PI_CHECKPOINT_TTL_MS` | デフォルトTTL（ミリ秒） |
| `PI_MAX_CHECKPOINTS` | 最大チェックポイント数 |
| `PI_CHECKPOINT_CLEANUP_MS` | クリーンアップ間隔（ミリ秒） |

## 使用例

```typescript
import {
  initCheckpointManager,
  getCheckpointManager,
} from "./lib/checkpoint-manager.js";

// 初期化
initCheckpointManager({
  checkpointDir: ".pi/checkpoints",
  defaultTtlMs: 86_400_000,
});

const manager = getCheckpointManager();

// 保存
const result = await manager.save({
  taskId: "task-123",
  source: "subagent_run",
  provider: "anthropic",
  model: "claude-sonnet-4",
  priority: "normal",
  state: { step: 5, data: "..." },
  progress: 0.5,
  ttlMs: 86_400_000,
});

// 読み込み
const checkpoint = await manager.load("task-123");

// 統計
const stats = manager.getStats();
console.log(`Total checkpoints: ${stats.totalCount}`);
```

## 関連ファイル

- `.pi/lib/task-scheduler.ts` - タスクスケジューラ
- `.pi/extensions/agent-runtime.ts` - エージェントランタイム
