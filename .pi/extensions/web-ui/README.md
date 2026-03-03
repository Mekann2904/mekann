---
title: Web UI ダッシュボード（統合版）
category: user-guide
audience: daily-user
last_updated: 2026-03-03
tags: [web-ui, dashboard, monitoring]
related: []
---

# pi Web UI ダッシュボード

Preact + ViteベースのWeb UIダッシュボード拡張機能。すべてのpiインスタンスを一元管理できる。

## アーキテクチャ（v2.0 - 統合版）

### 単一サーバー設計

以前のバージョンでは2つのサーバー（ポート3000と3457）が存在しましたが、v2.0からは**単一サーバー**に統合されました。

```
┌─────────────────────────────────────────┐
│  Unified Server (Port 3000)             │
│                                         │
│  - 静的ファイル配信（Preact UI）        │
│  - REST API（全機能）                   │
│  - SSE（リアルタイム更新）              │
│  - インスタンス管理                     │
└─────────────────────────────────────────┘
         │
         ├─── ~/.pi-shared/instances.json
         ├─── ~/.pi-shared/web-ui-server.json
         └─── ~/.pi-shared/theme.json
```

### 設定の一元管理

すべての設定は `config.ts` で管理されます:

```typescript
// 環境変数でポート変更
PI_WEB_UI_PORT=8080 pi

// 自動起動を無効化
PI_WEB_UI_AUTO_START=false pi
```

## 機能

- **Dashboard**: 現在のインスタンスの状態表示（モデル、作業ディレクトリ、コンテキスト使用量）
- **Instances**: 全piインスタンスの一覧表示（PID、起動時間、作業ディレクトリ）
- **Tasks**: タスク管理（作成、更新、完了、削除）
- **Analytics**: 使用統計とコスト追跡
- **UL Workflow**: ULワークフローの状態管理
- **Theme**: グローバルテーマ設定（35以上のテーマ、ライト/ダークモード）

## 特徴

### 複数インスタンス管理

- piを起動すると自動的にWeb UIサーバーが起動
- 複数のpiインスタンスを同時に監視可能
- 最後のインスタンスが終了するとサーバーも停止

### Detachedプロセス

- サーバーは親piプロセスとは独立して動作
- 親プロセスが終了してもサーバーは継続
- 次のpiインスタンス起動時にサーバーを再利用

## セットアップ

```bash
cd .pi/extensions/web-ui
npm install
npm run build
```

## 使用方法

### 自動起動（推奨）

piを起動すると自動的にWeb UIが起動します。

```bash
pi
# Web UI auto-started: http://localhost:3000
```

### 手動操作

```bash
/web-ui          # ステータス表示
/web-ui start    # サーバー起動
/web-ui stop     # サーバー停止
/web-ui status   # 現在の状態表示
/web-ui open     # ブラウザで開く
```

### 環境変数

```bash
# ポート番号を変更
PI_WEB_UI_PORT=8080 pi

# 自動起動を無効化
PI_WEB_UI_AUTO_START=false pi
```

## 共有ストレージ

複数インスタンス間で共有するデータは `~/.pi-shared/` に保存されます。

```
~/.pi-shared/
├── instances.json        # 実行中インスタンス一覧
├── web-ui-server.json    # Webサーバー情報
└── theme.json            # グローバルテーマ設定
```

## API

### GET /api/status

現在のインスタンスの状態を返す。

### GET /api/instances

全インスタンスの一覧を返す。

### GET /api/theme

グローバルテーマ設定を返す。

### POST /api/theme

テーマ設定を更新する。

```json
{
  "themeId": "blue",
  "mode": "dark"
}
```

### GET /api/tasks

タスク一覧を取得（フィルタリング可能）。

### POST /api/tasks

新規タスクを作成。

### GET /api/analytics/*

アナリティクスデータ（統計、レコード、異常検出）。

### GET /api/ul-workflow/*

ULワークフロータスク管理。

### GET /api/events

SSEエンドポイント（リアルタイム更新）。

## 開発

```bash
npm run dev      # 開発サーバー起動（HMR有効）
npm run build    # 本番ビルド
```

## アーキテクチャ詳細

```
web-ui/
├── unified-server.ts       # 統合サーバー（単一エントリーポイント）
├── config.ts               # 設定管理（ポート、環境変数）
├── index.ts                # 拡張機能エントリーポイント
├── lib/
│   ├── instance-registry.ts  # インスタンス管理
│   ├── sse-bus.ts            # SSEイベントバス
│   ├── task-storage.ts       # タスクストレージ
│   └── server-utils.ts       # サーバーユーティリティ
├── routes/
│   ├── instances.ts        # インスタンスAPI
│   ├── tasks.ts            # タスクAPI
│   ├── analytics.ts        # アナリティクスAPI
│   ├── ul-workflow.ts      # ULワークフローAPI
│   ├── mcp.ts              # MCP接続API
│   ├── runtime.ts          # ランタイム状態API
│   └── sse.ts              # SSEルート
├── middleware/
│   ├── cors.ts             # CORS設定
│   └── error-handler.ts    # 統一エラー処理
├── web/                    # Preactアプリケーション
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── app.tsx
│       └── components/
└── dist/                   # ビルド出力
```

## 移行ガイド（v1.x から v2.0）

### 変更点

1. **ポート統一**: ポート3457の内部APIサーバーは廃止
2. **単一サーバー**: `server.ts`と`standalone-server.ts`は`unified-server.ts`に統合
3. **設定管理**: `config.ts`で一元管理

### 廃止されたファイル

- ~~`server.ts`~~ - 削除済み（unified-server.tsに統合）
- ~~`standalone-server.ts`~~ - 削除済み（unified-server.tsに統合）

### 環境変数の変更

- `PI_RUNTIME_PORT` - 廃止（使用されなくなりました）
- `PI_WEB_UI_PORT` - 変更なし（デフォルト3000）
- `PI_WEB_UI_AUTO_START` - 変更なし

## トラブルシューティング

### ポートが使用中

```bash
# 使用中のポートを確認
lsof -i :3000

# 別のポートを使用
PI_WEB_UI_PORT=8080 pi
```

### ビルドが必要

```bash
cd .pi/extensions/web-ui
npm run build
```

### サーバーが応答しない

```bash
# サーバー状態確認
/web-ui status

# 強制停止して再起動
/web-ui stop
/web-ui start
```

## ライセンス

MIT
