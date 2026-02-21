---
title: 貢献
category: development
audience: contributor
last_updated: 2026-02-20
tags: [contributing, guide]
related: [../README.md, ./01-getting-started.md]
---

# 貢献

> パンくず: [Home](../../README.md) > [Developer Guide](./) > 貢献

このドキュメントでは、mekannプロジェクトへの貢献方法について説明します。

## 貢献の種類

| 種類 | 説明 | 方法 |
|------|------|------|
| バグ報告 | 不具合の報告 | Issueを作成 |
| 機能提案 | 新機能の提案 | Issueで議論 |
| ドキュメント改善 | ドキュメントの修正・追加 | Pull Request |
| コード貢献 | バグ修正・機能実装 | Pull Request |

## 開発ワークフロー

### 1. リポジトリのフォーク

```bash
# GitHubでフォーク後
git clone https://github.com/<your-username>/mekann.git
cd mekann
```

### 2. ブランチの作成

```bash
# 機能追加の場合
git checkout -b feature/your-feature-name

# バグ修正の場合
git checkout -b fix/your-fix-name

# ドキュメント更新の場合
git checkout -b docs/your-docs-update
```

### 3. 変更の実装

- コードはTypeScriptで記述
- 日本語のコメントとJSDocを使用
- 絵文字は使用しない

### 4. テストの実行

```bash
# 関連するテストスクリプトを実行
./scripts/test-kitty-extension.sh
```

### 5. コミットの作成

```bash
# 変更をステージング（git add .は使用禁止）
git add path/to/changed/files

# コミット（日本語で記述）
git commit -m "feat: 新機能を追加する"
```

### 6. プルリクエストの作成

```bash
# フォーク先にプッシュ
git push origin feature/your-feature-name

# GitHubでプルリクエストを作成
```

## コーディング規約

### 命名規則

| 種類 | 規約 | 例 |
|------|------|-----|
| ファイル名 | kebab-case | `my-extension.ts` |
| 関数名 | camelCase | `handleRequest()` |
| クラス名 | PascalCase | `AgentRuntime` |
| 定数 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |

### JSDocの記述

すべての公開関数には日本語でJSDocを記述します。

```typescript
/**
 * ユーザーに質問を表示し、回答を取得する
 * @summary 質問を表示して回答を取得
 * @param questions - 質問の配列
 * @returns ユーザーの回答
 */
async function askQuestions(questions: Question[]): Promise<Answer[]> {
  // ...
}
```

### エラーハンドリング

- ユーザーに分かりやすいエラーメッセージを提供
- エラーは適切にログに記録
- 復旧可能なエラーは自動リトライを検討

## 拡張機能の追加

### 新規拡張機能の作成

1. `.pi/extensions/` にTypeScriptファイルを作成
2. `ExtensionAPI` を使用してツール、コマンド、ショートカットを登録
3. `.pi/skills/` にスキルが必要な場合は追加
4. `docs/02-user-guide/` にドキュメントを作成

### 拡張機能のテンプレート

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";

export default function (pi: ExtensionAPI) {
  // ツールの登録
  pi.registerTool({
    name: "my_tool",
    label: "マイツール",
    description: "ツールの説明",
    parameters: Type.Object({
      input: Type.String({ description: "入力値" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // 実装
      return {
        content: [{ type: "text", text: `結果: ${params.input}` }],
        details: {}
      };
    }
  });

  // コマンドの登録
  pi.registerCommand("my-cmd", {
    description: "マイコマンド",
    handler: async (args, ctx) => {
      ctx.ui.notify(`実行: ${args}`, "info");
    }
  });
}
```

## ドキュメントの貢献

### ドキュメントの構造

ドキュメントは `docs/` ディレクトリに整理されています。

| ディレクトリ | 内容 |
|--------------|------|
| `01-getting-started/` | インストールと基本操作 |
| `02-user-guide/` | 各拡張機能の使い方 |
| `03-development/` | 開発者向けガイド |
| `04-reference/` | 設定とトラブルシューティング |
| `05-meta/` | 変更履歴、ロードマップ |

### ドキュメントテンプレート

新しいドキュメントを作成する際は `docs/_template.md` を使用してください。

### ドキュメント更新のフロー

1. 対象のMarkdownファイルを編集
2. `last_updated` 日付を更新
3. 関連リンクを確認・追加
4. プレビューで確認

## コミットメッセージ規約

### フォーマット

```
<Type>[(scope)]: <Title>

<Body>
```

### Type一覧

| Type | 説明 |
|------|------|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメント更新 |
| `refactor` | リファクタリング |
| `test` | テストの追加・修正 |
| `chore` | その他の変更 |

### 例

```
feat(search): 高速検索ツールを追加する

## 変更内容
- file_candidatesツールの実装
- code_searchツールの実装
- シンボルインデックス機能の追加

## テスト方法
- 手動での検索動作確認
- 大規模コードベースでのパフォーマンステスト
```

## 行動規範

- 尊重的なコミュニケーション
- 建設的なフィードバック
- 日本語でのコミュニケーションを基本

## サポート

質問や不明点がある場合は、GitHubのIssueで質問してください。

## 関連トピック

- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [APIリファレンス](./03-api-reference.md) - APIの完全なリファレンス
- [テスト](./04-testing.md) - テスト方法

## 次のトピック

[ → APIリファレンス](./03-api-reference.md)
