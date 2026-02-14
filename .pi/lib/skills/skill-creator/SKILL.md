---
name: skill-creator
description: Piスキル作成支援スキル。新しいスキルの設計、SKILL.mdの作成、frontmatter定義、テンプレート適用をガイド。Agent Skills標準に準拠したスキル開発を効率化。
license: MIT
metadata:
  skill-version: "1.0.0"
  author: core-delivery-team
  category: meta
---

# Skill Creator

Piスキルの作成を支援するメタスキル。Agent Skills標準に準拠したスキルを段階的に設計・作成する。

**主な機能:**
- スキル設計のガイダンス
- SKILL.md frontmatterの生成
- テンプレートの適用指導
- ベストプラクティスの提示
- スキル検証の支援

## 使用タイミング

以下の場合に使用:
- 新しいPiスキルを作成する場合
- 既存スキルを拡張・改良する場合
- スキルのfrontmatterを定義する場合
- スキル構造のベストプラクティスを知りたい場合

**特に以下の場合に推奨:**
- 初めてスキルを作成する場合
- Agent Skills標準への準拠を確認したい場合
- チーム共有用のスキルを開発する場合

## 必須ルール: スキル配置場所 (CRITICAL)

このプロジェクトでは、スキルの配置場所を以下の通り使い分ける:

### 配置場所の使い分け

| ディレクトリ | 用途 | ロード方法 |
|--------------|------|------------|
| `.pi/lib/skills/` | **メインのスキル置き場** | settings.json等で明示的にロード |
| `.pi/skills/` | 自動ロード回避用 | piが自動ロード（通常は空にする） |

### 推奨: .pi/lib/skills/ への配置

```bash
# 新規スキルはこちらに作成
.pi/lib/skills/{skill-name}/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

**理由:** Piは `.pi/skills/` を自動的にロードするため、不要なスキルがコンテキストを消費することを避けるため、通常は空にしておく。

### Pi公式ロードパス

Piは以下の順序でスキルを検索:

1. **Global:** `~/.pi/agent/skills/`
2. **Project:** `.pi/skills/`
3. **Packages:** `skills/` ディレクトリまたは `package.json` の `pi.skills`
4. **Settings:** `settings.json` の `skills` 配列
5. **CLI:** `--skill <path>` オプション

### .pi/lib/skills/ を有効にする設定

`.pi/settings.json` に追加:

```json
{
  "skills": [".pi/lib/skills"]
}
```

または、CLIで指定:

```bash
pi --skill .pi/lib/skills/my-skill
```

## 必須ルール: スキル名規約 (CRITICAL)

スキル名は以下のルールに従う必要がある:

### 名前ルール

| ルール | 説明 | 例 |
|--------|------|-----|
| 文字種 | 小文字a-z、数字0-9、ハイフンのみ | `data-analysis` |
| 長さ | 1-64文字 | OK: `pdf-tools`, NG: `a-very-long-skill-name-...` |
| 先頭・末尾 | ハイフン不可 | NG: `-skill`, `skill-` |
| 連続ハイフン | 不可 | NG: `my--skill` |
| ディレクトリ一致 | 親ディレクトリ名と一致 | `.pi/lib/skills/my-skill/SKILL.md` |

### 有効な名前例

```
pdf-processing     # OK
data-validation    # OK
api-client         # OK
code-review        # OK
git-workflow       # OK
```

### 無効な名前例

```
PDF-Processing     # NG: 大文字
-pdf               # NG: 先頭ハイフン
pdf-               # NG: 末尾ハイフン
pdf--processing    # NG: 連続ハイフン
pdf_processing     # NG: アンダースコア
```

## ワークフロー

### ステップ1: スキルの目的を定義

スキルが何をするか、いつ使用するかを明確にする。

```markdown
## 質問に答える:
1. スキルの目的は何か?
2. どのようなタスクを自動化/支援するか?
3. ユーザがいつこのスキルを必要とするか?
4. 主な機能は何か?
```

### ステップ2: ディレクトリ構造を設計

スキルの複雑さに応じて構造を決定。

**最小構成 (単純なスキル):**
```
.pi/lib/skills/{skill-name}/
└── SKILL.md              # 必須: メイン指示のみ
```

**標準構成 (一般的なスキル):**
```
.pi/lib/skills/{skill-name}/
├── SKILL.md              # 必須: メイン指示
└── references/           # 詳細ドキュメント
    └── {topic}-spec.md
```

**完全構成 (複雑なスキル):**
```
.pi/lib/skills/{skill-name}/
├── SKILL.md              # 必須: メイン指示
├── scripts/              # ヘルパースクリプト
│   └── {skill-name}.sh
├── references/           # 詳細ドキュメント
│   ├── api-reference.md
│   └── configuration.md
└── assets/               # テンプレート/リソース
    └── output-template.md
```

### ステップ3: frontmatterを作成

SKILL.mdの先頭にYAML frontmatterを追加。

```yaml
---
name: {skill-name}
description: スキルの説明（1024文字以内）。何をするか、いつ使うかを明記。
license: MIT              # 任意
metadata:                 # 任意
  skill-version: "1.0.0"
  created: "2026-02-14"
  author: "作成者名"
---
```

**重要:** descriptionは必須。欠けている場合スキルはロードされない。

### ステップ4: 本文を記述

SKILL.mdの本文を構造化して記述。

**推奨セクション:**

| セクション | 必須度 | 説明 |
|------------|--------|------|
| 概要 | 推奨 | スキルの概要と主な機能 |
| 使用タイミング | 推奨 | いつ使用するか |
| ワークフロー | 必須 | 実行手順 |
| スクリプト | 条件 | scripts/がある場合 |
| リファレンス | 条件 | references/がある場合 |
| アセット | 条件 | assets/がある場合 |
| 使用例 | 推奨 | 具体的な使用例 |
| トラブルシューティング | 任意 | よくある問題と解決策 |
| ベストプラクティス | 任意 | 推奨事項 |

### ステップ5: 検証とテスト

作成したスキルを検証。

```bash
# スキルが認識されるか確認
pi --skill .pi/lib/skills/{skill-name} --help

# スキルコマンドでテスト
/skill:{skill-name}
```

## リファレンス

詳細な情報は以下のリファレンスを参照:

- [references/frontmatter-spec.md](references/frontmatter-spec.md) - frontmatter完全仕様
- [references/templates.md](references/templates.md) - セクションテンプレート集
- [references/examples.md](references/examples.md) - 実装例集

## 使用例

### 例1: 最小スキルの作成

```markdown
# .pi/lib/skills/hello-world/SKILL.md
---
name: hello-world
description: 挨拶を生成するシンプルなスキル。デモ用。
---

# Hello World

## 使用方法

ユーザが挨拶を求めた場合に使用。

## ワークフロー

1. ユーザの名前を確認
2. 挨拶メッセージを生成
3. 出力
```

### 例2: リファレンス付きスキルの作成

```markdown
# .pi/lib/skills/api-helper/SKILL.md
---
name: api-helper
description: REST API呼び出しを支援。エンドポイント設計、リクエスト構築、レスポンス解析をガイド。
license: MIT
metadata:
  skill-version: "1.0.0"
---

# API Helper

## 概要

REST APIの呼び出しを支援するスキル。

## リファレンス

- [references/http-methods.md](references/http-methods.md) - HTTPメソッド詳細
```

### 例3: スクリプト付きスキルの作成

```markdown
# .pi/lib/skills/data-validation/SKILL.md
---
name: data-validation
description: データファイルをスキーマに対して検証。CSV、JSON、YAML形式に対応し、エラーを行番号付きで報告。
---

# Data Validation

## スクリプト

### scripts/validate.py

\`\`\`bash
# 使用方法
python scripts/validate.py data.json schema.json
\`\`\`
```

## トラブルシューティング

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| スキルがロードされない | description欠損 | frontmatterにdescriptionを追加 |
| 名前エラーの警告 | 名前がディレクトリと不一致 | nameをディレクトリ名に合わせる |
| 参照ファイルが見つからない | パスが絶対パス | 相対パスに変更 |
| 文字化け | エンコーディング問題 | UTF-8で保存 |

### 検証チェックリスト

- [ ] nameがディレクトリ名と一致する
- [ ] nameが64文字以内
- [ ] nameが小文字・数字・ハイフンのみ
- [ ] descriptionが存在し、1024文字以内
- [ ] 参照パスが相対パス
- [ ] UTF-8エンコーディング

## ベストプラクティス

### 説明の書き方

**良い例:**
```yaml
description: CSVファイルをスキーマ定義に対して検証。エラーを行番号と共に報告し、修正案を提示。データインポート前の品質確認に使用。
```

**悪い例:**
```yaml
description: ファイルを検証するスキル。
```

### セクション構成

1. **概要** - 最初に全体像を提示
2. **使用タイミング** - 明確な条件を列挙
3. **ワークフロー** - 番号付きステップで記述
4. **リファレンス** - 詳細は別ファイルに分離

### ファイルサイズ

| ファイル | 推奨サイズ | 理由 |
|----------|------------|------|
| SKILL.md | ~500行 | コンテキスト効率 |
| references/*.md | 制限なし | オンデマンド読み込み |

### 相対パスの使用

スキル内では常に相対パスを使用:

```markdown
# OK
See [API Reference](references/api.md)

# NG
See [API Reference](/full/path/to/references/api.md)
```

---

*このスキルはAgent Skills標準に準拠して作成されました。*
