---
title: text-utils
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# text-utils

## 概要

`text-utils` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `truncateText` | テキストを指定文字数に正確に収める |
| 関数 | `truncateTextWithMarker` | テキストを切り捨てマーカー付きで切り詰める |
| 関数 | `toPreview` | テキストをプレビュー形式に変換する |
| 関数 | `normalizeOptionalText` | optionalなテキストを正規化する |
| 関数 | `throwIfAborted` | AbortSignalの中断状態をチェックする |

## 図解

## 関数

### truncateText

```typescript
truncateText(text: string, maxLength: number): string
```

テキストを指定文字数に正確に収める

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| maxLength | `number` | はい |

**戻り値**: `string`

### truncateTextWithMarker

```typescript
truncateTextWithMarker(value: string, maxChars: number): string
```

テキストを切り捨てマーカー付きで切り詰める

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

### toPreview

```typescript
toPreview(value: string, maxChars: number): string
```

テキストをプレビュー形式に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

### normalizeOptionalText

```typescript
normalizeOptionalText(value: unknown): string | undefined
```

optionalなテキストを正規化する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `string | undefined`

### throwIfAborted

```typescript
throwIfAborted(signal: AbortSignal | undefined, message: any): void
```

AbortSignalの中断状態をチェックする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| signal | `AbortSignal | undefined` | はい |
| message | `any` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-22T19:27:00.733Z*
