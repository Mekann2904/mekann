<!-- File: .pi/APPEND_SYSTEM.md -->
<!-- Description: Project-level appended system prompt that prioritizes subagent and agent-team delegation. -->
<!-- Why: Enforces proactive delegation defaults across every prompt in this repository. -->
<!-- Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, README.md -->

# Quick Reference (READ FIRST)

| Need | Go To |
|------|-------|
| **Navigation** | `.pi/INDEX.md` - Repository structure map |
| **Task-to-Source** | `.pi/NAVIGATION.md` - Find right source for task |
| **Git operations** | Load `skills/git-workflow/SKILL.md` FIRST |
| **Browser/Site access** | Use `playwright_cli` tool (see Browser Automation Rule) |
| **Delegate task** | Use `subagent_run` or `agent_team_run` |
| **Parallel execution** | Use `subagent_run_dag` (see DAG Execution Guide) |
| **Code review** | Load `skills/code-review/SKILL.md` |
| **Architecture** | Load `skills/clean-architecture/SKILL.md` |
| **Ownership system** | `docs/04-reference/ownership.md` - UL workflow ownership |

**Core Rules**: No emoji | Use question tool for user choices | Delegate non-trivial tasks

---

# UL Mode Guideline

基本フロー: Research → Plan → [ユーザーレビュー] → Implement → Commit

> 拡張機能`inject-system-prompt`により、詳細なガイドラインが自動的にシステムプロンプトに注入されます。

---

# DAG Execution Guide

基本原則: 複雑なタスクはDAGで並列化し、レイテンシを削減する

- `subagent_run_dag` - タスクをDAGに分解して並列実行
- `agent_team_run_parallel` - 複数チームを並列実行

> 拡張機能`inject-system-prompt`により、詳細なガイドラインが自動的にシステムプロンプトに注入されます。

---

# Protected Files (DO NOT DELETE)

These files are **system-critical** and must NOT be deleted, renamed, or moved:

| File | Purpose | Auto-loaded |
|------|---------|-------------|
| `.pi/APPEND_SYSTEM.md` | Project-level system prompt (this file) | YES (pi core) |
| `.pi/INDEX.md` | Repository structure map | Referenced in Quick Reference |
| `.pi/NAVIGATION.md` | Task-to-source navigation guide | Referenced in Quick Reference |

**Deletion Protection Rule**: Any task that involves file cleanup, organization, or deletion MUST preserve these files.

---

# Document Template (MANDATORY)

When creating new documentation files, MUST use the template: `docs/_template.md`

## Required Frontmatter

```yaml
---
title: ページタイトル
category: getting-started | user-guide | development | reference | meta
audience: new-user | daily-user | developer | contributor
last_updated: YYYY-MM-DD
tags: []
related: []
---
```

## Exceptions (Template NOT Required)

| Type | Pattern | Reason |
|------|---------|--------|
| System files | `AGENTS.md`, `APPEND_SYSTEM.md`, `INDEX.md`, `NAVIGATION.md`, `SYSTEM.md` | pi core files |
| Skill definitions | `*/SKILL.md` | Skill standard format |
| Team definitions | `*/team.md`, `*/TEAM.md` | Team definition format |
| Templates | `_template.md`, `*-template.md` | Templates themselves |
| References | `references/*.md` | Reference materials |
| Run logs | `runs/*.md`, `*.SUMMARY.md` | Auto-generated |
| Changelog | `CHANGELOG.md` | Changelog format |

## Japanese Language Rule (MANDATORY)

All documentation MUST be written in Japanese (日本語).

**Exceptions (English allowed)**:
- Code examples (variable names, function names, API endpoints)
- Command names and CLI options
- File paths and URLs
- Technical terms without standard Japanese translation

---

# JSDoc System Prompt (Default Source)

The JSDoc generator (`scripts/add-jsdoc.ts`) MUST load its default system prompt from this file.

<!-- JSDOC_SYSTEM_PROMPT_START -->
あなたはTypeScriptのJSDocコメント生成アシスタントです。日本語で簡潔かつ正確なJSDocを生成してください。
必須タグは @summary / @param / @returns です。
条件付きで @throws（例外を投げる場合）と @deprecated（非推奨の場合）を付与してください。
イベント駆動の場合のみ @fires と @listens を付与してください。
@summary は20字以内で、シーケンス図の矢印ラベルとしてそのまま使える具体的な文にしてください。
出力はJSDocのみとし、コードブロックは使わないでください。
<!-- JSDOC_SYSTEM_PROMPT_END -->

---

<!-- ABDD_FILE_HEADER_PROMPT_START -->
あなたはTypeScriptファイル用のABDDヘッダー生成アシスタントです。
出力はコメントブロックのみ（/** ... */）にしてください。
必須構造:
- @abdd.meta
- path, role, why, related, public_api, invariants, side_effects, failure_modes
- @abdd.explain
- overview, what_it_does, why_it_exists, scope(in/out)
要件:
- 日本語で簡潔に記述する
- コードと矛盾する内容を書かない
- 曖昧語（適切に処理する、必要に応じて 等）を避ける
- related は2〜4件
<!-- ABDD_FILE_HEADER_PROMPT_END -->

---

# Execution Rules (MANDATORY)

The following rules apply to ALL agents, subagents, and team members in this project.

## JSDoc + ABDD Header Enforcement (MANDATORY)

For every TypeScript change in this repository, documentation comments are NOT optional.

### REQUIRED behavior

1. When creating or editing any `.ts` / `.tsx` file under `.pi/extensions` or `.pi/lib`:
   - MUST create or update JSDoc for changed public symbols.
   - MUST create or update the ABDD structured file header comment.

2. Completion gate for TypeScript edits:
   - A task is NOT complete until both JSDoc and ABDD header updates are applied.

### Trigger conditions

- Adding new TypeScript files
- Modifying function signatures
- Modifying exported APIs
- Refactoring module responsibility or behavior

### Violation handling

If code was changed without comment updates, STOP and fix comments first before finalizing.

---

## Git Workflow Skill Auto-Load (MANDATORY)

### REQUIRED behavior

1. When the task involves ANY git-related operation, you MUST read and follow the git-workflow skill BEFORE taking action.
2. Load command: `read tool with path: .pi/skills/git-workflow/SKILL.md`
3. The skill MUST be loaded BEFORE planning or executing ANY git-related operation.

### Detection patterns (MANDATORY load trigger)

- Keywords: "git", "commit", "branch", "push", "pull", "merge", "rebase", "stash", "checkout", "reset"
- Japanese: "コミット", "ブランチ", "プッシュ", "マージ", "リベース", "コンフリクト"
- Actions: version control, code history, commit message, conflict resolution, branch management

### Violation handling

If you attempt any git command without first loading the git-workflow skill, STOP and load it immediately.

---

## Quality Guidelines (RECOMMENDED)

- No emoji | Use question tool for user choices | Complete responses only

---

## Confirm-Before-Edit (RECOMMENDED)

`edit()` 前に `read()` で正確なテキストを確認（edit失敗率4.3%削減）

---

## Delegation Policy (RECOMMENDED)

委任を推奨するが、強制はしない。委任は「品質保証の手法」であり、「従順さの儀式」ではない。

**直接実行可能**: 単純タスク（1-2ステップ）、ドキュメントのみ更新、緊急時、既に十分な分析済み
**委任推奨**: アーキテクチャ決定、複数ファイル変更、セキュリティ関連、DBスキーマ変更、API契約修正

---

## Delegation Checklist (RECOMMENDED)

委任前確認: Context十分? Task明確? 前提条件OK?
危険信号: 「とにかく委任」、曖昧なタスク、成功基準なし

---

## Discussion Policy (RECOMMENDED)

複数エージェント委任時は、他エージェントの出力を参照し、合意点または反論点を少なくとも1つ特定することを推奨。

---

## Token Efficiency (RECOMMENDED)

エージェント間通信では英語・簡潔・構造化フォーマットを使用：

```
[CLAIM] <1文の主張>
[EVIDENCE] - <証拠> (file:line)
[CONFIDENCE] <0.0-1.0>
[ACTION] <next|done>
```

ユーザーへの最終出力のみ日本語・詳細で記述。

---

## Browser Automation Rule (MANDATORY)

ブラウザやウェブサイトを開く・操作するタスクでは、**積極的に`playwright_cli`ツールを使用すること**。

### REQUIRED behavior

1. ブラウザでURLを開く必要がある場合、`playwright_cli`ツールを使用する
2. デフォルトでヘッドモード（`--headed`）を使用し、ブラウザを表示する
3. 詳細なコマンドは `skills/playwright-cli/SKILL.md` を参照

### 検出パターン（MANDATORY load trigger）

- キーワード: "open browser", "visit site", "navigate to", "go to URL", "web page"
- 日本語: "ブラウザで開く", "サイトを開く", "ページを見る", "ウェブサイト", "URLにアクセス"
- アクション: ウェブサイトの閲覧、フォーム入力、スクリーンショット取得、ページ操作

### 使用例

```typescript
// URLを開く（ヘッドモード）
playwright_cli({
  command: "open",
  args: ["--headed", "https://example.com"]
})

// フォームに入力
playwright_cli({
  command: "fill",
  args: ["#email", "user@example.com"]
})

// スクリーンショット
playwright_cli({
  command: "screenshot"
})
```

### 理由

- **トークン効率**: ページデータをLLMに強制的に読み込まない
- **コーディングエージェント最適化**: 簡潔な目的別コマンドによる操作
- **セッション管理**: 複数のブラウザセッションを管理可能

### 違反時の対応

ブラウザを開くために他の方法を使用しようとした場合、STOPし、`playwright_cli`ツールを使用すること。
