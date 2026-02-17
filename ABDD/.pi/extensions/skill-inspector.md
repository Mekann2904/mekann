---
title: Skill Inspector Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, skill, inspector, assignment, team]
related: []
---

# Skill Inspector Extension

> パンくず: [Home](../README.md) > [Extensions](./) > Skill Inspector Extension

## 概要

Skill Inspector拡張機能は、スキルの割り当て状況を表示するツールです。チームやメンバーへのスキル割り当てを可視化し、管理をサポートします。

## 機能

- 利用可能なスキル一覧表示
- チーム別スキル割り当て表示
- メンバー別スキル割り当て表示
- 未割り当てスキルの特定
- プレーンテキスト/装飾形式の出力

---

## 型定義

### SkillInfo

スキル情報。

```typescript
interface SkillInfo {
  name: string;         // スキル名
  description: string;  // 説明
  filePath: string;     // ファイルパス
}
```

### TeamMemberWithSkills

スキルを持つチームメンバー。

```typescript
interface TeamMemberWithSkills {
  id: string;           // メンバーID
  role: string;         // ロール
  enabled: boolean;     // 有効フラグ
  skills: string[];     // スキルリスト
}
```

### TeamWithSkills

スキルを持つチーム。

```typescript
interface TeamWithSkills {
  id: string;                    // チームID
  name: string;                  // チーム名
  description: string;           // 説明
  enabled: string;               // 有効状態
  skills: string[];              // チーム共通スキル
  members: TeamMemberWithSkills[];  // メンバーリスト
  hasSkills?: boolean;           // スキル保有フラグ
}
```

### SkillUsage

スキル使用状況。

```typescript
interface SkillUsage {
  name: string;                              // スキル名
  description: string;                       // 説明
  usedByTeams: string[];                     // 使用チーム
  usedByMembers: { teamId: string; memberId: string }[];  // 使用メンバー
}
```

---

## 主要関数

### loadAvailableSkills(): Map<string, SkillInfo>

利用可能なスキルをロードします。

```typescript
function loadAvailableSkills(): Map<string, SkillInfo>
```

**戻り値**: スキル名をキーとするスキル情報のマップ

**読み込み元**: `.pi/lib/skills/*/SKILL.md`

### loadTeamDefinitions(): TeamWithSkills[]

チーム定義をロードします。

```typescript
function loadTeamDefinitions(): TeamWithSkills[]
```

**戻り値**: チーム定義の配列

**読み込み元**: `.pi/agent-teams/definitions/*.md` または `*.json`

### calculateSkillUsage(skills, teams): Map<string, SkillUsage>

スキルの使用状況を計算します。

```typescript
function calculateSkillUsage(
  skills: Map<string, SkillInfo>,
  teams: TeamWithSkills[]
): Map<string, SkillUsage>
```

**戻り値**: スキル使用状況のマップ

### formatSkillsOverview(skills, usage): string

スキル概要をフォーマットします（装飾形式）。

```typescript
function formatSkillsOverview(
  skills: Map<string, SkillInfo>,
  usage: Map<string, SkillUsage>
): string
```

### formatSkillsOverviewPlain(skills, usage): string

スキル概要をフォーマットします（プレーンテキスト）。

```typescript
function formatSkillsOverviewPlain(
  skills: Map<string, SkillInfo>,
  usage: Map<string, SkillUsage>
): string
```

### formatTeamsView(teams): string

チームビューをフォーマットします（装飾形式）。

```typescript
function formatTeamsView(teams: TeamWithSkills[]): string
```

### formatTeamDetail(team): string

チーム詳細をフォーマットします（装飾形式）。

```typescript
function formatTeamDetail(team: TeamWithSkills): string
```

### formatSkillDetail(skill, usage): string

スキル詳細をフォーマットします（装飾形式）。

```typescript
function formatSkillDetail(
  skill: SkillInfo,
  usage: SkillUsage
): string
```

---

## ツール

### skill_status

スキル割り当て状況を表示します。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| view | string | はい | ビュータイプ: overview, teams, team, skill |
| teamId | string | いいえ | チームID（team ビュー用） |
| skillName | string | いいえ | スキル名（skill ビュー用） |

**ビュータイプ**:
- `overview`: 全スキルの概要
- `teams`: 全チームのスキル割り当て
- `team`: 特定チームの詳細
- `skill`: 特定スキルの詳細

---

## コマンド

### /skill-status

スキル割り当て状況を表示します。

```
/skill-status                    # 概要表示
/skill-status teams              # チーム一覧
/skill-status team <teamId>      # チーム詳細
/skill-status skill <skillName>  # スキル詳細
```

---

## 使用例

### 概要表示

```
skill_status view="overview"
```

出力例:
```
╔══════════════════════════════════════════════════════════════════╗
║                     SKILLS ASSIGNMENT OVERVIEW                    ║
╚══════════════════════════════════════════════════════════════════╝

## Summary Statistics

  Total Skills: 8
  Assigned to Teams: 3
  Assigned to Members: 5
```

### チーム一覧

```
skill_status view="teams"
```

### 特定チームの詳細

```
skill_status view="team" teamId="backend-team"
```

### 特定スキルの詳細

```
skill_status view="skill" skillName="git-workflow"
```

---

## 割り当てステータス

| ステータス | 説明 |
|-----------|------|
| UNASSIGNED | どのチーム/メンバーにも割り当てられていない |
| TEAM ONLY | チーム共通スキルとしてのみ割り当て |
| MEMBER ONLY | 特定メンバーにのみ割り当て |
| TEAM + MEMBER | チーム共通とメンバー個別の両方で割り当て |

---

## スキルマトリックスの凡例

| 記号 | 説明 |
|-----|------|
| [T] | チーム共通スキル |
| [M] | メンバー固有スキル |
| [T+M] | チーム共通 + メンバー固有 |

---

## データソース

### スキル定義

`.pi/lib/skills/*/SKILL.md` から読み込みます。

フロントマター例:
```yaml
---
name: git-workflow
description: Git操作・ブランチ管理スキル
---
```

### チーム定義

`.pi/agent-teams/definitions/*.md` または `*.json` から読み込みます。

Markdown形式例:
```yaml
---
id: backend-team
name: Backend Team
skills:
  - git-workflow
  - code-review
members:
  - id: implementer
    role: Implementer
    skills:
      - clean-architecture
---
```

---

## 関連トピック

- [Agent Teams Extension](./agent-teams.md) - エージェントチーム管理
- [Dynamic Tools Extension](./dynamic-tools.md) - 動的ツール生成
