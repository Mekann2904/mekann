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
| **Delegate task** | Use `subagent_run` or `agent_team_run` |
| **Parallel execution** | Use `subagent_run_dag` (see DAG Execution Guide) |
| **Code review** | Load `skills/code-review/SKILL.md` |
| **Architecture** | Load `skills/clean-architecture/SKILL.md` |

**Core Rules**: No emoji | Use question tool for user choices | Delegate non-trivial tasks

---

# UL Mode Guideline (RECOMMENDED)

`ul <task>` で呼び出される委任モード。調査・計画・実装を自律的に行う。

## 基本原則

> **エージェントにコードを書かせる前に、必ず文章化された計画をレビュー・承認する**

## フロー

```
Research → Plan → [ユーザーレビュー] → Implement
```

---

## 第1段階：Research（調査）

コードベースの該当部分を**徹底的に**理解する。調査結果は必ず `.pi/ul-workflow/tasks/{taskId}/research.md` に記述する。

### アクション（推奨：専用ツールを使用）

```
ul_workflow_research({ task: "<タスク>", task_id: "<taskId>" })
```

### アクション（直接委任の場合）

```
subagent_run({
  subagentId: "researcher",
  task: "このフォルダの内容を徹底的に調査し、その仕組み、機能、およびすべての仕様を深く理解してください。調査が完了したら、得られた知見と学習内容を詳細にまとめたレポートを「.pi/ul-workflow/tasks/<taskId>/research.md」ファイルに作成してください。"
})
```

### 重要な表現

- **「深く」**
- **「詳細にわたって」**
- **「複雑な部分まで」**
- **「すべてを徹底的に」**

これらの言葉がないと、表面的な読み取りしか行わない。

### research.mdの目的

- ユーザーのレビュー用資料
- エージェントがシステムを正しく理解しているか確認
- 誤解があれば計画段階前に修正
- 保存場所: `.pi/ul-workflow/tasks/{taskId}/research.md`

---

## 第2段階：Plan（計画策定）

詳細な実装計画を `.pi/ul-workflow/tasks/{taskId}/plan.md` に作成する。

### アクション（推奨：専用ツールを使用）

```
ul_workflow_plan({ task: "<タスク>", task_id: "<taskId>" })
```

### アクション（直接委任の場合）

```
subagent_run({
  subagentId: "architect",
  task: "以下のタスクの詳細な実装計画をplan.mdに作成してください。コードスニペットも必ず含めてください。\n\nタスク: <task>\n\n保存先: .pi/ul-workflow/tasks/<taskId>/plan.md"
})
```

### plan.mdの構造

保存場所: `.pi/ul-workflow/tasks/{taskId}/plan.md`

```markdown
# 実装計画: <タスク名>

## 目的
<何を実現するか>

## 変更内容
1. <ファイルA>: <変更内容>

## 手順
1. <手順1>

## 考慮事項
- <考慮事項1>

## Todo
- [ ] <タスク1>
```

---

## 第3段階：Annotation Cycle（ユーザーレビュー）

**ここはユーザーが主導する。エージェントは待機。**

ユーザーがplan.mdをエディタで開き、インライン注釈（`<!-- NOTE: ... -->`）を追加する。

plan.mdの場所: `.pi/ul-workflow/tasks/{taskId}/plan.md`

### ユーザーが満足するまで繰り返し

1. ユーザーが注釈を追加
2. エージェントがplan.mdを更新
3. ユーザーが再レビュー
4. 満足したら実装へ

**「don't implement yet」ガードが必須**

---

## 第4段階：Todo List（タスクリスト）

実装前に詳細なタスクリストをplan.mdに追加する。

### Todo Listの目的

- 実装中の進捗トラッカー
- 完了したタスクをマークしていく

---

## 第5段階：Implement（実装）

計画に従って機械的に実装する。

### アクション（単一エージェント）

```
subagent_run({
  subagentId: "implementer",
  task: "plan.mdのすべてを実装してください...",
  extraContext: "plan.mdの場所: .pi/ul-workflow/tasks/<taskId>/plan.md"
})
```

### アクション（エージェントチーム - 並列実行）

```
agent_team_run({
  teamId: "core-delivery-team",
  task: "plan.mdの以下のタスクを並列で実装してください: <タスク>",
  sharedContext: "plan.mdの場所: .pi/ul-workflow/tasks/<taskId>/plan.md",
  strategy: "parallel"
})
```

### エージェントチームを使用する場面

| 場面 | 推奨 |
|------|------|
| 単一ファイルの変更 | `subagent_run({ subagentId: "implementer" })` |
| 複数の独立したファイル変更 | `agent_team_run_parallel` |
| 実装 + レビューを同時 | `subagent_run_parallel(["implementer", "code-reviewer"])` |

### 実装の原則

- **implement it all**: planのすべてを実行、チェリーピックしない
- **mark it as completed**: planが進捗の信頼できる情報源
- **do not stop until completed**: 確認のために途中で停止しない

**実装は機械的であるべき。創造的な作業は計画段階で完了している。**

---

## 判断の指針

| 状況 | フロー |
|------|--------|
| 重要な実装 | Research → Plan → Annotation Cycle → Todo → Implement |
| 中程度の実装 | Research → Plan → [確認] → Implement |
| 軽微な修正 | 直接編集（plan省略可） |
| 調査のみ | Research → 報告 |

---

# DAG Execution Guide (RECOMMENDED)

依存関係を持つタスクをDAG（有向非巡回グラフ）として分解し、依存関係に基づいて並列実行する。

## 基本原則

> **複雑なタスクはDAGで並列化し、レイテンシを削減する**

## 使用方法

### 自動DAG生成（推奨）

```typescript
subagent_run_dag({
  task: "認証システムを実装してテストを追加"
})
// plan省略時は自動的にDAGを生成
```

### 明示的プラン指定

```typescript
subagent_run_dag({
  task: "APIリファクタリング",
  plan: {
    id: "api-refactor",
    description: "APIリファクタリング",
    tasks: [
      { id: "research", description: "調査", assignedAgent: "researcher", dependencies: [] },
      { id: "impl-auth", description: "認証実装", assignedAgent: "implementer", dependencies: ["research"] },
      { id: "impl-users", description: "ユーザー実装", assignedAgent: "implementer", dependencies: ["research"] },
      { id: "review", description: "レビュー", assignedAgent: "reviewer", dependencies: ["impl-auth", "impl-users"] }
    ]
  },
  maxConcurrency: 3
})
```

## 実行パターン

### Fan-out（並列実行）

```
       ┌── impl-auth
research ├── impl-users
       └── impl-products
```

1つのタスクが複数の独立したタスクに分岐。**並列実行で高速化**。

### Fan-in（統合）

```
impl-auth ─┐
impl-users ─┼── review
impl-prods ─┘
```

複数のタスクが1つのタスクに収束。**全完了待ち**。

### Diamond（並列→統合）

```
       ┌── impl-auth ──┐
research │              ├── review
       └── impl-users ─┘
```

Fan-out + Fan-inの組み合わせ。**最も一般的なパターン**。

## 自動依存推論ルール

| エージェント | 自動依存先 |
|-------------|-----------|
| `researcher` | なし |
| `implementer` | `researcher`（存在する場合） |
| `tester` | すべての`implementer` |
| `reviewer` | すべての`implementer` |
| `architect` | `researcher`（存在する場合） |

## いつDAGを使うか

| 状況 | 推奨ツール |
|------|-----------|
| 単純な単一タスク | `subagent_run` |
| 複数エージェント並列（依存なし） | `subagent_run_parallel` |
| 複雑なタスク（依存あり） | `subagent_run_dag` |
| 高複雑度タスク（ULモード） | `ul_workflow_dag` |

### 複雑度判定

| 複雑度 | 条件 | 実行戦略 |
|--------|------|---------|
| 低 | 単純な変更、明確なゴール | `subagent_run` |
| 中 | 複数コンポーネント、ステップ指示あり | `subagent_run_dag` |
| 高 | アーキテクチャ変更、リファクタリング | `ul_workflow_dag` |

## パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|----|------|
| `task` | string | Yes | 実行するタスク |
| `plan` | TaskPlan | No | 明示的なDAGプラン（省略時は自動生成） |
| `autoGenerate` | boolean | No | plan省略時に自動生成するか（デフォルト: true） |
| `maxConcurrency` | number | No | 最大並列数（デフォルト: 3） |
| `abortOnFirstError` | boolean | No | 最初のエラーで中止するか（デフォルト: false） |

## 実行例

```
[subagent_run_dag] Auto-generated plan: auto-xxx (4 tasks, max depth: 2)

Tasks:
  - research [researcher]: 調査...
  - implement [implementer] (deps: research): 実装...
  - test [tester] (deps: implement): テスト...
  - review [reviewer] (deps: implement): レビュー...

Execution:
  [1/4] research started...
  [1/4] research completed (120s)
  [2/4] implement started...
  [3/4] test waiting for: implement
  [4/4] review waiting for: implement
  [2/4] implement completed (180s)
  [3/4] test started...
  [4/4] review started...
  ...
```

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

### Output Format

- **No emoji**: テキストのみの環境での可読性確保
- **Text-only format**: Markdownパーサーでの一貫した表示

### User Interaction

- **Question tool**: 選択肢からの選択、アクション前の確認に使用
- **Autonomous execution**: 安全な仮定が可能な場合は自律実行

### Prompt Quality

- **No shortcuts**: 省略は情報の欠落を招く
- **Complete responses**: 不完全な回答は追加のやり取りを必要とする
- **Concrete artifacts**: 抽象的な記述は実行可能性を下げる

> これらは「推奨」であり、理由を明確にすれば例外を認める。

---

## Confirm-Before-Edit Practice (RECOMMENDED)

### Why This Matters

Data shows edit failure rate of 4.3%, primarily from "exact text not found" errors.

### The Practice

```
BEFORE: edit(path, oldText, newText)
AFTER:  read(path) → verify exact text → edit(path, exactOldText, newText)
```

This is NOT a mandatory rule. It is a **mindfulness practice** to recognize craving patterns.

---

## Delegation Quality Checklist (RECOMMENDED)

### Before Delegating (Quick Check)

1. **Context sufficient?** Does the delegate have enough context to complete the task?
2. **Task clear?** Is the expected output unambiguous?
3. **Preconditions met?** Are necessary files/states available?

### Red Flags (Craving Symptoms)

- "Just delegate it quickly" without context
- Vague task descriptions ("review the code")
- No success criteria defined

---

# Delegation-First Policy (RECOMMENDED)

委任を推奨するが、強制はしない。委任は「品質保証の手法」であり、「従順さの儀式」ではない。

## 重要: 委任するかどうかはエージェントの判断に委ねる

委任には明確な価値があるが、「委任せよ」と強制すれば、委任は従順さの儀式となり、本来の目的（品質向上）を損なう。

### 委任しない自由

以下の場合、委任せずに直接実装することを許可する：

- タスクが明確に単純である（1-2ステップで完了）
- コンテキストが委任先に適切に伝達できない
- 緊急時（速度が品質より優先される）
- 既に十分な分析を行い、実装フェーズにある

### 委任を推奨する理由

1. **Planning Fallacy**: エージェントはタスクの複雑さを過小評価する
2. **Cognitive Load Saturation**: 単一エージェントは詳細を見落とす
3. **Single-Perspective Blindness**: 1つの視点では見えないものがある
4. **No Self-Correction Without Feedback**: フィードバックなしではエラーに気づけない
5. **Sequential Bottleneck**: 並列委任の方が高速

### When Direct Editing IS Appropriate

- Trivial typo fixes (1-2 character changes)
- Documentation-only updates
- Emergency hotfixes where speed is critical
- You have ALREADY delegated analysis and now implement the agreed solution

### When Direct Editing IS NOT Appropriate

- Any task involving architectural decisions
- Code that will affect multiple files or modules
- Security-sensitive changes
- Database schema changes
- API contract modifications

### RECOMMENDED behavior

| 場面 | 推奨ツール |
|------|-----------|
| 単一ファイル変更 | `subagent_run({ subagentId: "implementer" })` |
| 複数独立ファイル | `agent_team_run_parallel` |
| 実装+レビュー同時 | `subagent_run_parallel(["implementer", "reviewer"])` |

### Parallel speed policy (RECOMMENDED)

- タスクが独立している場合、委任エージェント数を意図的に制限しない
- 研究、仮説検証、レビュー重視のタスクでは並列ファンアウトを使用

---

# Discussion-First Policy (RECOMMENDED)

多エージェントシナリオでの議論を推奨するが、強制はしない。

## 議論しない自由

以下の場合、詳細な議論を省略することを許可する：

- タスクが単純で、複数視点の統合が必要ない
- 他のエージェントの出力が利用可能でない
- 緊急時（速度が優先される）
- 既に十分な合意形成が行われている

## RECOMMENDED behavior

1. 2以上のエージェントに委任した場合:
   - 他のエージェントの出力を参照することを推奨
   - 合意点または反論点を少なくとも1つ特定することを推奨
   - 「DISCUSSION」セクションを含めることを推奨

2. 出力フォーマット:
   ```
   SUMMARY: <要約>
   CLAIM: <1文の主張>
   EVIDENCE: <証拠リスト>
   CONFIDENCE: <0.00-1.00>
   DISCUSSION: <他エージェント出力への参照>
   RESULT: <主な回答>
   NEXT_STEP: <次のアクション>
   ```

---

# Token Efficiency Template (RECOMMENDED)

エージェント間通信では英語・簡潔・構造化フォーマットを使用：

```
[CLAIM] <1文の主張>
[EVIDENCE] - <証拠> (file:line)
[CONFIDENCE] <0.0-1.0>
[ACTION] <next|done>
```

ユーザーへの最終出力のみ日本語・詳細で記述。
