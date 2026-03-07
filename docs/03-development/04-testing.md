---
title: テスト
category: development
audience: developer
last_updated: 2026-03-07
tags: [testing, guide]
related: [../README.md, ./01-getting-started.md]
---

# テスト

> パンくず: [Home](../../README.md) > [Developer Guide](./) > テスト

このドキュメントでは、pi拡張機能のテスト方法を説明します。

mekann では、テストは単独の作業ではありません。

`実装 -> 検証 -> 観測 -> 修復` の品質ループの一部です。

品質は「きれいに書けた感覚」ではなく、`verified reality` で判断します。

## テスト戦略

拡張機能の品質を確保するため、以下のテストレイヤーを推奨します。

### テストピラミッド

| レイヤー | 説明 | 実行頻度 |
|----------|------|----------|
| 単体テスト | 個々の関数・モジュールのテスト | 高 |
| 統合テスト | 拡張機能とpiランタイムの連携テスト | 中 |
| E2Eテスト | ユーザーシナリオに沿った動作確認 | 低 |

## 品質ループ

mekann では、4 つの外部思想を 3 つのループに整理して使います。

### 1. 実行ループ

`plan -> edit -> test/build/lint -> observe -> repair -> repeat`

まず最小の変更を入れます。

次に結果を観測します。

壊れていれば、原因に対応する最小修復だけを入れます。

### 2. 検証ループ

テスト、lint、型検査、必要なら browser 確認や review を組み合わせます。

変更の種類ごとに、十分な証拠を残します。

### 3. 継続ループ

長い作業では、live todo、`plans/*.md`、進捗ログで現在地を外部化します。

コンテキストが圧縮されても、次の一手が分かる状態を保ちます。

## 検証の優先順位

変更後は、次の順で verification を積みます。

1. まず最も近い unit test を回す。
2. 次に関連する integration / e2e を回す。
3. 並行して `lint` と型検査を回す。
4. UI や対話フローなら、手動確認か screenshot を残す。
5. 高リスク変更なら review 観点を追加する。

証拠がない変更は、完了扱いにしません。

## テスト実行方法

### 推奨コマンド

```bash
npm test
npx vitest run
npx vitest run tests/unit/...
npx vitest run tests/integration/...
npx vitest run tests/e2e/...
npx eslint .
npx tsc -p tsconfig-check.json --noEmit
```

変更範囲が小さいときは、まず関連テストだけを回します。

最後に、必要な横断チェックを追加します。

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

### 変更ごとの最低ライン

| 変更の種類 | 最低限必要な検証 |
|-----------|------------------|
| 純粋関数、ユーティリティ | unit test |
| 拡張機能の登録、設定分岐 | unit test + integration test |
| エージェントフロー、plan連携 | integration test |
| ユーザー操作全体 | e2e または手動シナリオ |
| UI、ブラウザ連携 | 自動テスト + 手動確認 |

### Proof Artifacts

各変更では、できるだけ次を残します。

- 実行コマンド
- 成功 / 失敗の結果
- 必要ならログやスクリーンショット
- 未実施の検証と理由

これで、あとから同じ品質判断を再現できます。

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

将来の CI でも、考え方は同じです。

速いチェックを先に回し、失敗したらその証拠を残し、修復後に再実行します。

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

## 失敗時の進め方

テストが落ちたら、すぐに大きく書き換えないでください。

まず失敗を観測し、再現条件を固定します。

次に、壊れている層を 1 つに絞ります。

修復後は、落ちたテストと近接する回帰テストを再実行します。

## 関連トピック

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法

## 次のトピック

[ → 貢献方法](./05-contributing.md)
