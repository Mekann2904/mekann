---
title: dynamic-tools
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, dynamic, tools, code-generation, security]
related: [verification-workflow, dynamic-tools-lib]
---

# dynamic-tools

> パンくず: [Home](../../README.md) > [Extensions](./) > dynamic-tools

## 概要

タスク実行中に必要なツールを動的に生成・実行する拡張機能。Live-SWE-agent統合により、TypeScriptコードを指定して新しいツールを作成し、VMサンドボックス内で安全に実行する。

## 機能

- **create_tool**: 動的ツール生成
- **run_dynamic_tool**: 動的ツール実行
- **list_dynamic_tools**: ツール一覧表示
- **delete_dynamic_tool**: ツール削除
- **tool_reflection**: 実行後の反省とツール生成判定

## セキュリティ

- VMコンテキストで実行（require, processは除外）
- 外部モジュールアクセス・環境変数アクセス禁止
- allowlist-based検証パターン
- 詳細は `lib/dynamic-tools/safety.ts` 参照

## 型定義

### CreateToolInput

動的ツール生成の入力パラメータ。

```typescript
interface CreateToolInput {
  name: string;
  description: string;
  code: string;
  parameters?: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    default?: unknown;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    required?: boolean;
  }>;
  tags?: string[];
  generated_from?: string;
}
```

### RunDynamicToolInput

動的ツール実行の入力パラメータ。

```typescript
interface RunDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  parameters: Record<string, unknown>;
  timeout_ms?: number;
}
```

### ListDynamicToolsInput

ツール一覧表示の入力パラメータ。

```typescript
interface ListDynamicToolsInput {
  name?: string;
  tags?: string[];
  min_safety_score?: number;
  limit?: number;
}
```

### DeleteDynamicToolInput

ツール削除の入力パラメータ。

```typescript
interface DeleteDynamicToolInput {
  tool_id?: string;
  tool_name?: string;
  confirm?: boolean;
}
```

### ToolReflectionInput

ツール生成反省の入力パラメータ。

```typescript
interface ToolReflectionInput {
  task_description: string;
  last_tool_result: string;
  failed_attempts?: number;
}
```

## ツール

### create_tool

動的ツールを生成する。TypeScriptコードを指定して新しいツールを作成する。

**説明**: 動的ツールを生成します。TypeScriptコードを指定して新しいツールを作成します。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `name` | string | はい | ツール名（英字で始まり、英数字、アンダースコア、ハイフンのみ使用可能） |
| `description` | string | はい | ツールの説明 |
| `code` | string | はい | ツールのTypeScript/JavaScriptコード。execute(params)関数をエクスポートする必要がある |
| `parameters` | object | いいえ | パラメータ定義 |
| `tags` | string[] | いいえ | ツールのタグ（カテゴリ分類用） |
| `generated_from` | string | いいえ | ツールの生成元（タスク説明など） |

**戻り値**:
- ツールID
- 安全性スコア
- 品質スコア
- 検証状態
- 使用方法

### run_dynamic_tool

登録済みの動的ツールを実行する。tool_idまたはtool_nameでツールを指定する。

**説明**: 登録済みの動的ツールを実行します。tool_idまたはtool_nameでツールを指定します。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `tool_id` | string | いいえ | ツールID |
| `tool_name` | string | いいえ | ツール名（tool_idの代わりに使用可能） |
| `parameters` | object | はい | ツールに渡すパラメータ |
| `timeout_ms` | number | いいえ | タイムアウト時間（ミリ秒、デフォルト: 30000） |

**戻り値**:
- 実行時間
- 実行結果

### list_dynamic_tools

登録済みの動的ツール一覧を表示する。フィルタリングオプションを利用可能。

**説明**: 登録済みの動的ツール一覧を表示します。フィルタリングオプションを利用可能です。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `name` | string | いいえ | 名前でフィルタ（部分一致） |
| `tags` | string[] | いいえ | タグでフィルタ |
| `min_safety_score` | number | いいえ | 安全性スコアの最小値（0.0-1.0） |
| `limit` | number | いいえ | 最大表示件数（デフォルト: 20） |

**戻り値**:
- ツール一覧（ID、説明、信頼度、使用回数、最終使用日時、検証状態、タグ）

### delete_dynamic_tool

登録済みの動的ツールを削除する。confirm: trueで削除を確定する。

**説明**: 登録済みの動的ツールを削除します。confirm: trueで削除を確定します。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `tool_id` | string | いいえ | ツールID |
| `tool_name` | string | いいえ | ツール名（tool_idの代わりに使用可能） |
| `confirm` | boolean | いいえ | 削除の確認（trueで削除実行） |

### tool_reflection

タスク実行後に反省を行い、ツール生成が推奨されるかを判定する。

**説明**: タスク実行後に反省を行い、ツール生成が推奨されるかを判定します。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| `task_description` | string | はい | 実行中のタスクの説明 |
| `last_tool_result` | string | はい | 直前のツール実行結果 |
| `failed_attempts` | number | いいえ | 失敗した試行回数 |

**ツール生成が推奨されるパターン**:
- 繰り返し操作が検出された場合
- データ変換操作が検出された場合
- API呼び出しパターンが検出された場合
- 検証操作が検出された場合
- 集計操作が検出された場合
- 失敗回数が2回以上に達した場合

## 主な関数

### executeDynamicTool

動的ツールを実行する。同一プロセス内でフル権限実行。

```typescript
async function executeDynamicTool(
  tool: DynamicToolDefinition,
  params: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<ToolExecutionResult>
```

### executeCode

コードを実行する。VMコンテキストからrequire, process, タイマーを削除し、外部モジュールアクセス、プロセス操作、サンドボックスエスケープを制限する。

```typescript
async function executeCode(code: string): Promise<ToolExecutionResult>
```

**利用可能なグローバルオブジェクト**:
- console, Buffer
- Promise, JSON, Object, Array, String, Number, Boolean, Date, Math
- Error, TypeError, RangeError, SyntaxError
- URL, URLSearchParams

**利用不可（セキュリティ制約）**:
- require: 外部モジュールアクセス禁止
- process: 環境変数・プロセス情報アクセス禁止
- global, globalThis: グローバルスコープ汚染禁止
- __dirname, __filename: ファイルシステムパス漏洩禁止
- setTimeout, setInterval等: サンドボックスエスケープ防止

### handleCreateTool

create_toolツールのハンドラ。

```typescript
async function handleCreateTool(input: CreateToolInput): Promise<string>
```

### handleRunDynamicTool

run_dynamic_toolツールのハンドラ。

```typescript
async function handleRunDynamicTool(input: RunDynamicToolInput): Promise<string>
```

### handleListDynamicTools

list_dynamic_toolsツールのハンドラ。

```typescript
async function handleListDynamicTools(input: ListDynamicToolsInput): Promise<string>
```

### handleDeleteDynamicTool

delete_dynamic_toolツールのハンドラ。

```typescript
async function handleDeleteDynamicTool(input: DeleteDynamicToolInput): Promise<string>
```

### handleToolReflection

tool_reflectionツールのハンドラ。

```typescript
async function handleToolReflection(input: ToolReflectionInput): Promise<string>
```

## 監査ログ

監査ログは `.pi/logs/dynamic-tools-audit.jsonl` に保存される。

**ログエントリ**:

```typescript
{
  timestamp: string;
  action: string;
  toolId?: string;
  toolName?: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}
```

## イベントハンドラ

### tool_result

ツール実行結果後の反省プロンプト注入。

**処理**:
- 動的ツール実行後はスキップ
- エラー時は警告通知

### session_start

セッション開始時の初期化メッセージ表示。

## 依存モジュール

- `../lib/comprehensive-logger`: ロギング
- `../lib/dynamic-tools/index.js`: ツール登録・管理・安全性解析
- `../lib/verification-workflow.js`: Inspector/Challenger検証パターン

---

## 関連トピック

- [verification-workflow](../lib/verification-workflow.md) - 検証ワークフロー
- [dynamic-tools](../lib/dynamic-tools/index.md) - 動的ツールライブラリ
