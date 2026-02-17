---
title: Cross-Instance Coordinator
category: reference
audience: developer
last_updated: 2026-02-18
tags: [coordinator, distributed, parallelism, instances]
related: [task-scheduler, dynamic-parallelism]
---

# Cross-Instance Coordinator

複数のpiインスタンス間でLLM並列処理制限を調整するモジュール。

## 概要

ファイルベースのロックとハートビートを使用してアクティブなインスタンスを検出し、インスタンス間のリソース競合を管理する。

## モジュール構成

このファイルは `./coordinator/index.js` からすべての機能を再エクスポートする。

### 実装詳細

実装は `./coordinator/` ディレクトリ内のモジュール化されたパッケージに分割されている。

## エクスポート

すべての機能は `./coordinator/index.js` から提供される。

### 主要機能

- **インスタンス登録・解除**: `registerInstance`, `unregisterInstance`
- **ハートビート管理**: `updateHeartbeat`, `enhancedHeartbeat`
- **インスタンス情報取得**: `getActiveInstances`, `getActiveInstanceCount`
- **並列制限管理**: `getMyParallelLimit`, `getDynamicParallelLimit`
- **ワークスチール**: `shouldAttemptWorkStealing`, `getWorkStealingCandidates`, `stealWork`
- **モデル管理**: `setActiveModel`, `clearActiveModel`, `getActiveInstancesForModel`

## 使用例

```typescript
import {
  registerInstance,
  getActiveInstanceCount,
  getMyParallelLimit
} from "./cross-instance-coordinator.js";

// インスタンスを登録
registerInstance();

// アクティブなインスタンス数を取得
const count = getActiveInstanceCount();

// このインスタンスの並列制限を取得
const limit = getMyParallelLimit();
```

## 関連ファイル

- `./coordinator/index.ts` - 実装のエントリーポイント
- `./task-scheduler.ts` - タスクスケジューリング
- `./dynamic-parallelism.ts` - 動的並列処理調整
