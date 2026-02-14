---
reference-type: examples
skill: skill-creator
version: "1.0.0"
---

# 実装例集

様々なタイプのスキル実装例。実際のスキル作成時の参考用。

## 目次

1. [最小スキル](#1-最小スキル)
2. [標準スキル](#2-標準スキル)
3. [リファレンス付きスキル](#3-リファレンス付きスキル)
4. [スクリプト付きスキル](#4-スクリプト付きスキル)
5. [完全構成スキル](#5-完全構成スキル)
6. [既存スキル例](#6-既存スキル例)

---

## 1. 最小スキル

最もシンプルなスキル構成。学習用やデモ用。

### ディレクトリ構成

```
.pi/lib/skills/hello-world/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: hello-world
description: 挨拶を生成するシンプルなスキル。デモや学習用に使用。
---

# Hello World

## 概要

挨拶メッセージを生成するシンプルなスキル。

## 使用タイミング

以下の場合に使用:
- ユーザが挨拶を求めた場合
- デモやテストを行う場合

## ワークフロー

1. ユーザの名前を確認（指定がない場合は「ゲスト」）
2. 現在時刻に基づいて適切な挨拶を選択
3. 挨拶メッセージを生成して出力

## 使用例

### 例1: 基本的な使用

```
ユーザ: 挨拶して
出力: こんにちは、ゲストさん！
```

### 例2: 名前指定

```
ユーザ: 太郎に挨拶して
出力: こんにちは、太郎さん！本日は良い一日を。
```
```

---

## 2. 標準スキル

一般的なスキル構成。frontmatterに追加メタデータを含む。

### ディレクトリ構成

```
.pi/lib/skills/code-review/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: code-review
description: コードレビューを支援。変更内容の分析、品質チェック、改善提案を行う。Pull Request作成前の自己レビューや、チームレビューの準備に使用。
license: MIT
metadata:
  skill-version: "1.0.0"
  category: development
---

# Code Review

## 概要

コードレビューを支援するスキル。変更内容の分析、品質チェック、改善提案を行う。

**主な機能:**
- 変更差分の分析
- コーディング規約チェック
- 潜在的バグの検出
- 改善提案の生成

## 使用タイミング

以下の場合に使用:
- Pull Request作成前の自己レビュー
- チームレビューの準備
- コード品質の確認

**特に以下の場合に推奨:**
- 大きな変更を含むPR
- 重要な機能の実装
- リファクタリング後の確認

## ワークフロー

### ステップ1: 変更内容の確認

```bash
# ステージング済みの変更を確認
git diff --staged

# 最新Nコミットの変更を確認
git diff HEAD~N
```

### ステップ2: 品質チェック

以下の観点でコードを評価:
- 可読性
- 保守性
- パフォーマンス
- セキュリティ

### ステップ3: レビュー結果の整理

- 指摘事項のリスト化
- 優先度付け
- 修正案の提示

## 使用例

### 例1: ステージング済み変更のレビュー

```bash
# 変更をステージング
git add .

# レビュー実行
# スキルがgit diff --stagedを分析
```

### 例2: 特定コミットのレビュー

```bash
# 直前のコミットをレビュー
git show HEAD
```

## トラブルシューティング

| 問題 | 解決策 |
|------|--------|
| 差分が大きすぎる | ファイル単位で分割してレビュー |
| 複雑な変更 | コミット単位で分割してレビュー |

## ベストプラクティス

1. **小さな単位でレビュー**: 大きな変更は分割する
2. **客観的な視点**: 第三者の視点で見る
3. **建設的なフィードバック**: 改善案を含める

---

*このスキルはAgent Skills標準に準拠して作成されました。*
```

---

## 3. リファレンス付きスキル

詳細なドキュメントを分離した構成。

### ディレクトリ構成

```
.pi/lib/skills/api-design/
├── SKILL.md
└── references/
    ├── rest-guidelines.md
    └── error-handling.md
```

### SKILL.md

```markdown
---
name: api-design
description: RESTful APIの設計を支援。エンドポイント設計、リクエスト/レスポンス形式、エラーハンドリングのベストプラクティスを提供。API開発の初期段階で使用。
license: MIT
metadata:
  skill-version: "1.0.0"
  category: architecture
---

# API Design

## 概要

RESTful APIの設計を支援するスキル。

**主な機能:**
- エンドポイント設計
- HTTPメソッド選択
- ステータスコード決定
- エラーレスポンス設計

## 使用タイミング

以下の場合に使用:
- 新しいAPIエンドポイントを設計する場合
- 既存APIの改善を行う場合
- API仕様書を作成する場合

## ワークフロー

### ステップ1: 要件の整理

- リソースの特定
- 操作の特定（CRUD）
- 関連の特定

### ステップ2: エンドポイント設計

- パスの設計
- メソッドの選択
- パラメータの定義

### ステップ3: レスポンス設計

- 成功レスポンス形式
- エラーレスポンス形式
- ステータスコード

## リファレンス

- [references/rest-guidelines.md](references/rest-guidelines.md) - REST設計ガイドライン
- [references/error-handling.md](references/error-handling.md) - エラーハンドリング規約

## 使用例

### 例1: ユーザリソースの設計

```
リソース: User
操作: CRUD

エンドポイント設計:
- GET    /users          # ユーザ一覧
- GET    /users/{id}     # ユーザ詳細
- POST   /users          # ユーザ作成
- PUT    /users/{id}     # ユーザ更新
- DELETE /users/{id}     # ユーザ削除
```

---

*このスキルはREST API設計のベストプラクティスに基づいて作成されました。*
```

---

## 4. スクリプト付きスキル

ヘルパースクリプトを含む構成。

### ディレクトリ構成

```
.pi/lib/skills/data-validation/
├── SKILL.md
├── scripts/
│   └── validate.py
└── references/
    └── schema-format.md
```

### SKILL.md

```markdown
---
name: data-validation
description: データファイルをスキーマに対して検証。CSV、JSON、YAML形式に対応。エラーを行番号付きで報告し、修正案を提示。データインポート前の品質確認に使用。
license: MIT
metadata:
  skill-version: "1.0.0"
  category: data
---

# Data Validation

## 概要

データファイルをスキーマ定義に対して検証するスキル。

**主な機能:**
- スキーマベースの検証
- 複数形式対応（CSV, JSON, YAML）
- 詳細なエラーレポート
- 修正案の提示

## 使用タイミング

以下の場合に使用:
- データインポート前の確認
- データ移行時の検証
- 定期的なデータ品質チェック

## 必須ルール: データ整合性 (CRITICAL)

**検証前にデータのバックアップを取得すること。**

### 確認事項

1. 元データのバックアップがあるか
2. スキーマ定義が最新か
3. 検証環境が適切か

**重要**: このルールは必須（MANDATORY）です。

## ワークフロー

### ステップ1: スキーマ準備

```yaml
# schema.yaml
type: object
properties:
  id:
    type: integer
    required: true
  name:
    type: string
    required: true
  email:
    type: string
    format: email
```

### ステップ2: 検証実行

```bash
python scripts/validate.py data.json schema.yaml
```

### ステップ3: 結果確認

エラーがある場合は修正して再実行。

## スクリプト

### scripts/validate.py

```bash
# 基本的な使用方法
python scripts/validate.py <data-file> <schema-file>

# 詳細オプション
python scripts/validate.py data.json schema.yaml --verbose --output report.json
```

**パラメータ:**
| 引数 | 型 | 必須 | 説明 |
|------|-----|------|------|
| data-file | path | Yes | 検証するデータファイル |
| schema-file | path | Yes | スキーマ定義ファイル |
| --verbose | flag | No | 詳細ログ出力 |
| --output | path | No | レポート出力先 |

## リファレンス

- [references/schema-format.md](references/schema-format.md) - スキーマ形式仕様

## 使用例

### 例1: JSON データの検証

```bash
python scripts/validate.py users.json user-schema.yaml
```

### 例2: CSV データの検証

```bash
python scripts/validate.py products.csv product-schema.yaml --verbose
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| スキーマ読み込みエラー | 形式不正 | YAML/JSON構文を確認 |
| ファイルエンコーディングエラー | 文字コード | UTF-8で保存 |

## ベストプラクティス

1. **スキーマをバージョン管理**: 変更履歴を残す
2. **段階的検証**: 小さなデータセットでテスト
3. **自動化**: CI/CDに組み込む

---

*このスキルはJSON Schema仕様に基づいて作成されました。*
```

---

## 5. 完全構成スキル

全ディレクトリを使用する構成。

### ディレクトリ構成

```
.pi/lib/skills/project-setup/
├── SKILL.md
├── scripts/
│   ├── init.sh
│   └── validate.sh
├── references/
│   ├── structure.md
│   └── configuration.md
└── assets/
    └── project-template.md
```

### SKILL.md (抜粋)

```markdown
---
name: project-setup
description: 新規プロジェクトの初期設定を支援。ディレクトリ構造作成、設定ファイル生成、初期化スクリプト実行を行う。新しいプロジェクトを開始する際に使用。
license: MIT
metadata:
  skill-version: "1.0.0"
  category: development
---

# Project Setup

## 概要

新規プロジェクトの初期設定を支援するスキル。

**主な機能:**
- ディレクトリ構造の作成
- 設定ファイルの生成
- 初期化スクリプトの実行
- テンプレートの適用

## ワークフロー

### ステップ1: プロジェクト情報の収集

- プロジェクト名
- プロジェクトタイプ
- 使用技術スタック

### ステップ2: 構造作成

```bash
./scripts/init.sh --name my-project --type web
```

### ステップ3: 検証

```bash
./scripts/validate.sh
```

## スクリプト

### scripts/init.sh

```bash
./scripts/init.sh --name <project-name> --type <project-type>
```

### scripts/validate.sh

```bash
./scripts/validate.sh [--fix]
```

## リファレンス

- [references/structure.md](references/structure.md) - ディレクトリ構造ガイド
- [references/configuration.md](references/configuration.md) - 設定ファイル仕様

## アセット

### assets/project-template.md

プロジェクトのREADMEテンプレート。

```bash
cp assets/project-template.md README.md
```

---

*このスキルはプロジェクト構成のベストプラクティスに基づいて作成されました。*
```

---

## 6. 既存スキル例

### git-workflow スキル (抜粋)

実際のスキル例。`.pi/lib/skills/git-workflow/SKILL.md`を参照。

**特徴:**
- CRITICALルールセクション（ユーザ確認必須）
- questionツールの使用例
- 読み取り専用操作の明示
- 詳細なトラブルシューティング表

### 構造比較

| スキル | 構成 | 特徴 |
|--------|------|------|
| hello-world | 最小 | 学習用 |
| code-review | 標準 | 一般的な構成 |
| api-design | リファレンス付き | 詳細ドキュメント分離 |
| data-validation | スクリプト付き | 実行可能ツール |
| project-setup | 完全 | 全リソース使用 |
| git-workflow | 標準+CRITICAL | 安全性重視 |

---

## 選択ガイド

| 条件 | 推奨構成 |
|------|----------|
| 学習・デモ用 | 最小 |
| 単一目的 | 標準 |
| 複雑な仕様 | リファレンス付き |
| 自動化ツール | スクリプト付き |
| 包括的ソリューション | 完全構成 |

---

*この実装例集はskill-creatorスキルの一部です。*
