# スキルテンプレートシステム

スキルテンプレートシステムを使用して、一貫性のあるスキルを迅速に作成する。

**注意:** スキルは `.pi/lib/skills/` に配置してください。`.pi/skills/` はPiの自動読み込みを避けるため空にしておきます。

## ドキュメント

- [アーキテクチャ設計書](../../docs/skill-management-architecture.md): 技術仕様とシステム構成
- [スキルガイド](../../docs/skill-guide.md): 各スキルの詳細と使い方
- [運用ガイド](../../docs/skill-operations.md): 手順とトラブルシューティング

## クイックスタート

```bash
cd .pi/lib/skills/templates

# 基本スキル作成
./create-skill.sh my-skill "スキルの説明"

# 全テンプレート付きで作成
./create-skill.sh my-skill "スキルの説明" --with-all
```

## テンプレート一覧

| テンプレート | ファイル | 説明 |
|--------------|----------|------|
| **SKILL** | `SKILL-TEMPLATE.md` | メインスキル定義ファイル |
| **REFERENCE** | `REFERENCE-TEMPLATE.md` | 詳細技術ドキュメント |
| **ASSET** | `ASSET-TEMPLATE.md` | 出力テンプレート/リソース |
| **SCRIPT** | `SCRIPT-TEMPLATE.py` | Pythonヘルパースクリプト |

## ディレクトリ構造

```
.pi/lib/skills/{スキル名}/
├── SKILL.md                    # 必須: メイン指示
├── scripts/                    # 任意: ヘルパースクリプト
│   └── {スキル名}.py
├── references/                 # 任意: 詳細ドキュメント
│   └── {スキル名}-reference.md
└── assets/                     # 任意: テンプレート
    └── {スキル名}-template.md
```

## 新規スキル作成

### 方法1: create-skill.shを使用

```bash
# 基本作成（SKILL.mdのみ）
./create-skill.sh data-validation "データファイルを検証"

# 全テンプレート付き
./create-skill.sh data-validation "データファイルを検証" --with-all
```

### 方法2: 手動作成

```bash
# 1. ディレクトリ作成
mkdir -p .pi/lib/skills/my-skill/{scripts,references,assets}

# 2. テンプレートをコピー
cp .pi/lib/skills/templates/SKILL-TEMPLATE.md .pi/lib/skills/my-skill/SKILL.md

# 3. 必要に応じて追加
cp .pi/lib/skills/templates/REFERENCE-TEMPLATE.md .pi/lib/skills/my-skill/references/my-skill-reference.md
cp .pi/lib/skills/templates/ASSET-TEMPLATE.md .pi/lib/skills/my-skill/assets/my-skill-template.md
cp .pi/lib/skills/templates/SCRIPT-TEMPLATE.py .pi/lib/skills/my-skill/scripts/my-skill.py

# 4. プレースホルダーを置換
# {skill-name} -> my-skill
# {スキル名} -> My Skill
# 等
```

## テンプレート詳細

### SKILL-TEMPLATE.md

メインスキル定義。YAML frontmatter + Markdown形式。

**セクション:**
- 概要: スキルの概要
- 使用タイミング: 使用するタイミング
- ワークフロー: 実行手順
- スクリプト: スクリプト説明
- リファレンス: 参照リンク
- 使用例: 使用例

### REFERENCE-TEMPLATE.md

技術的な詳細情報を記述。

**用途:**
- API仕様
- ファイル形式定義
- 設定オプション
- トラブルシューティング

**セクション:**
- 概要
- クイックリファレンス表
- 詳細セクション
- APIリファレンス
- 形式仕様
- 設定
- トラブルシューティング
- ベストプラクティス

### ASSET-TEMPLATE.md

出力用テンプレートを定義。

**用途:**
- レポートテンプレート
- 設定ファイル雛形
- 出力形式定義

**機能:**
- テンプレート変数（{VAR1}, {VAR2}）
- 構造定義
- 使用例
- カスタマイズ方法

### SCRIPT-TEMPLATE.py

Pythonスクリプトの雛形。

**機能:**
- argparse引数解析
- 入力検証
- エラーハンドリング
- 複数出力形式対応
- 詳細モード

## Frontmatterリファレンス

SKILL.mdのfrontmatter:

```yaml
---
name: skill-name           # 必須: スキルID
description: ...          # 必須: 1024文字以内
license: MIT              # 任意: ライセンス
metadata:                 # 任意: メタデータ
  skill-version: "1.0.0"
  created: "2026-02-13"
  author: "Your Name"
---
```

### 名前ルール

- 1-64文字
- 小文字、数字、ハイフンのみ
- 先頭・末尾にハイフン不可
- 連続ハイフン不可
- 親ディレクトリ名と一致

## スキルの使用

```bash
# スキルをロード
/skill:my-skill

# 引数付きで使用
/skill:my-skill arg1 arg2

# CLIから指定
pi --skill .pi/skills/my-skill
```

## ベストプラクティス

### 説明の書き方

**良い例:**
```yaml
description: CSVファイルをスキーマ定義に対して検証。エラーを行番号と共に報告し、修正案を提示。
```

**悪い例:**
```yaml
description: ファイルを検証。
```

### ファイル構成

| ディレクトリ | 用途 | サイズ制限 |
|--------------|------|------------|
| SKILL.md | メイン指示 | ~2000行 |
| references/ | 詳細ドキュメント | 制限なし |
| scripts/ | 実行可能スクリプト | 制限なし |
| assets/ | テンプレート | 制限なし |

### 相対パス

スキル内では相対パスを使用:

```markdown
詳細は[リファレンス](references/ref.md)を参照。
```

```python
from pathlib import Path
template = Path(__file__).parent.parent / 'assets' / 'template.md'
```

## 検証

Piは自動的にスキルを検証:

- 名前がディレクトリと一致するか
- 名前が64文字以内か
- 無効な文字が含まれていないか
- 説明が1024文字以内か
- 説明が存在するか

**重要:** 説明が欠けているスキルはロードされません。

## 例

### 最小構成スキル

```
.pi/lib/skills/hello-world/
└── SKILL.md
```

### 完全構成スキル

```
.pi/lib/skills/data-analysis/
├── SKILL.md
├── scripts/
│   └── data-analysis.py
├── references/
│   ├── data-analysis-reference.md
│   ├── formats.md
│   └── api.md
└── assets/
    ├── report-template.md
    └── config-template.json
```

## 関連項目

- [アーキテクチャ設計書](../../docs/skill-management-architecture.md)
- [スキルガイド](../../docs/skill-guide.md)
- [運用ガイド](../../docs/skill-operations.md)
- [piスキルドキュメント](https://github.com/badlogic/pi-skills)
- [Agent Skills仕様](https://agentskills.io/specification)
