---
id: skill-creation-p2
name: Skill Creation - Phase 2 Authoring
description: "Skill Creation Phase 2: SKILL.md作成フェーズ。Phase 1の設計に基づき、frontmatter作成、ワークフロー記述、リファレンス作成を実施する。結果はPhase 3（品質検証）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - skill-creator         # チーム共通: スキル作成ガイドライン
members:
  - id: frontmatter-author
    role: Frontmatter Author
    description: "Frontmatter作成担当。name、description、skills、tools等のfrontmatterを作成する。"
    enabled: true
  - id: workflow-author
    role: Workflow Author
    description: "ワークフロー作成担当。スキルの使用手順、ベストプラクティスを記述する。"
    enabled: true
  - id: reference-author
    role: Reference Author
    description: "リファレンス作成担当。関連リソース、テンプレート、例へのリンクを作成する。"
    enabled: true
---

# Skill Creation - Phase 2: Authoring

## チームミッション

Skill CreationのPhase 2（SKILL.md作成）を担当。Phase 1（skill-creation-p1）の設計に基づきSKILL.mdを作成する。

**前提:** Phase 1の設計結果を受け取っていること。

**出力:** 作成したSKILL.mdは Phase 3（skill-creation-p3）に引き継がれる。

## Output Format

```
SUMMARY: [作成サマリー]
CLAIM: [SKILL.mdが完成したか]
EVIDENCE: [作成した内容]
CONFIDENCE: [0.00-1.00]
RESULT:
## 作成したSKILL.md
```markdown
---
name: [...]
description: [...]
---

# [スキル名]
[内容]
```
NEXT_STEP: Phase 3（skill-creation-p3）で品質検証
```
