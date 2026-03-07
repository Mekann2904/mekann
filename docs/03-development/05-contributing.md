---
title: 貢献
category: development
audience: contributor
last_updated: 2026-03-07
tags: [contributing, guide]
related: [../README.md, ./01-getting-started.md]
---

# 貢献

> パンくず: [Home](../../README.md) > [Developer Guide](./) > 貢献

このドキュメントでは、mekannプロジェクトへの貢献方法を説明します。

このリポジトリでは、変更の質は loop の運用で上げます。

重要なのは、一度で正解を書くことではありません。

計画し、最小変更を入れ、verify し、観測し、直して、記録を残すことです。

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
- 複雑な変更は、先に `AGENTS.md` と `plans/*.md` に沿って計画する
- 実装は小さな反復で進める

### 3.1 推奨ループ

貢献時は、次のループを基本にします。

1. `plan`
2. `edit`
3. `test/build/lint`
4. `observe`
5. `repair`
6. `repeat`

止める条件も先に決めます。

同じ種類の失敗が続くなら、実装を増やす前に仮説を見直します。

### 3.2 3つの品質ループ

| ループ | 目的 | 主な道具 |
|-------|------|---------|
| 実行ループ | 変更を前に進める | plan, edit, observe, repair |
| 検証ループ | 品質を証拠で確認する | test, lint, typecheck, browser, review |
| 継続ループ | 長い作業を壊さない | todo, plans, progress log, checkpoints |

### 3.3 Proof Artifacts

高精度に動く変更では、証拠を残します。

最低でも、実行した検証コマンドと結果は残してください。

可能なら、ログ、スクリーンショット、再現手順、coverage も残します。

### 4. テストの実行

```bash
# まず関連テストを実行
npx vitest run tests/unit/...

# 次に必要な横断チェックを実行
npx eslint .
npx tsc -p tsconfig-check.json --noEmit
npm run verify:workspace

# 必要なら既存スクリプトも実行
./scripts/test-kitty-extension.sh
```

変更範囲が広い場合は、integration や e2e まで広げます。

PR を出す前は、必要に応じて `verify:workspace` を quality gate として使ってください。

これは opt-in の GitHub Actions `quality-gates` と同じ入口です。

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

`main` / `master` の branch protection も、既定では required status checks を追加しません。

`ENABLE_STANDARD_CI_GATES=true` を有効化した場合だけ、`security` と `compatibility` を追加します。

`ENABLE_WORKSPACE_QUALITY_GATES=true` を有効化した場合だけ、`quality-gates` も追加します。

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

### 検証規約

- 完了報告には、何を verify したかを書く
- verify していない部分は、未検証として明記する
- UI や操作フローを変えたら、手動確認手順も書く
- review では bugs、security、regression、test gaps を先に見る
- 同じ失敗が続くなら、修復方針を更新してから再実行する
- eval case や verification artifact が残る変更では、その保存先も共有する

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
5. 必要なら plan と verification 記録も更新

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
