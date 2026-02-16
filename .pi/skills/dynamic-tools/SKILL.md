---
name: dynamic-tools
description: 動的ツール生成・実行スキル。タスク実行中に必要なツールを動的に生成・実行・管理する。
tags: dynamic, tools, code-generation, live-swe-agent
---

# 動的ツール生成・実行システム

このディレクトリには、動的に生成されたツールがスキルとして保存されます。

## 概要

Live-SWE-agent統合により、タスク実行中に必要なツールを動的に生成・実行できます。

## 利用可能なコマンド

### create_tool

新しい動的ツールを生成します。

```typescript
create_tool({
  name: "my_tool",
  description: "ツールの説明",
  code: `
    // TypeScriptコード
    async function execute(params) {
      // ツールのロジック
      return { result: "success" };
    }
  `,
  parameters: {
    input: {
      type: "string",
      description: "入力パラメータ",
      required: true
    }
  },
  tags: ["utility"]
})
```

### run_dynamic_tool

生成済みのツールを実行します。

```typescript
run_dynamic_tool({
  tool_id: "my_tool_1234567890",
  parameters: {
    input: "テスト入力"
  }
})
```

### list_dynamic_tools

登録済みツールの一覧を表示します。

```typescript
list_dynamic_tools({
  tags: ["utility"],
  min_safety_score: 0.5
})
```

### delete_dynamic_tool

ツールを削除します。

```typescript
delete_dynamic_tool({
  tool_id: "my_tool_1234567890",
  confirm: true
})
```

### tool_reflection

実行後の反省とツール生成判定を行います。

```typescript
tool_reflection({
  task_description: "データ変換タスク",
  last_tool_result: "前回の結果",
  failed_attempts: 2
})
```

## 安全性

- 生成されたコードは安全性解析を受ける
- 安全性スコアが0.5未満のコードは「検証待ち」状態
- クリティカルなパターン（ファイル削除、プロセス実行等）は警告

## 品質評価

- 可読性、エラーハンドリング、ドキュメント等を評価
- 品質スコアに基づいて改善提案を生成

## 監査ログ

全操作は `.pi/logs/dynamic-tools-audit.jsonl` に記録されます。

## 注意事項

- 動的ツールは同一プロセス内でフル権限実行
- 外部プロセスやネットワークアクセスは制限推奨
- 生成されたツールは定期的にレビューしてください
