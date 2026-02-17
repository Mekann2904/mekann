---
title: Skill Registry
category: reference
audience: developer
last_updated: 2026-02-18
tags: [skill, registry, loading, resolution, merging]
related: [subagents, agent-teams]
---

# Skill Registry

サブエージェントとエージェントチームのスキル読み込み、解決、マージを処理するモジュール。

主な機能:
- pi-coreスキルシステムからスキルを読み込み
- 名前またはIDでスキルを解決
- 継承ルールでスキルをマージ（親->子、チーム共通 + メンバー個別）
- プロンプト注入用にスキルコンテンツをフォーマット

## 型定義

### SkillDefinition

pi-core Skillインターフェースに一致するスキル定義。

```typescript
interface SkillDefinition {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation: boolean;
}
```

### SkillReference

スキル参照 - スキル名またはパス。

```typescript
type SkillReference = string;
```

### ResolvedSkill

コンテンツが読み込まれた解決済みスキル。

```typescript
interface ResolvedSkill extends SkillDefinition {
  content: string;
}
```

### ResolveSkillsOptions

スキル解決オプション。

```typescript
interface ResolveSkillsOptions {
  cwd: string;                          // 相対パス解決用の作業ディレクトリ
  agentDir?: string;                    // グローバルスキル用のエージェントディレクトリ（デフォルト: ~/.pi/agent）
  skillPaths?: string[];                // 検索する追加のスキルパス
}
```

### SkillMergeConfig

継承用のスキルマージ設定。

```typescript
interface SkillMergeConfig {
  parentSkills?: SkillReference[];      // 親スキル（チーム/サブエージェントレベルから継承）
  childSkills?: SkillReference[];       // 子スキル（メンバー固有）
  strategy?: "replace" | "merge";       // 戦略: "replace"は親を無視、"merge"は両方を結合
}
```

### ResolveSkillsResult

スキル解決の結果。

```typescript
interface ResolveSkillsResult {
  skills: ResolvedSkill[];
  errors: string[];
  warnings: string[];
}
```

## 関数

### resolveSkills

参照によって複数のスキルを解決する。

```typescript
function resolveSkills(
  references: SkillReference[],
  options: ResolveSkillsOptions,
): ResolveSkillsResult
```

### mergeSkills

継承ルールに従ってスキルをマージする。

ルール:
- 空の配列 [] は無視される（「指定なし」として扱われる）
- 親スキルはデフォルトで継承される
- 子スキルは親スキルとマージされる
- "replace"戦略は親スキルを無視する

```typescript
function mergeSkills(
  config: SkillMergeConfig,
  options: ResolveSkillsOptions,
): ResolveSkillsResult
```

### mergeSkillArrays

継承パターンを処理してスキル配列をマージする。サブエージェントとエージェントチームで使用される。

```typescript
function mergeSkillArrays(
  parentSkills: SkillReference[] | undefined,
  childSkills: SkillReference[] | undefined,
): SkillReference[]
```

### formatSkillsForPrompt

プロンプト注入用に解決済みスキルをフォーマットする。

```typescript
function formatSkillsForPrompt(skills: ResolvedSkill[]): string
```

### formatSkillsWithContent

即座に使用するためにフルコンテンツ付きで解決済みスキルをフォーマットする。

```typescript
function formatSkillsWithContent(skills: ResolvedSkill[]): string
```

### loadSkillsForAgent

サブエージェントまたはチームメンバーのスキルを読み込んで解決する。

```typescript
function loadSkillsForAgent(
  skillReferences: SkillReference[] | undefined,
  parentSkillReferences: SkillReference[] | undefined,
  cwd: string,
): { promptSection: string; skills: ResolvedSkill[]; errors: string[] }
```

### validateSkillReferences

コンテンツを読み込まずにスキル参照を検証する。

```typescript
function validateSkillReferences(
  references: SkillReference[],
  cwd: string,
): { valid: string[]; invalid: string[] }
```

## スキル検索パス

スキルは以下の順序で検索される:

1. プロジェクトローカルスキル: `<cwd>/.pi/lib/skills/`
2. グローバルスキル: `~/.pi/agent/skills/`

## スキルファイル形式

スキルは `SKILL.md` ファイルにYAMLフロントマター付きで定義される:

```markdown
---
name: skill-name
description: Skill description
disable-model-invocation: false
---

Skill content goes here...
```
