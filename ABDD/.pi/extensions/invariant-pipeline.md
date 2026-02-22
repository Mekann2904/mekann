---
title: invariant-pipeline
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# invariant-pipeline

## 概要

`invariant-pipeline` モジュールのAPIリファレンス。

## インポート

```typescript
// from 'node:fs': readFileSync, writeFileSync, existsSync, ...
// from 'node:path': join, dirname
// from '@sinclair/typebox': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## 図解

### クラス図

```mermaid
classDiagram
  class SpecState {
    <<interface>>
    +name: string
    +type: string
    +initialValue: unknown
    +constraints: string
  }
  class SpecOperation {
    <<interface>>
    +name: string
    +parameters: name_string_type_st
    +preconditions: string
    +postconditions: string
    +description: string
  }
  class SpecInvariant {
    <<interface>>
    +name: string
    +condition: string
    +description: string
  }
  class ParsedSpec {
    <<interface>>
    +title: string
    +description: string
    +states: SpecState
    +operations: SpecOperation
    +invariants: SpecInvariant
  }
  class GenerationOutput {
    <<interface>>
    +content: string
    +warnings: string
    +errors: string
  }
  class GenerationResult {
    <<interface>>
    +success: boolean
    +outputs: quint_path_string
    +errors: string
    +warnings: string
  }
  class VerifyQuintInput {
    <<interface>>
    +quint_path: string
    +check_invariants: boolean
    +check_liveness: boolean
  }
  class GenerateMacrosInput {
    <<interface>>
    +spec_path: string
    +output_path: string
    +struct_name: string
  }
  class GenerateTestsInput {
    <<interface>>
    +spec_path: string
    +output_path: string
    +struct_name: string
    +test_count: number
  }
  class GenerateMBTInput {
    <<interface>>
    +spec_path: string
    +output_path: string
    +struct_name: string
    +max_steps: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[invariant-pipeline]
    main[Main Module]
  end
  subgraph external[外部ライブラリ]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

## 関数

### parseSpecMarkdown

```typescript
parseSpecMarkdown(content: string): ParsedSpec
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `ParsedSpec`

### parseConstantValue

```typescript
parseConstantValue(valueStr: string, type: string): unknown
```

Parse constant value based on type

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| valueStr | `string` | はい |
| type | `string` | はい |

**戻り値**: `unknown`

### generateQuintSpec

```typescript
generateQuintSpec(spec: ParsedSpec, moduleName?: string): GenerationOutput
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| spec | `ParsedSpec` | はい |
| moduleName | `string` | いいえ |

**戻り値**: `GenerationOutput`

### mapTypeToQuint

```typescript
mapTypeToQuint(type: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `string`

### getDefaultValue

```typescript
getDefaultValue(type: string): unknown
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `unknown`

### formatValue

```typescript
formatValue(value: unknown, type: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| type | `string` | はい |

**戻り値**: `string`

### generateTsValidators

```typescript
generateTsValidators(spec: ParsedSpec, structName?: string): GenerationOutput
```

spec.mdからTypeScriptバリデーション関数を生成する
Rustマクロの代わりに、クラスベースのバリデーションを提供

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| spec | `ParsedSpec` | はい |
| structName | `string` | いいえ |

**戻り値**: `GenerationOutput`

### mapTypeToTypeScript

```typescript
mapTypeToTypeScript(type: string): string
```

型をTypeScriptの型にマッピングする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `string`

### getTypeScriptDefaultValue

```typescript
getTypeScriptDefaultValue(type: string): string
```

TypeScriptのデフォルト値を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `string`

### translateConditionToTypeScript

```typescript
translateConditionToTypeScript(condition: string, states: SpecState[]): string
```

条件式をTypeScriptの式に変換する
obj.field形式でモデルのフィールドにアクセスする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| condition | `string` | はい |
| states | `SpecState[]` | はい |

**戻り値**: `string`

### generatePropertyTests

```typescript
generatePropertyTests(spec: ParsedSpec, structName?: string, testCount?: number): GenerationOutput
```

spec.mdからfast-checkベースのプロパティテストを生成する
Rustのproptestの代わりに、TypeScriptのfast-checkを使用

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| spec | `ParsedSpec` | はい |
| structName | `string` | いいえ |
| testCount | `number` | いいえ |

**戻り値**: `GenerationOutput`

### getFastCheckArbitrary

```typescript
getFastCheckArbitrary(type: string): string
```

TypeScript型に対応するfast-checkアービトラリーを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `string`

### translatePostconditionToTypeScript

```typescript
translatePostconditionToTypeScript(postcondition: string, states: SpecState[]): { code: string; warning?: string }
```

事後条件をTypeScriptの状態遷移コードに変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| postcondition | `string` | はい |
| states | `SpecState[]` | はい |

**戻り値**: `{ code: string; warning?: string }`

### generateMBTDriver

```typescript
generateMBTDriver(spec: ParsedSpec, structName?: string, maxSteps?: number): GenerationOutput
```

spec.mdからTypeScriptベースのモデルベーステストドライバーを生成する
ランダム実行と決定的ステップ実行の両方をサポート

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| spec | `ParsedSpec` | はい |
| structName | `string` | いいえ |
| maxSteps | `number` | いいえ |

**戻り値**: `GenerationOutput`

### translatePostconditionToMBT

```typescript
translatePostconditionToMBT(postcondition: string, states: SpecState[]): { code: string; warning?: string }
```

事後条件をMBT用のTypeScriptコードに変換

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| postcondition | `string` | はい |
| states | `SpecState[]` | はい |

**戻り値**: `{ code: string; warning?: string }`

### translateConditionToTypeScriptForMBT

```typescript
translateConditionToTypeScriptForMBT(condition: string, states: SpecState[]): string
```

条件式をMBT用のTypeScript式に変換（this.field形式）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| condition | `string` | はい |
| states | `SpecState[]` | はい |

**戻り値**: `string`

### translateConditionToTypeScriptBase

```typescript
translateConditionToTypeScriptBase(condition: string): string
```

条件式の基本変換（型マッピングなし）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| condition | `string` | はい |

**戻り値**: `string`

### formatTypeScriptValue

```typescript
formatTypeScriptValue(value: unknown, type: string): string
```

TypeScriptの値をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `unknown` | はい |
| type | `string` | はい |

**戻り値**: `string`

### getTypeScriptDefaultLiteral

```typescript
getTypeScriptDefaultLiteral(type: string): string
```

TypeScriptのデフォルト値リテラルを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `string`

## インターフェース

### SpecState

```typescript
interface SpecState {
  name: string;
  type: string;
  initialValue?: unknown;
  constraints?: string[];
}
```

### SpecOperation

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

```typescript
interface SpecInvariant {
  name: string;
  condition: string;
  description?: string;
}
```

### ParsedSpec

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

```typescript
interface GenerationOutput {
  content: string;
  warnings: string[];
  errors: string[];
}
```

### GenerationResult

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

### VerifyQuintInput

```typescript
interface VerifyQuintInput {
  quint_path: string;
  check_invariants?: boolean;
  check_liveness?: boolean;
}
```

### GenerateMacrosInput

```typescript
interface GenerateMacrosInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
}
```

### GenerateTestsInput

```typescript
interface GenerateTestsInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  test_count?: number;
}
```

### GenerateMBTInput

```typescript
interface GenerateMBTInput {
  spec_path: string;
  output_path?: string;
  struct_name?: string;
  max_steps?: number;
}
```

---
*自動生成: 2026-02-22T19:27:00.286Z*
