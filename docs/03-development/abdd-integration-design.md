---
title: ABDD統合設計書
category: development
audience: developer
last_updated: 2026-02-18
tags: [abdd, architecture, documentation]
related: [../../philosophy.md, ../../ABDD/spec.md]
---

# ABDD統合設計書

> パンくず: [Home](../../README.md) > [Development](../) > ABDD統合設計書

## 概要

ABDD（As-Built Driven Development / 実態駆動開発）の包括的統合設計。コードから自動生成される実態記述と、人間が定義する意図記述を往復し、乖離を可視化・解消する開発手法。

## ABDDの概念

### 3つの柱

1. **一次成果物（Intentional Artifacts）**
   - `philosophy.md`: 価値観・優先順位・禁則・非目標
   - `spec.md`: ドメイン不変条件・契約・境界条件

2. **実装実態記述（As-Built Documentation）**
   - コードから後置生成されるMermaid図付きドキュメント
   - 自動生成のため常に実装と同期

3. **反復ループ（Iteration Loop）**
   - 人間が実態記述をレビュー
   - 乖離を指摘
   - AIが実装を更新（または意図を修正）

---

## ディレクトリ構造

### 推奨構造（案A: .pi/abdd/）

```
.pi/abdd/                           # ABDD専用ディレクトリ
├── philosophy.md                   # 価値観・優先順位・禁則・非目標
├── spec.md                         # ドーマン不変条件・契約・境界条件
├── as-built/                       # 実装実態記述（自動生成）
│   ├── extensions/                 # .pi/extensionsのドキュメント
│   │   └── *.md                    # 各拡張機能のAPIリファレンス
│   └── lib/                        # .pi/libのドキュメント
│       └── *.md                    # 各ライブラリのAPIリファレンス
├── reviews/                        # レビュー記録
│   └── YYYY-MM-DD.md               # 日付ごとのレビューログ
└── index.md                        # ABDDインデックス
```

### 代替構造（案B: ABDD/維持）

```
ABDD/                               # 既存ディレクトリ維持
├── philosophy.md                   # （ルートから移動）
├── spec.md                         # 新規作成
├── .pi/                            # as-built（既存構造）
│   ├── extensions/                 # 自動生成ドキュメント
│   └── lib/                        # 自動生成ドキュメント
├── reviews/                        # レビュー記録
└── index.md                        # ABDDインデックス
```

### 構造選択基準

| 基準 | 案A (.pi/abdd/) | 案B (ABDD/) |
|------|-----------------|-------------|
| .pi配下の統一感 | 高い | 低い |
| 既存スクリプトへの影響 | 修正必要 | 修正不要 |
| 可視性（トップレベル） | 低い | 高い |
| git管理のしやすさ | .gitignoreで除外しやすい | 別途設定必要 |

**推奨**: 案B（ABDD/維持）を採用し、最小限の変更で統合する。

---

## ファイル構成

### philosophy.md（意図記述）

```markdown
---
title: プロジェクト哲学
category: abdd
audience: developer
last_updated: 2026-02-18
tags: [philosophy, values, priorities]
---

# プロジェクト哲学

## 価値観

- **委任優先**: 非自明なタスクは必ずサブエージェントに委任する
- **出力形式**: 絵文字禁止、Markdownのみ
- **言語**: すべて日本語で出力

## 優先順位

1. 正確性 > 速度
2. 保守性 > 機能追加
3. ドキュメント > コード

## 禁則

- `git add .`の安易な使用を禁止
- 日本語コンテキストでの英語出力を禁止
- ユーザー確認なしの破壊的操作を禁止

## 非目標

- 多言語対応（日本語のみ）
- 完全自動化（人間の判断を尊重）
```

### spec.md（ドメイン不変条件）

```markdown
---
title: ドメイン仕様
category: abdd
audience: developer
last_updated: 2026-02-18
tags: [spec, invariants, contracts]
---

# ドメイン仕様

## 不変条件

### サブエージェントシステム

- [ ] 各サブエージェントは単一責任を持つ
- [ ] サブエージェント間通信は構造化されたプロトコルを使用する
- [ ] エラーは上位に伝播し、適切にハンドリングされる

### 拡張機能システム

- [ ] 各拡張機能は冪等性を持つ
- [ ] 拡張機能間の依存は明示的に宣言される
- [ ] 失敗時は有用なエラーメッセージを返す

## 契約

### Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<Result>;
}
```

### Result Type

```typescript
type Result<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

## 境界条件

- 最大並列数: 10
- タイムアウト: 60秒
- 最大出力サイズ: 50KB
```

### index.md（ABDDインデックス）

```markdown
---
title: ABDDインデックス
category: abdd
audience: developer
last_updated: 2026-02-18
tags: [abdd, index]
---

# ABDDインデックス

## 意図記述（Intentional）

| ファイル | 目的 | 更新頻度 |
|----------|------|----------|
| [philosophy.md](philosophy.md) | 価値観・優先順位 | 手動 |
| [spec.md](spec.md) | ドメイン不変条件 | 手動 |

## 実態記述（As-Built）

| ディレクトリ | 対象 | 更新頻度 |
|--------------|------|----------|
| [.pi/extensions/](.pi/extensions/) | 拡張機能API | 自動 |
| [.pi/lib/](.pi/lib/) | ライブラリAPI | 自動 |

## レビュー記録

| 日付 | ファイル | 概要 |
|------|----------|------|
| - | [reviews/](reviews/) | レビューログ |

## ワークフロー

1. **意図の確認**: philosophy.mdとspec.mdを読む
2. **実態の確認**: as-builtドキュメントを確認
3. **乖離の特定**: 意図と実態の差異を特定
4. **修正**: 実装を更新するか、意図を修正する
5. **再生成**: `npx tsx scripts/generate-abdd.ts`を実行

## コマンド

```bash
# 実態ドキュメント生成
npx tsx scripts/generate-abdd.ts

# JSDoc自動生成
npx tsx scripts/add-jsdoc.ts

# JSDocチェック（CI用）
npx tsx scripts/add-jsdoc.ts --check
```
```

---

## スキル定義

### .pi/skills/abdd/SKILL.md

```markdown
---
name: abdd
description: ABDD（実態駆動開発）スキル。意図記述と実態記述の往復レビュー、乖離検出、ドキュメント生成を支援。
license: MIT
tags: [abdd, documentation, review]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
---

# ABDD（As-Built Driven Development）

実態駆動開発を支援するスキル。コードから生成される実態記述と、人間が定義する意図記述を比較し、乖離を可視化・解消する。

## 主な機能

- **意図の確認**: philosophy.mdとspec.mdの理解支援
- **実態の確認**: as-builtドキュメントの解析
- **乖離検出**: 意図と実態の不一致を特定
- **修正提案**: 実装更新または意図修正の提案

## 使用タイミング

- コード変更後のドキュメント更新
- アーキテクチャレビュー
- 仕様乖離の調査
- オンボーディング時の理解支援

## ワークフロー

### ステップ1: 意図の確認

```bash
# 意図記述を読む
read .pi/abdd/philosophy.md
read .pi/abdd/spec.md
```

### ステップ2: 実態の確認

```bash
# 実態記述を生成・確認
npx tsx scripts/generate-abdd.ts
ls ABDD/.pi/extensions/*.md
ls ABDD/.pi/lib/*.md
```

### ステップ3: 乖離の検出

意図と実態を比較し、以下を確認:
- [ ] 実装はphilosophyの価値観に合致しているか
- [ ] 実装はspecの不変条件を満たしているか
- [ ] 実装はspecの契約に従っているか
- [ ] 実装はspecの境界条件内で動作しているか

### ステップ4: 修正

- **実装を更新**: 意図に合わない実装を修正
- **意図を修正**: 実装が正しく、意図が古い場合に意図を更新

### ステップ5: ドキュメント更新

```bash
# 実態ドキュメントを再生成
npx tsx scripts/generate-abdd.ts

# JSDocを更新（必要に応じて）
npx tsx scripts/add-jsdoc.ts
```

## JSDoc統合フロー

### 自動JSDoc生成

```bash
# ドライラン（変更を確認）
npx tsx scripts/add-jsdoc.ts --dry-run

# 実行
npx tsx scripts/add-jsdoc.ts

# チェック（CI用）
npx tsx scripts/add-jsdoc.ts --check
```

### 品質基準

- すべてのエクスポート関数にJSDocがあること
- @paramと@returnsが正しく記述されていること
- 日本語で記述されていること

## チェックリスト

### レビュー前

- [ ] philosophy.mdとspec.mdを読んだか
- [ ] as-builtドキュメントを生成したか
- [ ] 対象モジュールのMermaid図を確認したか

### レビュー中

- [ ] 実装は価値観に合致しているか
- [ ] 不変条件は満たされているか
- [ ] 契約は遵守されているか
- [ ] 境界条件内で動作しているか

### レビュー後

- [ ] 乖離がある場合、修正案を作成したか
- [ ] ドキュメントを再生成したか
- [ ] レビュー記録を残したか

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| Mermaid図が表示されない | mmdc未インストール | `npm install -g @mermaid-js/mermaid-cli` |
| JSDocが生成されない | APIキー未設定 | `.pi/agent/auth.json`を確認 |
| 図が壊れている | 構文エラー | mmdcで検証 |

## 関連ファイル

- 実装: `scripts/generate-abdd.ts`, `scripts/add-jsdoc.ts`
- 出力: `ABDD/.pi/extensions/`, `ABDD/.pi/lib/`
- 意図: `philosophy.md`, `spec.md`
```

---

## 拡張機能設計

### .pi/extensions/abdd.ts（概要）

```typescript
/**
 * ABDD Extension
 * 
 * Tools:
 * - abdd_generate: 実態ドキュメントを生成
 * - abdd_review: 意図と実態の乖離をレビュー
 * - abdd_check: JSDocとドキュメントの整合性をチェック
 */

export const abddTools = {
  abdd_generate: {
    description: 'ABDD実態ドキュメントを生成する',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['all', 'extensions', 'lib'],
          description: '生成対象'
        }
      }
    }
  },
  
  abdd_review: {
    description: '意図と実態の乖離をレビューする',
    parameters: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          description: 'レビュー対象モジュール'
        }
      }
    }
  },
  
  abdd_check: {
    description: 'JSDocとドキュメントの整合性をチェック',
    parameters: {
      type: 'object',
      properties: {
        fix: {
          type: 'boolean',
          description: '自動修正するかどうか'
        }
      }
    }
  }
};
```

---

## INDEX.mdへの統合

### 追加エントリ

```markdown
## ABDD System

| Task | Primary Source | Key Files |
|------|---------------|-----------|
| View as-built docs | `ABDD/.pi/extensions/`, `ABDD/.pi/lib/` | `*.md` |
| Review intention | `philosophy.md`, `spec.md` | 手動更新 |
| Generate docs | `scripts/generate-abdd.ts` | `npx tsx scripts/generate-abdd.ts` |
| Add JSDoc | `scripts/add-jsdoc.ts` | `npx tsx scripts/add-jsdoc.ts` |
```

### Skills Indexへの追加

```markdown
| abdd | `skills/abdd/` | Documentation review, gap analysis |
```

---

## NAVIGATION.mdへの統合

### 追加エントリ

```markdown
### Documentation Tasks

| Task | Primary Source | Key Files |
|------|---------------|-----------|
| Generate as-built docs | `scripts/generate-abdd.ts` | `npx tsx scripts/generate-abdd.ts` |
| Add JSDoc | `scripts/add-jsdoc.ts` | `npx tsx scripts/add-jsdoc.ts --dry-run` |
| Review intention vs implementation | `skills/abdd/SKILL.md` | Load skill first |
```

---

## 実装優先順位

### Phase 1: 基盤整備（優先度: 高）

1. **ディレクトリ構造の確定**
   - ABDD/を維持し、内部構造を整理
   - reviews/ディレクトリの作成
   - index.mdの作成

2. **テンプレートファイルの作成**
   - philosophy.mdのテンプレート作成
   - spec.mdのテンプレート作成

3. **スキル定義の作成**
   - `.pi/skills/abdd/SKILL.md`の作成

### Phase 2: ドキュメント統合（優先度: 中）

4. **INDEX.mdの更新**
   - ABDDセクションの追加
   - Skills Indexへの追加

5. **NAVIGATION.mdの更新**
   - Documentation Tasksセクションの追加

6. **generate-abdd.tsの調整**
   - 出力先の確認（現在のABDD/.pi/を維持）

### Phase 3: 拡張機能実装（優先度: 低）

7. **abdd.ts拡張機能の実装**
   - abdd_generate
   - abdd_review
   - abdd_check

8. **レビューフローの自動化**
   - reviews/への自動記録

---

## 既存資産との整合性

### generate-abdd.ts

- **現状**: ABDD_DIR = `join(ROOT_DIR, 'ABDD')`
- **変更**: 不要（現在の構造を維持）
- **出力先**: `ABDD/.pi/extensions/`, `ABDD/.pi/lib/`

### add-jsdoc.ts

- **現状**: `.pi/extensions/`, `.pi/lib/`を対象
- **変更**: 不要
- **統合**: ABDDワークフローの一部として位置づけ

### philosophy.md

- **現状**: ルートに空ファイル
- **変更**: ABDD/philosophy.mdに移動、またはルートに維持
- **推奨**: ルートに維持（可視性確保）、ABDD/からシンボリックリンク

---

## レビュー記録テンプレート

### reviews/YYYY-MM-DD.md

```markdown
---
title: ABDDレビュー記録
date: YYYY-MM-DD
reviewer: AI Agent / Human
module: 対象モジュール名
---

# レビュー記録

## 確認事項

### 意図との整合性

- [ ] philosophy.mdの価値観に合致
- [ ] spec.mdの不変条件を満たす
- [ ] 契約に従っている
- [ ] 境界条件内で動作

## 乖離の特定

| 箇所 | 意図 | 実態 | 修正方針 |
|------|------|------|----------|
| - | - | - | - |

## 修正内容

- 実装を更新: -
- 意図を修正: -

## 次のアクション

- [ ] -
```

---

## 関連トピック

- [philosophy.md](../../philosophy.md) - プロジェクト哲学
- [spec.md](spec.md) - ドメイン仕様
- [generate-abdd.ts](../../scripts/generate-abdd.ts) - ドキュメント生成スクリプト
- [add-jsdoc.ts](../../scripts/add-jsdoc.ts) - JSDoc自動生成スクリプト

## 次のトピック

[ → スキル定義の実装](.pi/skills/abdd/SKILL.md)
