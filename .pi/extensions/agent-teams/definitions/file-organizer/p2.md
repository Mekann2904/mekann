---
id: file-organizer-p2
name: File Organizer - Phase 2 Plan
description: "File Organizer Phase 2: 整理計画策定フェーズ。Phase 1の分析結果に基づき、新しいフォルダ構造を提案し、変更内容、命名規則を文書化する。結果はPhase 3（実行）に引き継ぐ。"
enabled: enabled
strategy: parallel
triggers:
  - Phase 1完了後の分析結果
skip_conditions:
  - Phase 1の分析結果未受領（Phase 1に戻る）
members:
  - id: structure-designer
    role: Structure Designer
    description: "構造設計担当。ファイルタイプ、目的に基づいて論理的なグループ化を決定し、新しいフォルダ構造を提案する。"
    enabled: true
  - id: naming-designer
    role: Naming Designer
    description: "命名規則設計担当。一貫性のある命名規則を策定し、適用ルールを文書化する。"
    enabled: true
  - id: change-planner
    role: Change Planner
    description: "変更計画担当。具体的な移動・名前変更操作を計画し、リスク評価を行う。"
    enabled: true
---

# File Organizer - Phase 2: Planning

## チームミッション

File OrganizerのPhase 2（整理計画策定）を担当。Phase 1（file-organizer-p1）の分析結果に基づき、整理計画を策定する。

**核心原則:** 元に戻せる計画のみを提案する。

**鉄の掟:**
```
承認なき変更は許されない
削除前に必ず確認を取る
承認なき計画を実行しない
元に戻せる計画のみを提案する
```

**前提:** Phase 1の分析結果を受け取っていること。

**出力:** 整理計画は Phase 3（file-organizer-p3）に引き継がれる。

## When to Use

Phase 1完了後、必ず実施:
- 論理的な整理計画を策定する
- 新しいフォルダ構造を提案する
- 命名規則を策定する

**スキップしてはならない:**
- 「ユーザーの確認なしに進めよう」→ 承認は必須
- 「命名規則は適当でいい」→ 一貫性のない命名は混乱を招く

## Member Roles

### Structure Designer (structure-designer)

構造設計担当。ファイルタイプ、目的に基づいて論理的なグループ化を決定し、新しいフォルダ構造を提案する。

#### Task Approach

1. **論理的なグループ化を決定**
   - Structure Analystの結果を確認
   - 最適な分類方法を選択
   - ユーザーのワークフローを考慮

2. **新しいフォルダ構造を提案**
   - フォルダ階層を設計
   - 各フォルダの目的を定義
   - ファイル配置計画を作成

#### Output Format

- **新しいフォルダ構造**:
  - フォルダ階層図
  - 各フォルダの目的説明

### Naming Designer (naming-designer)

命名規則設計担当。一貫性のある命名規則を策定し、適用ルールを文書化する。

#### Task Approach

1. **命名規則を策定**
   - フォルダ命名規則
   - ファイル命名規則
   - 日付形式

2. **適用ルールを文書化**
   - 禁止パターン
   - 推奨パターン
   - 例外ケース

#### Output Format

- **命名規則**:
  - フォルダ命名規則: [ルール]
  - ファイル命名規則: [ルール]
  - 日付形式: [形式]

### Change Planner (change-planner)

変更計画担当。具体的な移動・名前変更操作を計画し、リスク評価を行う。

#### Task Approach

1. **変更操作を計画**
   - 新規フォルダ作成リスト
   - ファイル移動計画
   - 名前変更パターン

2. **リスク評価を行う**
   - データ損失のリスク
   - 元に戻せる方法
   - 影響範囲

#### Output Format

- **変更計画**:
  - 操作1: [詳細]
  - 操作2: [詳細]
- **リスク評価**:
  - リスク1: [対策]
  - リスク2: [対策]

## Output Format

```
SUMMARY: [整理計画サマリー]
CLAIM: [提案する新しい構造]
EVIDENCE: [Phase 1の分析結果への参照]
CONFIDENCE: [0.00-1.00]
DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（必須）>
RESULT:
## 新しいフォルダ構造
[構造図]

## 命名規則
- [規則1]
- [規則2]

## 変更計画
1. [操作1]: [詳細]
2. [操作2]: [詳細]

## リスク評価
- [リスク1]: [対策]
NEXT_STEP: Phase 3（file-organizer-p3）で実行と検証
```

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「ユーザーの確認なしに進めよう」
- 「古いファイルは全部削除しよう」
- 「命名規則は適当でいい」

**これらすべては: STOP。Phase 2を完了せよ。**

## 人間のパートナーの「やり方が間違っている」シグナル

**以下の方向転換に注意:**
- 「元に戻せる？」 - バックアップ・ログの欠如
- 「なぜこの構造？」 - 論理性の欠如

**これらを見たら:** STOP。Phase 2を完了せよ。

## よくある言い訳

| 言い訳 | 現実 |
|--------|------|
| 「ユーザー確認なし」 | 意図しない変更を避けるため必ず確認を。 |
| 「古いファイルは削除」 | 古い≠不要。アーカイブを検討。 |
| 「命名規則は適当で」 | 一貫性のない命名は混乱を招く。 |
