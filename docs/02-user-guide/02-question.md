---
title: question - インタラクティブUI
category: user-guide
audience: daily-user
last_updated: 2026-02-25
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
- マルチバイト文字（日本語など）対応

## パラメータ

```typescript
{
  questions: Array<{
    question: string;       // 質問テキスト（完全な文章）
    header: string;         // 短いラベル（推奨: 最大30文字）
    options: Array<{
      label: string;        // 表示テキスト（推奨: 1-10文字、簡潔に）
      description?: string; // オプションの説明
    }>;
    multiple?: boolean;     // 複数選択を許可（デフォルト: false）
    custom?: boolean;       // 自由形式入力を許可（デフォルト: true）
  }>;
}
```

### デフォルト値

| パラメータ | デフォルト値 | 説明 |
|-----------|-------------|------|
| `multiple` | `false` | 単一選択モード |
| `custom` | `true` | 「その他」オプションが自動追加される |

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

### 選択肢のみ（カスタム入力なし）

```json
{
  "tool": "question",
  "input": {
    "questions": [
      {
        "question": "続行しますか？",
        "header": "確認",
        "options": [
          { "label": "はい" },
          { "label": "いいえ" }
        ],
        "custom": false
      }
    ]
  }
}
```

## 出力形式

### 成功時

```
ユーザーの回答: "どのファイルを編集しますか？"="main.ts"
```

### 複数の質問

```
ユーザーの回答: "質問1？"="回答1", "質問2？"="回答2, 回答3"
```

### エラー時（構造化レスポンス）

```
エラー [NO_OPTIONS]: 質問 1 (ファイル選択) に選択肢がなく、自由記述も無効です

回復方法:
1. options に少なくとも1つの選択肢を追加してください: options: [{ label: "はい" }]
2. または custom: true を設定して自由記述を許可してください
```

## エラーコード

| コード | 説明 | 回復方法 |
|--------|------|----------|
| `NO_UI` | 非対話モードで実行中 | 対話モードで再実行 |
| `NO_OPTIONS` | 選択肢がなく自由記述も無効 | `options`を追加または`custom: true`を設定 |
| `NO_QUESTIONS` | 質問が提供されていない | `questions`配列に質問を追加 |
| `CANCELLED` | ユーザーがキャンセル | 処理を中止または別の方法を検討 |
| `VALIDATION_ERROR` | パラメータ検証エラー | 検証エラーメッセージに従って修正 |

## キーボード操作

### 選択肢モード

| キー | アクション |
|-----|----------|
| ↑ / ↓ | オプション間を移動 |
| Space | 選択/選択解除（複数選択モード） |
| Enter | 選択を確定 |
| Escape | キャンセル |

### カスタム入力モード

| キー | アクション |
|-----|----------|
| ↑ / ↓ | 行間移動（複数行対応） |
| ← / → | カーソル移動 |
| Home / End | 先頭/末尾移動 |
| Enter | 入力確定 |
| Shift+Enter | 改行挿入 |
| Backspace | 前の文字削除 |
| Delete | 次の文字削除 |
| Escape | 選択肢モードに戻る |

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

## LLM向けベストプラクティス

### 1. パラメータ設定のガイドライン

#### 選択肢のみを使用する場合

```json
{
  "options": [{ "label": "はい" }, { "label": "いいえ" }],
  "custom": false
}
```

#### 選択肢 + 自由記述を許可する場合

```json
{
  "options": [{ "label": "A" }, { "label": "B" }],
  "custom": true  // または省略（デフォルト: true）
}
```

#### 自由記述のみを使用する場合

```json
{
  "options": [],
  "custom": true
}
```

### 2. よくあるエラーと対処法

#### エラー: `NO_OPTIONS`

**原因**: `options: []` かつ `custom: false` の組み合わせ

**対処法**:
```json
// 方法1: 選択肢を追加
{ "options": [{ "label": "はい" }], "custom": false }

// 方法2: 自由記述を許可
{ "options": [], "custom": true }
```

#### エラー: `NO_QUESTIONS`

**原因**: `questions`配列が空

**対処法**:
```json
{ "questions": [{ "question": "...", "header": "...", "options": [...] }] }
```

### 3. ヘッダーとラベルの長さ

- **header**: 最大30文字を推奨（長い場合は警告）
- **label**: 1-10文字を推奨（長い場合は警告）

### 4. 複数質問の使用

```json
{
  "questions": [
    { "question": "質問1?", "header": "Q1", "options": [...] },
    { "question": "質問2?", "header": "Q2", "options": [...] }
  ]
}
```

確認画面で各質問を個別に修正可能。

---

## 技術仕様

### マルチバイト文字対応

日本語などのマルチバイト文字は幅2として計算されます：
- ひらがな・カタカナ: 幅2
- 漢字: 幅2
- ASCII文字: 幅1

### ペースト処理

- ブラケットペーストモード対応
- ANSIエスケープシーケンス自動除去
- 最大長制限: 10,000文字

### レスポンス形式

```typescript
interface ToolResult {
  content: { type: "text"; text: string }[];
  details: {
    answers: string[][];  // 各質問への回答
    error?: {            // エラー時のみ
      code: string;
      message: string;
      recovery: string[];
      details?: Record<string, unknown>;
    };
  };
}
```

---

## 関連トピック

- [拡張機能一覧](./01-extensions.md) - すべての拡張機能
- [abbr](./06-abbr.md) - 略語管理
