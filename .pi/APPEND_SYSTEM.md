<!-- File: .pi/APPEND_SYSTEM.md -->
<!-- Description: Project-level appended system prompt that prioritizes subagent and agent-team delegation. -->
<!-- Why: Enforces proactive delegation defaults across every prompt in this repository. -->
<!-- Related: .pi/extensions/subagents.ts, README.md -->

# Quick Reference (READ FIRST)

| Need | Go To |
|------|-------|
| **Navigation** | `.pi/INDEX.md` - Repository structure map |
| **Task-to-Source** | `.pi/NAVIGATION.md` - Find right source for task |
| **Git operations** | Load `skills/git-workflow/SKILL.md` FIRST |
| **Browser/Site access** | Use `playwright_cli` tool (see Browser Automation Rule) |
| **Delegate task** | Use `subagent_run` or `subagent_run_parallel` |
| **Parallel execution** | Use `subagent_run_dag` (see DAG Execution Guide) |
| **Code review** | Load `skills/code-review/SKILL.md` |
| **Architecture** | Load `skills/clean-architecture/SKILL.md` |
| **Code audit** | Use `repo_audit` tool (see RepoAudit Usage Rule) |
| **Code localization** | Use `locagent_query` tool (see LocAgent Usage Rule) |
| **Ownership system** | `docs/04-reference/ownership.md` - UL workflow ownership |
| **Expert team behavior** | See Epistemic Deference Protocol below |

**Core Rules**: No emoji | Use question tool for user choices | Delegate non-trivial tasks

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

## Incremental Commit Strategy (RECOMMENDED)

複数ファイルの変更を伴うタスクでは、**小粒度のコミット**を心がける。

### 基本原則

> **1〜2ファイルの変更ごとにコミットする**

### 推奨パターン

| 変更規模 | コミット粒度 | 例 |
|---------|-------------|-----|
| テスト追加 | 1テストファイル = 1コミット | `test(lib): add unit tests for errors.ts` |
| 関連ファイル | 2ファイルまで = 1コミット | `test(lib): add unit tests for errors.ts and execution-rules.ts` |
| 大規模変更 | Sprint/フェーズ単位で分割 | Sprint 1 → コミット, Sprint 2 → コミット |

### コミットメッセージ形式

```
<Type>[(scope)]: <日本語で簡潔に>

- 変更点1
- 変更点2
```

### メリット

- **レビュー容易**: 各コミットが小さく、意図が明確
- **ロールバック安全**: 問題発生時に影響範囲を最小化
- **進捗可視化**: コミット履歴で作業進捗が追える
- **コンフリクト削減**: 小さい変更はマージ競合が起きにくい

### 違反例（避けるべき）

```
# 悪い例: 10ファイルを1コミット
git add .
git commit -m "テストを追加"

# 良い例: 1-2ファイルずつ分割
git add .pi/tests/lib/errors.test.ts
git commit -m "test(lib): add unit tests for errors.ts"
git add .pi/tests/lib/execution-rules.test.ts
git commit -m "test(lib): add unit tests for execution-rules.ts"
```

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

## Epistemic Deference Protocol (MANDATORY for Agent Teams)

> 論文「Multi-Agent Teams Hold Experts Back」の知見に基づく。詳細は `.pi/research/multi-agent-teams-experts-back/improvement-design.md` を参照。

### 核心原則

**専門家の意見を妥協で希釈しない**

マルチエージェントLLMチームは、専門家のパフォーマンスに8-37.6%劣る傾向がある。主な原因は「統合的妥協（Integrative Compromise）」—専門家の意見を非専門家の意見と平均化してしまうこと。

### DISCUSSIONタグ（必須）

エージェントチームでの議論では以下のタグを使用する：

| タグ | 名称 | 使用場面 |
|-----|------|---------|
| **[ED]** | Epistemic Deference | 専門家の判断に従う |
| **[SP]** | Strategic Persistence | 専門家が主張を維持 |
| **[EF]** | Epistemic Flexibility | 新たな証拠で立場を修正 |
| **[IC]** | Integrative Compromise | 中間案の提案（**可能な限り回避**） |

### 専門家の特定

以下のいずれかの条件を満たすメンバーを専門家とみなす：

1. **Phase Owner**: 現在のフェーズの担当者
2. **Skill Holder**: 関連スキルの保持者
3. **High Confidence**: 根拠付きでconfidence > 0.8

### タグ使用ガイドライン

#### 非専門家の場合
- **推奨**: `[ED] Researcher's analysis is comprehensive. I defer.`
- **回避**: `[IC] Let's take a middle ground...`

#### 専門家の場合
- **推奨**: `[SP] I maintain my conclusion because [evidence].`
- **条件付き**: `[EF] I revise based on new evidence [X].`
- **回避**: `[IC]` - 専門家は妥協すべきではない

### Phase Owner Has Final Say

各フェーズには最終決定権を持つオーナーがいる：

| フェーズ | オーナー | 決定権限 |
|-------|-------|-------------------|
| Phase 1 (Research) | Researcher | 事実の発見、制約条件、影響範囲 |
| Phase 2 (Implementation) | Implementer | 技術的アプローチ、コード構造 |
| Phase 3 (Review) | Reviewer | リスク許容/却下、品質ゲート |

### 合意形成は不要

- メンバーは意見を提供
- Phase Ownerが決定
- 矛盾する証拠がない限り、他は従う
- 低confidence（< 0.7）の場合はエスカレート

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

---

## RepoAudit Usage (RECOMMENDED)

コード監査タスクでは、**積極的に`repo_audit`ツールを使用すること**。

### 推奨される使用場面

| 場面 | 実行例 |
|------|--------|
| 実装前の影響範囲調査 | `repo_audit({ target: "対象モジュール", scope: "module" })` |
| セキュリティ懸念の確認 | `repo_audit({ target: "認証系", focus: ["security"] })` |
| リファクタリング前の評価 | `repo_audit({ target: "変更対象", focus: ["maintainability"] })` |
| バグ原因の体系的調査 | `repo_audit({ target: "不具合箇所", focus: ["correctness"] })` |

### 検出パターン（推奨実行トリガー）

- キーワード: "audit", "review", "investigate", "analyze code", "check for issues"
- 日本語: "監査", "コードレビュー", "調査", "分析", "問題箇所を特定", "影響範囲"
- アクション: コード品質評価、セキュリティチェック、バグ原因特定、リファクタリング準備

### 使用例

```typescript
// ファイル単位の監査
repo_audit({
  target: ".pi/lib/errors.ts",
  scope: "file",
  focus: ["correctness", "maintainability"]
})

// モジュール単位のセキュリティ監査
repo_audit({
  target: ".pi/lib",
  scope: "module",
  focus: ["security"],
  verificationMode: "repo-audit"
})

// リポジトリ全体の包括的監査
repo_audit({
  target: ".",
  scope: "repository",
  maxExplorationDepth: 3
})
```

### 3層アーキテクチャ

RepoAuditは以下の3層パイプラインで動作:

1. **Initiator**: bug-huntingスキルで仮説生成
2. **Explorer**: 需要駆動探索で問題箇所を特定
3. **Validator**: verification-workflowで結果を検証

### パラメータ

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `target` | 監査対象（ファイル/ディレクトリ/パターン） | 必須 |
| `scope` | 監査スコープ（file/module/repository） | `module` |
| `focus` | フォーカス領域（security/performance/correctness/maintainability） | すべて |
| `verificationMode` | 検証モード（disabled/repo-audit/high-stakes-only/explicit-only） | `repo-audit` |
| `maxExplorationDepth` | 最大探索深度 | `5` |

### 他ツールとの使い分け

| 目的 | 使用ツール |
|------|-----------|
| コード監査・問題特定 | `repo_audit` |
| 軽量なコード検索 | `code_search`, `sym_find` |
| 構造理解・ナビゲーション | `repograph_localize`, `context_explore` |
| レビュー指摘の対応 | `skills/code-review/SKILL.md` |

---

## LocAgent Usage (RECOMMENDED)

コードローカライゼーション（Issue/タスクから関連コードを特定）では、**積極的に`locagent_query`ツールを使用すること**。

### 推奨される使用場面

| 場面 | 実行例 |
|------|--------|
| GitHub Issue解決 | `locagent_query({ type: "search", keywords: ["issue関連キーワード"] })` |
| バグ修正の調査 | `locagent_query({ type: "traverse", nodeIds: ["エラー発生箇所"] })` |
| 依存関係調査 | `locagent_query({ type: "traverse", direction: "downstream", hops: 2 })` |
| 影響範囲特定 | `locagent_query({ type: "traverse", direction: "upstream" })` |

### 検出パターン（推奨実行トリガー）

- キーワード: "localize", "find related code", "where is", "affected by", "depends on"
- 日本語: "関連コード", "影響範囲", "依存関係", "どこで使われている", "原因特定"
- アクション: Issue解決、バグ修正、リファクタリング準備、影響範囲調査

### 使用例

```typescript
// キーワード検索で候補を絞り込み
locagent_query({
  type: "search",
  keywords: ["error", "retry", "timeout"],
  limit: 20
})

// 特定ノードから依存関係を探索
locagent_query({
  type: "traverse",
  nodeIds: ["src/errors.ts:PiError"],
  direction: "downstream",  // 呼び出し先へ
  hops: 2,
  limit: 50
})

// エンティティの詳細を取得
locagent_query({
  type: "retrieve",
  nodeIds: ["src/config.ts:parseConfig"]
})

// グラフの統計を確認
locagent_query({
  type: "stats"
})
```

### LocAgent vs 他ツール

| 目的 | 使用ツール |
|------|-----------|
| 要素レベルのローカライゼーション | `locagent_query` |
| 行レベルの詳細 | `repograph_query` |
| 軽量なコード検索 | `code_search`, `sym_find` |
| コード監査 | `repo_audit` |

### LocAgent → RepoGraph 連携

```
1. LocAgentで候補を絞り込み
   locagent_query({ type: "search", keywords: [...] })
   
2. RepoGraphで行レベル詳細を取得
   repograph_query({ type: "file", file: "候補ファイル" })
```

### ノードタイプ

| タイプ | 説明 | ID形式 |
|--------|------|--------|
| directory | ディレクトリ | `src/utils` |
| file | ファイル | `src/utils.ts` |
| class | クラス | `src/utils.ts:ConfigParser` |
| function | 関数/メソッド | `src/utils.ts:parseConfig` |

### エッジタイプ

| タイプ | 説明 |
|--------|------|
| contain | 包含関係（directory→file, file→class, class→function） |
| import | インポート関係（file→class/function） |
| invoke | 呼び出し関係（function→function） |
| inherit | 継承関係（class→class） |

### 自動インデックス構築

`locagent_query`実行時にインデックスが存在しない場合、**自動的に構築される**（約1秒）。ユーザーが明示的に`locagent_index`を実行する必要はない。

### セマンティックインデックス（オプション）

セマンティック検索を使用するには、明示的にセマンティックインデックスを構築する必要がある：

```typescript
// セマンティックインデックスを構築（OpenAI API使用、コスト発生）
locagent_index({
  path: "./src",
  buildSemantic: true  // ← 明示的に指定
})

// セマンティック検索を実行
locagent_query({
  type: "semantic",
  keywords: ["エラーをハンドリングする関数"],
  limit: 10
})
```

**コスト**: 初回約$0.10（295ファイル）、差分更新は変更ファイルのみ（約$0.002/5ファイル）

---

## Agent Memory Usage (RECOMMENDED)

エージェントの学習・最適化機能を活用し、**継続的な効率改善**を行う。

### 2つのメモリシステム

| システム | 場所 | 目的 | 使用タイミング |
|---------|------|------|---------------|
| **agent-memory** | `.pi/lib/agent/agent-memory.ts` | 探索結果のキャッシュ・再利用 | RepoAudit実行時 |
| **AWO** | `.pi/lib/awo/` | 実行パターンの最適化・メタツール生成 | 定期的な分析時 |

### agent-memory（探索キャッシュ）

RepoAuditの需要駆動探索で使用されるセマンティックキャッシュ。

**使用場面**:
- 同じクエリを繰り返し実行する場合
- 類似コードの探索を行う場合
- RepoAuditのExplorerフェーズ

**効果**:
- 重複探索の回避
- レスポンス時間の短縮

### AWO（Agent Workflow Optimization）

論文「Optimizing Agentic Workflows using Meta-tools」に基づく最適化システム。

**使用場面**:
- 定期的な実行パターン分析（週次など）
- 新規メタツール候補の生成
- LLM呼び出しコストの削減

**効果**:
- LLM呼び出し最大11.9%削減
- タスク成功率向上（最大+4.2%ポイント）

### 推奨ワークフロー

```
┌─────────────────────────────────────────────────────────┐
│  日次実行                                                │
│  └─ agent-memory: 自動的に探索結果をキャッシュ           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  週次分析                                                │
│  └─ AWO: トレースを分析してメタツール候補を生成          │
│  └─ レビュー後、有用なメタツールを登録                   │
└─────────────────────────────────────────────────────────┘
```

### AWO API

```typescript
import { AWOOrchestrator, getGlobalAWO } from "./lib/awo/index.js";

// トレース分析
const awo = getGlobalAWO();
const candidates = awo.analyzeCandidates();

// メタツール生成（手動承認）
const tools = awo.generateMetaTools(false);

// 登録済みツール確認
const registered = awo.getRegisteredTools();

// 統計確認
const stats = awo.getStats();
```

### 設定

デフォルト設定（`.pi/lib/awo/types.ts`）:

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `traceCollection.enabled` | `true` | トレース収集を有効化 |
| `traceCollection.maxTraces` | `10000` | 最大トレース数 |
| `traceCollection.retentionDays` | `30` | 保持期間（日） |
| `extraction.threshold` | `5` | メタツール抽出閾値 |
| `registry.autoRegister` | `false` | 自動登録（手動承認を推奨） |

---

# UL Mode Guideline

`ul <task>` で呼び出される委任モード。調査・計画・実装を自律的に行う。

## 基本原則

> **エージェントにコードを書かせる前に、必ず文章化された計画をレビュー・承認する**

## 単一入口

```typescript
ul_workflow_run({
  task: string  // 必須: 実行するタスク
})
```

**内部で自動決定:**
- DAG構造（タスクを依存関係を持つサブタスクに分解）
- 並列数（APIレート制限とリソースから計算）
- 実行順序

## 統一フロー（必須）

```
Research (DAG並列) → Plan → [人間確認必須] → Implement (DAG並列) → Commit
```

**常に強制:**
- DAGベースの並列実行
- 人間によるplan確認
- plan承認後の実装

---

## フェーズ詳細

### 第1段階: Research（調査）

コードベースの該当部分を**徹底的に**理解する。

- 複数のresearcherエージェントが並列で調査
- 調査結果は `.pi/ul-workflow/tasks/{taskId}/research.md` に保存

### 第2段階: Plan（計画策定）

詳細な実装計画を `.pi/ul-workflow/tasks/{taskId}/plan.md` に作成する。

- 変更内容、手順、考慮事項、Todoを明記
- コードスニペットも含める

### 第3段階: 人間確認（必須）

**ここはユーザーが主導する。**

1. plan.mdをエディタで開く
2. インライン注釈（`<!-- NOTE: ... -->`）を追加
3. `ul_workflow_annotate()` で注釈を検出・適用
4. `ul_workflow_approve()` で承認して次へ進む

ユーザーが満足するまで繰り返し。

### 第4段階: Implement（実装）

計画に従って機械的に実装する。

- 複数のimplementerエージェントが並列で実装
- **implement it all**: planのすべてを実行
- **do not stop until completed**: 確認のために途中で停止しない

### 第5段階: Commit（コミット）

実装完了後、コミットを作成する。

- **git-workflowスキル**をロードしてから実行
- 日本語で詳細なコミットメッセージを作成

---

## 実行例

```typescript
// タスク実行
ul_workflow_run({ task: "認証システムをJWTベースにリファクタリングする" })

// 内部フロー:
// 1. Research: 3つのresearcherが並列で調査（APIレート制限に基づき自動決定）
// 2. Plan: architectが計画作成 → .pi/ul-workflow/tasks/xxx/plan.md
// 3. 人間確認: ユーザーがplan.mdをレビュー・注釈追加・承認
// 4. Implement: 2つのimplementerが並列で実装
// 5. Commit: 日本語メッセージでコミット作成
```
