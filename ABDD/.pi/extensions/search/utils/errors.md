---
title: errors
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# errors

## 概要

`errors` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `dependencyError` | 依存関係エラーを作成する |
| 関数 | `parameterError` | パラメータ検証エラーを作成する |
| 関数 | `executionError` | コマンド実行エラーを作成する |
| 関数 | `timeoutError` | タイムアウトエラーを作成する |
| 関数 | `indexError` | インデックス関連のエラーを作成する |
| 関数 | `filesystemError` | ファイルシステム操作のエラーを作成する |
| 関数 | `isSearchToolError` | SearchToolErrorかどうかを判定する |
| 関数 | `isErrorCategory` | エラーが特定のカテゴリか判定する |
| 関数 | `getErrorMessage` | エラーメッセージを取得する |
| 関数 | `ok` | 成功結果を作成する |
| 関数 | `err` | 失敗を表す検索結果を作成する |
| 関数 | `isOk` | Check if a result is successful. |
| 関数 | `isErr` | 検索結果が失敗か判定する |
| クラス | `SearchToolError` | 検索ツール用の基底エラークラス |
| 型 | `SearchErrorCategory` | 検索ツールのエラー区分 |
| 型 | `SearchResult` | 検索操作の結果を表す型 |

## 図解

### クラス図

```mermaid
classDiagram
  class SearchToolError {
    +category: SearchErrorCategory
    +recovery: string
    +cause: Error
    +format()
    +toJSON()
  }
  Error <|-- SearchToolError
```

### 関数フロー

```mermaid
flowchart TD
  dependencyError["dependencyError()"]
  parameterError["parameterError()"]
  executionError["executionError()"]
  timeoutError["timeoutError()"]
  indexError["indexError()"]
  filesystemError["filesystemError()"]
  dependencyError -.-> parameterError
  parameterError -.-> executionError
  executionError -.-> timeoutError
  timeoutError -.-> indexError
  indexError -.-> filesystemError
```

## 関数

### dependencyError

```typescript
dependencyError(tool: string, recovery?: string): SearchToolError
```

依存関係エラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |
| recovery | `string` | いいえ |

**戻り値**: `SearchToolError`

### getInstallHint

```typescript
getInstallHint(tool: string): string
```

Get installation hint for common tools.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| tool | `string` | はい |

**戻り値**: `string`

### parameterError

```typescript
parameterError(parameter: string, reason: string, recovery?: string): SearchToolError
```

パラメータ検証エラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| parameter | `string` | はい |
| reason | `string` | はい |
| recovery | `string` | いいえ |

**戻り値**: `SearchToolError`

### executionError

```typescript
executionError(command: string, stderr: string, recovery?: string): SearchToolError
```

コマンド実行エラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| command | `string` | はい |
| stderr | `string` | はい |
| recovery | `string` | いいえ |

**戻り値**: `SearchToolError`

### timeoutError

```typescript
timeoutError(operation: string, timeoutMs: number, recovery?: string): SearchToolError
```

タイムアウトエラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| operation | `string` | はい |
| timeoutMs | `number` | はい |
| recovery | `string` | いいえ |

**戻り値**: `SearchToolError`

### indexError

```typescript
indexError(message: string, recovery?: string): SearchToolError
```

インデックス関連のエラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| message | `string` | はい |
| recovery | `string` | いいえ |

**戻り値**: `SearchToolError`

### filesystemError

```typescript
filesystemError(operation: string, path: string, cause?: Error): SearchToolError
```

ファイルシステム操作のエラーを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| operation | `string` | はい |
| path | `string` | はい |
| cause | `Error` | いいえ |

**戻り値**: `SearchToolError`

### isSearchToolError

```typescript
isSearchToolError(error: unknown): error is SearchToolError
```

SearchToolErrorかどうかを判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `error is SearchToolError`

### isErrorCategory

```typescript
isErrorCategory(error: unknown, category: SearchErrorCategory): boolean
```

エラーが特定のカテゴリか判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |
| category | `SearchErrorCategory` | はい |

**戻り値**: `boolean`

### getErrorMessage

```typescript
getErrorMessage(error: unknown): string
```

エラーメッセージを取得する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `unknown` | はい |

**戻り値**: `string`

### ok

```typescript
ok(value: T): SearchResult<T>
```

成功結果を作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `T` | はい |

**戻り値**: `SearchResult<T>`

### err

```typescript
err(error: E): SearchResult<never, E>
```

失敗を表す検索結果を作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| error | `E` | はい |

**戻り値**: `SearchResult<never, E>`

### isOk

```typescript
isOk(result: SearchResult<T, E>): result is { ok: true; value: T }
```

Check if a result is successful.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `SearchResult<T, E>` | はい |

**戻り値**: `result is { ok: true; value: T }`

### isErr

```typescript
isErr(result: SearchResult<T, E>): result is { ok: false; error: E }
```

検索結果が失敗か判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `SearchResult<T, E>` | はい |

**戻り値**: `result is { ok: false; error: E }`

## クラス

### SearchToolError

検索ツール用の基底エラークラス

**継承**: `Error`

**プロパティ**

| 名前 | 型 | 可視性 |
|------|-----|--------|
| category | `SearchErrorCategory` | public |
| recovery | `string` | public |
| cause | `Error` | public |

**メソッド**

| 名前 | シグネチャ |
|------|------------|
| format | `format(): string` |
| toJSON | `toJSON(): {
		name: string;
		message: string;
		category: SearchErrorCategory;
		recovery?: string;
	}` |

## 型定義

### SearchErrorCategory

```typescript
type SearchErrorCategory = | "dependency"   // External tool not available (rg, fd, ctags)
	| "parameter"    // Invalid input parameters
	| "execution"    // Command execution failed
	| "timeout"      // Operation timed out
	| "index"        // Index-related issues
	| "filesystem"
```

検索ツールのエラー区分

### SearchResult

```typescript
type SearchResult = | { ok: true; value: T }
	| { ok: false; error: E }
```

検索操作の結果を表す型

---
*自動生成: 2026-02-18T07:48:44.659Z*
