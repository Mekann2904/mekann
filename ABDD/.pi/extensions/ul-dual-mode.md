---
title: UL Dual-Mode Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, ul-mode, delegation, adaptive, loop]
related: [subagents.md, agent-teams.md, loop.md]
---

# UL Dual-Mode Extension

"ul"プレフィックスモードとセッション全体の永続ULモードを追加し、適応的な委譲実行を提供する拡張機能。

## 概要

ULモード（Ultra-Low-latency / Ultra-Leverage モード）は、以下の特徴を持つ：

- **委任優先実行**: 直接編集より委譲を優先
- **適応的フェーズ数**: LLMの裁量で1〜Nフェーズを最適化
- **必須レビュアー**: 完了前にreviewerサブエージェントの呼び出しを要求
- **ゴアループ**: 明確な達成条件検出時にloop_runを自動提案

## モード種類

### 単発ULモード

入力の先頭に`ul`を付けることで、そのターンのみULモードが有効になる。

```
ul この関数をリファクタリングして
```

### セッション永続ULモード

CLIフラグ`--ul`または`/ulmode`コマンドでセッション全体で有効化。

```bash
pi --ul
```

```
/ulmode
```

### 自動ULモード

明確な達成条件を含むタスクを検出すると自動的にUL+loopモードを有効化。

検出パターン（`CLEAR_GOAL_SIGNAL`）:
- 達成条件、完了条件、成功条件、受け入れ条件
- until, done when
- all tests pass, tests pass, lint pass, build succeeds
- exit code 0, エラー0, テスト.*通る

## CLIフラグ

### --ul

```typescript
pi.registerFlag("ul", {
  description: "Enable UL Dual-Orchestration Mode for entire session",
  type: "boolean",
  default: false,
});
```

## スラッシュコマンド

### /ulmode

セッション中にULモードをトグル切り替え。

```
/ulmode  # 有効/無効を切り替え
```

## 内部状態

```typescript
const state = {
  persistentUlMode: false,       // セッション全体の永続ULモード
  pendingUlMode: false,          // 次ターンでのULモード保留
  activeUlMode: false,           // 現在アクティブなULモード
  pendingGoalLoopMode: false,    // 次ターンでのゴアループ保留
  activeGoalLoopMode: false,     // 現在アクティブなゴアループ
  usedSubagentRun: false,        // subagent_run使用済み
  usedAgentTeamRun: false,       // agent_team_run使用済み
  completedRecommendedReviewerPhase: false, // reviewer完了
  currentTask: "",               // 現在のタスク
};
```

## 主要な関数

### extractTextWithoutUlPrefix

```typescript
function extractTextWithoutUlPrefix(text: string): string
```

入力から`ul`プレフィックスを除去。

### looksLikeClearGoalTask

```typescript
function looksLikeClearGoalTask(text: string): boolean
```

`CLEAR_GOAL_SIGNAL`正規表現で明確な達成条件を検出。

### isTrivialTask

```typescript
function isTrivialTask(task: string): boolean
```

小規模タスクかどうかを判定。

**判定条件**:
- 文字数 < `UL_REVIEWER_MIN_TASK_LENGTH` (200)
- `UL_TRIVIAL_PATTERNS`のいずれかに一致:
  - `read `, `show `, `list `
  - `what is`, `explain `
  - `?`で開始
  - `search `, `find `

### shouldRequireReviewer

```typescript
function shouldRequireReviewer(task: string): boolean
```

reviewerが必要かどうかを判定。

**条件**:
- `UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL`がfalse: 不要
- `UL_SKIP_REVIEWER_FOR_TRIVIAL`がfalse: 常に必要
- 小規模タスク: 不要

### getMissingRequirements

```typescript
function getMissingRequirements(): string[]
```

ULモード完了に必要な未実行項目を返す。

### getUlPolicy

```typescript
function getUlPolicy(sessionWide: boolean, goalLoopMode: boolean): string
```

ULモードのポリシー文字列を返す（キャッシュ付き）。

### buildUlPolicyString

```typescript
function buildUlPolicyString(sessionWide: boolean, goalLoopMode: boolean): string
```

ポリシー文字列を構築。

## イベントハンドラ

### input

```typescript
pi.on("input", async (event, ctx) => {
  // ulプレフィックス検出 -> transform
  // 自動UL検出 -> pendingUlMode設定
});
```

**アクション**:
- `continue`: 通常処理継続
- `transform`: テキスト変換して処理
- `handled`: 処理完了（空のul入力など）

### before_agent_start

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // ULモード有効時 -> ポリシー注入
});
```

**戻り値**:
- `systemPrompt`: ULポリシーを追加したシステムプロンプト

### tool_call

```typescript
pi.on("tool_call", async (event, ctx) => {
  // subagent_run / agent_team_run使用を追跡
  // reviewer呼び出しを検出
});
```

### agent_end

```typescript
pi.on("agent_end", async (event, ctx) => {
  // 未達項目があれば警告
  // セッション永続モードなら状態維持
});
```

### session_start

```typescript
pi.on("session_start", async (_event, ctx) => {
  // CLIフラグと保存状態から復元
});
```

## 定数

| 定数 | 値 | 説明 |
|------|-----|------|
| `UL_PREFIX` | `/^\s*ul(?:\s+|$)/i` | ULプレフィックス検出パターン |
| `STABLE_UL_PROFILE` | `true` | 安定プロファイル使用 |
| `UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL` | `true` | reviewer必須ガードレール |
| `UL_SKIP_REVIEWER_FOR_TRIVIAL` | 環境変数依存 | 小規模タスクでreviewerスキップ |
| `UL_REVIEWER_MIN_TASK_LENGTH` | `200` | 小規模タスク判定の文字数閾値 |
| `RECOMMENDED_SUBAGENT_IDS` | `["researcher", "architect", "implementer"]` | 推奨サブエージェント |
| `RECOMMENDED_CORE_TEAM_ID` | `"core-delivery-team"` | 推奨チームID |
| `RECOMMENDED_REVIEWER_ID` | `"reviewer"` | 推奨レビュアーID |
| `REFRESH_STATUS_THROTTLE_MS` | `300` | ステータス更新スロットリング間隔 |

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PI_UL_SKIP_REVIEWER_FOR_TRIVIAL` | `"1"` | 小規模タスクでreviewerスキップ |

## 注入されるポリシー例

```markdown
---
## UL (delegation-first)

This turn is in UL Adaptive Mode.

Execution:
- Use subagent_run_parallel / agent_team_run as needed.
- Phase count: LLM discretion (1-N, optimize for task scale).
- YOU MUST: subagent_run(subagentId: "reviewer") before marking complete.

Patterns:
1. Simple: single subagent_run or direct execution
2. Multi-perspective: subagent_run_parallel(subagentIds: researcher, architect, implementer)
3. Complex: agent_team_run(teamId: core-delivery-team, strategy: parallel)

Rules:
- Use loop_run with goal if explicit completion criteria exist.
- Direct edits allowed for trivial changes.
- Do not finish until reviewer has been called.
---
```

## ステータス表示

ULモード有効時のステータス行:

```
UL mode | subagent:✓ team:… reviewer:… loop:✓
```

- `subagent`: subagent_run使用済み
- `team`: agent_team_run使用済み
- `reviewer`: reviewer完了
- `loop`: ゴアループ有効

## 依存関係

- `@mariozechner/pi-coding-agent` - ExtensionAPI

## エクスポート

```typescript
export default function registerUlDualModeExtension(pi: ExtensionAPI): void
```
