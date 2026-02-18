---
title: audit
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# audit

## 概要

`audit` モジュールのAPIリファレンス。

## インポート

```typescript
import { appendFileSync, existsSync, mkdirSync... } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { AuditLogEntry, AuditAction, DynamicToolsPaths... } from './types.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `logAudit` | 監査ログにエントリを追加 |
| 関数 | `readAuditLog` | 監査ログを読み込み |
| 関数 | `getToolHistory` | ツールの操作履歴を取得 |
| 関数 | `getAuditStatistics` | 指定期間内の統計を取得 |
| 関数 | `formatAuditLogEntry` | 監査ログをフォーマットして表示用文字列を生成 |
| 関数 | `generateAuditReport` | 監査ログレポートを生成 |
| 関数 | `archiveOldLogs` | 古いログをアーカイブ |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[audit]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    types["types"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  logAudit["logAudit()"]
  readAuditLog["readAuditLog()"]
  getToolHistory["getToolHistory()"]
  getAuditStatistics["getAuditStatistics()"]
  formatAuditLogEntry["formatAuditLogEntry()"]
  generateAuditReport["generateAuditReport()"]
  logAudit -.-> readAuditLog
  readAuditLog -.-> getToolHistory
  getToolHistory -.-> getAuditStatistics
  getAuditStatistics -.-> formatAuditLogEntry
  formatAuditLogEntry -.-> generateAuditReport
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant audit as "audit"
  participant types as "types"

  Caller->>audit: logAudit()
  activate audit
  Note over audit: 非同期処理開始
  audit->>types: 内部関数呼び出し
  types-->>audit: 結果
  deactivate audit
  audit-->>Caller: Promise_AuditLogEntr

  Caller->>audit: readAuditLog()
  audit-->>Caller: AuditLogEntry
```

## 関数

### generateEntryId

```typescript
generateEntryId(): string
```

エントリIDを生成

**戻り値**: `string`

### logAudit

```typescript
async logAudit(entry: {
    action: AuditAction;
    toolId?: string;
    toolName?: string;
    actor: string;
    details: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
  }, paths?: DynamicToolsPaths): Promise<AuditLogEntry>
```

監査ログにエントリを追加

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `{
    action: AuditAction;
    toolId?: string;
    toolName?: string;
    actor: string;
    details: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
  }` | はい |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `Promise<AuditLogEntry>`

### readAuditLog

```typescript
readAuditLog(options?: {
    limit?: number;
    toolId?: string;
    action?: AuditAction;
    since?: Date;
  }, paths?: DynamicToolsPaths): AuditLogEntry[]
```

監査ログを読み込み

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `{
    limit?: number;
    toolId?: string;
    action?: AuditAction;
    since?: Date;
  }` | いいえ |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `AuditLogEntry[]`

### getToolHistory

```typescript
getToolHistory(toolId: string, paths?: DynamicToolsPaths): AuditLogEntry[]
```

ツールの操作履歴を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| toolId | `string` | はい |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `AuditLogEntry[]`

### getAuditStatistics

```typescript
getAuditStatistics(since: Date, paths?: DynamicToolsPaths): {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actionsByType: Record<AuditAction, number>;
  topTools: Array<{ toolId: string; toolName: string; count: number }>;
}
```

指定期間内の統計を取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| since | `Date` | はい |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `{
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actionsByType: Record<AuditAction, number>;
  topTools: Array<{ toolId: string; toolName: string; count: number }>;
}`

### formatAuditLogEntry

```typescript
formatAuditLogEntry(entry: AuditLogEntry): string
```

監査ログをフォーマットして表示用文字列を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| entry | `AuditLogEntry` | はい |

**戻り値**: `string`

### generateAuditReport

```typescript
generateAuditReport(since: Date, paths?: DynamicToolsPaths): string
```

監査ログレポートを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| since | `Date` | はい |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `string`

### archiveOldLogs

```typescript
archiveOldLogs(daysToKeep: number, paths?: DynamicToolsPaths): { archived: number; error?: string }
```

古いログをアーカイブ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| daysToKeep | `number` | はい |
| paths | `DynamicToolsPaths` | いいえ |

**戻り値**: `{ archived: number; error?: string }`

---
*自動生成: 2026-02-18T00:15:35.681Z*
