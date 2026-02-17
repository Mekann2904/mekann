---
title: agent-runtime
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, extensions]
---

# agent-runtime

## 概要

サブエージェントとエージェントチーム間でランタイムカウンターを共有し、アクティブなLLMワーカーとリクエストの一貫したリアルタイムビューを維持する。

## エクスポート

### インターフェース

#### AgentRuntimeLimits

```typescript
interface AgentRuntimeLimits {
  maxTotalActiveLlm: number;
  maxTotalActiveRequests: number;
  maxParallelSubagentsPerRun: number;
  maxParallelTeamsPerRun: number;
  maxParallelTeammatesPerTeam: number;
  maxConcurrentOrchestrations: number;
  capacityWaitMs: number;
  capacityPollMs: number;
}
```

ランタイムの制限値を定義。

#### AgentRuntimeSnapshot

```typescript
interface AgentRuntimeSnapshot {
  subagentActiveRequests: number;
  subagentActiveAgents: number;
  teamActiveRuns: number;
  teamActiveAgents: number;
  reservedRequests: number;
  reservedLlm: number;
  activeReservations: number;
  activeOrchestrations: number;
  queuedOrchestrations: number;
  queuedTools: string[];
  totalActiveRequests: number;
  totalActiveLlm: number;
  limits: AgentRuntimeLimits;
  limitsVersion: string;
  priorityStats?: {
    critical: number;
    high: number;
    normal: number;
    low: number;
    background: number;
  };
}
```

ランタイムのスナップショット情報。

#### RuntimeCapacityCheck

```typescript
interface RuntimeCapacityCheck {
  allowed: boolean;
  reasons: string[];
  projectedRequests: number;
  projectedLlm: number;
  snapshot: AgentRuntimeSnapshot;
}
```

キャパシティチェック結果。

#### RuntimeCapacityReservationLease

```typescript
interface RuntimeCapacityReservationLease {
  id: string;
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
  expiresAtMs: number;
  consume: () => void;
  heartbeat: (ttlMs?: number) => void;
  release: () => void;
}
```

キャパシティ予約リース。

#### RuntimeStateProvider

```typescript
interface RuntimeStateProvider {
  getState(): AgentRuntimeState;
  resetState(): void;
}
```

DIP準拠の状態プロバイダーインターフェース。

### 関数

#### getSharedRuntimeState

```typescript
export function getSharedRuntimeState(): AgentRuntimeState
```

共有ランタイム状態を取得する。

#### getRuntimeSnapshot

```typescript
export function getRuntimeSnapshot(): AgentRuntimeSnapshot
```

現在のランタイムスナップショットを取得する。

#### formatRuntimeStatusLine

```typescript
export function formatRuntimeStatusLine(options?: RuntimeStatusLineOptions): string
```

ランタイムステータスをフォーマットして返す。

#### checkRuntimeCapacity

```typescript
export function checkRuntimeCapacity(input: RuntimeCapacityCheckInput): RuntimeCapacityCheck
```

ランタイムキャパシティをチェックする。

#### waitForRuntimeCapacity

```typescript
export async function waitForRuntimeCapacity(
  input: RuntimeCapacityWaitInput
): Promise<RuntimeCapacityWaitResult>
```

キャパシティが利用可能になるまで待機する。

#### tryReserveRuntimeCapacity

```typescript
export function tryReserveRuntimeCapacity(
  input: RuntimeCapacityReserveInput
): RuntimeCapacityCheck & { reservation?: RuntimeCapacityReservationLease }
```

キャパシティの予約を試行する。

#### reserveRuntimeCapacity

```typescript
export async function reserveRuntimeCapacity(
  input: RuntimeCapacityReserveInput
): Promise<RuntimeCapacityReserveResult>
```

キャパシティを予約する（待機付き）。

#### waitForRuntimeOrchestrationTurn

```typescript
export async function waitForRuntimeOrchestrationTurn(
  input: RuntimeOrchestrationWaitInput
): Promise<RuntimeOrchestrationWaitResult>
```

オーケストレーションのターンを待機する。

#### resetRuntimeTransientState

```typescript
export function resetRuntimeTransientState(): void
```

一時的なランタイム状態をリセットする。

#### notifyRuntimeCapacityChanged

```typescript
export function notifyRuntimeCapacityChanged(): void
```

キャパシティ変更を通知する。

#### setRuntimeStateProvider

```typescript
export function setRuntimeStateProvider(provider: RuntimeStateProvider): void
```

ランタイム状態プロバイダーを設定する（テスト用）。

#### getModelAwareParallelLimit

```typescript
export function getModelAwareParallelLimit(provider: string, model: string): number
```

モデル固有の並列制限を取得する。

#### shouldAllowParallelForModel

```typescript
export function shouldAllowParallelForModel(
  provider: string,
  model: string,
  currentActive: number
): boolean
```

モデルの並列操作を許可するかチェックする。

#### getLimitsSummary

```typescript
export function getLimitsSummary(provider?: string, model?: string): string
```

現在の制限のサマリーを取得する。

## 使用例

```typescript
// キャパシティチェック
const check = checkRuntimeCapacity({
  additionalRequests: 2,
  additionalLlm: 1
});

if (check.allowed) {
  // 処理を実行
} else {
  console.log("理由:", check.reasons);
}

// キャパシティ予約
const result = await reserveRuntimeCapacity({
  additionalRequests: 1,
  additionalLlm: 1,
  maxWaitMs: 30000
});

if (result.reservation) {
  // リースを使用
  result.reservation.heartbeat();
  // 処理完了後
  result.reservation.release();
}
```

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| PI_USE_SCHEDULER | スケジューラーベースのキャパシティ管理を使用 | false |
| PI_AGENT_MAX_TOTAL_LLM | 最大アクティブLLM数 | 8 (安定版: 4) |
| PI_AGENT_MAX_TOTAL_REQUESTS | 最大アクティブリクエスト数 | 6 (安定版: 2) |
| PI_AGENT_MAX_PARALLEL_SUBAGENTS | 並列サブエージェント数 | 4 (安定版: 2) |
| PI_AGENT_MAX_PARALLEL_TEAMS | 並列チーム数 | 3 (安定版: 1) |
| STABLE_RUNTIME_PROFILE | 安定版プロファイルを使用 | - |

## 関連

- `.pi/extensions/subagents.ts`
- `.pi/extensions/agent-teams.ts`
- `.pi/lib/adaptive-rate-controller.ts`
- `.pi/lib/cross-instance-coordinator.ts`
