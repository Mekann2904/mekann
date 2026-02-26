# UL Mode Guideline

`ul <task>` で呼び出される委任モード。調査・計画・実装を自律的に行う。

## 基本原則

> **エージェントにコードを書かせる前に、必ず文章化された計画をレビュー・承認する**

## 推奨: DAGベース並列実行

ULモードの各フェーズはDAG実行で並列化できる:

```typescript
// 推奨: DAG統合ULモード
ul_workflow_dag({
  task: "<タスク>",
  maxConcurrency: 3
})
```

### DAG統合の利点

- Research並列実行で調査時間短縮
- 実装タスクの自動並列化
- 依存関係の自動推論
- レート制限への適応的対応

## フロー

```
Research → Plan → [ユーザーレビュー] → Implement (DAG)
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

### アクション（DAG並列実装 - 推奨）

```typescript
subagent_run_dag({
  task: "plan.mdの内容を実装",
  plan: {
    id: "implementation-phase",
    tasks: [
      { id: "impl-core", description: "コア実装", assignedAgent: "implementer", dependencies: [] },
      { id: "impl-tests", description: "テスト実装", assignedAgent: "tester", dependencies: ["impl-core"] },
      { id: "review", description: "コードレビュー", assignedAgent: "reviewer", dependencies: ["impl-core"] }
    ]
  },
  maxConcurrency: 3
})
```

### アクション（単一エージェント - 単純な場合のみ）

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
| 複数の独立したファイル変更 | `agent_team_run_parallel` または `subagent_run_dag` |
| 実装 + レビューを同時 | `subagent_run_dag` で依存関係を指定 |

### 実装の原則

- **implement it all**: planのすべてを実行、チェリーピックしない
- **mark it as completed**: planが進捗の信頼できる情報源
- **do not stop until completed**: 確認のために途中で停止しない

**実装は機械的であるべき。創造的な作業は計画段階で完了している。**

---

## 第6段階：Commit（コミット）【推奨】

実装完了後、**積極的にコミットを作成する**。

### 基本原則

> **実装完了後は必ずコミットを提案する**

### コミットのタイミング

| タイミング | アクション |
|-----------|-----------|
| 実装フェーズ完了後 | 必ずコミットを提案 |
| 中規模以上の変更 | フェーズごとにコミットを検討 |
| ユーザーが明示的に拒否した場合のみ | コミットをスキップ |

### コミットワークフロー

**git-workflowスキルをロードしてから実行する。**

```
read tool: .pi/skills/git-workflow/SKILL.md
```

#### 統合コミット（推奨）

add + commit を1回のquestion呼び出しで実行:

```typescript
// 1. 変更内容を確認
git status
git diff

// 2. コミットメッセージを作成（日本語・Body必須）
// Conventional Commits準拠

// 3. questionツールで統合確認
question({
  questions: [{
    question: "以下の内容でコミットしますか？\n\n" +
              "【コミットメッセージ】\n" +
              "feat: ユーザー認証を追加する\n\n" +
              "【ステージングファイル】\n" +
              "- src/auth.ts\n" +
              "- tests/auth.test.ts\n\n" +
              "【変更概要】\n" +
              "- JWT認証を実装\n" +
              "- テストを追加",
    header: "Git Commit",
    options: [
      { label: "Commit", description: "ステージング + コミットを実行" },
      { label: "Edit", description: "メッセージを編集" },
      { label: "Skip", description: "コミットせずに完了" }
    ],
    custom: true
  }]
})
```

### コミットメッセージ規約

**git-workflowスキルの規約に従う:**

- **絵文字は使用しない**
- **日本語で詳細に書く（絶対必須）**
- **Body（本文）を必ず書く**
- **英語でのコミットメッセージは禁止**

```
<Type>[(scope)]: #<Issue Number> <Title>

## 背景
<なぜこの変更が必要か>

## 変更内容
<具体的な変更点>

## テスト方法
<どうテストしたか>

## 影響範囲
<他に影響する部分>
```

### 選択的ステージング（CRITICAL）

**`git add .`や`git add -A`は安易に使用しない。**

```bash
# 推奨: 特定ファイルを明示的に指定
git add path/to/file.ts

# 禁止: 全ファイルをステージング
# git add .
# git add -A
```

### ULモードでのコミットフロー

1. **実装完了**: implementerサブエージェントが実装を完了
2. **変更確認**: `git status`と`git diff`で変更内容を確認
3. **コミット提案**: questionツールでユーザーに確認
4. **コミット実行**: ユーザー承認後に`git add`と`git commit`を実行
5. **完了報告**: ワークフロー完了を通知

---

## 判断の指針

| 状況 | フロー |
|------|--------|
| 重要な実装 | Research → Plan → Annotation Cycle → Todo → Implement → **Commit** |
| 中程度の実装 | Research → Plan → [確認] → Implement → **Commit** |
| 軽微な修正 | 直接編集（plan省略可）→ **Commit** |
| 調査のみ | Research → 報告（コミット不要） |
