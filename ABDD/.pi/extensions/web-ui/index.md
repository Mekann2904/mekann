---
title: index
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# index

## 概要

`index` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@sinclair/typebox': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from 'child_process': exec, spawn, ChildProcess
// from 'util': promisify
// from 'path': join
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### open_web_ui

Open the Web UI dashboard in a browser. Returns the URL if server is running.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant LLM as "LLM"
  participant Internal as "Internal"
  participant Executor as "Executor"
  participant Unresolved as "Unresolved"

  User->>System: Open the Web UI dashboard in a browser. Returns the URL i...
  System->>LLM: isApiServerRunning
  System->>Internal: parseInt
  System->>Executor: startServer
  Executor->>Internal: createServer
  Executor->>Unresolved: server.on (node_modules/@types/node/http.d.ts)
  Executor->>Unresolved: server.listen (node_modules/@types/node/net.d.ts)
  Executor->>Unresolved: console.log (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Unresolved: console.error (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Unresolved: ServerRegistry.isRunning (.pi/extensions/web-ui/lib/instance-registry.ts)
  System->>Internal: 規定のブラウザでURLを開く
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[index]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    instance_registry["instance-registry"]
    server["server"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _sinclair["@sinclair"]
    _mariozechner["@mariozechner"]
    child_process["child_process"]
    util["util"]
    path["path"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant index as "index"
  participant sinclair as "@sinclair"
  participant mariozechner as "@mariozechner"
  participant child_process as "child_process"
  participant instance_registry as "instance-registry"
  participant server as "server"

```

## 関数

### startStandaloneServerProcess

```typescript
startStandaloneServerProcess(port: number): ChildProcess | null
```

スタンドアロンサーバーをdetached子プロセスとして起動

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| port | `number` | はい |

**戻り値**: `ChildProcess | null`

### stopStandaloneServerProcess

```typescript
stopStandaloneServerProcess(): void
```

スタンドアロンサーバーを停止（SIGTERMを送信）

**戻り値**: `void`

### openBrowser

```typescript
async openBrowser(url: string): Promise<boolean>
```

規定のブラウザでURLを開く

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| url | `string` | はい |

**戻り値**: `Promise<boolean>`

### getServerUrl

```typescript
getServerUrl(): string
```

サーバーのURLを取得する

**戻り値**: `string`

### ensureRegistered

```typescript
ensureRegistered(modelId?: string): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| modelId | `string` | いいえ |

**戻り値**: `void`

### ensureUnregistered

```typescript
ensureUnregistered(): void
```

**戻り値**: `void`

---
*自動生成: 2026-02-28T13:55:23.044Z*
