---
title: validation-utils
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# validation-utils

## 概要

`validation-utils` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `toFiniteNumber` | 不明な値を有限の数値に変換する |
| 関数 | `toFiniteNumberWithDefault` | 有限数またはデフォルト値を返す |
| 関数 | `toBoundedInteger` | 整数値の検証と範囲制限を行う |
| 関数 | `clampInteger` | 整数値を指定範囲内に制限する |
| 関数 | `clampFloat` | 浮動小数点数を指定範囲内に制限する |
| 型 | `BoundedIntegerResult` | 整数範囲検証の結果型 |

## 図解

### 関数フロー

```mermaid
flowchart TD
  toFiniteNumber["toFiniteNumber()"]
  toFiniteNumberWithDefault["toFiniteNumberWithDefault()"]
  toBoundedInteger["toBoundedInteger()"]
  clampInteger["clampInteger()"]
  clampFloat["clampFloat()"]
  toFiniteNumber -.-> toFiniteNumberWithDefault
  toFiniteNumberWithDefault -.-> toBoundedInteger
  toBoundedInteger -.-> clampInteger
  clampInteger -.-> clampFloat
```

## 関数

### toFiniteNumber

```typescript
toFiniteNumber(value: unknown): number | undefined
```

不明な値を有限の数値に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |

**戻り値**: `number | undefined`

### toFiniteNumberWithDefault

```typescript
toFiniteNumberWithDefault(value: unknown, fallback: any): number
```

有限数またはデフォルト値を返す

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `any` | はい |

**戻り値**: `number`

### toBoundedInteger

```typescript
toBoundedInteger(value: unknown, fallback: number, min: number, max: number, field: string): BoundedIntegerResult
```

整数値の検証と範囲制限を行う

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| fallback | `number` | はい |
| min | `number` | はい |
| max | `number` | はい |
| field | `string` | はい |

**戻り値**: `BoundedIntegerResult`

### clampInteger

```typescript
clampInteger(value: number, min: number, max: number): number
```

整数値を指定範囲内に制限する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number` | はい |
| min | `number` | はい |
| max | `number` | はい |

**戻り値**: `number`

### clampFloat

```typescript
clampFloat(value: number, min: number, max: number): number
```

浮動小数点数を指定範囲内に制限する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `number` | はい |
| min | `number` | はい |
| max | `number` | はい |

**戻り値**: `number`

## 型定義

### BoundedIntegerResult

```typescript
type BoundedIntegerResult = | { ok: true; value: number }
  | { ok: false; error: string }
```

整数範囲検証の結果型

---
*自動生成: 2026-02-18T07:17:30.516Z*
