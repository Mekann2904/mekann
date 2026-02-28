---
title: agent-team-dag-wrapper
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# agent-team-dag-wrapper

## 概要

`agent-team-dag-wrapper` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### analyze_team_dependencies

Analyze task for team dependencies and recommend optimal execution strategy. Use before agent_team_run_parallel for complex tasks.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Team as "Team"
  participant Unresolved as "Unresolved"

  User->>System: Analyze task for team dependencies and recommend optimal ...
  System->>Team: チーム間依存推論
  Team->>Unresolved: task.toLowerCase (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: lowerTask.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Team->>Unresolved: teamIds.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Team->>Unresolved: dependencies.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Team->>Unresolved: reasons.push (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: dependencies.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Team->>Unresolved: sequentialPatterns.some (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: p.test (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: reasons.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: Array.from(deps.dependencies.entries())         .map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: Array.from (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Unresolved: deps.dependencies.entries (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  System->>Unresolved: task.slice (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: task.replace (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: Object.fromEntries (node_modules/typescript/lib/lib.es2019.object.d.ts)
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[agent-team-dag-wrapper]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### inferTeamDependencies

```typescript
inferTeamDependencies(teamIds: string[], task: string): {
  hasDependencies: boolean;
  dependencies: Map<string, string[]>;
  description: string;
  recommendedTool: string;
}
```

Infer dependencies between teams based on task description

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| teamIds | `string[]` | はい |
| task | `string` | はい |

**戻り値**: `{
  hasDependencies: boolean;
  dependencies: Map<string, string[]>;
  description: string;
  recommendedTool: string;
}`

---
*自動生成: 2026-02-28T13:55:17.710Z*
