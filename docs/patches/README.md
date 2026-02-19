---
title: パッチ一覧
category: reference
audience: developer, contributor
last_updated: 2026-02-14
tags: [patch, patch-package]
related: []
---

# パッチ一覧

> パンくず: [Home](../README.md) > Patches

## 概要

このプロジェクトでは、依存パッケージの一時的な修正に`patch-package`を使用している。パッチは`npm install`時に自動的に適用される。

## 前提条件

`patch-package`が`devDependencies`に含まれている必要がある:

```json
{
  "devDependencies": {
    "patch-package": "^8.0.0"
  }
}
```

## パッチ一覧

| パッチ名 | 対象パッケージ | 説明 |
|---------|--------------|------|
| [pi-ai-abort-fix](./pi-ai-abort-fix.md) | @mariozechner/pi-ai@0.53.0 | "abort" stop reason対応 |
| [pi-coding-agent-rate-limit-fix](./pi-coding-agent-rate-limit-fix.md) | @mariozechner/pi-coding-agent@0.53.0 | 429自動リトライ改善（拡張でランタイム適用） |

## patch-packageについて

### 基本的な使い方

```bash
# パッチの作成
# 1. node_modules内のファイルを編集
# 2. 以下のコマンドを実行
npx patch-package <package-name>

# パッチの適用（npm install時に自動実行）
npx patch-package

# パッチの逆適用（確認用）
npx patch-package <package-name> --reverse
```

### 注意事項

- パッケージのバージョンアップ時はパッチの更新が必要
- upstreamで修正された場合はパッチを削除可能
- 詳細は各パッチのドキュメントを参照

## 関連ファイル

```
patches/
  @mariozechner+pi-ai+0.52.9.patch
```

---

## 関連トピック

- [トラブルシューティング](../04-reference/03-troubleshooting.md)
- [開発者ガイド](../03-development/README.md)
