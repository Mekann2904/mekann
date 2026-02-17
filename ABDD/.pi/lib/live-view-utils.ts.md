---
title: Live View Utilities
category: reference
audience: developer
last_updated: 2026-02-18
tags: [live, view, status, tui]
related: [live-monitor-base, tui-utils]
---

# Live View Utilities

サブエージェントとエージェントチーム用のライブビューユーティリティ。TUIでのライブステータスビューレンダリング用の共有関数。

## 型定義

### LiveStatus

ライブビューアイテムの共通ステータスタイプ。サブエージェントとチームメンバーの両方のライブアイテムで使用。

```typescript
type LiveStatus = "pending" | "running" | "completed" | "failed";
```

## 関数

### getLiveStatusGlyph(status)

ライブステータスをグリフ表現に変換する。

```typescript
function getLiveStatusGlyph(status: LiveStatus): string
```

**パラメータ:**
- `status` - 変換するステータス

**戻り値:** ステータスを表す2文字の文字列

**マッピング:**
| ステータス | グリフ |
|-----------|-------|
| completed | OK |
| failed | !! |
| running | >> |
| pending | .. |

### isEnterInput(rawInput)

生入力がEnterキー押下を表しているか確認する。異なるターミナル間でのEnterの複数の表現を処理。

```typescript
function isEnterInput(rawInput: string): boolean
```

**パラメータ:**
- `rawInput` - 確認する生入力文字列

**戻り値:** 入力がEnterを表す場合はtrue

**検出パターン:**
- `\r` - CR
- `\n` - LF
- `\r\n` - CRLF
- `enter` - 文字列リテラル

### finalizeLiveLines(lines, height)

固定高さビューでの表示用にラインを確定する。高さより少ない場合は空文字でパディング、多い場合は切り詰め。

```typescript
function finalizeLiveLines(lines: string[], height?: number): string[]
```

**パラメータ:**
- `lines` - 確定するライン
- `height` - 出力のターゲット高さ（オプション）

**戻り値:** 確定されたライン配列

**動作:**
- `height` が未指定または0以下: そのまま返す
- `lines.length > height`: 先頭からheight分を返す
- `lines.length < height`: 空文字でパディング

## 使用例

```typescript
import {
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines
} from "./live-view-utils.js";

// ステータスグリフ取得
const glyph = getLiveStatusGlyph("running");  // ">>"
const doneGlyph = getLiveStatusGlyph("completed");  // "OK"

// Enter入力確認
if (isEnterInput(rawKey)) {
  // 詳細モードに切り替え
}

// ライン確定（20行のビュー用）
const displayLines = finalizeLiveLines(renderedLines, 20);
```

## 関連ファイル

- `./live-monitor-base.ts` - ライブモニターベースモジュール
- `./tui-utils.ts` - TUIユーティリティ
