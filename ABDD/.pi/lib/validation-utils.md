---
title: Validation Utils
category: reference
audience: developer
last_updated: 2026-02-18
tags: [validation, utilities, numbers]
related: []
---

# Validation Utils

拡張機能間で共有されるバリデーションユーティリティ。

## 概要

context-usage-dashboard.ts, agent-usage-tracker.ts, retry-with-backoff.ts, loop.ts, rsa.tsから重複実装を統合。

## Number Utilities

### toFiniteNumber()

未知の値を有限数に変換。有効な有限数でない場合はundefinedを返す。

```typescript
function toFiniteNumber(value: unknown): number | undefined
```

**パラメータ:**
- `value` - 変換する値

**戻り値:** 有限数またはundefined

### toFiniteNumberWithDefault()

未知の値を有限数に変換（デフォルトフォールバック付き）。

```typescript
function toFiniteNumberWithDefault(value: unknown, fallback?: number): number
```

**パラメータ:**
- `value` - 変換する値
- `fallback` - 変換失敗時のフォールバック値（デフォルト: 0）

**戻り値:** 有限数またはフォールバック

## Integer Utilities

### BoundedIntegerResult

境界付き整数バリデーションの結果型。

```typescript
type BoundedIntegerResult =
  | { ok: true; value: number }
  | { ok: false; error: string };
```

### toBoundedInteger()

整数値をバリデーションして境界を設定。

```typescript
function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): BoundedIntegerResult
```

**パラメータ:**
- `value` - バリデーションする値
- `fallback` - undefined時のフォールバック値
- `min` - 最小許容値
- `max` - 最大許容値
- `field` - エラーメッセージ用のフィールド名

**戻り値:** 値またはエラーを含むバリデーション結果

### clampInteger()

整数値を指定範囲にクランプ。Math.truncを使用して整数結果を保証。

```typescript
function clampInteger(value: number, min: number, max: number): number
```

**パラメータ:**
- `value` - クランプする値
- `min` - 最小許容値
- `max` - 最大許容値

**戻り値:** クランプされた整数

### clampFloat()

浮動小数点値を指定範囲にクランプ。

```typescript
function clampFloat(value: number, min: number, max: number): number
```

**パラメータ:**
- `value` - クランプする値
- `min` - 最小許容値
- `max` - 最大許容値

**戻り値:** クランプされた浮動小数点

## 使用例

```typescript
// 数値変換
const count = toFiniteNumber(userInput);
if (count === undefined) {
  console.log("Invalid number");
}

// デフォルト付き変換
const timeout = toFiniteNumberWithDefault(envTimeout, 5000);

// 境界付き整数バリデーション
const result = toBoundedInteger(portInput, 80, 1, 65535, "port");
if (result.ok) {
  console.log(`Port: ${result.value}`);
} else {
  console.log(`Error: ${result.error}`);
}

// クランプ
const clampedPort = clampInteger(userPort, 1, 65535);
const normalizedConfidence = clampFloat(confidence, 0, 1);
```

## 関連ファイル

- `.pi/extensions/context-usage-dashboard.ts`
- `.pi/extensions/agent-usage-tracker.ts`
- `.pi/lib/retry-with-backoff.ts`
- `.pi/lib/loop.ts`
- `.pi/lib/rsa.ts`
