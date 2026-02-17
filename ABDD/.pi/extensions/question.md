---
title: Question Extension
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, question, interactive, ui, user-input]
related: []
---

# Question Extension

> パンくず: [Home](../README.md) > [Extensions](./) > Question Extension

## 概要

Question拡張機能は、PIエージェントがユーザーに質問するためのインタラクティブUIを提供します。opencode互換のシンプルで使いやすいインターフェースを持ちます。

## 機能

- 単一選択・複数選択対応
- 自由記述（カスタム入力）対応
- 複数行入力対応
- 複数質問の一括処理
- 確認画面での修正機能
- 日本語入力対応

---

## 型定義

### QuestionOption

選択肢の定義。

```typescript
interface QuestionOption {
  label: string;           // 表示テキスト（1-5文字推奨）
  description?: string;    // 選択肢の説明
}
```

### QuestionInfo

質問の定義。

```typescript
interface QuestionInfo {
  question: string;        // 質問文（完全な文章）
  header: string;          // 短いラベル（最大30文字）
  options: QuestionOption[];  // 選択肢一覧
  multiple?: boolean;      // 複数選択を許可
  custom?: boolean;        // 自由記述を許可（デフォルト: true）
}
```

### Answer

回答の型。

```typescript
type Answer = string[];    // 選択されたラベルの配列
```

---

## 主要関数

### askSingleQuestion(question: QuestionInfo, ctx: any): Promise<Answer | null>

単一の質問を表示します。

```typescript
async function askSingleQuestion(
  question: QuestionInfo,
  ctx: any
): Promise<Answer | null>
```

**パラメータ**:
- `question`: 質問情報
- `ctx`: コンテキスト

**戻り値**: 選択された回答の配スト、キャンセル時は`null`

### showConfirmationScreen(questions: QuestionInfo[], answers: Answer[], ctx: any): Promise<ConfirmAction>

確認画面を表示します。

```typescript
async function showConfirmationScreen(
  questions: QuestionInfo[],
  answers: Answer[],
  ctx: any
): Promise<ConfirmAction>
```

**戻り値**: 確認アクション（confirm/edit/cancel）

### createRenderer<TState>(initialState, renderFn): Renderer

レンダラーを作成します。

```typescript
function createRenderer<TState>(
  initialState: TState,
  renderFn: (state: TState, width: number, theme: any) => string[]
)
```

### isCustomMessage(msg: AgentMessage): boolean

CustomMessage型かどうかを判定する型ガード関数。

```typescript
function isCustomMessage(msg: AgentMessage): msg is AgentMessage & { customType: string }
```

---

## ツール

### question

ユーザーに質問を表示し、回答を取得します。

**説明**: ユーザーに選択肢から選ばせたり、確認を求める場合は必ずこのツールを使用してください。単一選択、複数選択、自由記述に対応。

**パラメータ**:
| 名前 | 型 | 必須 | 説明 |
|-----|-----|-----|------|
| questions | QuestionInfo[] | はい | 質問一覧 |

**QuestionInfoの構造**:
```typescript
{
  question: string;      // 質問文
  header: string;        // 短いラベル
  options: {             // 選択肢
    label: string;
    description?: string;
  }[];
  multiple?: boolean;    // 複数選択
  custom?: boolean;      // 自由記述許可
}
```

---

## キーボード操作

### 選択肢モード

| キー | アクション |
|-----|----------|
| ↑/↓ | カーソル移動 |
| Space | 選択/解除（複数選択時） |
| Enter | 選択確定 |
| Esc | キャンセル |

### カスタム入力モード

| キー | アクション |
|-----|----------|
| Enter | 入力確定 |
| Shift+Enter | 改行 |
| Esc | 選択肢モードに戻る |
| ←/→ | カーソル移動 |
| ↑/↓ | 行移動（複数行時） |
| Home/End | 先頭/末尾移動 |
| Backspace | 前の文字削除 |
| Delete | 次の文字削除 |

### 確認画面

| キー | アクション |
|-----|----------|
| ↑/↓ | カーソル移動 |
| Enter | 選択確定 |
| Y | 確定して送信 |
| N | キャンセル |
| 1-9 | 指定質問を修正 |

---

## システムプロンプト

この拡張機能は`before_agent_start`イベントで以下のシステムプロンプトを注入します:

```
## CRITICAL: Question Tool Usage (MANDATORY)

You **MUST** use the `question` tool for any user selection.
NEVER present options as plain text.
```

### 検出パターン

以下のパターンが検出された場合、questionツールの使用が推奨されます:

- "...教えてください" / "...教えて"
- "どれから" / "どれが"
- "選んで" / "選択して"
- 番号付き/箇条書きリストを表示しようとする場合

---

## 使用例

### 単一選択

```typescript
question({
  questions: [{
    question: "どの実装方法を採用しますか？",
    header: "実装方法",
    options: [
      { label: "A", description: "シンプルな実装" },
      { label: "B", description: "パフォーマンス重視" },
      { label: "C", description: "拡張性重視" }
    ]
  }]
})
```

### 複数選択

```typescript
question({
  questions: [{
    question: "どの機能を実装しますか？（複数選択可）",
    header: "機能選択",
    options: [
      { label: "認証" },
      { label: "API" },
      { label: "UI" }
    ],
    multiple: true
  }]
})
```

### 自由記述

```typescript
question({
  questions: [{
    question: "プロジェクト名を入力してください",
    header: "プロジェクト名",
    options: [],
    custom: true
  }]
})
```

### 複数質問

```typescript
question({
  questions: [
    {
      question: "優先度を選択",
      header: "優先度",
      options: [
        { label: "高" },
        { label: "中" },
        { label: "低" }
      ]
    },
    {
      question: "期限を選択",
      header: "期限",
      options: [
        { label: "今週" },
        { label: "来週" },
        { label: "今月" }
      ]
    }
  ]
})
```

---

## 出力形式

回答はopencode互換形式で出力されます:

```
ユーザーの回答: "質問1"="回答1", "質問2"="回答2, 回答3"
```

---

## 関連トピック

- [Plan Extension](./plan.md) - プラン管理機能
- [Loop Extension](./loop.md) - ループ実行機能
