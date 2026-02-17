---
title: TUI Utils
category: reference
audience: developer
last_updated: 2026-02-18
tags: [tui, terminal, markdown, preview]
related: []
---

# TUI Utils

拡張機能間で共有されるTUI（Terminal User Interface）ユーティリティ。

## 概要

agent-teams.tsとsubagents.tsから重複実装を統合した。Layer 0: 他のlibモジュールへの依存なし。

## Constants

### LIVE_TAIL_LIMIT

テールコンテンツのデフォルト最大長。

```typescript
const LIVE_TAIL_LIMIT = 40_000;
```

### LIVE_MARKDOWN_PREVIEW_MIN_WIDTH

Markdownプレビューレンダリングの最小幅。

```typescript
const LIVE_MARKDOWN_PREVIEW_MIN_WIDTH = 24;
```

## Types

### MarkdownPreviewResult

Markdownプレビューレンダリングの結果型。

```typescript
interface MarkdownPreviewResult {
  lines: string[];
  renderedAsMarkdown: boolean;
}
```

## Utility Functions

### appendTail()

現在のテール文字列にチャンクを追加。最大長を尊重し、超過時は先頭を切り捨て。

```typescript
function appendTail(
  current: string,
  chunk: string,
  maxLength?: number
): string
```

**パラメータ:**
- `current` - 現在のテール文字列
- `chunk` - 追加するチャンク
- `maxLength` - 結果の最大長（デフォルト: LIVE_TAIL_LIMIT）

**戻り値:** 新しいテール文字列

### toTailLines()

テール文字列を行に分割、末尾の空白をトリム、行数を制限。

```typescript
function toTailLines(tail: string, limit: number): string[]
```

**パラメータ:**
- `tail` - 処理するテール文字列
- `limit` - 返す最大行数

**戻り値:** 処理された行の配列

### countOccurrences()

入力文字列内のターゲット文字列の出現回数をカウント。

```typescript
function countOccurrences(input: string, target: string): number
```

### estimateLineCount()

バイト数と改行数に基づいて行数を推定。

```typescript
function estimateLineCount(
  bytes: number,
  newlineCount: number,
  endsWithNewline: boolean
): number
```

### looksLikeMarkdown()

文字列がMarkdownコンテンツのように見えるかチェック。

検出パターン:
- ヘッダー (`# `)
- 順序なしリスト (`- `, `* `, `+ `)
- 順序付きリスト (`1. `)
- コードブロック (```)
- リンク (`[text](url)`)
- ブロック引用 (`> `)
- テーブル (`|`)
- 太字 (`**text**`)
- インラインコード (`` `code` ``)

```typescript
function looksLikeMarkdown(input: string): boolean
```

### renderPreviewWithMarkdown()

Markdownに見える場合はMarkdownとしてレンダリング、それ以外はプレーン行を返す。

```typescript
function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): MarkdownPreviewResult
```

**パラメータ:**
- `text` - レンダリングするテキスト
- `width` - レンダリング幅
- `maxLines` - 返す最大行数

**戻り値:** 行とMarkdownレンダリングされたかどうかを含むオブジェクト

## 使用例

```typescript
// テールの管理
let stdoutTail = "";
stdoutTail = appendTail(stdoutTail, newChunk);
const recentLines = toTailLines(stdoutTail, 100);

// Markdown検出
if (looksLikeMarkdown(output)) {
  const result = renderPreviewWithMarkdown(output, 80, 50);
  result.lines.forEach(line => console.log(line));
}

// 行数の推定
const lineCount = estimateLineCount(
  stdoutBytes,
  stdoutNewlineCount,
  stdoutEndsWithNewline
);
```

## 関連ファイル

- `.pi/extensions/agent-teams.ts` - エージェントチーム拡張
- `.pi/extensions/subagents.ts` - サブエージェント拡張
