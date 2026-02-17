---
title: concurrency.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [concurrency, pool, parallel, abort]
related: [abort-utils.ts, subagents.ts, agent-teams.ts]
---

# concurrency.ts

Abort対応スケジューリングを持つ共有並行性制限ワーカープール。

## 概要

重複するプールロジックを削除し、キャンセル後の余分な作業の開始を回避する。サブエージェントとエージェントチームの並列実行で使用される。

## 型定義

### ConcurrencyRunOptions

```typescript
interface ConcurrencyRunOptions {
  signal?: AbortSignal;
}
```

並行実行オプション。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `signal` | `AbortSignal?` | キャンセル用のAbortSignal |

## 関数

### runWithConcurrencyLimit

並行性制限付きでアイテムを処理する。

```typescript
async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TResult>,
  options?: ConcurrencyRunOptions,
): Promise<TResult[]>
```

**パラメータ**

| 名前 | 型 | 説明 |
|------|-----|------|
| `items` | `TInput[]` | 処理するアイテム配列 |
| `limit` | `number` | 最大並行数 |
| `worker` | `(item, index) => Promise<TResult>` | ワーカー関数 |
| `options` | `ConcurrencyRunOptions?` | オプション |

**戻り値**

結果の配列（入力順序を保持）。

**動作**

1. 並行数を`limit`に制限してワーカーを起動
2. 各ワーカーは利用可能なアイテムを順次処理
3. AbortSignalが中止された場合、即座にエラーをスロー
4. 全ワーカーの完了を待機
5. エラーがある場合、`AggregateError`をスロー

**エラーハンドリング**

- 単一エラー: そのエラーを直接スロー
- 複数エラー: `AggregateError`でラップしてスロー

**使用例**

```typescript
import { runWithConcurrencyLimit } from "./lib/concurrency.js";

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// 最大3並列で処理
const results = await runWithConcurrencyLimit(
  items,
  3,
  async (item, index) => {
    console.log(`Processing item ${item} at index ${index}`);
    await sleep(1000);
    return item * 2;
  }
);
// results: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

// AbortSignal付き
const controller = new AbortController();
try {
  await runWithConcurrencyLimit(
    items,
    3,
    async (item) => {
      if (item === 5) controller.abort();
      return item * 2;
    },
    { signal: controller.signal }
  );
} catch (error) {
  console.log("Cancelled:", error.message);
  // "concurrency pool aborted"
}
```

## 内部型

### WorkerResult

```typescript
interface WorkerResult<TResult> {
  index: number;
  result?: TResult;
  error?: unknown;
}
```

個別ワーカーの成功/失敗を追跡するためのラッパー。

## アルゴリズム

1. `limit`を正規化（1以上、アイテム数以下）
2. `limit`個のワーカーを起動
3. 各ワーカーは以下を繰り返す:
   - 中止チェック
   - 次のアイテムを取得（アトミックなインクリメント）
   - アイテムがなければ終了
   - ワーカー関数を実行
   - 結果/エラーを記録
4. 全ワーカー完了後、エラーチェック
5. エラーがあればスロー、なければ結果を返す

## 関連ファイル

- `.pi/lib/abort-utils.ts` - AbortControllerユーティリティ
- `.pi/extensions/subagents.ts` - サブエージェント実行
- `.pi/extensions/agent-teams.ts` - エージェントチーム実行
- `.pi/extensions/agent-runtime.ts` - エージェントランタイム
