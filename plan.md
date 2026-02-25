# 実装計画: 潜在的バグ修正

## 目的

research.mdで特定された47件の問題のうち、高優先度12件を中心に現実的に修正可能な範囲で計画を策定する。主に以下に対応する：

1. サイレントエラー無視（12箇所）へのログ追加
2. シングルトン初期化競合状態の修正
3. any型の適切なインターフェース定義
4. 配列境界チェックの追加

## 修正対象一覧

| 優先度 | ファイル | 問題 | 影響 |
|--------|---------|------|------|
| High | `.pi/lib/cross-instance-coordinator.ts` | サイレントエラー無視 (5箇所) | デバッグ不可能 |
| High | `.pi/lib/storage-lock.ts` | サイレントエラー無視 (4箇所) | デッドロック検知不能 |
| High | `.pi/extensions/agent-runtime.ts` | シングルトン初期化競合 | 状態不整合 |
| High | `.pi/lib/checkpoint-manager.ts` | シングルトン初期化競合 | メモリリーク |
| High | `.pi/lib/checkpoint-manager.ts` | LRUキャッシュメモリリーク | メモリ枯渇 |
| High | `.pi/extensions/cross-instance-runtime.ts` | any型使用 (4箇所) | 型安全性喪失 |
| Medium | `.pi/lib/task-scheduler.ts` | 配列境界チェック不足 | 誤削除 |
| Medium | `.pi/lib/adaptive-rate-controller.ts` | サイレントエラー無視 | 設定エラー隠蔽 |
| Medium | `.pi/lib/provider-limits.ts` | サイレントエラー無視 | レート制限誤動作 |
| Medium | `.pi/extensions/ul-dual-mode.ts` | any型使用 (3箇所) | 型安全性喪失 |
| Medium | `.pi/lib/dynamic-tools/registry.ts` | 動的コード実行セキュリティ | 任意コード実行リスク |
| Low | `.pi/lib/error-utils.ts` | 循環参照シリアライズ | エラー情報欠損 |

## 手順

### 1. サイレントエラー無視の修正（ログ追加）

#### 1.1 cross-instance-coordinator.ts (5箇所)

##### 1.1.1 Line 204
- ファイル: `.pi/lib/cross-instance-coordinator.ts`
- 行番号: 204
- 修正前コード:
```typescript
} catch {
  // ignore cleanup failures
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[cross-instance-coordinator] Cleanup failed: ${errorMessage}`);
}
```
- 説明: クリーンアップ失敗をログ出力し、デバッグ可能にする

##### 1.1.2 Line 329
- ファイル: `.pi/lib/cross-instance-coordinator.ts`
- 行番号: 329
- 修正前コード:
```typescript
} catch {
  // ignore cleanup failures
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[cross-instance-coordinator] Session cleanup failed: ${errorMessage}`);
}
```
- 説明: セッションクリーンアップ失敗をログ出力

##### 1.1.3 Line 424
- ファイル: `.pi/lib/cross-instance-coordinator.ts`
- 行番号: 424
- 修正前コード:
```typescript
} catch {
  // ignore cleanup failures
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[cross-instance-coordinator] Coordinator cleanup failed: ${errorMessage}`);
}
```
- 説明: コーディネータクリーンアップ失敗をログ出力

##### 1.1.4 Line 463
- ファイル: `.pi/lib/cross-instance-coordinator.ts`
- 行番号: 463
- 修正前コード:
```typescript
} catch {
  // ignore cleanup failures
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[cross-instance-coordinator] Lock release failed: ${errorMessage}`);
}
```
- 説明: ロック解放失敗をログ出力

##### 1.1.5 Line 477
- ファイル: `.pi/lib/cross-instance-coordinator.ts`
- 行番号: 477
- 修正前コード:
```typescript
} catch {
  // ignore cleanup failures
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[cross-instance-coordinator] Final cleanup failed: ${errorMessage}`);
}
```
- 説明: 最終クリーンアップ失敗をログ出力

#### 1.2 storage-lock.ts (4箇所)

##### 1.2.1 Line 168
- ファイル: `.pi/lib/storage-lock.ts`
- 行番号: 168
- 修正前コード:
```typescript
} catch {
  // noop
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[storage-lock] Lock acquisition failed: ${errorMessage}`);
}
```
- 説明: ロック取得失敗をログ出力（デッドロック検知に重要）

##### 1.2.2 Line 198
- ファイル: `.pi/lib/storage-lock.ts`
- 行番号: 198
- 修正前コード:
```typescript
} catch {
  // noop
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[storage-lock] Lock release failed: ${errorMessage}`);
}
```
- 説明: ロック解放失敗をログ出力

##### 1.2.3 Line 267
- ファイル: `.pi/lib/storage-lock.ts`
- 行番号: 267
- 修正前コード:
```typescript
} catch {
  // noop
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[storage-lock] Stale lock cleanup failed: ${errorMessage}`);
}
```
- 説明: 古いロックのクリーンアップ失敗をログ出力

##### 1.2.4 Line 288
- ファイル: `.pi/lib/storage-lock.ts`
- 行番号: 288
- 修正前コード:
```typescript
} catch {
  // noop
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.debug(`[storage-lock] Lock validation failed: ${errorMessage}`);
}
```
- 説明: ロック検証失敗をログ出力

#### 1.3 その他のサイレントエラー（中優先度）

##### 1.3.1 adaptive-rate-controller.ts
- ファイル: `.pi/lib/adaptive-rate-controller.ts`
- 行番号: 286
- 修正前コード:
```typescript
} catch {
  // ignore
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[adaptive-rate-controller] Rate limit config error: ${errorMessage}`);
}
```
- 説明: レート制限設定エラーを警告として出力

##### 1.3.2 provider-limits.ts
- ファイル: `.pi/lib/provider-limits.ts`
- 行番号: 407
- 修正前コード:
```typescript
} catch {
  // ignore
}
```
- 修正後コード:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[provider-limits] Provider limit detection failed: ${errorMessage}, using fallback`);
}
```
- 説明: プロバイダ制限検出失敗を警告出力、フォールバック使用を明示

---

### 2. シングルトン初期化競合状態の修正

#### 2.1 agent-runtime.ts - GlobalRuntimeStateProvider

- ファイル: `.pi/extensions/agent-runtime.ts`
- 行番号: GlobalRuntimeStateProvider class
- 修正前コード:
```typescript
class GlobalRuntimeStateProvider implements RuntimeStateProvider {
  private initializationInProgress = false;

  getState(): AgentRuntimeState {
    if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      if (this.initializationInProgress) {
        // 短いスピンウェイト（初期化完了を待機）
        let attempts = 0;
        while (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ && attempts < 1000) {
          attempts += 1;
        }
        // 初期化が完了していない場合は新規作成
        if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
          this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = createInitialRuntimeState();
        }
      }
```
- 修正後コード:
```typescript
class GlobalRuntimeStateProvider implements RuntimeStateProvider {
  private initializationPromise: Promise<void> | null = null;
  private initializationLock = false;

  getState(): AgentRuntimeState {
    if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      if (this.initializationLock && this.initializationPromise) {
        // 同期的に待機（既に初期化中の場合は完了を待つ）
        // 注: JavaScriptは単一スレッドなので、実際の競合は発生しないが、
        // 非同期初期化の整合性を保証
        throw new Error("[agent-runtime] Runtime state initialization in progress. Use getStateAsync() instead.");
      }
      this.initializationLock = true;
      try {
        if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
          this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = createInitialRuntimeState();
        }
      } finally {
        this.initializationLock = false;
      }
    }
    return this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__;
  }

  async getStateAsync(): Promise<AgentRuntimeState> {
    if (this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      return this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__!;
    }

    this.initializationPromise = (async () => {
      if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
        this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__ = createInitialRuntimeState();
      }
    })();

    await this.initializationPromise;
    return this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__!;
  }
```
- 説明: スピンウェイトを削除し、Promiseベースの初期化に変更。同期的アクセス時はロックで保護、非同期アクセス時はPromiseで待機。

#### 2.2 agent-runtime.ts - Reservation Sweeper

- ファイル: `.pi/extensions/agent-runtime.ts`
- 行番号: ensureReservationSweeper
- 修正前コード:
```typescript
let runtimeReservationSweeperInitializing = false;

function ensureReservationSweeper(): void {
  if (runtimeReservationSweeper || runtimeReservationSweeperInitializing) return;

  runtimeReservationSweeperInitializing = true;
  try {
    if (runtimeReservationSweeper) return;
    // ... create sweeper
  } finally {
    runtimeReservationSweeperInitializing = false;
  }
}
```
- 修正後コード:
```typescript
let runtimeReservationSweeperInitializing = false;
let runtimeReservationSweeperInitAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

function ensureReservationSweeper(): void {
  if (runtimeReservationSweeper) return;

  if (runtimeReservationSweeperInitializing) {
    runtimeReservationSweeperInitAttempts++;
    if (runtimeReservationSweeperInitAttempts > MAX_INIT_ATTEMPTS) {
      console.warn("[agent-runtime] Reservation sweeper initialization blocked after ${MAX_INIT_ATTEMPTS} attempts");
      runtimeReservationSweeperInitAttempts = 0;
    }
    return;
  }

  runtimeReservationSweeperInitializing = true;
  runtimeReservationSweeperInitAttempts = 0;
  try {
    if (runtimeReservationSweeper) return;
    // ... create sweeper
  } finally {
    runtimeReservationSweeperInitializing = false;
  }
}
```
- 説明: 二重チェックパターンを維持しつつ、初期化試行回数を制限し、無限待機を防止

#### 2.3 checkpoint-manager.ts

- ファイル: `.pi/lib/checkpoint-manager.ts`
- 行番号: initCheckpointManager
- 修正前コード:
```typescript
let managerState: {...} | null = null;

export function initCheckpointManager(configOverrides?: Partial<CheckpointManagerConfig>): void {
  if (managerState?.initialized) {
    return;
  }
  // ... initialization
  managerState = {...};
}
```
- 修正後コード:
```typescript
let managerState: {...} | null = null;
let managerInitializing = false;

export function initCheckpointManager(configOverrides?: Partial<CheckpointManagerConfig>): void {
  if (managerState?.initialized) {
    return;
  }

  if (managerInitializing) {
    console.warn("[checkpoint-manager] Initialization already in progress");
    return;
  }

  managerInitializing = true;
  try {
    if (managerState?.initialized) {
      return;
    }
    // ... initialization
    managerState = {...};
  } finally {
    managerInitializing = false;
  }
}
```
- 説明: 初期化フラグで二重初期化を防止

---

### 3. any型の適切なインターフェース定義

#### 3.1 cross-instance-runtime.ts

- ファイル: `.pi/extensions/cross-instance-runtime.ts`
- 行番号: Multiple
- 修正前コード:
```typescript
const status = (result as any)?.details?.coordinator;
const resolved = (result as any)?.details?.resolved;
const sessionId = (event as any)?.sessionId ?? "unknown";
const eventPayload = event as any;
```
- 修正後コード:
```typescript
// ファイル先頭にインターフェース定義を追加
interface CoordinatorStatus {
  activeInstances: number;
  totalReservations: number;
  oldestSessionAgeMs: number;
}

interface CoordinatorDetails {
  coordinator?: CoordinatorStatus;
  resolved?: boolean;
}

interface CrossInstanceEvent {
  sessionId?: string;
  instanceId?: string;
  type: string;
  timestamp: number;
}

// 使用箇所
const details = result?.details as CoordinatorDetails | undefined;
const status = details?.coordinator;
const resolved = details?.resolved;

const sessionId = (event as CrossInstanceEvent)?.sessionId ?? "unknown";
const eventPayload = event as CrossInstanceEvent;
```
- 説明: 明示的なインターフェース定義により型安全性を確保

#### 3.2 ul-dual-mode.ts

- ファイル: `.pi/extensions/ul-dual-mode.ts`
- 行番号: Helper functions
- 修正前コード:
```typescript
function refreshStatus(ctx: any): void {
function parseToolInput(event: any): Record<string, unknown> | undefined {
function isRecommendedSubagentParallelCall(event: any): boolean {
```
- 修正後コード:
```typescript
// インターフェース定義
interface ExtensionContext {
  cwd: string;
  piDir: string;
  [key: string]: unknown;
}

interface ToolCallEvent {
  toolCallId: string;
  name: string;
  input: Record<string, unknown>;
}

interface SubagentCallEvent extends ToolCallEvent {
  input: {
    subagentId: string;
    task: string;
    parallel?: boolean;
  };
}

// 使用箇所
function refreshStatus(ctx: ExtensionContext): void {
  // ...
}

function parseToolInput(event: unknown): Record<string, unknown> | undefined {
  if (typeof event !== 'object' || event === null) return undefined;
  const e = event as Record<string, unknown>;
  return e.input as Record<string, unknown> | undefined;
}

function isRecommendedSubagentParallelCall(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as SubagentCallEvent;
  return e.name === "subagent_run" && e.input?.parallel === true;
}
```
- 説明: unknown型で受け取り、型ガードを通して安全にキャスト

---

### 4. 配列境界チェックの追加

#### 4.1 task-scheduler.ts

- ファイル: `.pi/lib/task-scheduler.ts`
- 行番号: Queue operations
- 修正前コード:
```typescript
const queueIndex = queue.indexOf(entry);
// ...
queue.splice(queueIndex, 1);
```
- 修正後コード:
```typescript
const queueIndex = queue.indexOf(entry);
if (queueIndex === -1) {
  console.warn(`[task-scheduler] Entry not found in queue, skipping removal`);
  return;
}
queue.splice(queueIndex, 1);
```
- 説明: indexOfが-1を返した場合、splice(-1, 1)が最後の要素を削除してしまう問題を防止

#### 4.2 agent-runtime.ts - trimPendingQueueToLimit

- ファイル: `.pi/extensions/agent-runtime.ts`
- 行番号: trimPendingQueueToLimit
- 修正前コード:
```typescript
function trimPendingQueueToLimit(runtime: AgentRuntimeState): RuntimeQueueEntry | null {
  // ...
  const evicted = pending.splice(evictionIndex, 1)[0];
  if (!evicted) return null;
  // ...
}
```
- 修正後コード:
```typescript
function trimPendingQueueToLimit(runtime: AgentRuntimeState): RuntimeQueueEntry | null {
  // ...
  if (evictionIndex < 0 || evictionIndex >= pending.length) {
    console.warn(`[agent-runtime] Invalid eviction index: ${evictionIndex}, queue length: ${pending.length}`);
    return null;
  }
  const evicted = pending.splice(evictionIndex, 1)[0];
  if (!evicted) return null;
  // ...
}
```
- 説明: 境界チェックを追加し、負のインデックスや範囲外アクセスを防止

---

### 5. LRUキャッシュメモリリーク対策

#### 5.1 checkpoint-manager.ts

- ファイル: `.pi/lib/checkpoint-manager.ts`
- 行番号: Cache management
- 修正前コード:
```typescript
const CACHE_MAX_ENTRIES = 100;

function setToCache(taskId: string, checkpoint: Checkpoint): void {
  // ... add to cache

  // 最大エントリ数を超えた場合、最も古いエントリを削除
  while (managerState.cacheOrder.length > CACHE_MAX_ENTRIES) {
    const oldestKey = managerState.cacheOrder.shift();
    if (oldestKey) {
      managerState.cacheOrder.delete(oldestKey);
    }
  }
}
```
- 修正後コード:
```typescript
const CACHE_MAX_ENTRIES = 100;
const CACHE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function estimateCheckpointSize(checkpoint: Checkpoint): number {
  try {
    return JSON.stringify(checkpoint).length;
  } catch {
    return 1024; // Default estimate if serialization fails
  }
}

function setToCache(taskId: string, checkpoint: Checkpoint): void {
  if (!managerState) return;

  const entrySize = estimateCheckpointSize(checkpoint);

  // Add to cache
  managerState.cache.set(taskId, checkpoint);
  managerState.cacheOrder.push(taskId);
  managerState.cacheSizes.set(taskId, entrySize);

  let totalSize = Array.from(managerState.cacheSizes.values()).reduce((a, b) => a + b, 0);

  // Evict by count
  while (managerState.cacheOrder.length > CACHE_MAX_ENTRIES) {
    const oldestKey = managerState.cacheOrder.shift();
    if (oldestKey) {
      const size = managerState.cacheSizes.get(oldestKey) || 0;
      managerState.cache.delete(oldestKey);
      managerState.cacheSizes.delete(oldestKey);
      totalSize -= size;
    }
  }

  // Evict by size
  while (totalSize > CACHE_MAX_SIZE_BYTES && managerState.cacheOrder.length > 0) {
    const oldestKey = managerState.cacheOrder.shift();
    if (oldestKey) {
      const size = managerState.cacheSizes.get(oldestKey) || 0;
      managerState.cache.delete(oldestKey);
      managerState.cacheSizes.delete(oldestKey);
      totalSize -= size;
    }
  }
}

// Periodic cleanup (add to initCheckpointManager)
function startCacheCleanupTimer(): void {
  if (managerState?.cleanupTimer) {
    clearInterval(managerState.cleanupTimer);
  }

  managerState!.cleanupTimer = setInterval(() => {
    if (!managerState) return;

    const now = Date.now();
    // Remove entries older than 30 minutes
    const maxAge = 30 * 60 * 1000;

    for (const [key, checkpoint] of managerState.cache.entries()) {
      const age = now - (checkpoint.timestamp || 0);
      if (age > maxAge) {
        managerState.cache.delete(key);
        managerState.cacheOrder = managerState.cacheOrder.filter(k => k !== key);
        managerState.cacheSizes.delete(key);
      }
    }
  }, CACHE_CLEANUP_INTERVAL_MS);
}
```
- 説明: エントリ数に加えてサイズベースの削除と、時間ベースの定期クリーンアップを追加

---

## 考慮事項

### パフォーマンス影響
- ログ出力の追加はconsole.debugを使用するため、本番環境では無視される可能性がある
- キャッシュサイズ計算（JSON.stringify）はCPUコストが高い。必要に応じて簡易推定に変更
- 初期化ロックは単一スレッド環境では実質的にオーバーヘッドなし

### 後方互換性
- getStateAsync()の追加は破壊的変更ではない
- インターフェース定義の追加は既存コードに影響しない
- ログ出力の追加は動作に影響しない

### テスト戦略
- 競合状態のテストは困難なため、単体テストでロック機構を検証
- キャッシュテストはモックを使用してサイズ計算を検証
- 境界チェックは単体テストで容易に検証可能

### リスク
- シングルトン初期化の変更は影響範囲が大きい。慎重にテストが必要
- LRUキャッシュの変更はメモリ使用量に影響する。本番環境での監視が必要

---

## Todo

### Phase 1: サイレントエラー修正（低リスク）
- [ ] 1.1 cross-instance-coordinator.ts (5箇所) にログ追加
- [ ] 1.2 storage-lock.ts (4箇所) にログ追加
- [ ] 1.3 adaptive-rate-controller.ts にログ追加
- [ ] 1.4 provider-limits.ts にログ追加
- [ ] 1.5 ログ出力テストを追加

### Phase 2: 配列境界チェック（低リスク）
- [ ] 2.1 task-scheduler.ts に境界チェック追加
- [ ] 2.2 agent-runtime.ts trimPendingQueueToLimit に境界チェック追加
- [ ] 2.3 境界チェックテストを追加

### Phase 3: 型安全性改善（中リスク）
- [ ] 3.1 cross-instance-runtime.ts にインターフェース定義追加
- [ ] 3.2 ul-dual-mode.ts にインターフェース定義追加
- [ ] 3.3 型定義のテストを追加

### Phase 4: シングルトン初期化修正（高リスク）
- [ ] 4.1 agent-runtime.ts GlobalRuntimeStateProvider を修正
- [ ] 4.2 agent-runtime.ts ensureReservationSweeper を修正
- [ ] 4.3 checkpoint-manager.ts initCheckpointManager を修正
- [ ] 4.4 統合テストで初期化競合を検証

### Phase 5: キャッシュ改善（中リスク）
- [ ] 5.1 checkpoint-manager.ts にサイズベース削除追加
- [ ] 5.2 定期クリーンアップタイマー追加
- [ ] 5.3 キャッシュテストを追加
- [ ] 5.4 メモリ使用量の監視を追加

---

## 実行順序の依存関係

```
Phase 1 ──┐
          ├──> Phase 4
Phase 2 ──┤
          │
Phase 3 ──┴──> Phase 5
```

- Phase 1, 2, 3 は並列実行可能（独立している）
- Phase 4 は Phase 1, 2 の完了後に実行（テスト基盤が必要）
- Phase 5 は Phase 3 の完了後に実行（型定義が必要）

---

## 見積もり

| フェーズ | 工数（エージェントラウンド） | リスク |
|---------|---------------------------|--------|
| Phase 1 | 2-3 rounds | 低 |
| Phase 2 | 1-2 rounds | 低 |
| Phase 3 | 2-3 rounds | 中 |
| Phase 4 | 3-4 rounds | 高 |
| Phase 5 | 2-3 rounds | 中 |
| **合計** | **10-15 rounds** | - |

---

## 成功基準

1. すべてのサイレントエラー箇所にログ出力が追加されている
2. シングルトン初期化が競合状態に対して安全である
3. すべてのany型に適切なインターフェースが定義されている
4. 配列境界チェックが追加され、テストが通る
5. 既存のテストがすべて通る
6. 新規テストが追加されている

---

**計画作成日**: 2026-02-25
**作成者**: architect subagent
