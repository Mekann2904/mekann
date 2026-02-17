---
title: Library Index
category: reference
audience: developer
last_updated: 2026-02-18
tags: [index, exports, barrel]
related: [agent, storage]
---

# Library Index

共有ライブラリのインデックス。共通ユーティリティを再エクスポートする。

## 概要

既存のすべてのエクスポートを後方互換性のために維持する。新しいコードでは可能な限りフォーカスされたエントリポイントからのインポートを推奨。

## アーキテクチャレイヤー

| レイヤー | 内容 |
|---------|------|
| Layer 0 | コアユーティリティ（エラー、検証、フォーマット、TUI） |
| Layer 1 | エージェントユーティリティ（型、タイムアウト、ランタイム、ロギング） |
| Layer 2 | 高度ユーティリティ（埋め込み、メモリ、スケジューリング） |
| Layer 3 | 調整（クロスインスタンス、タスクスケジューリング） |

## フォーカスされたエントリポイント

より良いツリーシェイキングと明示的な依存関係のために、以下のエントリポイントの使用を推奨：

- `lib/agent.ts` - エージェント関連の型とユーティリティ
- `lib/storage.ts` - ストレージ関連ユーティリティ

## エクスポート一覧

### Layer 0: コアユーティリティ

#### エラーハンドリング

```typescript
// error-utils.ts
export {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  type PressureErrorType
}

// errors.ts
export {
  PiError,
  RuntimeLimitError,
  RuntimeQueueWaitError,
  SchemaValidationError,
  ValidationError,
  TimeoutError,
  CancelledError,
  RateLimitError,
  CapacityError,
  ParsingError,
  ExecutionError,
  ConfigurationError,
  StorageError,
  isPiError,
  hasErrorCode,
  isRetryableError,
  toPiError,
  getErrorCode,
  isRetryableErrorCode,
  type PiErrorCode,
  type ErrorSeverity,
  type ErrorContext
}
```

#### 検証ユーティリティ

```typescript
// validation-utils.ts
export {
  toFiniteNumber,
  toFiniteNumberWithDefault,
  toBoundedInteger,
  clampInteger,
  clampFloat,
  type BoundedIntegerResult
}
```

#### フォーマットユーティリティ

```typescript
// format-utils.ts
export {
  formatDuration,
  formatDurationMs,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine
}
```

#### TUIユーティリティ

```typescript
// tui-utils.ts
export {
  appendTail,
  toTailLines,
  countOccurrences,
  estimateLineCount,
  looksLikeMarkdown,
  renderPreviewWithMarkdown,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
  type MarkdownPreviewResult
}
```

#### ファイルシステム

```typescript
// fs-utils.ts
export { ensureDir }
```

### Layer 1: エージェントユーティリティ

#### 型定義

```typescript
// team-types.ts, subagent-types.ts, agent-types.ts
export { type TeamLivePhase, type SubagentLiveStreamView, ... }
export { type ThinkingLevel, type RunOutcomeCode, DEFAULT_AGENT_TIMEOUT_MS }
```

#### ユーティリティ

```typescript
// agent-utils.ts
export { createRunId, computeLiveWindow }

// model-timeouts.ts
export {
  MODEL_TIMEOUT_BASE_MS,
  THINKING_LEVEL_MULTIPLIERS,
  getModelBaseTimeoutMs,
  computeModelTimeoutMs,
  computeProgressiveTimeoutMs,
  type ComputeModelTimeoutOptions
}

// live-view-utils.ts
export {
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus
}

// output-validation.ts
export {
  hasNonEmptyResultSection,
  validateSubagentOutput,
  validateTeamMemberOutput,
  type SubagentValidationOptions,
  type TeamMemberValidationOptions
}

// runtime-utils.ts
export {
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  normalizeTimeoutMs,
  createRetrySchema,
  toRetryOverrides,
  toConcurrencyLimit
}

// agent-common.ts
export {
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  ...
}

// agent-errors.ts
export {
  isRetryableEntityError,
  resolveFailureOutcome,
  ...
}

// structured-logger.ts
export {
  StructuredLogger,
  ChildLogger,
  getMinLogLevel,
  createLogger,
  ...
}
```

### Layer 2: 高度ユーティリティ

#### ストレージ

```typescript
// storage-base.ts
export {
  type HasId,
  type BaseRunRecord,
  createPathsFactory,
  mergeEntitiesById,
  ...
}
```

#### ライブモニター

```typescript
// live-monitor-base.ts
export {
  type LiveItemStatus,
  type BaseLiveItem,
  createBaseLiveItem,
  renderLiveViewHeader,
  ...
}
```

#### スキルレジストリ

```typescript
// skill-registry.ts
export {
  type SkillDefinition,
  resolveSkills,
  mergeSkills,
  formatSkillsForPrompt,
  ...
}
```

#### メモリ・インデックス

```typescript
// run-index.ts
export { type IndexedRun, type RunIndex, buildRunIndex, searchRuns, ... }

// pattern-extraction.ts
export { type ExtractedPattern, extractPatternFromRun, ... }

// semantic-memory.ts
export { type RunEmbedding, semanticSearch, ... }

// embeddings/index.ts
export { type EmbeddingProvider, cosineSimilarity, ... }

// semantic-repetition.ts
export { detectSemanticRepetition, TrajectoryTracker, ... }

// intent-aware-limits.ts
export { type TaskIntent, classifyIntent, getIntentBudget, ... }

// dynamic-parallelism.ts
export { DynamicParallelismAdjuster, getParallelismAdjuster, ... }

// checkpoint-manager.ts
export { type Checkpoint, initCheckpointManager, ... }

// metrics-collector.ts
export { type SchedulerMetrics, initMetricsCollector, ... }
```

### Layer 3: 調整

#### タスクスケジューラー

```typescript
// task-scheduler.ts
export {
  type TaskSource,
  type ScheduledTask,
  createTaskId,
  getScheduler,
  PREEMPTION_MATRIX,
  ...
}
```

#### クロスインスタンス調整

```typescript
// cross-instance-coordinator.ts
export {
  type InstanceInfo,
  registerInstance,
  getActiveInstanceCount,
  stealWork,
  ...
}
```

## 便利な再エクスポート

```typescript
// カテゴリ別エントリポイント
export * from "./agent.js";     // エージェント/サブエージェント/チームユーティリティ
export * from "./storage.js";   // ストレージ/メモリ/埋め込みユーティリティ
```

## 使用例

```typescript
// メインエントリポイントから
import { formatDuration, PiError, getSubagentExecutionRules } from "./lib/index.js";

// フォーカスされたエントリポイントから（推奨）
import { type SubagentLiveItem } from "./lib/agent.js";
import { type RunIndex, searchRuns } from "./lib/storage.js";
```

## 関連ファイル

- `./agent.ts` - エージェント関連エクスポート
- `./storage.ts` - ストレージ関連エクスポート
