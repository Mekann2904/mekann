---
title: MCP (Model Context Protocol) 統合アーキテクチャ設計
category: development
audience: developer
last_updated: 2026-02-17
tags: [mcp, extension, architecture, integration]
related: []
---

# MCP (Model Context Protocol) 統合アーキテクチャ設計

> パンくず: [Home](../../README.md) > [Development](../README.md) > MCP統合

## 概要

本ドキュメントでは、pi-coding-agentにModel Context Protocol (MCP) クライアント機能を統合するためのアーキテクチャ設計を定義します。
この統合により、piは外部のMCPサーバー（stdio接続など）と連携し、ファイルシステム操作、データベース検索、API連携などの拡張機能を安全かつ動的に利用可能になります。

## 目標

1. **拡張性**: ユーザーが設定ファイルを通じて任意のMCPサーバーを追加・削除できること。
2. **安全性**: 外部サーバーが提供するツール実行時に、ユーザーの明示的な承認を要求できること。
3. **堅牢性**: サーバープロセスのライフサイクル（起動・停止・再起動）を適切に管理し、ゾンビプロセスを防ぐこと。
4. **透明性**: サーバーとの通信ログやエラー情報をユーザーに提供すること。

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

    subgraph "MCP Extension"
        ConfigLoader[Config Loader]
        ServerManager[Server Manager]
        ClientWrapper[Client Wrapper]
        ToolAdapter[Tool Adapter]
    end

    subgraph "External Process"
        MCPServer[MCP Server (stdio)]
    end

    ConfigLoader -->|Load .pi/mcp-servers.json| ServerManager
    ServerManager -->|Spawn| MCPServer
    ServerManager -->|Create| ClientWrapper
    ClientWrapper -->|Connect (stdio)| MCPServer
    ClientWrapper -->|ListTools| MCPServer
    ClientWrapper -->|CallTool| MCPServer
    ClientWrapper -->|Tools| ToolAdapter
    ToolAdapter -->|Register| ToolRegistry
    UI -->|Confirm| ClientWrapper
```

### 主要コンポーネント

1. **Config Loader**:
   - `.pi/mcp-servers.json` を読み込み、サーバー設定（コマンド、引数、環境変数、承認ポリシー）をパースします。
   - スキーマ検証を行い、不正な設定を検出します。

2. **Server Manager**:
   - サーバープロセスのライフサイクルを管理します。
   - `session_start` でサーバーを起動し、`session_shutdown` で停止します。
   - プロセスの標準出力/エラー出力を監視し、ログに記録します。

3. **Client Wrapper**:
   - `@modelcontextprotocol/sdk` の `Client` インスタンスをラップします。
   - ツール実行時の承認フロー (`autoApprove` チェック) を実装します。
   - 接続エラーやタイムアウトをハンドリングします。

4. **Tool Adapter**:
   - MCPの `ListTools` 結果（JSON Schema）を、piの `registerTool` 形式（TypeBox/Zod）に変換します。
   - piのツール実行リクエストをMCPの `CallTool` リクエストに変換します。

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
3. `ToolAdapter` -> `ClientWrapper.callTool`
4. `ClientWrapper`:
    a. `autoApprove` 確認
    b. `false` なら `ctx.ui.confirm` でユーザー承認要求
    c. 承認されれば `sdk.Client.callTool` 実行
5. `MCP Server` -> 実行結果返却
6. `ClientWrapper` -> 結果を受け取り `ToolAdapter` へ
7. `ToolAdapter` -> pi形式の結果に変換して返却

## 設定ファイルスキーマ

`.pi/mcp-servers.json` の形式:

```json
{
  "servers": {
    "server-name": {
      "command": "executable-command",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      },
      "autoApprove": false,
      "disabled": false
    }
  }
}
```

- **server-name**: サーバーの一意な識別子（ツール名のプレフィックスとしても使用可能）。
- **command**: 実行するコマンド（例: `npx`, `python3`）。
- **args**: コマンドライン引数の配列。
- **env**: 追加の環境変数（PATHなどは継承）。
- **autoApprove**: `true` の場合、ツール実行時の確認ダイアログを省略（デフォルト: `false`）。
- **disabled**: `true` の場合、起動しない。

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

## 実装計画

### フェーズ1: 基本実装
- [ ] プロジェクト構造作成 (`extensions/mcp-client`)
- [ ] 依存関係インストール (`@modelcontextprotocol/sdk`, `zod`)
- [ ] 設定ファイル読み込み機能実装
- [ ] サーバープロセス起動・停止機能実装

### フェーズ2: クライアント機能
- [ ] MCP SDKを用いた接続実装 (`Client`, `StdioClientTransport`)
- [ ] `listTools` によるツール取得
- [ ] ツール登録アダプター実装

### フェーズ3: セキュリティとUX
- [ ] ツール実行時の承認フロー実装
- [ ] エラーハンドリングとログ出力強化
- [ ] 動作確認（`@modelcontextprotocol/server-filesystem` 等を使用）

## 関連トピック

- [pi Extensions Documentation](../../../node_modules/@mariozechner/pi-coding-agent/docs/extensions.md)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)

