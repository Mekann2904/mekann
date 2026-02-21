---
title: cross-instance-coordinator.ts 分割設計書
category: architecture
audience: developer
last_updated: 2026-02-21
tags: [refactoring, architecture, cross-instance-coordinator]
related: [.pi/lib/cross-instance-coordinator.ts]
---

## 概要

`.pi/lib/cross-instance-coordinator.ts`（1698行、45公開API）の分割設計書。
現在のファイル構造を分析し、保守性を向上させるためのモジュール分割案を提示する。

## 現状分析

### ファイル情報

| 項目 | 値 |
|------|-----|
| 行数 | 1698 |
| 公開API数 | 45 |
| 主要責務 | 複数PIインスタンス間のLLM並列実行数調整、ワークスティーリング、分散ロック管理 |

### 現在の構造

```
cross-instance-coordinator.ts (1698行)
├── 型定義セクション (61-110行)
│   ├── ActiveModelInfo
│   ├── InstanceInfo
│   ├── CoordinatorConfig
│   └── CoordinatorInternalState
├── 定数とグローバル状態 (117-156行)
│   ├── DEFAULT_CONFIG
│   ├── COORDINATOR_DIR, INSTANCES_DIR, CONFIG_FILE
│   └── state, coordinatorNowProvider
├── 内部ユーティリティ (156-340行)
│   ├── ensureDirs()
│   ├── logCoordinatorDebug()
│   ├── writeTextFileAtomic()
│   ├── writeJsonFileAtomic()
│   ├── patchMyInstanceInfo()
│   ├── generateInstanceId()
│   ├── parseLockFile()
│   ├── isProcessAlive()
│   ├── isInstanceAlive()
│   └── loadConfig()
├── インスタンス管理API (341-530行)
│   ├── registerInstance()
│   ├── unregisterInstance()
│   ├── updateHeartbeat()
│   ├── cleanupDeadInstances()
│   ├── getActiveInstanceCount()
│   └── getActiveInstances()
├── 並列度制御API (534-650行)
│   ├── getMyParallelLimit()
│   ├── getContendingInstanceCount()
│   └── getDynamicParallelLimit()
├── ワークスティーリングAPI (630-800行)
│   ├── shouldAttemptWorkStealing()
│   ├── getWorkStealingCandidates()
│   ├── updateWorkloadInfo()
│   └── getClusterRuntimeUsage()
├── モデル管理API (851-1035行)
│   ├── setActiveModel()
│   ├── clearActiveModel()
│   ├── getActiveInstancesForModel()
│   └── getModelParallelLimit()
├── キューブロードキャストAPI (1036-1310行)
│   ├── StealableQueueEntry
│   ├── BroadcastQueueState
│   ├── broadcastQueueState()
│   ├── getRemoteQueueStates()
│   └── stealWork()
├── 分散ロックAPI (1309-1510行)
│   ├── DistributedLock
│   ├── tryAcquireLock()
│   ├── acquireDistributedLock()
│   └── releaseLock()
└── スティーリング統計API (1477-1698行)
    ├── StealingStats
    ├── isIdle()
    ├── findStealCandidate()
    ├── safeStealWork()
    └── getStealingStats()
```

### 課題

1. **単一ファイルの肥大化**: 1698行は可読性・保守性の観点から分割が望ましい
2. **責務の混在**: インスタンス管理、並列度制御、ワークスティーリング、分散ロックが混在
3. **テストの困難さ**: モジュール単位でのテストが困難
4. **循環依存リスク**: 単一ファイル内での依存関係が複雑化

## 提案する分割後のモジュール構成

### ディレクトリ構造

```
.pi/lib/cross-instance-coordinator/
├── index.ts              # パブリックAPI再エクスポート
├── types.ts              # 型定義
├── constants.ts          # 定数とパス設定
├── utils.ts              # 内部ユーティリティ
├── instance-manager.ts   # インスタンス管理
├── parallelism.ts        # 並列度制御
├── work-stealing.ts      # ワークスティーリング
├── model-manager.ts      # モデル管理
├── queue-broadcast.ts    # キューブロードキャスト
├── distributed-lock.ts   # 分散ロック
└── stealing-stats.ts     # スティーリング統計
```

### 各モジュールの責任範囲

#### 1. types.ts（型定義モジュール）

**責務**: すべてのパブリック型定義を一元管理

**含める型**:
- `ActiveModelInfo`
- `InstanceInfo`
- `CoordinatorConfig`
- `CoordinatorInternalState`
- `StealableQueueEntry`
- `BroadcastQueueState`
- `DistributedLock`
- `StealingStats`

**依存**: なし（純粋な型定義）

#### 2. constants.ts（定数モジュール）

**責務**: 定数とパス設定の管理

**含める定数**:
- `DEFAULT_CONFIG`
- `COORDINATOR_DIR`
- `INSTANCES_DIR`
- `CONFIG_FILE`
- `resolveCoordinatorRuntimeDir()`

**依存**: なし

#### 3. utils.ts（ユーティリティモジュール）

**責務**: 内部共通ユーティリティ

**含める関数**:
- `currentTimeMs()`
- `setCoordinatorNowProvider()`
- `ensureDirs()`
- `logCoordinatorDebug()`
- `writeTextFileAtomic()`
- `writeJsonFileAtomic()`
- `getMyLockFilePath()`
- `createDefaultMyInstanceInfo()`
- `patchMyInstanceInfo()`
- `generateInstanceId()`
- `parseLockFile()`
- `isProcessAlive()`
- `shouldCheckProcessLiveness()`
- `isInstanceAlive()`
- `loadConfig()`

**依存**: `types.ts`, `constants.ts`

#### 4. instance-manager.ts（インスタンス管理モジュール）

**責務**: インスタンスの登録・削除・ハートビート管理

**含める関数**:
- `registerInstance()`
- `unregisterInstance()`
- `updateHeartbeat()`
- `cleanupDeadInstances()`
- `getActiveInstanceCount()`
- `getActiveInstances()`
- `isCoordinatorInitialized()`
- `getCoordinatorStatus()`
- `getTotalMaxLlm()`
- `getEnvOverrides()`

**依存**: `types.ts`, `constants.ts`, `utils.ts`

#### 5. parallelism.ts（並列度制御モジュール）

**責務**: 動的並列度の計算と制御

**含める関数**:
- `getMyParallelLimit()`
- `getContendingInstanceCount()`
- `getDynamicParallelLimit()`
- `isContendingInstance()`（内部関数）

**依存**: `types.ts`, `instance-manager.ts`

#### 6. work-stealing.ts（ワークスティーリングモジュール）

**責務**: ワークスティーリングの実行と管理

**含める関数**:
- `shouldAttemptWorkStealing()`
- `getWorkStealingCandidates()`
- `updateWorkloadInfo()`
- `updateRuntimeUsage()`
- `getClusterRuntimeUsage()`
- `checkRemoteCapacity()`
- `stealWork()`
- `cleanupQueueStates()`

**依存**: `types.ts`, `instance-manager.ts`, `utils.ts`

#### 7. model-manager.ts（モデル管理モジュール）

**責務**: アクティブモデルの管理

**含める関数**:
- `setActiveModel()`
- `clearActiveModel()`
- `clearAllActiveModels()`
- `getActiveInstancesForModel()`
- `getModelParallelLimit()`
- `getModelUsageSummary()`
- `matchesModelPattern()`（内部関数）

**依存**: `types.ts`, `instance-manager.ts`, `utils.ts`

#### 8. queue-broadcast.ts（キューブロードキャストモジュール）

**責務**: キュー状態のブロードキャストと取得

**含める関数**:
- `broadcastQueueState()`
- `getRemoteQueueStates()`
- `ensureQueueStateDir()`

**依存**: `types.ts`, `constants.ts`, `utils.ts`

#### 9. distributed-lock.ts（分散ロックモジュール）

**責務**: 分散ロックの取得と解放

**含める関数**:
- `tryAcquireLock()`
- `tryCleanupExpiredLock()`
- `acquireDistributedLock()`
- `releaseLock()`
- `cleanupExpiredLocks()`
- `ensureLockDir()`

**依存**: `types.ts`, `constants.ts`, `utils.ts`

#### 10. stealing-stats.ts（スティーリング統計モジュール）

**責務**: スティーリング統計の管理

**含める関数**:
- `isIdle()`
- `findStealCandidate()`
- `safeStealWork()`
- `getStealingStats()`
- `resetStealingStats()`
- `enhancedHeartbeat()`

**依存**: `types.ts`, `instance-manager.ts`, `distributed-lock.ts`

#### 11. index.ts（エントリーポイント）

**責務**: パブリックAPIの再エクスポート

```typescript
// 型の再エクスポート
export type {
  ActiveModelInfo,
  InstanceInfo,
  CoordinatorConfig,
  StealableQueueEntry,
  BroadcastQueueState,
  StealingStats,
} from "./types.js";

// インスタンス管理
export {
  registerInstance,
  unregisterInstance,
  updateHeartbeat,
  cleanupDeadInstances,
  getActiveInstanceCount,
  getActiveInstances,
  isCoordinatorInitialized,
  getCoordinatorStatus,
} from "./instance-manager.js";

// 並列度制御
export {
  getMyParallelLimit,
  getContendingInstanceCount,
  getDynamicParallelLimit,
} from "./parallelism.js";

// ... 他のモジュールから
```

## インターフェース定義

### モジュール間インターフェース

```
┌─────────────────────────────────────────────────────────────┐
│                       index.ts (Public API)                 │
└─────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │instance- │   │parallel- │   │work-     │   │model-    │
    │manager.ts│   │ism.ts    │   │stealing.ts│  │manager.ts│
    └──────────┘   └──────────┘   └──────────┘   └──────────┘
          │              │              │              │
          └──────────────┴──────────────┴──────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │queue-    │   │distributed│  │stealing- │
    │broadcast │   │-lock.ts   │  │stats.ts  │
    └──────────┘   └──────────┘   └──────────┘
          │              │              │
          └──────────────┴──────────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ utils.ts │
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │constants.ts│
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ types.ts │
                   └──────────┘
```

### 依存関係ルール

1. **types.ts**: どのモジュールからも依存可能（純粋な型定義）
2. **constants.ts**: types.ts以外から依存しない
3. **utils.ts**: constants.ts, types.tsに依存
4. **instance-manager.ts**: utils.ts, constants.ts, types.tsに依存
5. **他モジュール**: instance-manager.ts, utils.ts, constants.ts, types.tsに依存
6. **index.ts**: すべてのモジュールに依存（再エクスポートのみ）

## 移行計画

### フェーズ1: 型定義の分離（低リスク）

1. `types.ts`を作成
2. 型定義を移動
3. インポートを更新

### フェーズ2: 定数とユーティリティの分離（低リスク）

1. `constants.ts`と`utils.ts`を作成
2. 定数と内部関数を移動
3. インポートを更新

### フェーズ3: インスタンス管理の分離（中リスク）

1. `instance-manager.ts`を作成
2. インスタンス管理関数を移動
3. グローバル状態の移行

### フェーズ4: 機能モジュールの分離（中リスク）

1. `parallelism.ts`, `work-stealing.ts`, `model-manager.ts`を作成
2. 各機能を移動
3. テストを更新

### フェーズ5: 補助モジュールの分離（低リスク）

1. `queue-broadcast.ts`, `distributed-lock.ts`, `stealing-stats.ts`を作成
2. 補助機能を移動

### フェーズ6: エントリーポイントの作成

1. `index.ts`を作成
2. 再エクスポートを設定
3. 外部インポートを更新

## リスク評価

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 循環依存の発生 | 高 | 依存関係ルールの厳守、循環依存検出ツールの導入 |
| グローバル状態の競合 | 高 | state変数の移行を慎重に行う、シングルトンパターンの維持 |
| テストの破損 | 中 | 各フェーズでテストを実行 |
| パフォーマンス劣化 | 低 | モジュール境界の最小化 |
| 後方互換性の喪失 | 高 | index.tsでの再エクスポート維持 |

## 成功基準

1. **可読性**: 各ファイルが300行以下
2. **凝集度**: 各モジュールが単一責務を持つ
3. **結合度**: モジュール間の依存が一方向
4. **テスト容易性**: モジュール単体でテスト可能
5. **後方互換性**: 既存のインポートが動作継続

## 次のステップ

1. チームレビューで設計の合意形成
2. フェーズ1から順次実装
3. 各フェーズでTypeScriptコンパイルとテストを実行
4. 全フェーズ完了後に統合テスト実施

## 参考資料

- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID原則](https://en.wikipedia.org/wiki/SOLID)
