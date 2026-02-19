---
title: skill-inspector
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# skill-inspector

## 概要

`skill-inspector` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': readdirSync, existsSync, readFileSync
// from 'node:path': join, basename
// from '@mariozechner/pi-coding-agent': parseFrontmatter
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### skill_status

Show skill assignment status. Use to see which skills are available, which teams use which skills, and which members have skill assignments.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Storage as "Storage"
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant Team as "Team"

  User->>System: Show skill assignment status. Use to see which skills are...
  System->>Storage: loadAvailableSkills
  Storage->>Internal: join
  Storage->>Internal: existsSync
  Storage->>Storage: readdirSync
  Storage->>Unresolved: entry.isDirectory (node_modules/@types/node/fs.d.ts)
  Storage->>Storage: readFileSync
  Storage->>Unresolved: parseFrontmatter (node_modules/@mariozechner/pi-coding-agent/dist/utils/frontmatter.d.ts)
  Storage->>Unresolved: skills.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Team: loadTeamDefinitions
  Team->>Unresolved: readdirSync(teamsDir).filter (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: f.endsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Team->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: basename(file, '.md').replace (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Internal: basename
  Team->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: members.push (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: loadedTeams.get (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Team->>Unresolved: members.some (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: loadedTeams.values (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  System->>Internal: calculateSkillUsage
  Internal->>Unresolved: skill.usedByTeams.includes (node_modules/typescript/lib/lib.es2016.array.include.d.ts)
  System->>Internal: formatSkillsOverview
  Internal->>Unresolved: [...skills.entries()].sort (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: skills.entries (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  Internal->>Unresolved: a[0].localeCompare (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: skill.description.slice (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: membersByTeam.has (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  Internal->>Unresolved: '─'.repeat (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Team: formatTeamsView
  System->>Unresolved: teams.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: teams.find (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System->>Team: formatTeamDetail
  Team->>Unresolved: team.name.toUpperCase().padEnd (node_modules/typescript/lib/lib.es2017.string.d.ts)
  Team->>Unresolved: team.name.toUpperCase (node_modules/typescript/lib/lib.es5.d.ts)
  Team->>Unresolved: allSkills.add (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Unresolved: skills.keys (node_modules/typescript/lib/lib.es2015.iterable.d.ts)
  System->>Internal: formatSkillDetail
  Internal->>Unresolved: skill.description.split (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### クラス図

```mermaid
classDiagram
  class SkillInfo {
    <<interface>>
    +name: string
    +description: string
    +filePath: string
  }
  class TeamMemberWithSkills {
    <<interface>>
    +id: string
    +role: string
    +enabled: boolean
    +skills: string
  }
  class TeamWithSkills {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +enabled: string
    +skills: string
  }
  class SkillUsage {
    <<interface>>
    +name: string
    +description: string
    +usedByTeams: string
    +usedByMembers: teamId_string_membe
  }
  class TeamFrontmatter {
    <<interface>>
    +id: string
    +name: string
    +description: string
    +enabled: string
    +skills: string
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[skill-inspector]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### loadAvailableSkills

```typescript
loadAvailableSkills(): Map<string, SkillInfo>
```

Load all available skills from .pi/lib/skills/

**戻り値**: `Map<string, SkillInfo>`

### loadTeamDefinitions

```typescript
loadTeamDefinitions(): TeamWithSkills[]
```

Load team definitions with skill assignments

**戻り値**: `TeamWithSkills[]`

### calculateSkillUsage

```typescript
calculateSkillUsage(skills: Map<string, SkillInfo>, teams: TeamWithSkills[]): Map<string, SkillUsage>
```

Calculate skill usage across all teams

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skills | `Map<string, SkillInfo>` | はい |
| teams | `TeamWithSkills[]` | はい |

**戻り値**: `Map<string, SkillUsage>`

### formatSkillsOverviewPlain

```typescript
formatSkillsOverviewPlain(skills: Map<string, SkillInfo>, usage: Map<string, SkillUsage>): string
```

Format skills overview - Plain text version for command output

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skills | `Map<string, SkillInfo>` | はい |
| usage | `Map<string, SkillUsage>` | はい |

**戻り値**: `string`

### formatTeamDetailPlain

```typescript
formatTeamDetailPlain(team: TeamWithSkills): string
```

Format team detail - Plain text version for command output

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| team | `TeamWithSkills` | はい |

**戻り値**: `string`

### formatSkillDetailPlain

```typescript
formatSkillDetailPlain(skill: SkillInfo, usage: SkillUsage): string
```

Format skill detail - Plain text version for command output

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skill | `SkillInfo` | はい |
| usage | `SkillUsage` | はい |

**戻り値**: `string`

### formatTeamsViewPlain

```typescript
formatTeamsViewPlain(teams: TeamWithSkills[]): string
```

Format teams view - Plain text version for command output

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| teams | `TeamWithSkills[]` | はい |

**戻り値**: `string`

### formatSkillsOverview

```typescript
formatSkillsOverview(skills: Map<string, SkillInfo>, usage: Map<string, SkillUsage>): string
```

Format skills overview (markdown for tool output)

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skills | `Map<string, SkillInfo>` | はい |
| usage | `Map<string, SkillUsage>` | はい |

**戻り値**: `string`

### formatTeamsView

```typescript
formatTeamsView(teams: TeamWithSkills[]): string
```

Format team skills view

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| teams | `TeamWithSkills[]` | はい |

**戻り値**: `string`

### formatTeamDetail

```typescript
formatTeamDetail(team: TeamWithSkills): string
```

Format single team detail

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| team | `TeamWithSkills` | はい |

**戻り値**: `string`

### formatSkillDetail

```typescript
formatSkillDetail(skill: SkillInfo, usage: SkillUsage): string
```

Format skill detail

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| skill | `SkillInfo` | はい |
| usage | `SkillUsage` | はい |

**戻り値**: `string`

## インターフェース

### SkillInfo

```typescript
interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
}
```

### TeamMemberWithSkills

```typescript
interface TeamMemberWithSkills {
  id: string;
  role: string;
  enabled: boolean;
  skills: string[];
}
```

### TeamWithSkills

```typescript
interface TeamWithSkills {
  id: string;
  name: string;
  description: string;
  enabled: string;
  skills: string[];
  members: TeamMemberWithSkills[];
  hasSkills?: boolean;
}
```

### SkillUsage

```typescript
interface SkillUsage {
  name: string;
  description: string;
  usedByTeams: string[];
  usedByMembers: { teamId: string; memberId: string }[];
}
```

### TeamFrontmatter

```typescript
interface TeamFrontmatter {
  id?: string;
  name?: string;
  description?: string;
  enabled?: string;
  skills?: string[];
  members?: Array<{
    id?: string;
    role?: string;
    enabled?: boolean;
    skills?: string[];
  }>;
}
```

---
*自動生成: 2026-02-18T18:06:17.421Z*
