---
name: dynamic-tools
description: 動的ツール生成・実行スキル。タスク実行中に必要なツールを動的に生成・実行・管理する。
license: MIT
tags: [tools, dynamic-generation, runtime]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
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

---

## デバッグ情報

### 記録されるイベント

このスキルの実行時に記録されるイベント：

| イベント種別 | 説明 | 記録タイミング |
|-------------|------|---------------|
| session_start | セッション開始 | pi起動時 |
| task_start | タスク開始 | ユーザー依頼受付時 |
| operation_start | 操作開始 | スキル実行開始時 |
| operation_end | 操作終了 | スキル実行完了時 |
| task_end | タスク終了 | タスク完了時 |

### ログ確認方法

```bash
# 今日のログを確認
cat .pi/logs/events-$(date +%Y-%m-%d).jsonl | jq .

# 特定の操作を検索
cat .pi/logs/events-*.jsonl | jq 'select(.eventType == "operation_start")'

# エラーを検索
cat .pi/logs/events-*.jsonl | jq 'select(.data.status == "failure")'
```

### トラブルシューティング

| 症状 | 考えられる原因 | 確認方法 | 解決策 |
|------|---------------|---------|--------|
| 実行が停止する | タイムアウト | ログのdurationMsを確認 | タイムアウト設定を増やす |
| 結果が期待と異なる | 入力パラメータの問題 | paramsを確認 | 入力を修正して再実行 |
| エラーが発生する | リソース不足 | エラーメッセージを確認 | 設定を調整 |

### 関連ファイル

- 実装: `.pi/extensions/dynamic-tools.ts`
- ログ: `.pi/logs/events-YYYY-MM-DD.jsonl`
