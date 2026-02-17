---
title: agent-types.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [agent, types, constants]
related: [agent-common.ts, agent-utils.ts]
---

# agent-types.ts

共有エージェント型と定数。複数ファイルに分散していた型定義を統合する。

## 概要

以下のファイルから重複する型定義を統合:
- `.pi/extensions/loop.ts` (ThinkingLevel)
- `.pi/extensions/rsa.ts` (ThinkingLevel)
- `.pi/extensions/subagents.ts` (RunOutcomeCode, RunOutcomeSignal)
- `.pi/extensions/agent-teams.ts` (RunOutcomeCode, RunOutcomeSignal)

## 型定義

### ThinkingLevel

```typescript
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
```

モデル推論の思考レベル。モデルからの思考/推論出力の深さを制御する。

| 値 | 説明 |
|-----|------|
| `off` | 思考なし |
| `minimal` | 最小限の思考 |
| `low` | 低レベル思考 |
| `medium` | 中レベル思考 |
| `high` | 高レベル思考 |
| `xhigh` | 最高レベル思考 |

### RunOutcomeCode

```typescript
type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT"
```

エージェント/サブエージェント/チーム実行結果の結果コード。リトライロジックとレポート用に結果を分類する。

| 値 | 説明 |
|-----|------|
| `SUCCESS` | 完全成功 |
| `PARTIAL_SUCCESS` | 部分成功 |
| `RETRYABLE_FAILURE` | 再試行可能な失敗 |
| `NONRETRYABLE_FAILURE` | 再試行不可能な失敗 |
| `CANCELLED` | キャンセル |
| `TIMEOUT` | タイムアウト |

### RunOutcomeSignal

```typescript
interface RunOutcomeSignal {
  outcomeCode: RunOutcomeCode;
  retryRecommended: boolean;
}
```

エージェント/サブエージェント/チーム実行から返されるシグナル。結果コードと再試行推奨をカプセル化する。

## 定数

### DEFAULT_AGENT_TIMEOUT_MS

```typescript
const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes
```

エージェント操作のデフォルトタイムアウト（ミリ秒）。複雑な操作用の保守的なデフォルト値。

## 使用例

```typescript
import {
  ThinkingLevel,
  RunOutcomeCode,
  RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS
} from "./lib/agent-types.js";

function handleOutcome(signal: RunOutcomeSignal): void {
  switch (signal.outcomeCode) {
    case "SUCCESS":
      console.log("Operation succeeded");
      break;
    case "RETRYABLE_FAILURE":
      if (signal.retryRecommended) {
        console.log("Retrying...");
      }
      break;
    default:
      console.log(`Outcome: ${signal.outcomeCode}`);
  }
}
```

## 関連ファイル

- `.pi/lib/agent-common.ts` - エージェント共通ユーティリティ
- `.pi/lib/agent-utils.ts` - エージェントユーティリティ関数
- `.pi/extensions/loop.ts` - ループ実行
- `.pi/extensions/subagents.ts` - サブエージェント実行
- `.pi/extensions/agent-teams.ts` - エージェントチーム実行
