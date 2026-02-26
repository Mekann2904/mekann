# DAG Execution Guide

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
