---
title: テスト
category: development
audience: developer
last_updated: 2026-02-20
tags: [testing, guide]
related: [../README.md, ./01-getting-started.md]
---

# テスト

> パンくず: [Home](../../README.md) > [Developer Guide](./) > テスト

このドキュメントでは、pi拡張機能のテスト方法について説明します。

## テスト戦略

拡張機能の品質を確保するため、以下のテストレイヤーを推奨します。

### テストピラミッド

| レイヤー | 説明 | 実行頻度 |
|----------|------|----------|
| 単体テスト | 個々の関数・モジュールのテスト | 高 |
| 統合テスト | 拡張機能とpiランタイムの連携テスト | 中 |
| E2Eテスト | ユーザーシナリオに沿った動作確認 | 低 |

## テスト実行方法

### シェルスクリプトによるテスト

プロジェクトには拡張機能をテストするためのシェルスクリプトが含まれています。

```bash
# kittyターミナル統合のテスト
./scripts/test-kitty-extension.sh
```

### テストスクリプト一覧

| スクリプト | 対象 | 説明 |
|------------|------|------|
| `scripts/test-kitty-extension.sh` | kitty-status-integration | kittyターミナル統合機能のテスト |

## テスト構成

### ディレクトリ構造

```
mekann/
├── scripts/
│   └── test-kitty-extension.sh  # kitty統合テスト
├── .pi/
│   └── test-bash.ts             # bash拡張機能のテスト
```

### テストファイルの命名規則

- `test-*.sh` - シェルスクリプトによるテスト
- `*.test.ts` - TypeScriptによる単体テスト（将来実装予定）
- `test-*.ts` - 簡易的なテストスクリプト

## テストの種類

### 1. 機能テスト

各拡張機能の主な機能が正しく動作することを確認します。

**テスト項目の例（kitty-status-integration）:**

| テスト | 説明 |
|-------|------|
| Terminal detection | kittyターミナルの検出確認 |
| Window title setting | ウィンドウタイトルの設定と復元 |
| Notification | 通知の送信 |
| Temporary notification | 一時的（3秒）通知の送信 |
| Extension file check | 拡張機能ファイルの存在確認 |
| Environment variables | 環境変数の表示 |

### 2. 回帰テスト

既存機能が変更によって破損していないことを確認します。

### 3. 負荷テスト

多数のリクエストや並列実行時の動作を確認します。

## テスト作成ガイドライン

### 新規テストの追加

1. `scripts/` ディレクトリにテストスクリプトを作成
2. テスト名は `test-<機能名>.sh` の形式にする
3. テスト結果は明確な成功/失敗メッセージを出力する
4. 必要に応じてクリーンアップ処理を含める

### テストスクリプトのテンプレート

```bash
#!/bin/bash

# ==========================================
# <機能名> Test
# ==========================================

set -e

echo "=========================================="
echo "<機能名> Test"
echo "=========================================="

# 前提条件の確認
if ! command -v <必要なコマンド> &> /dev/null; then
    echo "✗ <必要なコマンド> is not installed"
    exit 1
fi

echo "✓ Detected <必要なコマンド>"

# テスト1: <テスト項目>
echo ""
echo "Test 1: <テスト項目>..."
# テストコード
echo "✓ <テスト項目> passed"

# テスト2: <テスト項目>
echo ""
echo "Test 2: <テスト項目>..."
# テストコード
echo "✓ <テスト項目> passed"

echo ""
echo "=========================================="
echo "All tests passed!"
echo "=========================================="
```

## CI/CDでのテスト実行

将来的にGitHub ActionsなどのCI/CDパイプラインで自動テストを実行することを想定しています。

### 推奨CI設定

```yaml
# .github/workflows/test.yml（将来実装予定）
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g @mariozechner/pi-coding-agent
      - run: ./scripts/test-kitty-extension.sh
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| テストが見つからない | スクリプトに実行権限がない | `chmod +x scripts/test-*.sh` |
| kitty detection failed | 非kitty環境で実行 | kittyターミナルで実行するか、テストをスキップ |
| 拡張機能がロードされない | インストール不完全 | `pi install` を再実行 |

## 関連トピック

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法

## 次のトピック

[ → 貢献方法](./05-contributing.md)
