---
title: question - インタラクティブUI
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [extension, ui, interaction]
related: [./01-extensions.md, ./06-abbr.md]
---

# question - インタラクティブUI

> パンくず: [Home](../../README.md) > [User Guide](./) > question

ユーザー入力を収集するターミナルベースUIツール。

## 機能

- 単一選択・複数選択モード
- 自由形式の応答用カスタム入力オプション
- 送信前の確認画面
- キーボードナビゲーションサポート

## パラメータ

```typescript
{
  questions: Array<{
    question: string;       // 質問テキスト
    header: string;         // 短いラベル（推奨: 最大30文字）
    options: Array<{
      label: string;        // 表示テキスト（推奨: 1-5文字、簡潔に）
      description?: string; // オプションの説明
    }>;
    multiple?: boolean;     // 複数選択を許可（デフォルト: false）
    custom?: boolean;       // 自由形式入力を許可（デフォルト: true）
  }>;
}
```

## 使用例

### 単一選択

```json
{
  "tool": "question",
  "input": {
    "questions": [
      {
        "question": "どのファイルを編集しますか？",
        "header": "ファイル選択",
        "options": [
          { "label": "main.ts", "description": "エントリーポイント" },
          { "label": "utils.ts", "description": "ユーティリティ関数" },
          { "label": "config.ts", "description": "設定ファイル" }
        ],
        "multiple": false,
        "custom": true
      }
    ]
  }
}
```

### 複数選択

```json
{
  "tool": "question",
  "input": {
    "questions": [
      {
        "question": "どの拡張機能を使用しますか？（複数可）",
        "header": "拡張機能選択",
        "options": [
          { "label": "A", "description": "subagent" },
          { "label": "B", "description": "agent-team" },
          { "label": "C", "description": "loop-run" }
        ],
        "multiple": true,
        "custom": false
      }
    ]
  }
}
```

## 出力形式

### 単一の質問

```
"どのファイルを編集しますか？"="main.ts"
```

### 複数の質問

```
"質問1？"="回答1", "質問2？"="回答2, 回答3"
```

## キーボード操作

| キー | アクション |
|-----|----------|
| ↑ / ↓ | オプション間を移動 |
| スペース | 選択/選択解除（複数選択モード） |
| Enter | 選択を確定 |
| Escape | キャンセル |

## 使用パターン

### ファイル選択

```
どのファイルを編集するか、questionを使ってユーザーに選択させてください
```

### 機能選択

```
どの拡張機能を使用するか、questionでユーザーに選択させてください
```

### 確認ダイアログ

```
この操作を実行しますか？questionで確認を求めてください
```

---

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - すべての拡張機能
- [abbr](./06-abbr.md) - 略語管理


