---
title: agent-teams
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, extensions]
---

# agent-teams

## 概要

マルチメンバーのエージェントチームオーケストレーションツールを提供する。専門化されたチームメイトロール間での並列コラボレーションを可能にする。

## エクスポート

### インターフェース

#### TeamDefinition

```typescript
interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  enabled: TeamEnabledState;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}
```

チーム定義。

#### TeamMember

```typescript
interface TeamMember {
  id: string;
  role: string;
  description: string;
  provider?: string;
  model?: string;
  enabled: boolean;
}
```

チームメンバー定義。

#### TeamMemberResult

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

メンバー実行結果。

#### TeamRunRecord

```typescript
interface TeamRunRecord {
  runId: string;
  teamId: string;
  strategy: TeamStrategy;
  task: string;
  communicationRounds: number;
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
  finalJudge?: TeamJudgeVerdict;
}
```

チーム実行レコード。

#### TeamJudgeVerdict

```typescript
interface TeamJudgeVerdict {
  verdict: "accept" | "reject" | "uncertain";
  confidence: number;
  reason: string;
  nextStep: string;
  uIntra: number;
  uInter: number;
  uSys: number;
  collapseSignals: string[];
}
```

最終判定結果。

### 型エイリアス

#### TeamEnabledState

```typescript
type TeamEnabledState = "enabled" | "disabled"
```

#### TeamStrategy

```typescript
type TeamStrategy = "parallel" | "sequential"
```

### 関数（再エクスポート）

#### parseTeamMarkdownFile

```typescript
export function parseTeamMarkdownFile(content: string, filename: string): ParsedTeamMarkdown | null
```

チーム定義Markdownファイルをパースする。

#### loadTeamDefinitionsFromDir

```typescript
export function loadTeamDefinitionsFromDir(teamsDir: string): TeamDefinition[]
```

ディレクトリからチーム定義を読み込む。

#### runMember

```typescript
export async function runMember(input: {...}): Promise<TeamMemberResult>
```

チームメンバーを実行する。

#### resolveTeamParallelCapacity

```typescript
export function resolveTeamParallelCapacity(
  candidates: TeamParallelCapacityCandidate[],
  snapshot: AgentRuntimeSnapshot
): TeamParallelCapacityResolution
```

チームの並列キャパシティを解決する。

## 登録ツール

### agent_team_list

設定されたエージェントチームとチームメイトの一覧を表示。

### agent_team_create

カスタムエージェントチームを作成。

```typescript
parameters: {
  id?: string;
  name: string;
  description: string;
  members: Array<{
    id: string;
    role: string;
    description: string;
    provider?: string;
    model?: string;
    enabled?: boolean;
  }>;
  setCurrent?: boolean;
}
```

### agent_team_configure

チームの設定を更新（有効/無効、デフォルト設定）。

### agent_team_run

指定されたチームでタスクを実行。

```typescript
parameters: {
  teamId?: string;
  task: string;
  strategy?: TeamStrategy;
  memberParallelLimit?: number;
  communicationRounds?: number;
  failedMemberRetryRounds?: number;
  timeoutMs?: number;
}
```

### agent_team_run_parallel

複数のチームを並列で実行。

### agent_team_status

アクティブなチーム実行のステータスを表示。

### agent_team_judge

チーム結果に対する最終判定を実行。

## 使用例

```typescript
// チーム一覧
agent_team_list()

// チーム作成
agent_team_create({
  name: "code-review-team",
  description: "コードレビュー専門チーム",
  members: [
    { id: "architect", role: "アーキテクト", description: "設計観点" },
    { id: "security", role: "セキュリティ", description: "セキュリティ観点" }
  ]
})

// チーム実行
agent_team_run({
  teamId: "code-review-team",
  task: "このPRをレビューしてください",
  strategy: "parallel"
})
```

## 通信ラウンド

チームメンバー間での通信ラウンドをサポート:
- 各メンバーは他のメンバーの出力を参照可能
- CLAIM/DISCUSSION/RESULT形式での出力解析
- 参照不足の検出

## 最終判定 (Final Judge)

- proxyベースの不確実性評価
- uIntra（メンバー内不確実性）
- uInter（メンバー間不確実性）
- uSys（システム不確実性）

## 関連

- `.pi/extensions/subagents.ts`
- `.pi/extensions/plan.ts`
- `.pi/extensions/agent-runtime.ts`
- `.pi/extensions/agent-teams/storage.ts`
- `.pi/extensions/agent-teams/judge.ts`
- `.pi/extensions/agent-teams/communication.ts`
