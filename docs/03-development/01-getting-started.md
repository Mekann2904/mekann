---
title: 開発者向けGetting Started
category: development
audience: developer
last_updated: 2026-02-12
tags: [development, setup]
related: [./03-api-reference.md, ../01-getting-started/02-installation.md]
---

# 開発者向けGetting Started

> パンくず: [Home](../../README.md) > [Developer Guide](./) > Getting Started

拡張機能の開発を始めるためのガイドです。

## 開発環境のセットアップ

### 前提条件

- Node.js v20.18.1以上
- TypeScript
- piがインストールされていること

### プロジェクト構造

```
mekann/
├── .pi/
│   └── extensions/           # 拡張機能ファイル
│       ├── question.ts
│       ├── rsa-solve.ts
│       └── ...
└── docs/                    # ドキュメント
```

### 拡張機能の基本構造

```typescript
// .pi/extensions/my-extension.ts
import { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default {
  name: 'my-extension',
  description: 'マイ拡張機能の説明',

  register(api: ExtensionAPI) {
    // ツールの登録
    api.registerTool({
      name: 'myTool',
      description: 'ツールの説明',
      execute: async (input: any) => {
        // ツールの実装
        return { result: 'success' };
      }
    });

    // コマンドの登録
    api.registerCommand({
      name: '/my-command',
      description: 'コマンドの説明',
      handler: async (args: string[]) => {
        // コマンドの実装
      }
    });
  }
};
```

## 開発ワークフロー

### 1. 拡張機能の作成

新しい拡張機能ファイルを `.pi/extensions/` に作成します。

### 2. 拡張機能のテスト

piを起動して拡張機能が読み込まれることを確認します。

```bash
pi
```

### 3. ホットリロード

変更を反映するには、以下のコマンドを実行します：

```bash
/reload
```

またはpiを再起動します。

## デバッグ

### ログの確認

拡張機能からのログを確認するには、piのログ機能を使用します。

### エラーハンドリング

```typescript
api.registerTool({
  name: 'myTool',
  description: 'ツールの説明',
  execute: async (input: any) => {
    try {
      // ツールの実装
      return { result: 'success' };
    } catch (error) {
      console.error('Error in myTool:', error);
      throw error;
    }
  }
});
```

## 次のステップ

- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス

---

## 関連トピック

- [APIリファレンス](./03-api-reference.md) - APIリファレンス
