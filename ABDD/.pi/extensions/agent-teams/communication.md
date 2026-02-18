---
title: communication
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# communication

## 概要

`communication` モジュールのAPIリファレンス。

## インポート

```typescript
import { normalizeForSingleLine } from '../../lib/format-utils.js';
import { analyzeDiscussionStance } from '../../lib/text-parsing';
import { classifyFailureType, shouldRetryByClassification, FailureClassification } from '../../lib/agent-errors';
import { getCommunicationIdMode, getStanceClassificationMode, CommunicationIdMode } from '../../lib/output-schema';
import { TeamMember, TeamMemberResult, TeamDefinition... } from './storage';
// ... and 1 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `buildPrecomputedContextMap` | 事前計算済みのメンバーごとのコンテキストを構築します。 |
| 関数 | `normalizeCommunicationRounds` | 通信ラウンド数を正規化・検証する |
| 関数 | `normalizeFailedMemberRetryRounds` | メンバーの再試行回数を正規化 |
| 関数 | `shouldRetryFailedMemberResult` | 失敗したメンバー結果を再試行すべきか判定する |
| 関数 | `shouldPreferAnchorMember` | メンバーをアンカーとして優先するか判定 |
| 関数 | `createCommunicationLinksMap` | チームメンバーの通信リンクマップを作成する |
| 関数 | `sanitizeCommunicationSnippet` | 通信スニペットをサニタイズする |
| 関数 | `detectPartnerReferencesV2` | パートナーの参照を検出する（V2） |
| 関数 | `extractField` | 構造化されたテキストから指定フィールドの値を抽出 |
| 関数 | `buildCommunicationContext` | チームメンバー向けの通信コンテキストを作成する |
| 関数 | `detectPartnerReferences` | メンバーの出力から参照されるパートナーを検出します。 |
| 関数 | `checkTermination` | Check if task execution can be safely terminated. |
| 関数 | `updateBeliefState` | メンバーの出力に基づき信念状態を更新する |
| 関数 | `getBeliefSummary` | 指定されたメンバーの信念サマリーを取得する |
| 関数 | `clearBeliefStateCache` | 新しいチーム実行開始時に信念状態キャッシュをクリア |
| インターフェース | `PrecomputedMemberContext` | メンバーの事前計算されたコンテキスト |
| インターフェース | `PartnerReferenceResultV2` | 構造化ID追跡付きのパートナー参照検出結果 |
| インターフェース | `TerminationCheckResult` | タスク終了チェックの結果を表します。 |
| インターフェース | `AgentBelief` | エージェントの信念追跡構造 |
| インターフェース | `BeliefContradiction` | エージェントの信念間で検出された矛盾 |

## 図解

### クラス図

```mermaid
classDiagram
  class PrecomputedMemberContext {
    <<interface>>
    +memberId: string
    +role: string
    +status: string
    +summary: string
    +claim: string
  }
  class PartnerReferenceResultV2 {
    <<interface>>
    +referencedPartners: string
    +missingPartners: string
    +claimReferences: ClaimReference
    +referenceQuality: number
  }
  class TerminationCheckResult {
    <<interface>>
    +canTerminate: boolean
    +completionScore: number
    +missingElements: string
    +suspiciousPatterns: string
    +recommendation: proceed_extend
  }
  class AgentBelief {
    <<interface>>
    +memberId: string
    +claimId: string
    +claimText: string
    +confidence: number
    +evidenceRefs: string
  }
  class BeliefContradiction {
    <<interface>>
    +belief1: AgentBelief
    +belief2: AgentBelief
    +contradictionType: direct_implicit
    +severity: low_medium_high
    +description: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[communication]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils["format-utils"]
    text_parsing["text-parsing"]
    agent_errors["agent-errors"]
    output_schema["output-schema"]
    storage["storage"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  buildPrecomputedContextMap["buildPrecomputedContextMap()"]
  normalizeCommunicationRounds["normalizeCommunicationRounds()"]
  normalizeFailedMemberRetryRounds["normalizeFailedMemberRetryRounds()"]
  shouldRetryFailedMemberResult["shouldRetryFailedMemberResult()"]
  shouldPreferAnchorMember["shouldPreferAnchorMember()"]
  createCommunicationLinksMap["createCommunicationLinksMap()"]
  buildPrecomputedContextMap -.-> normalizeCommunicationRounds
  normalizeCommunicationRounds -.-> normalizeFailedMemberRetryRounds
  normalizeFailedMemberRetryRounds -.-> shouldRetryFailedMemberResult
  shouldRetryFailedMemberResult -.-> shouldPreferAnchorMember
  shouldPreferAnchorMember -.-> createCommunicationLinksMap
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant communication as "communication"
  participant format_utils as "format-utils"
  participant text_parsing as "text-parsing"

  Caller->>communication: buildPrecomputedContextMap()
  communication->>format_utils: 内部関数呼び出し
  format_utils-->>communication: 結果
  communication-->>Caller: Map_string_Precomput

  Caller->>communication: normalizeCommunicationRounds()
  communication-->>Caller: number
```

## 関数

### buildPrecomputedContextMap

```typescript
buildPrecomputedContextMap(results: TeamMemberResult[]): Map<string, PrecomputedMemberContext>
```

事前計算済みのメンバーごとのコンテキストを構築します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| results | `TeamMemberResult[]` | はい |

**戻り値**: `Map<string, PrecomputedMemberContext>`

### normalizeCommunicationRounds

```typescript
normalizeCommunicationRounds(value: unknown, fallback: any, isStableRuntime: any): number
```

通信ラウンド数を正規化・検証する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `any` | はい |
| isStableRuntime | `any` | はい |

**戻り値**: `number`

### normalizeFailedMemberRetryRounds

```typescript
normalizeFailedMemberRetryRounds(value: unknown, fallback: any, isStableRuntime: any): number
```

メンバーの再試行回数を正規化

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `any` | はい |
| isStableRuntime | `any` | はい |

**戻り値**: `number`

### shouldRetryFailedMemberResult

```typescript
shouldRetryFailedMemberResult(result: TeamMemberResult, retryRound: number, classifyPressureError: (error: unknown) => string): boolean
```

失敗したメンバー結果を再試行すべきか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `TeamMemberResult` | はい |
| retryRound | `number` | はい |
| classifyPressureError | `(error: unknown) => string` | はい |

**戻り値**: `boolean`

### shouldPreferAnchorMember

```typescript
shouldPreferAnchorMember(member: TeamMember): boolean
```

メンバーをアンカーとして優先するか判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| member | `TeamMember` | はい |

**戻り値**: `boolean`

### createCommunicationLinksMap

```typescript
createCommunicationLinksMap(members: TeamMember[]): Map<string, string[]>
```

チームメンバーの通信リンクマップを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| members | `TeamMember[]` | はい |

**戻り値**: `Map<string, string[]>`

### addLink

```typescript
addLink(fromId: string, toId: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| fromId | `string` | はい |
| toId | `string` | はい |

**戻り値**: `void`

### sanitizeCommunicationSnippet

```typescript
sanitizeCommunicationSnippet(value: string, fallback: string): string
```

通信スニペットをサニタイズする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| fallback | `string` | はい |

**戻り値**: `string`

### detectPartnerReferencesV2

```typescript
detectPartnerReferencesV2(output: string, partnerIds: string[], memberById: Map<string, TeamMember>, mode: CommunicationIdMode): PartnerReferenceResultV2
```

パートナーの参照を検出する（V2）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| partnerIds | `string[]` | はい |
| memberById | `Map<string, TeamMember>` | はい |
| mode | `CommunicationIdMode` | はい |

**戻り値**: `PartnerReferenceResultV2`

### extractField

```typescript
extractField(output: string, name: string): string | undefined
```

構造化されたテキストから指定フィールドの値を抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| name | `string` | はい |

**戻り値**: `string | undefined`

### buildCommunicationContext

```typescript
buildCommunicationContext(input: {
  team: TeamDefinition;
  member: TeamMember;
  round: number;
  partnerIds: string[];
  contextMap: Map<string, PrecomputedMemberContext>;
}): string
```

チームメンバー向けの通信コンテキストを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `{
  team: TeamDefinition;
  member: TeamMember;
  round: number;
  partnerIds: string[];
  contextMap: Map<string, PrecomputedMemberContext>;
}` | はい |

**戻り値**: `string`

### detectPartnerReferences

```typescript
detectPartnerReferences(output: string, partnerIds: string[], memberById: Map<string, TeamMember>): { referencedPartners: string[]; missingPartners: string[] }
```

メンバーの出力から参照されるパートナーを検出します。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| partnerIds | `string[]` | はい |
| memberById | `Map<string, TeamMember>` | はい |

**戻り値**: `{ referencedPartners: string[]; missingPartners: string[] }`

### checkTermination

```typescript
checkTermination(task: string, results: TeamMemberResult[], minCompletionScore: any): TerminationCheckResult
```

Check if task execution can be safely terminated.
Based on arXiv:2602.06176 recommendations for completion verification.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| results | `TeamMemberResult[]` | はい |
| minCompletionScore | `any` | はい |

**戻り値**: `TerminationCheckResult`

### updateBeliefState

```typescript
updateBeliefState(memberId: string, output: string, round: number): AgentBelief[]
```

メンバーの出力に基づき信念状態を更新する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| memberId | `string` | はい |
| output | `string` | はい |
| round | `number` | はい |

**戻り値**: `AgentBelief[]`

### getBeliefSummary

```typescript
getBeliefSummary(memberIds: string[]): string
```

指定されたメンバーの信念サマリーを取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| memberIds | `string[]` | はい |

**戻り値**: `string`

### clearBeliefStateCache

```typescript
clearBeliefStateCache(): void
```

新しいチーム実行開始時に信念状態キャッシュをクリア

**戻り値**: `void`

## インターフェース

### PrecomputedMemberContext

```typescript
interface PrecomputedMemberContext {
  memberId: string;
  role: string;
  status: string;
  summary: string;
  claim: string;
}
```

メンバーの事前計算されたコンテキスト

### PartnerReferenceResultV2

```typescript
interface PartnerReferenceResultV2 {
  referencedPartners: string[];
  missingPartners: string[];
  claimReferences: ClaimReference[];
  referenceQuality: number;
}
```

構造化ID追跡付きのパートナー参照検出結果

### TerminationCheckResult

```typescript
interface TerminationCheckResult {
  canTerminate: boolean;
  completionScore: number;
  missingElements: string[];
  suspiciousPatterns: string[];
  recommendation: "proceed" | "extend" | "challenge";
}
```

タスク終了チェックの結果を表します。

### AgentBelief

```typescript
interface AgentBelief {
  memberId: string;
  claimId: string;
  claimText: string;
  confidence: number;
  evidenceRefs: string[];
  round: number;
  timestamp: string;
}
```

エージェントの信念追跡構造

### BeliefContradiction

```typescript
interface BeliefContradiction {
  belief1: AgentBelief;
  belief2: AgentBelief;
  contradictionType: "direct" | "implicit" | "assumption_conflict";
  severity: "low" | "medium" | "high";
  description: string;
}
```

エージェントの信念間で検出された矛盾

---
*自動生成: 2026-02-18T06:37:19.480Z*
