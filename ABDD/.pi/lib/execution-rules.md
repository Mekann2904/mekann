---
title: execution-rules
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# execution-rules

## 概要

`execution-rules` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildExecutionRulesSection` | 実行ルールセクションを構築する |
| 関数 | `getSubagentExecutionRules` | サブエージェント用の実行ルールを取得 |
| 関数 | `getTeamMemberExecutionRules` | チームメンバー用の実行ルールを取得する |
| 関数 | `getChallengerExecutionRules` | Challenger用実行ルールを取得 |
| 関数 | `getInspectorExecutionRules` | Inspectorサブエージェント用の実行ルールを取得 |
| 関数 | `getVerificationWorkflowExecutionRules` | 検証ワークフロー用の実行ルールを取得 |
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
  getSubagentExecutionRules["getSubagentExecutionRules()"]
  getTeamMemberExecutionRules["getTeamMemberExecutionRules()"]
  getChallengerExecutionRules["getChallengerExecutionRules()"]
  getInspectorExecutionRules["getInspectorExecutionRules()"]
  getVerificationWorkflowExecutionRules["getVerificationWorkflowExecutionRules()"]
  buildExecutionRulesSection -.-> getSubagentExecutionRules
  getSubagentExecutionRules -.-> getTeamMemberExecutionRules
  getTeamMemberExecutionRules -.-> getChallengerExecutionRules
  getChallengerExecutionRules -.-> getInspectorExecutionRules
  getInspectorExecutionRules -.-> getVerificationWorkflowExecutionRules
```

## 関数

### buildExecutionRulesSection

```typescript
buildExecutionRulesSection(options: BuildExecutionRulesOptions): string
```

実行ルールセクションを構築する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `BuildExecutionRulesOptions` | はい |

**戻り値**: `string`

### getSubagentExecutionRules

```typescript
getSubagentExecutionRules(includeGuidelines: any): string
```

サブエージェント用の実行ルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getTeamMemberExecutionRules

```typescript
getTeamMemberExecutionRules(phase: "initial" | "communication", includeGuidelines: any): string
```

チームメンバー用の実行ルールを取得する

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

Challenger用実行ルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getInspectorExecutionRules

```typescript
getInspectorExecutionRules(includeGuidelines: any): string
```

Inspectorサブエージェント用の実行ルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| includeGuidelines | `any` | はい |

**戻り値**: `string`

### getVerificationWorkflowExecutionRules

```typescript
getVerificationWorkflowExecutionRules(phase: "inspector" | "challenger" | "both", includeGuidelines: any): string
```

検証ワークフロー用の実行ルールを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| phase | `"inspector" | "challenger" | "both"` | はい |
| includeGuidelines | `any` | はい |

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
}
```

実行ルールの構築オプション

---
*自動生成: 2026-02-18T07:17:30.448Z*
