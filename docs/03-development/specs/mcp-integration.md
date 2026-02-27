---
title: MCP (Model Context Protocol) 統合アーキテクチャ設計
category: development
audience: developer
last_updated: 2026-02-27
tags: [mcp, extension, architecture, integration]
related: [../README.md, ../../04-reference/ownership.md]
---

# MCP (Model Context Protocol) 統合アーキテクチャ設計

> パンくず: [Home](../../README.md) > [Development](../README.md) > MCP統合

## 概要

本ドキュメントでは、pi-coding-agentにModel Context Protocol (MCP) クライアント機能を統合するためのアーキテクチャ設計を定義します。
この統合により、piは外部のMCPサーバー（HTTP/SSE/stdio接続）と連携し、ファイルシステム操作、データベース検索、API連携などの拡張機能を安全かつ動的に利用可能になります。

## 目標

1. **拡張性**: ユーザーが設定ファイルを通じて任意のMCPサーバーを追加・削除できること。
2. **安全性**: 外部サーバーが提供するツール実行時に、ユーザーの明示的な承認を要求できること。
3. **堅牢性**: サーバープロセスのライフサイクル（起動・停止・再起動）を適切に管理し、ゾンビプロセスを防ぐこと。
4. **透明性**: サーバーとの通信ログやエラー情報をユーザーに提供すること。
5. **マルチトランスポート**: HTTP、SSE、stdioの3種類のトランスポートをサポートすること。

## アーキテクチャ

システムは以下のコンポーネントで構成されます。

### コンポーネント図 (Mermaid)

```mermaid
graph TD
    subgraph "pi Core"
        ExtensionAPI[Extension API]
        ToolRegistry[Tool Registry]
        UI[User Interface]
    end

    subgraph "MCP Extension (.pi/extensions/mcp-client.ts)"
        ConfigLoader[Config Loader]
        ConnectionManager[Connection Manager]
        NotificationDispatcher[Notification Dispatcher]
        ToolAdapter[Tool Adapter]
    end

    subgraph "MCP Library (.pi/lib/mcp/)"
        Types[types.ts]
        ConfigLoaderLib[config-loader.ts]
        ConnectionManagerLib[connection-manager.ts]
        ToolBridge[tool-bridge.ts]
    end

    subgraph "External"
        HTTPServer[MCP Server (HTTP/SSE)]
        StdioServer[MCP Server (stdio)]
    end

    ExtensionAPI -->|Load| ConfigLoader
    ConfigLoaderLib -->|Load .pi/mcp-servers.json| ConfigLoader
    ConnectionManagerLib -->|Manage| ConnectionManager
    ConnectionManager -->|HTTP/SSE| HTTPServer
    ConnectionManager -->|stdio| StdioServer
    ConnectionManager -->|Notifications| NotificationDispatcher
    ConnectionManager -->|Tools| ToolAdapter
    ToolAdapter -->|Register| ToolRegistry
    UI -->|Notify| ConnectionManager
```

### 主要コンポーネント

1. **Config Loader** (`lib/mcp/config-loader.ts`):
   - `.pi/mcp-servers.json` を読み込み、サーバー設定（URL、タイムアウト、有効/無効）をパースします。
   - TypeBoxによるスキーマ検証を行い、不正な設定を検出します。
   - デフォルト値の適用と有効サーバーのフィルタリングを提供します。

2. **Connection Manager** (`lib/mcp/connection-manager.ts`):
   - MCPサーバーへの接続を一元管理するシングルトンクラスです。
   - HTTP（StreamableHTTPClientTransport）、SSE（SSEClientTransport）、stdio（StdioClientTransport）の3種類をサポートします。
   - 接続タイプを自動検出し、適切なトランスポートを選択します。
   - 最大10接続まで管理可能です。

3. **Notification Dispatcher**:
   - MCPサーバーからの通知（tools/list_changed等）をハンドラーにディスパッチします。
   - タイプ別・接続別のフィルタリングをサポートします。

4. **Tool Adapter** (`lib/mcp/tool-bridge.ts`):
   - MCPツールの結果をpi形式にフォーマットします。
   - リソース内容のフォーマット処理を提供します。

## データフロー

### 初期化フロー

1. 拡張機能ロード (`activate`)
2. 設定ファイル読み込み (`ConfigLoader`)
3. 各サーバー設定に対して:
    a. プロセス起動 (`ServerManager`)
    b. MCPクライアント接続 (`ClientWrapper`)
    c. ツール一覧取得 (`listTools`)
    d. ツール登録 (`ToolAdapter` -> `pi.registerTool`)

### 実行フロー

1. ユーザープロンプト -> piがツール呼び出しを決定
2. `pi` -> 登録されたツール実行 (`execute`)
3. `ToolAdapter` -> `mcpManager.callTool`
4. `mcpManager` -> `sdk.Client.callTool` 実行
5. `MCP Server` -> 実行結果返却
6. `mcpManager` -> 結果を受け取り `ToolAdapter` へ
7. `ToolAdapter` -> pi形式の結果に変換して返却

## 設定ファイルスキーマ

`.pi/mcp-servers.json` の形式:

```json
{
  "$schema": "./mcp-servers.schema.json",
  "version": "1.0",
  "servers": [
    {
      "id": "my-http-server",
      "name": "My HTTP Server",
      "url": "http://localhost:3000/mcp",
      "description": "MCP server via HTTP transport",
      "enabled": true,
      "timeout": 30000
    },
    {
      "id": "my-sse-server",
      "url": "sse://localhost:3001/sse",
      "enabled": false
    },
    {
      "id": "my-stdio-server",
      "url": "npx -y @anthropic/mcp-server",
      "enabled": false
    }
  ]
}
```

### フィールド説明

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | ○ | サーバーの一意な識別子（英数字、アンダースコア、ハイフンのみ） |
| `url` | string | ○ | MCPサーバーのURLまたはコマンド |
| `name` | string | - | 表示名 |
| `description` | string | - | 説明 |
| `enabled` | boolean | - | 自動接続するか（デフォルト: `false`） |
| `timeout` | number | - | 接続タイムアウト（ミリ秒、デフォルト: 30000、範囲: 1000-300000） |

### URL形式とトランスポート種別

| URL形式 | トランスポート | 例 |
|---------|---------------|-----|
| `http://...` / `https://...` | HTTP | `http://localhost:3000/mcp` |
| `sse://...` / `http+sse://...` | SSE | `sse://localhost:3001/sse` |
| コマンド形式（プロトコルなし） | stdio | `npx -y @anthropic/mcp-server` |

### トランスポートの自動判定

- `http://` または `https://` で始まるURL → HTTP (StreamableHTTPClientTransport)
- `sse://`、`http+sse://`、`https+sse://` で始まるURL → SSE (SSEClientTransport)
- 上記以外 → stdio (StdioClientTransport)

> **注意**: SSEClientTransportはSDK v1で非推奨となっており、新しい実装ではStreamableHTTPClientTransportの使用が推奨されます。

## セキュリティ設計

1. **コマンド実行権限**:
   - サーバープロセスはpiを実行しているユーザーと同じ権限で動作します。
   - 設定ファイルで指定されたコマンドをそのまま実行するため、悪意のある設定ファイルが読み込まれないよう、`.pi` ディレクトリのアクセス権管理が重要です。

2. **ツール実行承認**:
   - デフォルトで `autoApprove: false` とし、重要な操作（ファイル書き込み、APIアクセス等）を行うツール実行前にユーザーの確認を求めます。
   - 確認ダイアログには、実行するツール名と引数を表示します。

3. **入力値サニタイズ**:
   - MCPサーバーへの入力はJSON-RPC経由で行われるため、OSコマンドインジェクションのリスクは低いですが、サーバー実装に依存します。
   - pi側では、ツール引数の型チェック（Schema validation）を行います。

## エラー処理

1. **プロセス起動失敗**:
   - 指定されたコマンドが見つからない、実行権限がない等の場合、エラーログを出力し、そのサーバーのみ無効化して続行します（他のサーバーやpi本体は停止させない）。

2. **接続断**:
   - サーバープロセスがクラッシュした場合、クライアントは切断を検知し、再接続を試みるか、エラーを通知します。
   - ツール実行中に切断した場合、piにエラー結果を返します。

3. **タイムアウト**:
   - ツール実行にはタイムアウトを設定し、サーバーが応答しない場合にハングアップを防ぎます。

## 実装状況

### フェーズ1: 基本実装 ✅
- [x] プロジェクト構造作成 (`.pi/extensions/mcp-client.ts`, `.pi/lib/mcp/`)
- [x] 依存関係インストール (`@modelcontextprotocol/sdk`)
- [x] 設定ファイル読み込み機能実装 (`config-loader.ts`)
- [x] 型定義の作成 (`types.ts`)

### フェーズ2: クライアント機能 ✅
- [x] MCP SDKを用いた接続実装 (`Client`, `StdioClientTransport`, `SSEClientTransport`, `StreamableHTTPClientTransport`)
- [x] `listTools` によるツール取得
- [x] ツール登録アダプター実装 (`tool-bridge.ts`)
- [x] HTTP/SSE/stdioの3種類トランスポート対応
- [x] 接続タイプの自動判定

### フェーズ3: セキュリティとUX ✅
- [x] エラーハンドリングとログ出力強化
- [x] セッション開始時の自動接続
- [x] セッション終了時の自動切断
- [x] UI通知の実装
- [x] 通知ハンドラー登録機能

### 提供ツール一覧

| ツール名 | 説明 | 主なパラメータ |
|---------|------|---------------|
| `mcp_connect` | MCPサーバーに接続 | `id`, `url`, `type?`, `timeout?` |
| `mcp_disconnect` | 接続を切断 | `id` |
| `mcp_list_connections` | アクティブな接続一覧を表示 | なし |
| `mcp_list_tools` | 接続先のツール一覧を表示 | `id?` |
| `mcp_call_tool` | 接続先でツールを実行 | `connection_id`, `tool_name`, `arguments?` |
| `mcp_list_resources` | 接続先のリソース一覧を表示 | `id` |
| `mcp_read_resource` | 接続先からリソースを読み取り | `connection_id`, `uri` |
| `mcp_reload_config` | 設定ファイルを再読み込み | `disconnect_existing?` |
| `mcp_register_notification_handler` | 通知ハンドラーを登録 | `connection_id?`, `types?`, `description?` |

### 通知種別

`mcp_register_notification_handler` で監視可能な通知種別:

| 通知種別 | 説明 |
|---------|------|
| `tools/list_changed` | サーバーのツール一覧が変更された |
| `resources/list_changed` | サーバーのリソース一覧が変更された |
| `prompts/list_changed` | サーバーのプロンプト一覧が変更された |
| `logging/setLevel` | ログレベルの変更通知 |
| `progress` | 進捗通知 |
| `cancelled` | リクエストのキャンセル通知 |

## 使用例

> **参考**: `.pi/mcp-servers.json.example` に設定例のテンプレートがあります。

### クイックスタート

1. **設定ファイルを作成**
   ```bash
   cp .pi/mcp-servers.json.example .pi/mcp-servers.json
   ```

2. **設定を編集** - `enabled: true` に設定
   ```json
   {
     "servers": [{
       "id": "filesystem",
       "url": "npx -y @anthropic/mcp-server-filesystem /home/user/projects",
       "enabled": true
     }]
   }
   ```

3. **piを起動** - 自動的に接続されます

### 基本的な接続フロー

```
# 1. HTTPサーバーに接続
mcp_connect(id="my-server", url="http://localhost:3000/mcp")

# 出力例:
# Successfully connected to http://localhost:3000/mcp
# Connection ID: my-server
# Transport: HTTP
# Available tools (3): read_file, write_file, list_directory
# Available resources: 0

# 2. 利用可能なツールを確認
mcp_list_tools(id="my-server")

# 出力例:
# Tools from 'my-server' (3):
#   - read_file: Read file contents
#   - write_file: Write content to a file
#   - list_directory: List directory contents

# 3. ツールを実行
mcp_call_tool(connection_id="my-server", tool_name="read_file", arguments={"path": "/tmp/test.txt"})

# 出力例:
# Hello, World!

# 4. リソースを確認
mcp_list_resources(id="my-server")

# 5. 接続を切断
mcp_disconnect(id="my-server")
```

### stdioサーバーへの接続

```
# npx経由でMCPサーバーを起動・接続
mcp_connect(
  id="filesystem",
  url="npx -y @anthropic/mcp-server-filesystem /home/user"
)

# 出力例:
# Successfully connected to npx -y @anthropic/mcp-server-filesystem /home/user
# Connection ID: filesystem
# Transport: stdio
# Available tools (5): read_file, write_file, list_directory, search_files, get_file_info
```

> **注意**: stdioトランスポートはURL形式でない場合に自動判定されます。コマンド引数はスペース区切りで指定します。

### SSEサーバーへの接続

```
# SSEトランスポートで接続（URLパターンで自動判定）
mcp_connect(
  id="sse-server",
  url="sse://localhost:3001/sse"
)

# または明示的にタイプを指定
mcp_connect(
  id="sse-server",
  url="http://localhost:3001/sse",
  type="sse"
)
```

### 設定ファイルによる自動接続

`.pi/mcp-servers.json` を作成:

```json
{
  "servers": [
    {
      "id": "local-filesystem",
      "url": "npx -y @anthropic/mcp-server-filesystem /home/user/projects",
      "enabled": true
    },
    {
      "id": "remote-api",
      "url": "http://api.example.com/mcp",
      "enabled": true,
      "timeout": 60000
    }
  ]
}
```

piセッション開始時に自動的に接続されます:

```
# セッション開始時のログ例:
# MCP Client extension loaded • Checking for auto-connect servers...
# Auto-connected: local-filesystem, remote-api
```

### 設定の再読み込み

```
# 設定ファイルを再読み込みして接続
mcp_reload_config()

# 出力例:
# Reloaded MCP config from .pi/mcp-servers.json
# Connected: server-a, server-b

# 既存接続を切断してから再読み込み
mcp_reload_config(disconnect_existing=true)

# 出力例:
# Disconnected 2 existing connection(s)
# Reloaded MCP config from .pi/mcp-servers.json
# Connected: server-a, server-b
```

### 通知ハンドラーの登録

```
# ツール変更通知を監視（全接続）
mcp_register_notification_handler(
  types=["tools/list_changed"],
  description="Monitor tool changes"
)

# 出力例:
# Registered notification handler: handler-1
# Connection filter: all connections
# Type filter: tools/list_changed

# 特定接続のリソース変更を監視
mcp_register_notification_handler(
  connection_id="my-server",
  types=["resources/list_changed"]
)
```

### 全接続の確認

```
mcp_list_connections()

# 出力例:
# Active MCP Connections (2):
# - filesystem: npx -y @anthropic/mcp-server-filesystem /home/user [connected] (5 tools) - mcp-server-filesystem/1.0.0
# - remote-api: http://api.example.com/mcp [connected] (3 tools) - my-api-server/2.1.0
```

### エラー処理の例

```
# 存在しないサーバーに接続
mcp_connect(id="test", url="http://localhost:9999/mcp", timeout=5000)

# 出力例（エラー）:
# Connection failed: Connection timeout after 5000ms

# 無効なツールを実行
mcp_call_tool(connection_id="my-server", tool_name="invalid_tool")

# 出力例（エラー）:
# Error: Tool 'invalid_tool' not found on server
```

### 実践例: ファイルシステムMCPサーバーの使用

```
# 1. ファイルシステムサーバーに接続
mcp_connect(
  id="fs",
  url="npx -y @anthropic/mcp-server-filesystem /home/user/projects"
)

# 出力:
# Successfully connected to npx -y @anthropic/mcp-server-filesystem /home/user/projects
# Connection ID: fs
# Transport: stdio
# Available tools (8): read_file, read_multiple_files, write_file, edit_file, ...
# Available resources: 0

# 2. 利用可能なツールを確認
mcp_list_tools(id="fs")

# 出力:
# Tools from 'fs' (8):
#   - read_file: Read the complete contents of a file from the file system
#   - read_multiple_files: Read the contents of multiple files simultaneously
#   - write_file: Create a new file or overwrite an existing file
#   - edit_file: Make line-based edits to a text file
#   - create_directory: Create a new directory
#   - list_directory: Get a detailed listing of all files and directories
#   - directory_tree: Get a recursive tree view of files and directories
#   - search_files: Recursively search for files and directories

# 3. ディレクトリ一覧を取得
mcp_call_tool(
  connection_id="fs",
  tool_name="list_directory",
  arguments={"path": "/home/user/projects/myapp"}
)

# 出力:
# [DIR] src
# [DIR] tests
# [FILE] package.json (1.2KB)
# [FILE] README.md (3.4KB)
# [FILE] tsconfig.json (0.5KB)

# 4. ファイルを読み取り
mcp_call_tool(
  connection_id="fs",
  tool_name="read_file",
  arguments={"path": "/home/user/projects/myapp/package.json"}
)

# 出力:
# {
#   "name": "myapp",
#   "version": "1.0.0",
#   ...
# }

# 5. ファイルを検索
mcp_call_tool(
  connection_id="fs",
  tool_name="search_files",
  arguments={"path": "/home/user/projects/myapp", "pattern": "*.ts"}
)

# 出力:
# Found 15 files:
# - src/index.ts
# - src/utils/helper.ts
# - tests/index.test.ts
# ...

# 6. 使用完了後に切断
mcp_disconnect(id="fs")

# 出力:
# Disconnected from 'fs' (npx -y @anthropic/mcp-server-filesystem /home/user/projects)
```

## 内部モジュール構成

### lib/mcp/types.ts

MCP統合の型定義モジュール。以下の型をエクスポート:

| 型 | 説明 |
|----|------|
| `McpConnectionStatus` | 接続ステータス（connecting/connected/disconnected/error） |
| `McpConnection` | 接続情報（id, url, client, tools, resources等） |
| `McpToolInfo` | ツール情報（name, description, inputSchema） |
| `McpResourceInfo` | リソース情報（uri, name, mimeType） |
| `McpTransportType` | トランスポート種別（stdio/sse/http/streamable-http） |
| `McpAuthProvider` | 認証プロバイダー（bearer/basic/oauth2/api-key/custom） |
| `McpNotificationType` | 通知種別（tools/list_changed等） |
| `McpNotificationHandler` | 通知ハンドラー関数型 |

### lib/mcp/connection-manager.ts

MCPサーバー接続のライフサイクル管理:

- `McpConnectionManager` クラス（シングルトン）
  - `connect()`: サーバー接続確立
  - `disconnect()`: 接続切断
  - `disconnectAll()`: 全接続切断
  - `callTool()`: ツール実行
  - `readResource()`: リソース読み取り
  - `listConnections()`: 接続一覧取得
  - `setNotificationCallback()`: 通知コールバック設定

### lib/mcp/config-loader.ts

設定ファイル読み込み・バリデーション:

- `loadMcpConfig()`: 設定ファイル読み込み
- `validateMcpConfig()`: 設定全体のバリデーション
- `validateServerConfig()`: 個別サーバー設定のバリデーション
- `applyDefaults()`: デフォルト値適用
- `getEnabledServers()`: 有効サーバーのフィルタリング

### lib/mcp/tool-bridge.ts

データ変換ユーティリティ:

- `formatToolResult()`: ツール実行結果のテキストフォーマット
- `formatResourceContent()`: リソース内容のテキストフォーマット
- `formatToolList()`: ツール一覧のフォーマット
- `formatConnectionList()`: 接続一覧のフォーマット

## トラブルシューティング

### 接続エラー

| エラー | 原因 | 対処法 |
|-------|------|--------|
| `Connection timeout` | サーバーが応答しない | `timeout`パラメータを増やす、サーバーが起動しているか確認 |
| `Invalid protocol` | URL形式が不正 | `http://`、`https://`、`sse://`、またはコマンド形式を使用 |
| `Connection 'x' already exists` | 重複ID | 異なるIDを使用するか、先に`mcp_disconnect`を実行 |
| `Maximum connections (10) reached` | 接続数上限 | 不要な接続を切断 |
| `Failed to create transport` | トランスポート作成失敗 | URL/コマンドが正しいか確認 |
| `Connection 'x' not found` | 存在しない接続ID | `mcp_list_connections`で有効なIDを確認 |

### stdioサーバーのデバッグ

stdioサーバーで問題が発生した場合:
1. コマンドを単独で実行して動作確認
   ```bash
   # 例: コマンド単体で実行
   npx -y @anthropic/mcp-server-filesystem /home/user
   ```
2. 環境変数が正しく設定されているか確認
3. 作業ディレクトリを確認
4. npxキャッシュの問題: `npx clear-npx-cache` または手動削除

### 設定ファイルの問題

| エラー | 原因 | 対処法 |
|-------|------|--------|
| `Failed to parse MCP config file` | JSON構文エラー | JSON形式を確認（カンマ忘れ、引用符など） |
| `Invalid MCP config` | バリデーションエラー | エラーメッセージの内容に従って修正 |
| `duplicate id 'x'` | ID重複 | 一意なIDを使用 |
| `id: must contain only alphanumeric...` | 不正なID形式 | 英数字、アンダースコア、ハイフンのみ使用 |

### 推奨デバッグ手順

1. **接続状態の確認**: `mcp_list_connections` で現在の接続を確認
2. **設定の検証**: `.pi/mcp-servers.json.example` と比較して形式を確認
3. **手動接続テスト**: 設定ファイルを使わず `mcp_connect` で直接接続
4. **サーバー単体テスト**: MCPサーバーを単独で起動して動作確認

### よくある問題と解決策

| 問題 | 原因 | 解決策 |
|-----|------|--------|
| ツールが実行されない | 接続が切断されている | `mcp_list_connections` でステータス確認 |
| 自動接続されない | `enabled: false` | 設定ファイルで `enabled: true` に設定 |
| npxコマンドが失敗 | キャッシュの問題 | `npx clear-npx-cache` を実行 |
| 接続は成功するがツールがない | サーバーがtools capabilityを持たない | サーバーの実装を確認 |

### ログレベルの確認

MCPサーバーからのログは通知ハンドラーで確認可能:

```
mcp_register_notification_handler(
  types=["logging/setLevel"],
  description="Monitor server logs"
)
```

## 設定ファイルテンプレート

`.pi/mcp-servers.json.example` をコピーして使用:

```bash
cp .pi/mcp-servers.json.example .pi/mcp-servers.json
```

編集後に `mcp_reload_config` で反映、またはpiを再起動してください。

## 関連トピック

- [pi Extensions Documentation](../../../node_modules/@mariozechner/pi-coding-agent/docs/extensions.md)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

