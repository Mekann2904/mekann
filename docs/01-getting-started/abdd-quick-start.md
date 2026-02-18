---
title: ABDDクイックスタート
category: getting-started
audience: new-user
last_updated: 2026-02-18
tags: [abdd, quick-start, documentation]
related: [../../ABDD/index.md, ../02-installation.md]
---

# ABDDクイックスタート

> パンくず: [Home](../../README.md) > [Getting Started](./) > ABDDクイックスタート

3ステップでABDD（As-Built Driven Development）を始めるガイド。

---

## 概要

このガイドでは、ABDDの基本的な使い方を3ステップで説明します：

1. **実態ドキュメント生成** - コードからドキュメントを自動生成
2. **JSDoc自動生成** - 日本語のJSDocを追加
3. **乖離確認** - 意図と実態の不一致をチェック

所要時間: ステップ1は約1分、ステップ2は処理数による（ドライランで確認可能）、ステップ3はpiエージェント内で実行

---

## ステップ1: 実態ドキュメント生成

TypeScriptコードを解析し、Mermaid図付きのAPIリファレンスを生成します。

### コマンド

```bash
npx tsx scripts/generate-abdd.ts
```

### 出力先

| ディレクトリ | 内容 |
|--------------|------|
| `ABDD/.pi/extensions/*.md` | 拡張機能のAPIリファレンス |
| `ABDD/.pi/lib/*.md` | ライブラリのAPIリファレンス |

### 生成される内容

各TypeScriptファイルに対して以下を生成：

- **概要**: モジュールの目的
- **エクスポート一覧**: 関数、クラス、インターフェース、型
- **Mermaid図**:
  - クラス図（クラス構造）
  - 依存関係図（モジュール依存）
  - 関数フロー図（呼び出し関係）
  - シーケンス図（非同期処理）
- **詳細**: 各要素のシグネチャと説明

### 成功例

```
=== ABDD Documentation Generator ===

Processing extensions...
  abbr.ts
  agent-runtime.ts
  ...

Processing lib...
  concurrency.ts
  ...

=== Validating Mermaid diagrams ===

📊 Results: 24/24 diagrams valid

✅ All Mermaid diagrams are valid!

=== Done ===
```

---

## ステップ2: JSDoc自動生成

LLMを使用して日本語のJSDocを自動生成します。

### 2-1: ドライランで確認

まず、どのようなJSDocが生成されるか確認します：

```bash
npx tsx scripts/add-jsdoc.ts --dry-run
```

出力例：

```
=== JSDoc自動生成スクリプト ===

pi設定を読み込み中...
モデル: anthropic:claude-sonnet-4-20250514

対象ファイル: 28件

JSDocなしの要素: 15件

[1/15] function: formatType
    .pi/lib/runtime-utils.ts:42
    生成されたJSDoc:
       /**
        * 型文字列を表示用にフォーマットする
        * @param typeStr - フォーマット対象の型文字列
        * @returns フォーマット結果
        */
...
```

### 2-2: 実行

問題がなければ、実際にJSDocを追加します：

```bash
npx tsx scripts/add-jsdoc.ts
```

### よく使うオプション

| オプション | 説明 |
|------------|------|
| `--dry-run` | 変更を適用せず、生成内容のみ表示 |
| `--check` | JSDocがない要素の数のみ表示（CI用） |
| `--verbose` | 詳細ログを出力 |
| `--limit N` | 処理する要素数の上限 |
| `--file PATH` | 特定ファイルのみ処理 |
| `--regenerate` | 既存のJSDocも含めて再生成 |
| `--metrics` | 品質メトリクスを出力 |

### 品質基準

生成されるJSDocの品質基準：

- 要約は50文字以内
- すべてのパラメータに `@param`
- 戻り値がある場合 `@returns`
- 日本語で記述

---

## ステップ3: 乖離確認

意図記述（philosophy.md、spec.md）と実態記述（as-builtドキュメント）の乖離を確認します。

### 3-1: 手動確認（コマンドライン）

最もシンプルな方法は、意図と実態を直接比較することです：

```bash
# 意図記述を確認
cat philosophy.md
cat ABDD/spec.md

# 実態ドキュメントを確認
ls ABDD/.pi/extensions/*.md
ls ABDD/.pi/lib/*.md

# 特定のファイルを確認
cat ABDD/.pi/extensions/abbr.md
```

### 3-2: piエージェントで確認

**piエージェントとは**: このプロジェクトで使用するAIアシスタント（Claude等）。ABDD拡張機能を使用すると、対話的にABDDワークフローを実行できます。

piエージェントを使用している場合、`abdd_review`ツールでチェックリストを表示できます：

```
# piエージェントに自然言語で依頼
abdd_reviewツールでチェックリストを表示してください
```

または、JSONパラメータで明示的に指定：

```json
{
  "name": "abdd_review",
  "params": {
    "showChecklist": true
  }
}
```

確認項目：

- [ ] philosophy.mdの価値観に合致しているか
- [ ] spec.mdの不変条件を満たしているか
- [ ] 契約に従っているか
- [ ] 境界条件内で動作しているか

### 3-3: レビュー記録作成

乖離を発見した場合、レビュー記録を作成します：

```
# piエージェントに依頼
abdd_reviewツールでレビュー記録を作成してください
```

または、JSONパラメータで指定：

```json
{
  "name": "abdd_review",
  "params": {
    "createRecord": true,
    "date": "2026-02-18"
  }
}
```

出力先: `ABDD/reviews/2026-02-18.md`

### 3-4: 拡張機能ツール一覧

piエージェント内で使用できるABDDツール：

| ツール | 機能 | 主なパラメータ |
|--------|------|----------------|
| `abdd_generate` | 実態ドキュメント生成 | `dryRun`, `verbose` |
| `abdd_jsdoc` | JSDoc自動生成 | `dryRun`, `check`, `limit`, `file` |
| `abdd_review` | 乖離確認 | `showChecklist`, `createRecord`, `date` |

詳細は [ABDD/index.md](../../ABDD/index.md) を参照

---

## ワークフロー判断フロー

どのコマンドをいつ実行すべきか：

```
コード変更
    │
    ├─ ドキュメント更新が必要？
    │       │
    │       └─ Yes → npx tsx scripts/generate-abdd.ts
    │
    ├─ JSDocが不足？
    │       │
    │       ├─ 確認のみ → npx tsx scripts/add-jsdoc.ts --dry-run
    │       │
    │       └─ 追加 → npx tsx scripts/add-jsdoc.ts
    │
    └─ レビューが必要？
            │
            ├─ piエージェント内 → abdd_reviewツールを使用
            │
            └─ コマンドライン → 手動でphilosophy.mdと実態ドキュメントを比較
```

**補足**: abdd_reviewツールはpiエージェント内でのみ使用可能です。コマンドラインからは実行できません。

---

## JSDocとABDDの関係

### 役割の違い

| 種別 | 役割 | 更新タイミング |
|------|------|----------------|
| JSDoc | コード内のインラインドキュメント | 関数追加・変更時 |
| ABDD | コードから生成される外部ドキュメント | コミット前・リリース前 |

### 連携の流れ

```
1. add-jsdoc.ts でJSDoc追加
       ↓
2. JSDocがコードに埋め込まれる
       ↓
3. generate-abdd.ts がJSDocを読み取る
       ↓
4. ABDDドキュメントにJSDocの説明が反映される
```

つまり、**JSDocを書くことでABDDドキュメントの質が向上**します。

---

## トラブルシューティング

### Mermaid図が壊れている

**原因**: mmdcがインストールされていない、または構文エラー

**解決策**:

```bash
# mmdcをインストール
npm install -g @mermaid-js/mermaid-cli

# 再実行
npx tsx scripts/generate-abdd.ts
```

### JSDocが生成されない

**原因**: APIキーが設定されていない

**解決策**:

```bash
# 設定ファイルを確認
cat ~/.pi/agent/auth.json

# 必要に応じて設定
# auth.jsonにAPIキーを追加
```

### タイムアウトする

**原因**: 要素数が多すぎる

**解決策**:

```bash
# 上限を設定
npx tsx scripts/add-jsdoc.ts --limit 10

# または特定ファイルのみ
npx tsx scripts/add-jsdoc.ts --file .pi/lib/concurrency.ts
```

---

## 次のステップ

- [ABDDインデックス](../../ABDD/index.md) - ABDDの全体像を理解
- [ABDDスキル](../../.pi/skills/abdd/SKILL.md) - 詳細なワークフロー
- [philosophy.md](../../philosophy.md) - プロジェクトの価値観

---

## 関連トピック

- [インストール](./02-installation.md) - 環境構築の詳細
- [最初のステップ](./03-first-steps.md) - 基本的な使い方
