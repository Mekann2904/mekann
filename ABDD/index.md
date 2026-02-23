---
title: ABDDインデックス
category: abdd
audience: developer
last_updated: 2026-02-23
tags: [abdd, index, as-built]
related: [philosophy.md, spec.md]
---

# ABDDインデックス

> As-Built Driven Documentation Index

## はじめに

ABDD（As-Built Driven Development）は、コードベースとドキュメントの乖離を防ぐための開発手法。「意図」と「実態」を継続的に比較し、不一致を早期に発見・解消することで、コードの品質と保守性を高める。

**何のために使うのか:**
- コード変更時にドキュメントが陳腐化する問題を防ぐ
- 設計意図と実装の不一致を検出する
- アーキテクチャの健全性を維持する
- 新規メンバーのオンボーディングを支援する

**前提条件:**

| ツール | 用途 | インストールコマンド |
|--------|------|----------------------|
| Node.js 18+ | TypeScript実行 | `nvm install 18` |
| mmdc（任意） | Mermaid図の厳密検証 | `npm install -g @mermaid-js/mermaid-cli` |

**3ステップで始める:** 詳細は [クイックスタートガイド](../docs/01-getting-started/abdd-quick-start.md) を参照。

```bash
# 1. 実態ドキュメント生成
npx tsx scripts/generate-abdd.ts

# 2. JSDoc確認（ドライラン）
npx tsx scripts/add-jsdoc.ts --dry-run

# 3. 乖離確認
# - piエージェント内: abdd_reviewツールを使用
# - コマンドライン: 手動でphilosophy.mdと実態ドキュメントを比較
```

mmdcが未インストールの場合でも、簡易検証モードで動作可能。

---

## piツールでABDDを使用する

ABDD拡張機能を使用すると、コマンドライン操作なしでABDDワークフローを実行できます。

### 実態ドキュメント生成

```typescript
abdd_generate
```

### JSDoc生成

```typescript
// ドライラン
abdd_jsdoc({ dryRun: true })

// 実行
abdd_jsdoc()

// CI用チェック
abdd_jsdoc({ check: true })
```

### 乖離レビュー

```typescript
// チェックリストを表示
abdd_review()

// 詳細を表示
abdd_review({ showDetails: true })
```

---

## クイックスタート（コマンドライン）

3ステップでABDDを体験:

```bash
# 1. 実態ドキュメントを生成
npx tsx scripts/generate-abdd.ts

# 2. 意図と実態を比較
cat philosophy.md          # 意図を確認
ls ABDD/.pi/extensions/    # 実態を確認

# 3. JSDocで品質向上（任意）
npx tsx scripts/add-jsdoc.ts --dry-run
```

詳細は[クイックスタートガイド](../docs/01-getting-started/abdd-quick-start.md)を参照。

---

## 概要

ABDD（As-Built Driven Development）は、コードから自動生成される実態記述と、人間が定義する意図記述を比較し、乖離を可視化・解消する開発手法。

---

## 意図記述（Intentional Artifacts）

人間が定義し、維持する意図記述:

| ファイル | 目的 | 内容 | 更新頻度 |
|----------|------|------|----------|
| [philosophy.md](../philosophy.md) | 価値観・優先順位 | 何を重視し、何を避けるか | 手動 |
| [spec.md](spec.md) | ドメイン不変条件 | 常に成り立つべきルール | 手動 |

### philosophy.mdの内容

- 価値観: プロジェクトが重視する原則
- 優先順位: トレードオフの判断基準
- 禁則: 避けるべきプラクティス
- 非目標: 範囲外とする事項

### spec.mdの内容

- 不変条件: 常に成り立つべきルール
- 契約: インターフェースの約束
- 境界条件: 動作の制約

---

## 実態記述（As-Built Documentation）

コードから自動生成される実態記述:

| ディレクトリ | 対象 | 内容 | 更新頻度 |
|--------------|------|------|----------|
| [.pi/extensions/](.pi/extensions/) | 拡張機能 | APIリファレンス + Mermaid図 | 自動 |
| [.pi/lib/](.pi/lib/) | ライブラリ | APIリファレンス + Mermaid図 | 自動 |

### 生成される内容

各TypeScriptファイルに対して以下を生成:

1. **概要**: モジュールの目的
2. **インポート**: 依存関係
3. **エクスポート一覧**: 関数、クラス、インターフェース、型
4. **Mermaid図**:
   - クラス図（クラス構造）
   - 依存関係図（モジュール依存）
   - 関数フロー図（呼び出し関係）
   - シーケンス図（非同期処理）
5. **詳細**: 関数、クラス、インターフェース、型の詳細

---

## レビュー記録

乖離の発見と修正の記録:

| ディレクトリ | 目的 | 内容 |
|--------------|------|------|
| [reviews/](reviews/) | レビュー記録 | 日付ごとのレビューログ |

### レビュー記録の形式

```markdown
# ABDD/reviews/YYYY-MM-DD.md

## 確認事項

### 意図との整合性

- [ ] philosophy.mdの価値観に合致
- [ ] spec.mdの不変条件を満たす
- [ ] 契約に従っている
- [ ] 境界条件内で動作

## 乖離の特定

| 箇所 | 意図 | 実態 | 修正方針 |
|------|------|------|----------|
| ... | ... | ... | ... |

## 修正内容

- 実装を更新: ...
- 意図を修正: ...
```

---

## ワークフロー

### 1. 意図の確認

```bash
# 意図記述を読む
cat philosophy.md
cat ABDD/spec.md
```

### 2. 実態の確認

```bash
# 実態ドキュメントを生成
npx tsx scripts/generate-abdd.ts

# 生成されたドキュメントを確認
ls ABDD/.pi/extensions/*.md
ls ABDD/.pi/lib/*.md
```

### 3. 乖離の検出

- 実装は価値観に合致しているか
- 不変条件は満たされているか
- 契約は遵守されているか
- 境界条件内で動作しているか

### 4. 修正

- **実装を更新**: 意図に合わない実装を修正
- **意図を修正**: 実装が正しく、意図が古い場合

### 5. ドキュメント更新

```bash
# 実態ドキュメントを再生成
npx tsx scripts/generate-abdd.ts

# JSDocを更新（必要に応じて）
npx tsx scripts/add-jsdoc.ts

# レビュー記録を残す
# ABDD/reviews/YYYY-MM-DD.md に記録
```

---

## コマンドリファレンス

### 実態ドキュメント生成

```bash
# 生成
npx tsx scripts/generate-abdd.ts

# 出力先
# - ABDD/.pi/extensions/*.md
# - ABDD/.pi/lib/*.md
```

### JSDoc自動生成

```bash
# ドライラン
npx tsx scripts/add-jsdoc.ts --dry-run

# 実行
npx tsx scripts/add-jsdoc.ts

# チェック（CI用）
npx tsx scripts/add-jsdoc.ts --check

# 詳細ログ
npx tsx scripts/add-jsdoc.ts --verbose

# 品質メトリクス
npx tsx scripts/add-jsdoc.ts --metrics
```

### 拡張機能ツール（エージェント内使用）

piエージェント内からは、以下のツールを使用できます：

| ツール名 | 機能 | 主な用途 |
|----------|------|----------|
| `abdd_generate` | 実態ドキュメント生成 | コード変更後のドキュメント更新 |
| `abdd_jsdoc` | JSDoc自動生成 | JSDocの追加・更新・チェック |
| `abdd_review` | 乖離確認チェックリスト | レビュー時の確認・記録作成 |

#### abdd_generate

```json
{
  "name": "abdd_generate",
  "params": {
    "dryRun": false,
    "verbose": true
  }
}
```

#### abdd_jsdoc

```json
{
  "name": "abdd_jsdoc",
  "params": {
    "dryRun": true,
    "check": false,
    "limit": 50
  }
}
```

#### abdd_review

```json
{
  "name": "abdd_review",
  "params": {
    "showChecklist": true,
    "createRecord": true,
    "date": "2026-02-18"
  }
}
```

---

## ディレクトリ構造

```
ABDD/
├── index.md                   # このファイル
├── spec.md                    # ドメイン不変条件（要作成）
├── .pi/
│   ├── extensions/            # 拡張機能ドキュメント（自動生成）
│   │   └── *.md
│   └── lib/                   # ライブラリドキュメント（自動生成）
│       └── *.md
└── reviews/                   # レビュー記録
    └── YYYY-MM-DD.md
```

---

## 関連リンク

- [設計書](docs/03-development/abdd-integration-design.md) - ABDD統合設計書
- [スキル定義](.pi/skills/abdd/SKILL.md) - ABDDスキル
- [philosophy.md](../philosophy.md) - プロジェクト哲学

---

## 次のステップ

1. [philosophy.md](../philosophy.md)を読んで価値観を理解する
2. [spec.md](spec.md)を作成して不変条件を定義する
3. `npx tsx scripts/generate-abdd.ts`で実態ドキュメントを生成する
4. 意図と実態を比較し、乖離がないか確認する
