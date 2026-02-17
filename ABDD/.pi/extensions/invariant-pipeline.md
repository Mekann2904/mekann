---
title: invariant-pipeline
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, invariant, quint, rust, proptest, mbt, formal-specification]
related: [invariant-generation-skill]
---

# invariant-pipeline

> パンくず: [Home](../../README.md) > [Extensions](./) > invariant-pipeline

## 概要

spec.mdからQuint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストを自動生成する拡張機能。

## ツール

### generate_from_spec

spec.mdからQuint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストドライバーを一括生成する。

**説明**: spec.mdからQuint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストドライバーを一括生成

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `spec_path` | string | はい | spec.mdファイルへのパス |
| `output_dir` | string | いいえ | 出力ディレクトリ（デフォルト: spec_pathと同じディレクトリ） |
| `module_name` | string | いいえ | Quintモジュール名（デフォルト: specのタイトル） |
| `struct_name` | string | いいえ | Rust構造体名（デフォルト: specのタイトル） |
| `test_count` | number | いいえ | プロパティテストのテスト数（デフォルト: 256） |
| `max_steps` | number | いいえ | MBTの最大ステップ数（デフォルト: 100） |

**戻り値**:
- 成功状態
- specタイトル
- 状態数、操作数、インバリアント数
- 生成されたファイル（quint, macros, tests, mbt）
- 警告、エラー
- 実行時間

### verify_quint_spec

Quint形式仕様を検証する（構文チェック、インバリアントチェック）。

**説明**: Quint形式仕様を検証（構文チェック、インバリアントチェック）

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `quint_path` | string | はい | Quintファイルへのパス |
| `check_invariants` | boolean | いいえ | インバリアントをチェック |

**戻り値**:
- 成功状態
- エラー、警告
- インバリアント存在フラグ

### generate_invariant_macros

spec.mdからRustインバリアントマクロを生成する。

**説明**: spec.mdからRustインバリアントマクロを生成

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `spec_path` | string | はい | spec.mdファイルへのパス |
| `output_path` | string | いいえ | 出力ファイルパス |
| `struct_name` | string | いいえ | Rust構造体名 |

### generate_property_tests

spec.mdからproptestベースのプロパティテストを生成する。

**説明**: spec.mdからproptestベースのプロパティテストを生成

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `spec_path` | string | はい | spec.mdファイルへのパス |
| `output_path` | string | いいえ | 出力ファイルパス |
| `struct_name` | string | いいえ | テスト対象構造体名 |
| `test_count` | number | いいえ | プロパティテストのテスト数（デフォルト: 256） |

### generate_mbt_driver

spec.mdからモデルベーステストドライバーを生成する。

**説明**: spec.mdからモデルベーステストドライバーを生成

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `spec_path` | string | はい | spec.mdファイルへのパス |
| `output_path` | string | いいえ | 出力ファイルパス |
| `struct_name` | string | いいえ | モデル構造体名 |
| `max_steps` | number | いいえ | MBTの最大ステップ数（デフォルト: 100） |

## 型定義

### SpecState

状態変数の定義。

```typescript
interface SpecState {
  name: string;
  type: string;
  initialValue?: unknown;
  constraints?: string[];
}
```

### SpecOperation

操作の定義。

```typescript
interface SpecOperation {
  name: string;
  parameters?: { name: string; type: string }[];
  preconditions?: string[];
  postconditions?: string[];
  description?: string;
}
```

### SpecInvariant

インバリアントの定義。

```typescript
interface SpecInvariant {
  name: string;
  condition: string;
  description?: string;
}
```

### ParsedSpec

パースされた仕様。

```typescript
interface ParsedSpec {
  title: string;
  description?: string;
  states: SpecState[];
  operations: SpecOperation[];
  invariants: SpecInvariant[];
  constants?: { name: string; type: string; value?: unknown }[];
}
```

### GenerationOutput

生成出力。

```typescript
interface GenerationOutput {
  content: string;
  warnings: string[];
  errors: string[];
}
```

### GenerationResult

生成結果。

```typescript
interface GenerationResult {
  success: boolean;
  outputs: {
    quint?: { path: string; content: string };
    macros?: { path: string; content: string };
    tests?: { path: string; content: string };
    mbt?: { path: string; content: string };
  };
  errors: string[];
  warnings: string[];
}
```

## 主な関数

### parseSpecMarkdown

spec.mdファイルをパースする。

```typescript
function parseSpecMarkdown(content: string): ParsedSpec
```

**パース対象セクション**:
- タイトル（# タイトル）
- 定数（## 定数 / ## Constants）
- 状態（## 状態 / ## State）
- 操作（## 操作 / ## Operations）
- インバリアント（## インバリアント / ## Invariants）

### generateQuintSpec

Quint形式仕様を生成する。

```typescript
function generateQuintSpec(spec: ParsedSpec, moduleName?: string): GenerationOutput
```

**生成内容**:
- 定数定義
- 状態変数定義
- 初期状態（init）
- 操作（action）
- インバリアント

### generateRustMacros

Rustインバリアントマクロを生成する。

```typescript
function generateRustMacros(spec: ParsedSpec, structName?: string): GenerationOutput
```

**生成内容**:
- InvariantViolationエラー型
- define_*_invariants!マクロ
- check_invariants()メソッド

### generatePropertyTests

プロパティベーステストを生成する。

```typescript
function generatePropertyTests(spec: ParsedSpec, structName?: string, testCount?: number): GenerationOutput
```

**生成内容**:
- 各状態変数のストラテジー（arb_*）
- テスト用構造体
- インバリアントテスト
- 操作テスト（事前条件チェック→実行→インバリアントチェック）

### generateMBTDriver

モデルベーステストドライバーを生成する。

```typescript
function generateMBTDriver(spec: ParsedSpec, structName?: string, maxSteps?: number): GenerationOutput
```

**生成内容**:
- Action列挙型
- Model構造体
- initial_state()
- apply_action()
- check_invariants()
- generate_valid_actions()
- run_mbt()

## 型マッピング

### Quint型マッピング

| 仕様型 | Quint型 |
|--------|---------|
| int, integer, 整数 | int |
| bool, boolean, 真偽 | bool |
| str, string, 文字列 | str |
| Set, 集合 | Set |
| List, リスト | List |
| Map, マップ | Map |

### Rust型マッピング

| 仕様型 | Rust型 |
|--------|--------|
| int, integer, 整数 | i64 |
| bool, boolean, 真偽 | bool |
| str, string, 文字列 | String |
| List, リスト | Vec |
| Map, マップ | HashMap |
| Set, 集合 | HashSet |

## 条件変換

### translateConditionToRust

自然言語/数学記法からRustブール式への変換。

```typescript
function translateConditionToRust(condition: string): string
```

**変換ルール**:
- `=` → `==`
- `and` → `&&`
- `or` → `||`
- `not` → `!`

### translatePreconditionToRust

事前条件をRust式に変換（model.fieldアクセスパターンを使用）。

```typescript
function translatePreconditionToRust(precondition: string, states: SpecState[], prefix: string = "model"): string
```

### translatePostconditionToTransition

事後条件を状態遷移コードに変換。

```typescript
function translatePostconditionToTransition(postcondition: string, states: SpecState[]): TransitionResult
```

**パターン**:
- `variable = expression` → `new_state.variable = expression`
- `variable' = expression` (TLA+スタイル) → `new_state.variable = expression`

## 依存関係

- `node:fs`: ファイル操作
- `node:path`: パス操作
- `@mariozechner/pi-ai`: Type
- `@mariozechner/pi-coding-agent`: ExtensionAPI

## 統合

- **invariant-generationスキル**: 形式仕様生成の専門知識
- **invariant-generation-team**: マルチエージェント生成

---

## 関連トピック

- [invariant-generationスキル](../skills/invariant-generation/SKILL.md) - インバリアント生成スキル
- [extensions](../../docs/extensions.md) - 拡張機能一覧
