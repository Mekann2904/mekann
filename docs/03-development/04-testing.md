---
title: テスト
category: development
audience: developer
last_updated: 2026-02-11
tags: [testing, wip]
related: [../README.md, ./01-getting-started.md, ]
---

# テスト

> パンくず: [Home](../../README.md) > [Developer Guide](./) > テスト

# 🚧 準備中

このドキュメントは現在準備中です。

## テスト戦略

拡張機能のテスト方法について記載されます。

### テストの種類

| 種類 | 説明 | ステータス |
|-------|------|---------|
| 単体テスト | 各関数のテスト | 🚧 準備中 |
| 統合テスト | piとの連携テスト | 🚧 準備中 |
| E2Eテスト | 端から端までのテスト | 🚧 準備中 |

## テストスクリプト

プロジェクトには拡張機能をテストするためのシェルスクリプトが含まれています。

### test-kitty-extension.sh

kittyターミナル統合拡張機能（`kitty-status-integration`）のテストスクリプトです。

#### 使用方法

```bash
# kittyターミナルで実行
./scripts/test-kitty-extension.sh
```

#### テスト内容

| テスト | 説明 |
|-------|------|
| Terminal detection | kittyターミナルの検出確認 |
| Window title setting | ウィンドウタイトルの設定と復元 |
| Notification | 通知の送信 |
| Temporary notification | 一時的（3秒）通知の送信 |
| Extension file check | 拡張機能ファイルの存在確認 |
| Environment variables | 環境変数の表示 |

#### 前提条件

- kittyターミナル環境（推奨）
- `.pi/extensions/kitty-status-integration.ts` が存在すること

#### 出力例

```
==========================================
Kitty Status Integration Test
==========================================

✓ Detected kitty terminal
  Window ID: 12345

Test 1: Setting window title...
✓ Window title set to 'Test: Title Change'

Test 2: Sending notification...
✓ Notification sent

Test 3: Temporary notification (3 seconds)...
✓ Temporary notification sent

...
```

---

## 関連トピック

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [拡張機能開発]() - 拡張機能の開発方法
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法
