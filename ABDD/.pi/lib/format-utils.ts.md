---
title: Format Utilities
category: reference
audience: developer
last_updated: 2026-02-18
tags: [formatting, duration, bytes, time]
related: [tui-utils, live-view-utils]
---

# Format Utilities

拡張機能間で共有されるフォーマットユーティリティ。Layer 0: 他のlibモジュールへの依存なし。

## 概要

`loop.ts`、`rsa.ts`、`agent-teams.ts`、`subagents.ts` から重複実装を統合した共通ユーティリティ。

## 関数

### formatDuration(ms)

ミリ秒単位の時間を読みやすい文字列にフォーマットする。

```typescript
function formatDuration(ms: number): string
```

**パラメータ:**
- `ms` - ミリ秒単位の時間

**戻り値:** フォーマット済み時間文字列（例: "500ms", "1.50s"）

**例:**
```typescript
formatDuration(500);     // "500ms"
formatDuration(1500);    // "1.50s"
formatDuration(-100);    // "0ms"
```

### formatDurationMs(item)

開始タイムスタンプとオプションの終了タイムスタンプを持つアイテムから時間をフォーマットする。未完了の場合は現在時刻を使用。

```typescript
function formatDurationMs(item: DurationItem): string
```

**パラメータ:**
- `item` - `startedAtMs` と `finishedAtMs` を持つオブジェクト

**戻り値:** フォーマット済み時間文字列（例: "1.5s", 未開始なら "-"）

**例:**
```typescript
formatDurationMs({ startedAtMs: Date.now() - 1500 });
// "1.5s" (実行中)

formatDurationMs({
  startedAtMs: 1000,
  finishedAtMs: 3000
});
// "2.0s" (完了)
```

### formatBytes(value)

バイト数を読みやすい文字列にフォーマットする。

```typescript
function formatBytes(value: number): string
```

**パラメータ:**
- `value` - バイト数

**戻り値:** フォーマット済み文字列（例: "512B", "1.5KB", "2.3MB"）

**例:**
```typescript
formatBytes(512);        // "512B"
formatBytes(1536);       // "1.5KB"
formatBytes(2400000);    // "2.3MB"
```

### formatClockTime(value)

タイムスタンプを時計形式（HH:MM:SS）にフォーマットする。

```typescript
function formatClockTime(value?: number): string
```

**パラメータ:**
- `value` - ミリ秒単位のタイムスタンプ、またはundefined

**戻り値:** フォーマット済み時計時刻、または値がない場合は "-"

**例:**
```typescript
formatClockTime(Date.now());  // "14:30:45"
formatClockTime(undefined);   // "-"
```

### normalizeForSingleLine(input, maxLength)

単一行表示用にテキストを正規化する。空白を圧縮し、必要に応じて切り詰める。同じ入力に対する繰り返し呼び出しにはLRUキャッシュを使用。

```typescript
function normalizeForSingleLine(
  input: string,
  maxLength?: number
): string
```

**パラメータ:**
- `input` - 入力テキスト
- `maxLength` - 最大長（デフォルト: 160）

**戻り値:** 正規化された単一行テキスト

**例:**
```typescript
normalizeForSingleLine("  hello   world  ");
// "hello world"

normalizeForSingleLine("a".repeat(200), 100);
// "aaa...(100文字)..."

normalizeForSingleLine("");
// "-"
```

## 型定義

### DurationItem

時間計算用の開始・終了タイムスタンプを持つアイテム。

```typescript
interface DurationItem {
  startedAtMs?: number;
  finishedAtMs?: number;
}
```

## キャッシュ

`normalizeForSingleLine` はLRUキャッシュを使用する：

- **最大エントリ数:** 256
- **エビクション:** 最も古いエントリから削除
- **キャッシュキー:** `${maxLength}:${input}`

## 使用例

```typescript
import {
  formatDuration,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine
} from "./format-utils.js";

// 時間フォーマット
const elapsed = formatDuration(Date.now() - startTime);

// バイトフォーマット
const size = formatBytes(outputBytes);

// 時計時刻
const updateTime = formatClockTime(lastUpdate);

// 単一行正規化
const summary = normalizeForSingleLine(longText, 80);
```

## 関連ファイル

- `./tui-utils.ts` - TUIユーティリティ
- `./live-view-utils.ts` - ライブビューユーティリティ
