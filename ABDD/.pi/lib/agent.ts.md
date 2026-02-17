---
title: agent.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [agent, aggregator, exports]
related: [agent-types.ts, agent-utils.ts, agent-common.ts, agent-errors.ts]
---

# agent.ts

エージェント関連ユーティリティと型の集約モジュール。lib全体をインポートせずに便利なインポートを提供する。

## 概要

エージェント、サブエージェント、チーム関連の全エクスポートを集約する。Layer 1モジュールとして、Layer 0モジュールへの依存を持つ。

## エクスポート一覧

### エージェント型 (Layer 1)

`agent-types.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `ThinkingLevel` | 型 | 思考レベル |
| `RunOutcomeCode` | 型 | 実行結果コード |
| `RunOutcomeSignal` | 型 | 実行結果シグナル |
| `DEFAULT_AGENT_TIMEOUT_MS` | 定数 | デフォルトタイムアウト |

### エージェントユーティリティ (Layer 1)

`agent-utils.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `createRunId` | 関数 | 実行ID生成 |
| `computeLiveWindow` | 関数 | ライブウィンドウ計算 |

### エージェント共通 (Layer 1)

`agent-common.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `STABLE_RUNTIME_PROFILE` | 定数 | 安定ランタイムプロファイル |
| `ADAPTIVE_PARALLEL_MAX_PENALTY` | 定数 | 最大ペナルティ |
| `ADAPTIVE_PARALLEL_DECAY_MS` | 定数 | 減衰間隔 |
| `STABLE_MAX_RETRIES` | 定数 | 最大リトライ |
| `STABLE_INITIAL_DELAY_MS` | 定数 | 初期遅延 |
| `STABLE_MAX_DELAY_MS` | 定数 | 最大遅延 |
| `STABLE_MAX_RATE_LIMIT_RETRIES` | 定数 | レート制限リトライ |
| `STABLE_MAX_RATE_LIMIT_WAIT_MS` | 定数 | レート制限待機 |
| `EntityType` | 型 | エンティティ種別 |
| `EntityConfig` | 型 | エンティティ設定 |
| `SUBAGENT_CONFIG` | 定数 | サブエージェント設定 |
| `TEAM_MEMBER_CONFIG` | 定数 | チームメンバー設定 |
| `NormalizedEntityOutput` | 型 | 正規化出力 |
| `PickFieldCandidateOptions` | 型 | 候補選択オプション |
| `pickFieldCandidate` | 関数 | 候補選択 |
| `pickSummaryCandidate` | 関数 | サマリー候補選択 |
| `pickClaimCandidate` | 関数 | クレーム候補選択 |
| `NormalizeEntityOutputOptions` | 型 | 正規化オプション |
| `normalizeEntityOutput` | 関数 | 出力正規化 |
| `isEmptyOutputFailureMessage` | 関数 | 空出力判定 |
| `buildFailureSummary` | 関数 | 失敗サマリー構築 |
| `resolveTimeoutWithEnv` | 関数 | タイムアウト解決 |

### エージェントエラー (Layer 1)

`agent-errors.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `isRetryableEntityError` | 関数 | 再試行可能判定 |
| `isRetryableSubagentError` | 関数 | サブエージェント再試行判定 |
| `isRetryableTeamMemberError` | 関数 | チーム再試行判定 |
| `resolveFailureOutcome` | 関数 | 失敗結果解決 |
| `resolveSubagentFailureOutcome` | 関数 | サブエージェント失敗解決 |
| `resolveTeamFailureOutcome` | 関数 | チーム失敗解決 |
| `EntityResultItem` | 型 | 結果アイテム |
| `resolveAggregateOutcome` | 関数 | 集計結果解決 |
| `resolveSubagentParallelOutcome` | 関数 | 並列サブエージェント結果 |
| `resolveTeamMemberAggregateOutcome` | 関数 | チーム集計結果 |
| `trimErrorMessage` | 関数 | エラーメッセージ切り詰め |
| `buildDiagnosticContext` | 関数 | 診断コンテキスト構築 |

### モデルタイムアウト (Layer 1)

`model-timeouts.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `MODEL_TIMEOUT_BASE_MS` | 定数 | ベースタイムアウト |
| `THINKING_LEVEL_MULTIPLIERS` | 定数 | 思考レベル乗数 |
| `getModelBaseTimeoutMs` | 関数 | モデルベースタイムアウト取得 |
| `computeModelTimeoutMs` | 関数 | タイムアウト計算 |
| `computeProgressiveTimeoutMs` | 関数 | 段階的タイムアウト計算 |
| `ComputeModelTimeoutOptions` | 型 | タイムアウト計算オプション |

### 適応ペナルティ (Layer 1)

`adaptive-penalty.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `createAdaptivePenaltyController` | 関数 | ペナルティコントローラ作成 |
| `AdaptivePenaltyState` | 型 | ペナルティ状態 |
| `AdaptivePenaltyOptions` | 型 | ペナルティオプション |
| `AdaptivePenaltyController` | 型 | ペナルティコントローラ |

### ライブビュー (Layer 1)

`live-view-utils.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `getLiveStatusGlyph` | 関数 | ステータスグリフ取得 |
| `isEnterInput` | 関数 | Enter入力判定 |
| `finalizeLiveLines` | 関数 | ライブライン確定 |
| `LiveStatus` | 型 | ライブステータス |

### 出力検証 (Layer 1)

`output-validation.js`から:

| エクスポート | 種別 | 説明 |
|-------------|------|------|
| `hasNonEmptyResultSection` | 関数 | 空でないRESULT判定 |
| `validateSubagentOutput` | 関数 | サブエージェント出力検証 |
| `validateTeamMemberOutput` | 関数 | チーム出力検証 |
| `SubagentValidationOptions` | 型 | サブエージェント検証オプション |
| `TeamMemberValidationOptions` | 型 | チーム検証オプション |

### その他

サブエージェント型、チーム型、構造化ロガーなどもエクスポート。

## 使用例

```typescript
// 統一インポート
import {
  createRunId,
  RunOutcomeCode,
  STABLE_RUNTIME_PROFILE,
  isRetryableSubagentError,
} from "./lib/agent.js";

const runId = createRunId();
console.log(`Run: ${runId}`);
```

## 関連ファイル

- `.pi/lib/agent-types.ts` - エージェント型
- `.pi/lib/agent-utils.ts` - エージェントユーティリティ
- `.pi/lib/agent-common.ts` - エージェント共通
- `.pi/lib/agent-errors.ts` - エージェントエラー
