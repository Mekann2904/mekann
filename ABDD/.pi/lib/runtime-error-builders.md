---
title: Runtime Error Builders
category: reference
audience: developer
last_updated: 2026-02-18
tags: [runtime, error, timeout, utilities]
related: [runtime-utils, subagents, agent-teams]
---

# Runtime Error Builders

ランタイムエラーとタイムアウトユーティリティ。サブエージェントとエージェントチームの一貫した動作のために共有される。

## 関数

### resolveEffectiveTimeoutMs

モデル固有の調整を含めて有効なタイムアウトを解決する。

優先度: max(ユーザー指定, モデル固有) > デフォルト

これにより、低速なモデル（例: GLM-5）は、呼び出しが高速なモデル用の短いタイムアウトを指定した場合でも、常に十分なタイムアウトを得ることが保証される。

```typescript
function resolveEffectiveTimeoutMs(
  userTimeoutMs: unknown,
  modelId: string | undefined,
  fallback: number,
): number
```

#### パラメータ

- `userTimeoutMs`: ユーザー指定のタイムアウト（安全性のためにunknown型）
- `modelId`: モデル固有のタイムアウトルックアップ用のモデルID
- `fallback`: デフォルトのフォールバックタイムアウト（ミリ秒）

#### 戻り値

解決されたタイムアウト（ミリ秒）

## 使用例

```typescript
import { resolveEffectiveTimeoutMs } from "./runtime-error-builders.js";

// ユーザーがタイムアウトを指定
const timeout1 = resolveEffectiveTimeoutMs(60000, "gpt-4o", 120000);
// => 60000 (ユーザー指定が優先)

// ユーザーが短いタイムアウトを指定したが、モデルは遅い
const timeout2 = resolveEffectiveTimeoutMs(30000, "glm-5", 120000);
// => max(30000, モデル固有タイムアウト) - モデル固有が大きければそれを使用

// タイムアウト未指定
const timeout3 = resolveEffectiveTimeoutMs(undefined, "gpt-4o", 120000);
// => モデル固有タイムアウトまたは120000
```

## 依存関係

- `runtime-utils.ts`: `normalizeTimeoutMs`
- `model-timeouts.ts`: `computeModelTimeoutMs`
