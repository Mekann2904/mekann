---
title: 開発者ガイド
category: development
audience: developer
last_updated: 2026-02-12
tags: [development, overview]
related: [../README.md, ./01-getting-started.md]
---

# 開発者ガイド

> パンくず: [Home](../../README.md) > 開発者ガイド

pi拡張機能コレクションの開発者ガイドです。

## 目次

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス
- [テスト](./04-testing.md) - テスト方法
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法

## クイックスタート

### 開発環境のセットアップ

```bash
# Node.jsの確認
node --version  # v20.18.1以上が必要

# piの確認
pi --version

# プロジェクトのクローン
git clone https://github.com/Mekann2904/mekann /path/to/mekann
cd /path/to/mekann

# 開発中のローカル版を任意のプロジェクトへ読み込む
# （対象プロジェクト側で実行）
pi install -l /path/to/mekann
```

### 最初の拡張機能の作成

新しい拡張機能ファイルを `.pi/extensions/` に作成します：

```typescript
// .pi/extensions/my-extension.ts
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default {
  name: 'my-extension',
  description: 'マイ拡張機能の説明',

  register(api: ExtensionAPI) {
    api.registerTool({
      name: 'myTool',
      description: 'ツールの説明',
      execute: async (input: any) => {
        return { result: 'success' };
      }
    });
  }
};
```

### 拡張機能のテスト

piを起動して拡張機能が読み込まれることを確認します：

```bash
pi
```

## 主要なトピック

### 拡張機能開発

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ

### APIリファレンス

- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス
- [ExtensionAPI](./03-api-reference.md#extensionapi) - 拡張機能API

### テストと品質

- [テスト](./04-testing.md) - テスト方法
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法

## 次のステップ

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ

---

## 関連トピック

- [Getting Started](../01-getting-started/) - ユーザー向けGetting Started
- [User Guide](../02-user-guide/) - ユーザーガイド
- [Reference](../04-reference/) - リファレンス

## 次のトピック

[ → 開発者向けGetting Started](./01-getting-started.md)
