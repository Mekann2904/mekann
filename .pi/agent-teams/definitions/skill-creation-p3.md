---
id: skill-creation-p3
name: Skill Creation - Phase 3 Validation
description: "Skill Creation Phase 3: 品質検証フェーズ。作成されたスキルの構文チェック、命名規則確認、リンク整合性検証、ベストプラクティス準拠確認を実施する。"
enabled: enabled
strategy: parallel
skills:
  - skill-creator         # チーム共通: スキル作成ガイドライン
members:
  - id: syntax-checker
    role: Syntax Checker
    description: "構文チェッカー。frontmatter構文、Markdown構文を検証する。"
    enabled: true
  - id: convention-checker
    role: Convention Checker
    description: "規約チェッカー。命名規則、ディレクトリ構造規約への準拠を確認する。"
    enabled: true
  - id: link-validator
    role: Link Validator
    description: "リンク検証担当。リンク整合性、ファイル存在確認を行う。"
    enabled: true
---

# Skill Creation - Phase 3: Validation

## チームミッション

Skill CreationのPhase 3（品質検証）を担当。Phase 2（skill-creation-p2）で作成されたSKILL.mdを検証する。

**前提:** Phase 1の設計結果、Phase 2で作成されたSKILL.mdを受け取っていること。

**出力:** 最終的な品質評価。

## Output Format

```
SUMMARY: [品質検証サマリー]
CLAIM: [スキルが品質基準を満たすか]
EVIDENCE: [検証結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 構文チェック
- [ ] frontmatter構文: OK
- [ ] Markdown構文: OK
- 問題: [なし/あり（内容）]

## 規約チェック
- [ ] 命名規則: OK
- [ ] ディレクトリ構造: OK
- 問題: [なし/あり（内容）]

## リンク検証
- [ ] すべてのリンクが有効
- 問題: [なし/あり（内容）]

## 最終判定
- [ ] 承認: スキル完成
- [ ] 要修正: [内容]
NEXT_STEP: [判定に基づく次のアクション]
```
