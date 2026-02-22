---
title: team-formatters
category: api-reference
audience: developer
last_updated: 2026-02-22
tags: [auto-generated]
related: []
---

# team-formatters

## 概要

`team-formatters` モジュールのAPIリファレンス。

## インポート

```typescript
// from './storage.js': TeamStorage
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `debugCostEstimation` | デバッグ用コスト推定ログを出力 |
| 関数 | `formatTeamList` | チーム一覧をフォーマット |
| 関数 | `formatRecentRuns` | 直近のチーム実行履歴をフォーマット |

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[team-formatters]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    storage["storage"]
  end
  main --> local
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant team_formatters as "team-formatters"
  participant storage as "storage"

  Caller->>team_formatters: debugCostEstimation()
  team_formatters->>storage: 内部関数呼び出し
  storage-->>team_formatters: 結果
  team_formatters-->>Caller: void

  Caller->>team_formatters: formatTeamList()
  team_formatters-->>Caller: string
```

## 関数

### debugCostEstimation

```typescript
debugCostEstimation(scope: string, fields: Record<string, unknown>): void
```

デバッグ用コスト推定ログを出力

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| scope | `string` | はい |
| fields | `Record<string, unknown>` | はい |

**戻り値**: `void`

### formatTeamList

```typescript
formatTeamList(storage: TeamStorage): string
```

チーム一覧をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |

**戻り値**: `string`

### formatRecentRuns

```typescript
formatRecentRuns(storage: TeamStorage, limit: any): string
```

直近のチーム実行履歴をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storage | `TeamStorage` | はい |
| limit | `any` | はい |

**戻り値**: `string`

---
*自動生成: 2026-02-22T18:55:28.329Z*
