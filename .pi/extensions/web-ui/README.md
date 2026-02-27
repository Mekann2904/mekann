---
title: Web UI ダッシュボード
category: user-guide
audience: daily-user
last_updated: 2026-02-27
tags: [web-ui, dashboard, monitoring]
related: []
---

# pi Web UI ダッシュボード

Preact + ViteベースのWeb UIダッシュボード拡張機能。すべてのpiインスタンスを一元管理できる。

## 機能

- **Dashboard**: 現在のインスタンスの状態表示（モデル、作業ディレクトリ、コンテキスト使用量）
- **Instances**: 全piインスタンスの一覧表示（PID、起動時間、作業ディレクトリ）
- **Theme**: グローバルテーマ設定（35以上のテーマ、ライト/ダークモード）

## 特徴

### 複数インスタンス管理

- piを起動すると自動的にWeb UIサーバーが起動
- 複数のpiインスタンスを同時に監視可能
- 最後のインスタンスが終了するとサーバーも停止

### グローバルテーマ

- テーマ設定は `~/.pi-shared/theme.json` に保存
- すべてのブラウザセッションで同じテーマが適用される

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
```

### 環境変数

```bash
# ポート番号を変更
PI_WEB_UI_PORT=8080 pi
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

## 開発

```bash
npm run dev      # 開発サーバー起動（HMR有効）
npm run build    # 本番ビルド
```

## アーキテクチャ

```
web-ui/
├── index.ts           # 拡張機能エントリーポイント
├── server.ts          # Express HTTPサーバー
├── lib/
│   └── instance-registry.ts  # インスタンス管理
├── web/               # Preactアプリケーション
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── app.tsx
│       └── components/
│           ├── dashboard-page.tsx
│           ├── instances-page.tsx
│           └── theme-page.tsx
└── dist/              # ビルド出力
```

## ライセンス

MIT
