---
title: abort-utils.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [abort-controller, signal, concurrency, utilities]
related: [concurrency.ts, subagents.ts, agent-teams.ts]
---

# abort-utils.ts

AbortControllerユーティリティ。AbortSignalの階層管理を提供する。

## 概要

複数の非同期操作が同じAbortSignalを共有する際に発生する`MaxListenersExceededWarning`を防止するための子AbortController生成機能を提供する。

## 関数

### createChildAbortController

親シグナルに連動する子AbortControllerを作成する。

```typescript
function createChildAbortController(
  parentSignal?: AbortSignal,
): { controller: AbortController; cleanup: () => void }
```

**パラメータ**

| 名前 | 型 | 説明 |
|------|-----|------|
| `parentSignal` | `AbortSignal?` | 親シグナル（オプション） |

**戻り値**

- `controller`: 子AbortController
- `cleanup`: クリーンアップ関数

**使用例**

```typescript
const { controller, cleanup } = createChildAbortController(parentSignal);
try {
  await doWork(controller.signal);
} finally {
  cleanup();
}
```

### createChildAbortControllers

単一の親シグナルから複数の子AbortControllerを作成する。並列実行時に各ワーカーが独自のシグナルを必要とする場合に使用する。

```typescript
function createChildAbortControllers(
  count: number,
  parentSignal?: AbortSignal,
): { controllers: AbortController[]; cleanup: () => void }
```

**パラメータ**

| 名前 | 型 | 説明 |
|------|-----|------|
| `count` | `number` | 作成する子コントローラの数 |
| `parentSignal` | `AbortSignal?` | 親シグナル（オプション） |

**戻り値**

- `controllers`: 子AbortControllerの配列
- `cleanup`: 統一クリーンアップ関数

**使用例**

```typescript
const { controllers, cleanup } = createChildAbortControllers(10, parentSignal);
try {
  await Promise.all(controllers.map((c, i) => doWork(c.signal, i)));
} finally {
  cleanup();
}
```

## 関連ファイル

- `.pi/lib/concurrency.ts` - 並行実行制御
- `.pi/extensions/subagents.ts` - サブエージェント実行
- `.pi/extensions/agent-teams.ts` - エージェントチーム実行
