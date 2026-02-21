---
title: agent-runtime.ts 分割設計書
category: architecture
audience: developer
last_updated: 2026-02-21
tags: [refactoring, architecture, agent-runtime]
related: [.pi/extensions/agent-runtime.ts]
---

## 概要

`.pi/extensions/agent-runtime.ts`（2669行、51エクスポート）の分割設計書。
現在のファイル構造を分析し、保守性を向上させるためのモジュール分割案を提示する。

## 現状分析

### ファイル情報

| 項目 | 値 |
|------|-----|
| 行数 | 2669 |
| エクスポート数 | 51 |
| 主要責務 | エージェント実行のランタイム状態管理、容量制御、キューイング |

### 現在の構造

```
agent-runtime.ts (2669行)
├── 型定義セクション (108-540行)
│   ├── AgentRuntimeLimits
│   ├── RuntimeStateProvider
│   ├── AgentRuntimeSnapshot
│   ├── RuntimeCapacityCheck系列
│   ├── RuntimeOrchestration系列
│   └── RuntimeDispatch系列
├── 内部ユーティリティ (572-626行)
│   ├── getRuntimeInstanceToken
│   ├── logRuntimeQueueDebug
│   └── runtimeNow
├── ランタイム状態管理 (626-951行)
│   ├── createRuntimeLimits
│   ├── ensureReservationSweeper
│   ├── createInitialRuntimeState
│   └── getSharedRuntimeState
└── パブリックAPI (951-2669行)
    ├── getRuntimeSnapshot
    ├── formatRuntimeStatusLine
    ├── キュー管理関数
    └── 容量待機・予約関数
```

### 課題

1. **単一ファイルの肥大化**: 2669行は可読性・保守性の観点から分割が望ましい
2. **責務の混在**: 型定義、状態管理、パブリックAPIが混在
3. **テストの困難さ**: モジュール単位でのテストが困難
4. **循環依存リスク**: 単一ファイル内での依存関係が複雑化

## 提案する分割後のモジュール構成

### ディレクトリ構造

```
.pi/extensions/agent-runtime/
├── index.ts              # パブリックAPI再エクスポート
├── types.ts              # 型定義
├── state.ts              # ランタイム状態管理
├── capacity.ts           # 容量制御
├── queue.ts              # キューイング
├── reservation.ts        # 予約管理
├── utils.ts              # 内部ユーティリティ
└── snapshot.ts           # スナップショット生成
```

### 各モジュールの責任範囲

#### 1. types.ts（型定義モジュール）

**責務**: すべてのパブリック型定義を一元管理

**含める型**:
- `AgentRuntimeLimits`
- `RuntimeStateProvider`
- `AgentRuntimeSnapshot`
- `RuntimeCapacityCheck` 系列
- `RuntimeOrchestration` 系列
- `RuntimeDispatch` 系列
- `RuntimeQueueClass`
- `TaskPriority`

**依存**: なし（純粋な型定義）

#### 2. state.ts（状態管理モジュール）

**責務**: ランタイム状態の作成・取得・更新

**含める関数**:
- `createInitialRuntimeState()`
- `getSharedRuntimeState()`
- `ensureRuntimeStateShape()`
- `sanitizeRuntimeLimits()`
- `enforceRuntimeLimitConsistency()`

**依存**: `types.ts`, `utils.ts`

#### 3. capacity.ts（容量制御モジュール）

**責務**: 容量チェック・待機・通知

**含める関数**:
- `checkRuntimeCapacity()`
- `waitForRuntimeCapacity()`
- `reserveRuntimeCapacity()`
- `notifyRuntimeCapacityChanged()`
- `getClusterUsageSafe()`

**依存**: `types.ts`, `state.ts`, `utils.ts`

#### 4. queue.ts（キューモジュール）

**責務**: タスクキューの管理

**含める関数**:
- `createRuntimeQueueEntryId()`
- `sortQueueByPriority()`
- `trimPendingQueueToLimit()`
- `getQueueClassRank()`
- `getPriorityRank()`
- `removeQueuedEntry()`

**依存**: `types.ts`, `state.ts`, `utils.ts`

#### 5. reservation.ts（予約モジュール）

**責務**: リソース予約のライフサイクル管理

**含める関数**:
- `createRuntimeReservationId()`
- `cleanupExpiredReservations()`
- `updateReservationHeartbeat()`
- `releaseReservation()`
- `consumeReservation()`
- `ensureReservationSweeper()`
- `stopRuntimeReservationSweeper()`

**依存**: `types.ts`, `state.ts`, `utils.ts`

#### 6. utils.ts（ユーティリティモジュール）

**責務**: 内部共通ユーティリティ

**含める関数**:
- `getRuntimeInstanceToken()`
- `logRuntimeQueueDebug()`
- `runtimeNow()`
- `setRuntimeNowProvider()`
- `getDefaultReservationTtlMs()`
- `normalizePositiveInt()`
- `normalizeReservationTtlMs()`
- `resolveLimitFromEnv()`
- `getLocalRuntimeUsage()`
- `publishRuntimeUsageToCoordinator()`

**依存**: なし

#### 7. snapshot.ts（スナップショットモジュール）

**責務**: ランタイム状態のスナップショット生成

**含める関数**:
- `getRuntimeSnapshot()`
- `formatRuntimeStatusLine()`

**依存**: `types.ts`, `state.ts`

#### 8. index.ts（エントリーポイント）

**責務**: パブリックAPIの再エクスポート

```typescript
// 型の再エクスポート
export type {
  AgentRuntimeLimits,
  RuntimeStateProvider,
  AgentRuntimeSnapshot,
  // ... 他の型
} from "./types.js";

// 関数の再エクスポート
export {
  getRuntimeSnapshot,
  formatRuntimeStatusLine,
} from "./snapshot.js";

export {
  checkRuntimeCapacity,
  waitForRuntimeCapacity,
  // ... 他の関数
} from "./capacity.js";

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
    │snapshot.ts│   │capacity.ts│  │queue.ts  │   │reservation.ts│
    └──────────┘   └──────────┘   └──────────┘   └──────────┘
          │              │              │              │
          └──────────────┴──────────────┴──────────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ state.ts │
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ utils.ts │
                   └──────────┘
                         │
                         ▼
                   ┌──────────┐
                   │ types.ts │
                   └──────────┘
```

### 依存関係ルール

1. **types.ts**: どのモジュールからも依存可能（純粋な型定義）
2. **utils.ts**: types.ts以外から依存しない
3. **state.ts**: utils.ts, types.tsに依存
4. **他モジュール**: state.ts, utils.ts, types.tsに依存
5. **index.ts**: すべてのモジュールに依存（再エクスポートのみ）

## 移行計画

### フェーズ1: 型定義の分離（低リスク）

1. `types.ts`を作成
2. 型定義を移動
3. インポートを更新

### フェーズ2: ユーティリティの分離（低リスク）

1. `utils.ts`を作成
2. 内部関数を移動
3. インポートを更新

### フェーズ3: 状態管理の分離（中リスク）

1. `state.ts`を作成
2. 状態管理関数を移動
3. グローバル状態の移行

### フェーズ4: 機能モジュールの分離（中リスク）

1. `capacity.ts`, `queue.ts`, `reservation.ts`を作成
2. 各機能を移動
3. テストを更新

### フェーズ5: スナップショットの分離（低リスク）

1. `snapshot.ts`を作成
2. スナップショット関数を移動

### フェーズ6: エントリーポイントの作成

1. `index.ts`を作成
2. 再エクスポートを設定
3. 外部インポートを更新

## リスク評価

| リスク | 影響度 | 対策 |
|--------|--------|------|
| 循環依存の発生 | 高 | 依存関係ルールの厳守、循環依存検出ツールの導入 |
| テストの破損 | 中 | 各フェーズでテストを実行 |
| パフォーマンス劣化 | 低 | モジュール境界の最小化 |
| 後方互換性の喪失 | 高 | index.tsでの再エクスポート維持 |

## 成功基準

1. **可読性**: 各ファイルが500行以下
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
