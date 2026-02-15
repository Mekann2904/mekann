---
id: skill-creation-p2
name: Skill Creation - Phase 2 Authoring
description: "Skill Creation Phase 2: SKILL.md作成フェーズ。Phase 1の設計に基づき、frontmatter作成、ワークフロー記述、リファレンス作成を実施する。結果はPhase 3（品質検証）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - skill-creator
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
triggers:
  - "Phase 1の設計書が完成している"
  - "スキル名、目的、構造が決定済み"
skip_conditions:
  - "Phase 1が未完了"
  - "設計書に不明点がある"
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

## When to Use

**このフェーズを使用する:**
- Phase 1の設計書が完成している
- スキル名、目的、構造が決定済み
- SKILL.mdの実装準備が整っている

**このフェーズをスキップすべきでない場合:**
- 設計書の内容が不明確
- frontmatterの必須項目が未定義
- ワークフローのステップが決まっていない

## 警告信号 - プロセスの遵守を促す

| 警告信号 | 何をすべきか |
|---------|-------------|
| 「frontmatterは後で埋める」 | 必須項目を即座に記述 |
| 「ワークフローは適当でいい」 | 番号付きステップで明確に記述 |
| 「リファレンスは省略する」 | 必要な参照を洗い出し作成 |
| 「Phase 1の設計を見ていない」 | 設計書を必ず確認してから作成 |
| 「テンプレートを使わない」 | Agent Skills標準のテンプレートを適用 |

## 人間のパートナーの「やり方が間違っている」シグナル

| シグナル | 意味 | 推奨アクション |
|---------|------|---------------|
| 「frontmatterの書き方がわからない」 | 標準理解不足 | skill-creatorスキルを参照 |
| 「ワークフローが長すぎる」 | 複雑すぎる | ステップを分割・簡素化 |
| 「リンクが切れている」 | 相対パスエラー | パスを確認・修正 |
| 「構造が設計と違う」 | 設計逸脱 | Phase 1に戻って確認 |
| 「descriptionが長すぎる」 | 文字数超過 | 1024文字以内に収める |

## よくある言い辞

| 言い辞 | なぜ危険か | 正しいアプローチ |
|-------|-----------|-----------------|
| 「とりあえず書いてから直す」 | 品質低下 | 設計書に基づき正確に記述 |
| 「リンクは適当でいい」 | 参照不可能 | 相対パスで正確に記述 |
| 「フロントマターは省略可能」 | 標準違反 | 必須項目を必ず記述 |
| 「英語で書けばいい」 | 一貫性不足 | プロジェクトの言語方針に従う |
| 「拡張子は何でもいい」 | 認識問題 | .mdファイルとして作成 |

## 鉄の掟

```
設計書に基づかないSKILL.mdを作成しない
必須frontmatter項目を省略しない
相対パス以外の参照を使用しない
```
