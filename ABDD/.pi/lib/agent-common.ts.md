---
title: agent-common.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [agent, subagent, team, constants, utilities]
related: [agent-types.ts, agent-utils.ts, agent-errors.ts]
---

# agent-common.ts

共有エージェント共通ユーティリティ。サブエージェントとチームメンバー実行の統一定数と関数を提供する。

## 概要

subagents.tsとagent-teams.ts間のコード重複を排除する。安定ランタイムプロファイル定数、並列ペナルティ設定、リトライ設定、出力正規化機能を含む。

## 定数

### STABLE_RUNTIME_PROFILE

```typescript
const STABLE_RUNTIME_PROFILE = true
```

安定ランタイムプロファイルフラグ。`true`の場合、決定的動作を有効にする。

### ADAPTIVE_PARALLEL_MAX_PENALTY

```typescript
const ADAPTIVE_PARALLEL_MAX_PENALTY = STABLE_RUNTIME_PROFILE ? 0 : 3
```

適応並列ペナルティの最大値。安定モードでは0。

### ADAPTIVE_PARALLEL_DECAY_MS

```typescript
const ADAPTIVE_PARALLEL_DECAY_MS = 8 * 60 * 1000  // 8 minutes
```

適応並列減衰間隔（ミリ秒）。

### リトライ設定

```typescript
const STABLE_MAX_RETRIES = 2
const STABLE_INITIAL_DELAY_MS = 800
const STABLE_MAX_DELAY_MS = 10_000
const STABLE_MAX_RATE_LIMIT_RETRIES = 4
const STABLE_MAX_RATE_LIMIT_WAIT_MS = 90_000
```

安定プロファイル用リトライ設定。

## 型定義

### EntityType

```typescript
type EntityType = "subagent" | "team-member"
```

エンティティ種別識別子。

### EntityConfig

```typescript
interface EntityConfig {
  type: EntityType;
  label: string;
  emptyOutputMessage: string;
  defaultSummaryFallback: string;
}
```

エンティティ固有動作の設定。

### NormalizedEntityOutput

```typescript
interface NormalizedEntityOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}
```

正規化されたエンティティ出力結果。

### PickFieldCandidateOptions

```typescript
interface PickFieldCandidateOptions {
  maxLength: number;
  excludeLabels?: string[];
  fallback?: string;
}
```

フィールド候補選択のオプション。

### NormalizeEntityOutputOptions

```typescript
interface NormalizeEntityOutputOptions {
  config: EntityConfig;
  validateFn: (output: string) => { ok: boolean; reason?: string };
  requiredLabels: string[];
  pickSummary?: (text: string) => string;
  includeConfidence?: boolean;
  formatAdditionalFields?: (text: string) => string[];
}
```

出力正規化のオプション。

## 定数設定

### SUBAGENT_CONFIG

```typescript
const SUBAGENT_CONFIG: EntityConfig = {
  type: "subagent",
  label: "subagent",
  emptyOutputMessage: "subagent returned empty output",
  defaultSummaryFallback: "回答を整形しました。",
}
```

サブエージェント用デフォルト設定。

### TEAM_MEMBER_CONFIG

```typescript
const TEAM_MEMBER_CONFIG: EntityConfig = {
  type: "team-member",
  label: "team member",
  emptyOutputMessage: "agent team member returned empty output",
  defaultSummaryFallback: "情報を整理しました。",
}
```

チームメンバー用デフォルト設定。

## 関数

### pickFieldCandidate

非構造化出力から構造化フィールドの候補テキストを選択する。

```typescript
function pickFieldCandidate(
  text: string,
  options: PickFieldCandidateOptions,
): string
```

**アルゴリズム**

1. テキストを空でない行に分割
2. 除外ラベルで始まらない最初の行を見つける
3. マークダウンフォーマットと余分な空白を削除
4. 必要に応じてmaxLengthで切り詰め

### pickSummaryCandidate

SUMMARYフィールド用の候補テキストを選択する。

```typescript
function pickSummaryCandidate(text: string): string
```

### pickClaimCandidate

CLAIMフィールド用の候補テキストを選択する。

```typescript
function pickClaimCandidate(text: string): string
```

### normalizeEntityOutput

エンティティ出力を必須構造化フォーマットに正規化する。

```typescript
function normalizeEntityOutput(
  output: string,
  options: NormalizeEntityOutputOptions,
): NormalizedEntityOutput
```

### isEmptyOutputFailureMessage

エラーメッセージが空出力失敗を示しているか判定する。

```typescript
function isEmptyOutputFailureMessage(
  message: string,
  config: EntityConfig,
): boolean
```

### buildFailureSummary

エラーメッセージから人間可読の失敗サマリーを構築する。

```typescript
function buildFailureSummary(message: string): string
```

### resolveTimeoutWithEnv

環境変数オーバーライド対応でタイムアウトを解決する。

```typescript
function resolveTimeoutWithEnv(
  defaultMs: number,
  envKey: string,
): number
```

## 依存関係

- Layer 0: `error-utils`, `validation-utils`, `format-utils`

## 関連ファイル

- `.pi/lib/agent-types.ts` - エージェント型定義
- `.pi/lib/agent-utils.ts` - エージェントユーティリティ
- `.pi/lib/agent-errors.ts` - エージェントエラーユーティリティ
