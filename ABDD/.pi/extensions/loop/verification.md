---
title: verification
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# verification

## 概要

`verification` モジュールのAPIリファレンス。

## インポート

```typescript
import { spawn } from 'node:child_process';
import { formatDuration } from '../../lib/format-utils.js';
import { toErrorMessage } from '../../lib/error-utils.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `resolveVerificationPolicy` | 環境変数から検証ポリシーを解決する |
| 関数 | `shouldRunVerificationCommand` | 検証コマンドを実行すべきか判定する |
| 関数 | `runVerificationCommand` | 検証コマンドを実行する |
| 関数 | `parseVerificationCommand` | 検証コマンドをパースする |
| 関数 | `resolveVerificationAllowlistPrefixes` | 検証許可リストのプレフィックスを解決する |
| 関数 | `isVerificationCommandAllowed` | 検証コマンドが許可リストに含まれるか判定 |
| 関数 | `buildVerificationValidationFeedback` | 検証結果からフィードバックメッセージを生成する |
| インターフェース | `LoopVerificationResult` | ループ検証結果を表すインターフェース |
| インターフェース | `ParsedVerificationCommand` | 検証コマンドの解析結果 |
| インターフェース | `VerificationPolicyConfig` | 検証ポリシーの設定 |
| 型 | `VerificationPolicyMode` | 検証ポリシーのモード |

## 図解

### クラス図

```mermaid
classDiagram
  class LoopVerificationResult {
    <<interface>>
    +command: string
    +passed: boolean
    +timedOut: boolean
    +exitCode: number_null
    +durationMs: number
  }
  class ParsedVerificationCommand {
    <<interface>>
    +executable: string
    +args: string
    +error: string
  }
  class VerificationPolicyConfig {
    <<interface>>
    +mode: VerificationPolicyMo
    +everyN: number
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[verification]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    format_utils["format-utils"]
    error_utils["error-utils"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  resolveVerificationPolicy["resolveVerificationPolicy()"]
  shouldRunVerificationCommand["shouldRunVerificationCommand()"]
  runVerificationCommand["runVerificationCommand()"]
  parseVerificationCommand["parseVerificationCommand()"]
  resolveVerificationAllowlistPrefixes["resolveVerificationAllowlistPrefixes()"]
  isVerificationCommandAllowed["isVerificationCommandAllowed()"]
  resolveVerificationPolicy -.-> shouldRunVerificationCommand
  shouldRunVerificationCommand -.-> runVerificationCommand
  runVerificationCommand -.-> parseVerificationCommand
  parseVerificationCommand -.-> resolveVerificationAllowlistPrefixes
  resolveVerificationAllowlistPrefixes -.-> isVerificationCommandAllowed
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant verification as "verification"
  participant format_utils as "format-utils"
  participant error_utils as "error-utils"

  Caller->>verification: resolveVerificationPolicy()
  verification->>format_utils: 内部関数呼び出し
  format_utils-->>verification: 結果
  verification-->>Caller: VerificationPolicyCo

  Caller->>verification: shouldRunVerificationCommand()
  verification-->>Caller: boolean
```

## 関数

### resolveVerificationPolicy

```typescript
resolveVerificationPolicy(): VerificationPolicyConfig
```

環境変数から検証ポリシーを解決する

**戻り値**: `VerificationPolicyConfig`

### shouldRunVerificationCommand

```typescript
shouldRunVerificationCommand(input: {
  iteration: number;
  maxIterations: number;
  status: "continue" | "done" | "unknown";
  policy: VerificationPolicyConfig;
}): boolean
```

検証コマンドを実行すべきか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ iteration | `number` | はい |
| &nbsp;&nbsp;↳ maxIterations | `number` | はい |
| &nbsp;&nbsp;↳ status | `"continue" | "done" | "unknown"` | はい |
| &nbsp;&nbsp;↳ policy | `VerificationPolicyConfig` | はい |

**戻り値**: `boolean`

### runVerificationCommand

```typescript
async runVerificationCommand(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<LoopVerificationResult>
```

検証コマンドを実行する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `object` | はい |
| &nbsp;&nbsp;↳ command | `string` | はい |
| &nbsp;&nbsp;↳ cwd | `string` | はい |
| &nbsp;&nbsp;↳ timeoutMs | `number` | はい |
| &nbsp;&nbsp;↳ signal | `AbortSignal` | いいえ |

**戻り値**: `Promise<LoopVerificationResult>`

### finish

```typescript
finish(partial: {
      passed: boolean;
      timedOut: boolean;
      exitCode: number | null;
      error?: string;
    }): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| partial | `object` | はい |
| &nbsp;&nbsp;↳ passed | `boolean` | はい |
| &nbsp;&nbsp;↳ timedOut | `boolean` | はい |
| &nbsp;&nbsp;↳ exitCode | `number | null` | はい |
| &nbsp;&nbsp;↳ error | `string` | いいえ |

**戻り値**: `void`

### killSafely

```typescript
killSafely(sig: NodeJS.Signals): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| sig | `NodeJS.Signals` | はい |

**戻り値**: `void`

### onAbort

```typescript
onAbort(): void
```

**戻り値**: `void`

### cleanup

```typescript
cleanup(): void
```

**戻り値**: `void`

### parseVerificationCommand

```typescript
parseVerificationCommand(command: string): ParsedVerificationCommand
```

検証コマンドをパースする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| command | `string` | はい |

**戻り値**: `ParsedVerificationCommand`

### tokenizeArgs

```typescript
tokenizeArgs(input: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |

**戻り値**: `string[]`

### resolveVerificationAllowlistPrefixes

```typescript
resolveVerificationAllowlistPrefixes(): string[][]
```

検証許可リストのプレフィックスを解決する

**戻り値**: `string[][]`

### isVerificationCommandAllowed

```typescript
isVerificationCommandAllowed(command: ParsedVerificationCommand, allowlistPrefixes: string[][]): boolean
```

検証コマンドが許可リストに含まれるか判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| command | `ParsedVerificationCommand` | はい |
| allowlistPrefixes | `string[][]` | はい |

**戻り値**: `boolean`

### formatAllowlistPreview

```typescript
formatAllowlistPreview(prefixes: string[][]): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| prefixes | `string[][]` | はい |

**戻り値**: `string`

### truncateText

```typescript
truncateText(value: string, maxChars: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

### redactSensitiveText

```typescript
redactSensitiveText(value: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |

**戻り値**: `string`

### buildVerificationValidationFeedback

```typescript
buildVerificationValidationFeedback(result: LoopVerificationResult): string[]
```

検証結果からフィードバックメッセージを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `LoopVerificationResult` | はい |

**戻り値**: `string[]`

### toPreview

```typescript
toPreview(value: string, maxChars: number): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string` | はい |
| maxChars | `number` | はい |

**戻り値**: `string`

## インターフェース

### LoopVerificationResult

```typescript
interface LoopVerificationResult {
  command: string;
  passed: boolean;
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}
```

ループ検証結果を表すインターフェース

### ParsedVerificationCommand

```typescript
interface ParsedVerificationCommand {
  executable: string;
  args: string[];
  error?: string;
}
```

検証コマンドの解析結果

### VerificationPolicyConfig

```typescript
interface VerificationPolicyConfig {
  mode: VerificationPolicyMode;
  everyN: number;
}
```

検証ポリシーの設定

## 型定義

### VerificationPolicyMode

```typescript
type VerificationPolicyMode = "always" | "done_only" | "every_n"
```

検証ポリシーのモード

---
*自動生成: 2026-02-18T07:17:30.246Z*
