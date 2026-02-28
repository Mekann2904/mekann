---
title: mcp-client
category: api-reference
audience: developer
last_updated: 2026-02-28
tags: [auto-generated]
related: []
---

# mcp-client

## 概要

`mcp-client` モジュールのAPIリファレンス。

## インポート

```typescript
// from '@mariozechner/pi-ai': Type
// from '@mariozechner/pi-coding-agent': ExtensionAPI
// from '../lib/mcp/connection-manager.js': mcpManager, McpConnectionType
// from '../lib/mcp/config-loader.js': loadMcpConfig, getEnabledServers, getConfigPath
// from '../lib/mcp/tool-bridge.js': formatToolResult, formatResourceContent, formatToolList, ...
// ... and 2 more imports
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|

## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

### mcp_connect

Connect to an MCP (Model Context Protocol) server. Supports HTTP, SSE, and stdio transports with optional authentication.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: Connect to an MCP (Model Context Protocol) server. Suppor...
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.connect (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Unresolved: connection.tools.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 認証情報をログ安全形式に変換
  Internal->>Unresolved: Object.keys(auth.headers).reduce (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Object.keys (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: toolNames.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_disconnect

Disconnect from an MCP server. This releases the connection and frees resources.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Disconnect from an MCP server. This releases the connecti...
  System->>Unresolved: mcpManager.getConnection (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.disconnect (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_list_connections

List all active MCP server connections and their status.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List all active MCP server connections and their status.
  System->>Unresolved: mcpManager.listConnections (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: connections.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Internal: 接続情報を人間可読形式でフォーマットする
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_list_tools

List available tools from a connected MCP server. Supports pagination for large datasets.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List available tools from a connected MCP server. Support...
  System->>Unresolved: mcpManager.getConnection (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.listTools (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Internal: ツール情報を人間可読形式でフォーマットする
  Internal->>Unresolved: tools.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: mcpManager.listAllTools (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: mcpManager.listConnections (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_call_tool

Execute a tool on a connected MCP server. The tool must be available on the specified connection.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Execute a tool on a connected MCP server. The tool must b...
  System->>Unresolved: mcpManager.callTool (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: MCPツール実行結果をテキスト形式にフォーマットする
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Internal: 結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_list_resources

List available resources from a connected MCP server. Resources are read-only data like files, configurations, or documents.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List available resources from a connected MCP server. Res...
  System->>Unresolved: mcpManager.getConnection (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.refreshResources (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: connection.resources.map(r =>         `  - ${r.uri}: ${r.name}${r.mimeType ? ` (${r.mimeType})` : ''}`       ).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: connection.resources.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_read_resource

Read a resource from a connected MCP server. Use mcp_list_resources to discover available resource URIs.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Read a resource from a connected MCP server. Use mcp_list...
  System->>Unresolved: mcpManager.getConnection (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.readResource (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: MCPリソース内容をテキスト形式にフォーマットする
  Internal->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Array.isArray (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: JSON.stringify (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.push (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: Math.ceil (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: lines.join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_reload_config

Reload MCP server configuration from .pi/mcp-servers.json and auto-connect enabled servers.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"
  participant Storage as "Storage"

  User->>System: Reload MCP server configuration from .pi/mcp-servers.json...
  System->>Internal: 設定ファイルのパスを取得する
  Internal->>Unresolved: process.cwd (node_modules/@types/node/process.d.ts)
  Internal->>Internal: join
  System->>Unresolved: mcpManager.getConnectionCount (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: mcpManager.disconnectAll (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Storage: MCP設定ファイルを読み込む
  Storage->>Internal: existsSync
  Storage->>Storage: readFile
  Storage->>Unresolved: JSON.parse (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  Storage->>Internal: validateMcpConfig
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Internal: 有効なサーバー設定のみを取得する
  Internal->>Unresolved: config.servers 		.filter(s => s.enabled !== false) 		.map (node_modules/typescript/lib/lib.es5.d.ts)
  Internal->>Unresolved: config.servers 		.filter (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: mcpManager.getConnection (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: results.succeeded.push (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: mcpManager.connect (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 接続タイプを判定する
  Internal->>Unresolved: url.startsWith (node_modules/typescript/lib/lib.es2015.core.d.ts)
  Internal->>Unresolved: url.includes (node_modules/typescript/lib/lib.es2015.core.d.ts)
  System-->>User: 結果

```

### mcp_register_notification_handler

Register a handler for MCP notifications (tools/list_changed, resources/list_changed, etc.).

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Register a handler for MCP notifications (tools/list_chan...
  System->>Unresolved: console.log (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Unresolved: notificationHandlers.set (node_modules/typescript/lib/lib.es2015.collection.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: params.types?.join (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_set_roots

Set root directories that MCP servers can access. Servers may use roots to resolve relative paths or understand project context.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Set root directories that MCP servers can access. Servers...
  System->>Unresolved: mcpManager.setRoots (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: params.roots.map(r => `  - ${r.name}: ${r.uri}`).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: params.roots.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_list_prompts

List available prompt templates from a connected MCP server.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List available prompt templates from a connected MCP server.
  System->>Unresolved: mcpManager.listPrompts (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: prompts.map(p => {           const args = p.arguments?.map(a => `${a.name}${a.required ? '*' : ''}`).join(', ') || 'no args';           return `  - ${p.name}: ${p.description || 'No description'} [${args}]`;         }).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: prompts.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_get_prompt

Get and expand a prompt template from a connected MCP server.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Get and expand a prompt template from a connected MCP ser...
  System->>Unresolved: mcpManager.getPrompt (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: result.messages.map(m => {           const content = m.content.type === 'text' ? m.content.text : `[${m.content.type}]`;           return `[${m.role}]: ${content}`;         }).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: result.messages.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_subscribe_resource

Subscribe to resource update notifications from a connected MCP server.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Subscribe to resource update notifications from a connect...
  System->>Unresolved: mcpManager.subscribeResource (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_unsubscribe_resource

Unsubscribe from resource update notifications.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Unsubscribe from resource update notifications.
  System->>Unresolved: mcpManager.unsubscribeResource (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_list_subscriptions

List active resource subscriptions for a connection.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List active resource subscriptions for a connection.
  System->>Unresolved: mcpManager.getSubscriptions (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: subscriptions.map(uri => `  - ${uri}`).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: subscriptions.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_ping

Check connection health by pinging the MCP server.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Check connection health by pinging the MCP server.
  System->>Unresolved: mcpManager.ping (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_complete

Get argument completions for a prompt or resource reference.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Internal as "Internal"
  participant Unresolved as "Unresolved"

  User->>System: Get argument completions for a prompt or resource reference.
  System->>Internal: エラー結果作成ヘルパー関数
  System->>Unresolved: mcpManager.complete (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: result.values.map(v => `  - ${v}`).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: result.values.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_get_instructions

Get server instructions from a connected MCP server. Instructions provide guidance on how to use the server's tools and resources.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Get server instructions from a connected MCP server. Inst...
  System->>Unresolved: mcpManager.getInstructions (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_list_resource_templates

List resource templates from a connected MCP server. Resource templates are URI patterns that can be used to construct resource URIs.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: List resource templates from a connected MCP server. Reso...
  System->>Unresolved: mcpManager.listResourceTemplatesPaginated (.pi/lib/mcp/connection-manager.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: result.resourceTemplates.map(t =>             `  - ${t.name}: ${t.uriTemplate}${t.mimeType ? ` (${t.mimeType})` : ''}${t.description ? ` - ${t.description}` : ''}`           ).join (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: result.resourceTemplates.map (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Unresolved: mcpManager.listResourceTemplates (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_set_logging_level

Set the logging level for a connected MCP server. Controls the verbosity of server log messages.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Set the logging level for a connected MCP server. Control...
  System->>Unresolved: mcpManager.setLoggingLevel (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: String (node_modules/typescript/lib/lib.es5.d.ts)
  System->>Internal: エラー結果作成ヘルパー関数
  System-->>User: 結果

```

### mcp_register_sampling_handler

Register a handler for sampling requests from MCP servers. Allows servers to request LLM sampling via the client.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Register a handler for sampling requests from MCP servers...
  System->>Unresolved: mcpManager.setSamplingHandler (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: console.log (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Unresolved: request.systemPrompt?.substring (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

### mcp_register_elicitation_handler

Register a handler for elicitation requests from MCP servers. Allows servers to request information collection (forms, URLs) from the client.

```mermaid
sequenceDiagram
  autonumber
  actor User as ユーザー
  participant System as System
  participant Unresolved as "Unresolved"
  participant Internal as "Internal"

  User->>System: Register a handler for elicitation requests from MCP serv...
  System->>Unresolved: mcpManager.setElicitationHandler (.pi/lib/mcp/connection-manager.ts)
  System->>Unresolved: ctx.ui.notify (node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts)
  System->>Internal: 結果作成ヘルパー関数
  System->>Unresolved: console.log (node_modules/typescript/lib/lib.dom.d.ts)
  System->>Unresolved: request.fields.map (node_modules/typescript/lib/lib.es5.d.ts)
  System-->>User: 結果

```

## 図解

### 依存関係図

```mermaid
flowchart LR
  subgraph this[mcp-client]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    connection_manager["connection-manager"]
    config_loader["config-loader"]
    tool_bridge["tool-bridge"]
    auth_provider["auth-provider"]
    types["types"]
  end
  main --> local
  subgraph external[外部ライブラリ]
    _mariozechner["@mariozechner"]
    _mariozechner["@mariozechner"]
  end
  main --> external
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant mcp_client as "mcp-client"
  participant mariozechner as "@mariozechner"
  participant connection_manager as "connection-manager"
  participant config_loader as "config-loader"

```

## 関数

### makeSuccessResult

```typescript
makeSuccessResult(text: string, details: Record<string, unknown>): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }
```

結果作成ヘルパー関数

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| details | `Record<string, unknown>` | はい |

**戻り値**: `{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }`

### makeErrorResult

```typescript
makeErrorResult(text: string, details: Record<string, unknown>): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError: boolean }
```

エラー結果作成ヘルパー関数

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| details | `Record<string, unknown>` | はい |

**戻り値**: `{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError: boolean }`

### dispatchNotification

```typescript
dispatchNotification(notification: McpNotification): void
```

内部通知ディスパッチャー

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| notification | `McpNotification` | はい |

**戻り値**: `void`

### autoConnectFromConfig

```typescript
async autoConnectFromConfig(ctx: { ui: { notify: (msg: string, type: "info" | "warning" | "error") => void } }): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>
```

設定ファイルから自動接続を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| ctx | `object` | はい |
| &nbsp;&nbsp;↳ ui | `{ notify: (msg: string, type: "info" | "warning" | "error") => void }` | はい |

**戻り値**: `Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }>`

### detectConnectionType

```typescript
detectConnectionType(url: string): McpConnectionType | undefined
```

接続タイプを判定する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| url | `string` | はい |

**戻り値**: `McpConnectionType | undefined`

### handler

```typescript
handler(notification: McpNotification): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| notification | `McpNotification` | はい |

**戻り値**: `void`

### handler

```typescript
async handler(request: any, connectionId: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| request | `any` | はい |
| connectionId | `any` | はい |

**戻り値**: `void`

### handler

```typescript
async handler(request: any, connectionId: any): void
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| request | `any` | はい |
| connectionId | `any` | はい |

**戻り値**: `void`

---
*自動生成: 2026-02-28T13:55:19.187Z*
