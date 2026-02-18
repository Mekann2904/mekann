---
title: storage
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# storage

## 概要

`storage` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPathsFactory, createEnsurePaths, pruneRunArtifacts... } from '../../lib/storage-base.js';
import { atomicWriteTextFile, withFileLock } from '../../lib/storage-lock.js';
import { getLogger } from '../../lib/comprehensive-logger.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `toId` | 文字列をID形式に変換する |
| 関数 | `loadStorage` | ディスクからチームストレージを読み込む |
| 関数 | `saveStorage` | チームストレージをディスクに保存する。 |
| 関数 | `saveStorageWithPatterns` | ストレージを保存し、パターンを抽出 |
| インターフェース | `TeamMember` | チームメンバーの定義情報を表す |
| インターフェース | `TeamDefinition` | エージェントチームの定義 |
| インターフェース | `TeamMemberResult` | チームメンバーの実行結果 |
| インターフェース | `TeamFinalJudge` | チーム最終審査の結果を表します。 |
| インターフェース | `ClaimReference` | メンバー間のClaim参照構造 |
| インターフェース | `DiscussionAnalysis` | Discussion analysis structure for structured commu |
| インターフェース | `DiscussionReference` | メンバー間のスタンス参照を追跡する |
| インターフェース | `TeamCommunicationAuditEntry` | チーム内通信監査エントリ |
| インターフェース | `TeamRunRecord` | チーム実行記録を表すインターフェース |
| インターフェース | `TeamStorage` | チーム定義と実行記録のストレージ |
| インターフェース | `TeamPaths` | チームストレージのパス定義（BaseStoragePathsを拡張） |
| 型 | `TeamEnabledState` | チームの有効状態を表す型 |
| 型 | `TeamStrategy` | チームの実行戦略を表す型 |
| 型 | `TeamJudgeVerdict` | チーム審査の判定結果 |

## 図解

### クラス図

```mermaid
classDiagram
  class TeamMember {
    <<interface>>
    +id: string
    +role: string
    +description: string
    +provider: string
    +model: string
  }
  class TeamDefinition {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +enabled: TeamEnabledState
    +members: TeamMember
  }
  class TeamMemberResult {
    <<interface>>
    +memberId: string
    +role: string
    +summary: string
    +output: string
    +status: completed_failed
  }
  class TeamFinalJudge {
    <<interface>>
    +verdict: TeamJudgeVerdict
    +confidence: number
    +reason: string
    +nextStep: string
    +uIntra: number
  }
  class ClaimReference {
    <<interface>>
    +claimId: string
    +memberId: string
    +stance: agree_disagree
    +confidence: number
  }
  class DiscussionAnalysis {
    <<interface>>
    +references: DiscussionReference
    +consensusMarker: string
    +stanceDistribution: agree_number_disagr
  }
  class DiscussionReference {
    <<interface>>
    +targetMemberId: string
    +targetClaimId: string
    +stance: agree_disagree
    +excerpt: string
    +confidence: number
  }
  class TeamCommunicationAuditEntry {
    <<interface>>
    +round: number
    +memberId: string
    +role: string
    +partnerIds: string
    +referencedPartners: string
  }
  class TeamRunRecord {
    <<interface>>
    +runId: string
    +teamId: string
    +strategy: TeamStrategy
    +task: string
    +communicationRounds: number
  }
  class TeamStorage {
    <<interface>>
    +teams: TeamDefinition
    +runs: TeamRunRecord
    +currentTeamId: string
    +defaultsVersion: number
  }
  class TeamPaths {
    <<interface>>
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[storage]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    storage_base["storage-base"]
    storage_lock["storage-lock"]
    comprehensive_logger["comprehensive-logger"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  toId["toId()"]
  loadStorage["loadStorage()"]
  saveStorage["saveStorage()"]
  saveStorageWithPatterns["saveStorageWithPatterns()"]
  toId -.-> loadStorage
  loadStorage -.-> saveStorage
  saveStorage -.-> saveStorageWithPatterns
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant storage as "storage"
  participant storage_base as "storage-base"
  participant storage_lock as "storage-lock"

  Caller->>storage: toId()
  storage->>storage_base: 内部関数呼び出し
  storage_base-->>storage: 結果
  storage-->>Caller: string

  Caller->>storage: loadStorage()
  storage-->>Caller: TeamStorage
```

## 関数

### toId

```typescript
toId(input: string): string
```

文字列をID形式に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |

**戻り値**: `string`

### mergeTeamStorageWithDisk

```typescript
mergeTeamStorageWithDisk(storageFile: string, next: TeamStorage): TeamStorage
```

Merge storage with disk state (for concurrent access).
Uses common utility from lib/storage-base.ts.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storageFile | `string` | はい |
| next | `TeamStorage` | はい |

**戻り値**: `TeamStorage`

### loadStorage

```typescript
loadStorage(cwd: string): TeamStorage
```

ディスクからチームストレージを読み込む

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |

**戻り値**: `TeamStorage`

### saveStorage

```typescript
saveStorage(cwd: string, storage: TeamStorage): void
```

チームストレージをディスクに保存する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| storage | `TeamStorage` | はい |

**戻り値**: `void`

### saveStorageWithPatterns

```typescript
async saveStorageWithPatterns(cwd: string, storage: TeamStorage): Promise<void>
```

ストレージを保存し、パターンを抽出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| cwd | `string` | はい |
| storage | `TeamStorage` | はい |

**戻り値**: `Promise<void>`

## インターフェース

### TeamMember

```typescript
interface TeamMember {
  id: string;
  role: string;
  description: string;
  provider?: string;
  model?: string;
  enabled: boolean;
  skills?: string[];
}
```

チームメンバーの定義情報を表す

### TeamDefinition

```typescript
interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  enabled: TeamEnabledState;
  members: TeamMember[];
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}
```

エージェントチームの定義

### TeamMemberResult

```typescript
interface TeamMemberResult {
  memberId: string;
  role: string;
  summary: string;
  output: string;
  status: "completed" | "failed";
  latencyMs: number;
  error?: string;
  diagnostics?: {
    confidence: number;
    evidenceCount: number;
    contradictionSignals: number;
    conflictSignals: number;
  };
}
```

チームメンバーの実行結果

### TeamFinalJudge

```typescript
interface TeamFinalJudge {
  verdict: TeamJudgeVerdict;
  confidence: number;
  reason: string;
  nextStep: string;
  uIntra: number;
  uInter: number;
  uSys: number;
  collapseSignals: string[];
  rawOutput: string;
}
```

チーム最終審査の結果を表します。

### ClaimReference

```typescript
interface ClaimReference {
  claimId: string;
  memberId: string;
  stance: "agree" | "disagree" | "neutral" | "partial";
  confidence?: number;
}
```

メンバー間のClaim参照構造

### DiscussionAnalysis

```typescript
interface DiscussionAnalysis {
  references: DiscussionReference[];
  consensusMarker?: string;
  stanceDistribution: { agree: number; disagree: number; neutral: number; partial: number };
}
```

Discussion analysis structure for structured communication context.
Tracks references between team members and stance distribution.
Controlled by PI_STANCE_CLASSIFICATION_MODE feature flag.

### DiscussionReference

```typescript
interface DiscussionReference {
  targetMemberId: string;
  targetClaimId?: string;
  stance: "agree" | "disagree" | "neutral" | "partial";
  excerpt: string;
  confidence: number;
}
```

メンバー間のスタンス参照を追跡する

### TeamCommunicationAuditEntry

```typescript
interface TeamCommunicationAuditEntry {
  round: number;
  memberId: string;
  role: string;
  partnerIds: string[];
  referencedPartners: string[];
  missingPartners: string[];
  contextPreview: string;
  partnerSnapshots: string[];
  resultStatus: "completed" | "failed";
  claimId?: string;
  evidenceId?: string;
  claimReferences?: ClaimReference[];
}
```

チーム内通信監査エントリ

### TeamRunRecord

```typescript
interface TeamRunRecord {
  runId: string;
  teamId: string;
  strategy: TeamStrategy;
  task: string;
  communicationRounds?: number;
  failedMemberRetryRounds?: number;
  failedMemberRetryApplied?: number;
  recoveredMembers?: string[];
  communicationLinks?: Record<string, string[]>;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  memberCount: number;
  outputFile: string;
  finalJudge?: {
    verdict: TeamJudgeVerdict;
    confidence: number;
    reason: string;
    nextStep: string;
    uIntra: number;
    uInter: number;
    uSys: number;
    collapseSignals: string[];
  };
  correlationId?: string;
  parentEventId?: string;
}
```

チーム実行記録を表すインターフェース

### TeamStorage

```typescript
interface TeamStorage {
  teams: TeamDefinition[];
  runs: TeamRunRecord[];
  currentTeamId?: string;
  defaultsVersion?: number;
}
```

チーム定義と実行記録のストレージ

### TeamPaths

```typescript
interface TeamPaths {
}
```

チームストレージのパス定義（BaseStoragePathsを拡張）

## 型定義

### TeamEnabledState

```typescript
type TeamEnabledState = "enabled" | "disabled"
```

チームの有効状態を表す型

### TeamStrategy

```typescript
type TeamStrategy = "parallel" | "sequential"
```

チームの実行戦略を表す型

### TeamJudgeVerdict

```typescript
type TeamJudgeVerdict = "trusted" | "partial" | "untrusted"
```

チーム審査の判定結果

---
*自動生成: 2026-02-18T07:48:44.346Z*
