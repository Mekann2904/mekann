---
title: execution-rules
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# execution-rules

## 概要

`execution-rules` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildExecutionRulesSection` | 実行ルールセクションを構築 |
| 関数 | `getSubagentExecutionRules` | サブエージェントルールを取得 |
| 関数 | `getTeamMemberExecutionRules` | チームメンバールールを取得 |
| 関数 | `getChallengerExecutionRules` | チャレンジャールールを取得 |
| 関数 | `getInspectorExecutionRules` | - |
| 関数 | `getVerificationWorkflowExecutionRules` | - |
| 関数 | `getLightweightExecutionRules` | 軽量実行ルールを取得（調査タスク・INTERNALモード用） |
| 関数 | `getExecutionRulesForProfile` | パフォーマンスプロファイルに基づく実行ルールを取得 |
| インターフェース | `BuildExecutionRulesOptions` | 実行ルールの構築オプション |

## 図解

### クラス図

```mermaid
classDiagram
  class BuildExecutionRulesOptions {
    <<interface>>
    +forSubagent: boolean
    +forTeam: boolean
    +phase: initial_communica
    +includeGuidelines: boolean
    +includeDiscussionRules: boolean
  }
```

### 関数フロー

```mermaid
flowchart TD
  buildExecutionRulesSection["buildExecutionRulesSection()"]
  getChallengerExecutionRules["getChallengerExecutionRules()"]
  getExecutionRulesForProfile["getExecutionRulesForProfile()"]
  getInspectorExecutionRules["getInspectorExecutionRules()"]
  getLightweightExecutionRules["getLightweightExecutionRules()"]
  getSubagentExecutionRules["getSubagentExecutionRules()"]
  getTeamMemberExecutionRules["getTeamMemberExecutionRules()"]
  getVerificationWorkflowExecutionRules["getVerificationWorkflowExecutionRules()"]
  safeCacheSet["safeCacheSet()"]
  buildExecutionRulesSection --> safeCacheSet
  getChallengerExecutionRules --> buildExecutionRulesSection
  getChallengerExecutionRules --> safeCacheSet
  getExecutionRulesForProfile --> buildExecutionRulesSection
  getExecutionRulesForProfile --> getLightweightExecutionRules
  getExecutionRulesForProfile --> safeCacheSet
  getInspectorExecutionRules --> buildExecutionRulesSection
  getInspectorExecutionRules --> safeCacheSet
  getSubagentExecutionRules --> buildExecutionRulesSection
  getSubagentExecutionRules --> safeCacheSet
  getTeamMemberExecutionRules --> buildExecutionRulesSection
  getTeamMemberExecutionRules --> safeCacheSet
  getVerificationWorkflowExecutionRules --> buildExecutionRulesSection
  getVerificationWorkflowExecutionRules --> safeCacheSet
```

## 関数

### buildExecutionRulesSection

```typescript
buildExecutionRulesSection(options: BuildExecutionRulesOptions): string
```

実行ルールセクションを構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `BuildExecutionRulesOptions` | はい |

**戻り値**: `string`

### safeCacheSet

```typescript
safeCacheSet(cache: Map<K, V>, key: K, value: V): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cache | `Map<K, V>` | はい |
| key | `K` | はい |
| value | `V` | はい |

**戻り値**: `void`

### getSubagentExecutionRules

```typescript
getSubagentExecutionRules(includeGuidelines: any): string
```

サブエージェントルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getTeamMemberExecutionRules

```typescript
getTeamMemberExecutionRules(phase: "initial" | "communication", includeGuidelines: any): string
```

チームメンバールールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| phase | `"initial" | "communication"` | はい |
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getChallengerExecutionRules

```typescript
getChallengerExecutionRules(includeGuidelines: any): string
```

チャレンジャールールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getInspectorExecutionRules

```typescript
getInspectorExecutionRules(includeGuidelines: any): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getVerificationWorkflowExecutionRules

```typescript
getVerificationWorkflowExecutionRules(phase: "inspector" | "challenger" | "both", includeGuidelines: any): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| phase | `"inspector" | "challenger" | "both"` | はい |
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getLightweightExecutionRules

```typescript
getLightweightExecutionRules(): string
```

軽量実行ルールを取得（調査タスク・INTERNALモード用）

**戻り値**: `string`

### getExecutionRulesForProfile

```typescript
getExecutionRulesForProfile(profileId: string, forSubagent: any, lightweight: any): string
```

パフォーマンスプロファイルに基づく実行ルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| profileId | `string` | はい |
| forSubagent | `any` | はい |
| lightweight | `any` | はい |

**戻り値**: `string`

## インターフェース

### BuildExecutionRulesOptions

```typescript
interface BuildExecutionRulesOptions {
  forSubagent?: boolean;
  forTeam?: boolean;
  phase?: "initial" | "communication";
  includeGuidelines?: boolean;
  includeDiscussionRules?: boolean;
  includeCognitiveBiasCountermeasures?: boolean;
  includeSelfVerification?: boolean;
  includeWorkingMemoryGuidelines?: boolean;
  includeTerminationCheck?: boolean;
  includeCompositionalInference?: boolean;
  includeChallengeRules?: boolean;
  includeInspectionRules?: boolean;
  includeVerificationWorkflow?: boolean;
  includeQualityBaseline?: boolean;
  includePhilosophicalReflection?: boolean;
  includeAporiaGuidelines?: boolean;
}
```

実行ルールの構築オプション

---
*自動生成: 2026-02-24T17:08:02.678Z*
