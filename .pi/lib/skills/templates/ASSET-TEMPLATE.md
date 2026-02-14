---
template-type: asset
template-version: "1.0.0"
description: アセットテンプレート用のテンプレート。レポート、設定ファイル、出力形式などのテンプレートを定義する。
---

# {アセットタイトル}

このテンプレートは{skill-name}スキルで使用する{目的}を定義する。

## 使用方法

```bash
# テンプレートの使用方法
cp assets/{アセット名}.md {出力パス}/{出力名}.md
```

または、スキル内から動的に参照:

```python
from pathlib import Path
template_path = Path(__file__).parent.parent / 'assets' / '{アセット名}.md'
with open(template_path) as f:
    template = f.read()
```

## テンプレート変数

このテンプレートで使用可能な変数:

| 変数 | 型 | 説明 | 例 |
|------|-----|------|-----|
| {VAR1} | string | 変数1の説明 | example_value |
| {VAR2} | number | 変数2の説明 | 42 |
| {VAR3} | boolean | 変数3の説明 | true |

## テンプレート構造

```markdown
# {VAR1} レポート

**生成日時:** {TIMESTAMP}

## セクション1

{SECTION1_CONTENT}

## セクション2

{SECTION2_CONTENT}

### サブセクション2.1

{SUBSECTION2_1_CONTENT}

## サマリー

{SUMMARY_CONTENT}

---

*{skill-name}スキルにより生成。*
```

## 完全テンプレート

---

# {FILENAME}

**生成日時:** {TIMESTAMP}

---

## エグゼクティブサマリー

{EXECUTIVE_SUMMARY}

---

## セクション1: {SECTION1_TITLE}

{SECTION1_DESCRIPTION}

### 要点

- 要点1
- 要点2
- 要点3

### 詳細

{SECTION1_DETAILS}

---

## セクション2: {SECTION2_TITLE}

{SECTION2_DESCRIPTION}

### データテーブル

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| {DATA1} | {DATA2} | {DATA3} |

---

## セクション3: {SECTION3_TITLE}

{SECTION3_DESCRIPTION}

---

## 推奨事項

1. **{REC1_TITLE}**: {REC1_DESCRIPTION}
2. **{REC2_TITLE}**: {REC2_DESCRIPTION}
3. **{REC3_TITLE}**: {REC3_DESCRIPTION}

---

## 次のステップ

- [ ] {ACTION1}
- [ ] {ACTION2}
- [ ] {ACTION3}

---

## 付録

### A. {APPENDIX_A_TITLE}

{APPENDIX_A_CONTENT}

### B. {APPENDIX_B_TITLE}

{APPENDIX_B_CONTENT}

---

*このドキュメントは{skill-name}スキルにより生成されました。*
*テンプレートバージョン: {TEMPLATE_VERSION}*

---

## 出力例

テンプレート適用後の出力例:

```markdown
# 分析レポート

**生成日時:** 2026-02-13 18:00:00

---

## エグゼクティブサマリー

このレポートは包括的な分析を提供します...

---

## セクション1: データ概要

...
```

## カスタマイズ

### 新しいセクションの追加

テンプレートに新しいセクションを追加:

```markdown
## セクションN: {NEW_SECTION_TITLE}

{NEW_SECTION_DESCRIPTION}

### {SUBSECTION_TITLE}

{SUBSECTION_CONTENT}
```

### 変数の変更

変数の置換ロジック:

```python
def apply_template(template: str, variables: dict) -> str:
    result = template
    for key, value in variables.items():
        result = result.replace(f'{{{key}}}', str(value))
    return result
```

## 関連項目

- [メインスキル](../SKILL.md)
- [関連リファレンス](../references/{reference}.md)

---

*{skill-name}スキル用テンプレート。*
