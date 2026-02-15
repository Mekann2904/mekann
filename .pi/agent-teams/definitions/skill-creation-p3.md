---
id: skill-creation-p3
name: Skill Creation - Phase 3 Validation
description: "Skill Creation Phase 3: 品質検証フェーズ。作成されたスキルの構文チェック、命名規則確認、リンク整合性検証、ベストプラクティス準拠確認を実施する。"
enabled: enabled
strategy: parallel
skills:
  - skill-creator
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
triggers:
  - "SKILL.mdが作成されている"
  - "Phase 2の作成が完了"
skip_conditions:
  - "SKILL.mdが存在しない"
  - "Phase 2が未完了"
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

## When to Use

**このフェーズを使用する:**
- SKILL.mdが作成されている
- Phase 2の作成が完了
- 品質基準への準拠を確認したい

**このフェーズをスキップすべきでない場合:**
- SKILL.mdが存在しない
- 構文エラーが疑われる
- 命名規則への準拠が未確認

## 警告信号 - プロセスの遵守を促す

| 警告信号 | 何をすべきか |
|---------|-------------|
| 「検証は時間の無駄」 | 品質問題は後で高コストになる |
| 「たぶん大丈夫」 | 全項目をチェックリストで確認 |
| 「軽微なエラーは無視」 | すべての問題を修正してから完了 |
| 「APPROVED判定を急ぐ」 | すべての検証項目を完了してから判定 |
| 「修正案は提示しない」 | 問題発見時は修正案を必ず提示 |

## 人間のパートナーの「やり方が間違っている」シグナル

| シグナル | 意味 | 推奨アクション |
|---------|------|---------------|
| 「検証をスキップして完了したい」 | 品質軽視 | プロセスの重要性を説明 |
| 「エラーがあっても気にしない」 | 基準理解不足 | 品質基準の重要性を説明 |
| 「命名規則はどうでもいい」 | 標準違反容認 | 規約準拠の必要性を説明 |
| 「リンク切れは些細な問題」 | ユーザビリティ低下 | リンク整合性の重要性を説明 |
| 「descriptionの長さは適当でいい」 | 標準違反 | 1024文字制限の理由を説明 |

## よくある言い辞

| 言い辞 | なぜ危険か | 正しいアプローチ |
|-------|-----------|-----------------|
| 「たぶん正しいはず」 | 未検証の前提 | 全項目を明示的に検証 |
| 「後で直せばいい」 | 技術負債の蓄積 | 完了前にすべて修正 |
| 「厳密なチェックは不要」 | 品質低下 | チェックリストを完全実施 |
| 「警告は無視していい」 | 潜在的問題 | Warning も確認・対応 |
| 「検証結果は報告しなくていい」 | 透明性不足 | 検証結果を必ず報告 |

## 「不十分/危険」の場合の対応

| 判定 | 条件 | 次のアクション |
|-----|------|---------------|
| **APPROVED** | 全Critical/Error項目がOK | スキル完成、使用開始可能 |
| **NEEDS_REVISION** | 1つ以上のError項目 | Phase 2に戻り修正 |
| **CRITICAL_FAILURE** | Critical項目不合格 | Phase 1から再検討 |

## クイックリファレンス

| 検証項目 | 基準 | 深刻度 |
|---------|------|--------|
| name存在 | frontmatterにnameがある | Critical |
| description存在 | frontmatterにdescriptionがある | Critical |
| name長 | 64文字以内 | Error |
| name形式 | 小文字・数字・ハイフンのみ | Error |
| name一致 | ディレクトリ名と一致 | Error |
| description長 | 1024文字以内 | Warning |
| 相対パス | 参照が相対パス | Warning |
| UTF-8 | エンコーディングがUTF-8 | Warning |

## 鉄の掟

```
検証なしにスキルを完成させない
Critical項目不合格でAPPROVEDを出さない
修正案なしでNEEDS_REVISIONを出さない
```
