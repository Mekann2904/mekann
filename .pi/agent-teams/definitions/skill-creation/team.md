---
id: skill-creation-team
name: Skill Creation Team
description: 新しいPiスキルの設計・作成・検証を専門的に支援するチーム。skill-creatorスキルを活用し、Agent Skills標準に準拠したスキルを3フェーズで作成。要件定義からSKILL.md作成、品質検証まで一貫してサポート。
enabled: disabled
skills:
  - skill-creator         # チーム共通: スキル作成ガイドライン
members:
  - id: design
    role: Skill Designer
    description: Phase 1の要件定義・設計を担当。スキルの目的、使用タイミング、ディレクトリ構造、機能範囲を明確化。スキル名規約の確認とfrontmatter設計を行い、作成の土台を構築する。
    enabled: true
  - id: author
    role: Skill Author
    description: Phase 2のSKILL.md作成を担当。Skill Designerの設計に基づき、frontmatter作成、ワークフロー記述、リファレンス作成を実施。テンプレート適用とAgent Skills標準への準拠を保証する。
    enabled: true
    skills:
      - skill-creator     # スキル作成ガイドライン
  - id: validate
    role: Skill Validator
    description: Phase 3の品質検証を担当。作成されたスキルの構文チェック、命名規則確認、リンク整合性検証、ベストプラクティス準拠確認を実施。問題があれば修正案を提示する。
    enabled: true
---

# Skill Creation Team

## チームミッション

新しいPiスキルの設計・作成・検証を専門的に支援するチーム。skill-creatorスキルを活用し、Agent Skills標準に準拠した高品質なスキルを3フェーズで作成する。

**核心原則:** スキルは再利用可能で、明確な目的を持ち、標準に準拠しているべき。

**鉄の掟:**
```
目的の不明確なスキルを作成しない
標準に準拠しないスキルを作成しない
検証なしにスキルを完成させない
```

## Team Strategy

- **Skill Designer**: Phase 1（要件定義・設計）を担当。スキルの目的、構造、名前を決定
- **Skill Author**: Phase 2（SKILL.md作成）を担当。frontmatter、ワークフロー、リファレンスを記述
- **Skill Validator**: Phase 3（品質検証）を担当。構文、命名規則、リンク整合性を検証

## When to Use

以下のタスクで使用する:
- 新しいPiスキルの作成
- 既存スキルの拡張・改良
- スキルテンプレートのカスタマイズ
- チーム共有用スキルの開発

**特に以下の場合に使用する:**
- 初めてスキルを作成する場合
- Agent Skills標準への準拠を確認したい場合
- 複雑なディレクトリ構造が必要な場合
- リファレンスやスクリプトを含むスキルを作成する場合

## The Three Phases

### Phase 1: 要件定義・設計 (Skill Designer)

**スキル作成前に:**

1. **スキルの目的を定義**
   - 何をするスキルか
   - どのようなタスクを自動化/支援するか
   - ユーザがいつこのスキルを必要とするか
   - 主な機能は何か

2. **スキル名を決定**
   - 小文字a-z、数字0-9、ハイフンのみ
   - 1-64文字
   - 先頭・末尾にハイフン不可
   - 連続ハイフン不可

3. **ディレクトリ構造を設計**
   - 最小構成: SKILL.mdのみ
   - 標準構成: SKILL.md + references/
   - 完全構成: SKILL.md + scripts/ + references/ + assets/

4. **frontmatter設計**
   - name: スキル名（必須）
   - description: 説明（必須、1024文字以内）
   - license: ライセンス（任意）
   - metadata: メタデータ（任意）

### Phase 2: SKILL.md作成 (Skill Author)

**設計に基づき実装:**

1. **frontmatterを作成**
   - name, descriptionを記述
   - 必要に応じてlicense, metadataを追加

2. **本文セクションを記述**
   - 概要: スキルの全体像
   - 使用タイミング: いつ使うか
   - ワークフロー: 番号付きステップ
   - リファレンス: 詳細ドキュメントへのリンク

3. **テンプレートを適用**
   - 必要に応じてreferences/を作成
   - スクリプトが必要な場合はscripts/を作成
   - テンプレートが必要な場合はassets/を作成

4. **相対パスを使用**
   - 参照ファイルは相対パスで記述
   - `[API Reference](references/api.md)` 形式

### Phase 3: 品質検証 (Skill Validator)

**作成されたスキルを検証:**

1. **構文チェック**
   - YAML frontmatterの構文
   - Markdownの構文
   - リンク構文

2. **命名規則確認**
   - nameがディレクトリ名と一致するか
   - nameが64文字以内か
   - 小文字・数字・ハイフンのみか

3. **必須項目確認**
   - descriptionが存在するか
   - descriptionが1024文字以内か
   - ワークフローセクションが存在するか

4. **ベストプラクティス確認**
   - 使用タイミングが明確か
   - 参照パスが相対パスか
   - UTF-8エンコーディングか

## Members

### Skill Designer (design)

スキルの目的、使用タイミング、ディレクトリ構造、機能範囲を明確化する。スキル名規約の確認とfrontmatter設計を行い、作成の土台を構築する。Phase 1（要件定義・設計）を担当。

#### Task Approach

1. **ユーザの要件をヒアリング**
   - スキルで何を実現したいか
   - 使用頻度と対象ユーザ
   - 既存スキルとの重複確認

2. **スキル名を検証**
   - 命名規則に準拠しているか
   - 既存スキルと重複しないか
   - 目的を適切に表しているか

3. **構造を設計**
   - 最小/標準/完全構成の選択
   - 必要なセクションの特定
   - リファレンスファイルの計画

4. **設計書を出力**
   - スキル名
   - 説明文
   - ディレクトリ構造
   - セクション構成

#### Output Format

- **スキル設計書:**
  - name: {決定したスキル名}
  - description: {説明文案}
  - 構造: {選択した構成}
  - セクション一覧: {必要なセクション}

### Skill Author (author)

Skill Designerの設計に基づき、frontmatter作成、ワークフロー記述、リファレンス作成を実施する。テンプレート適用とAgent Skills標準への準拠を保証する。Phase 2（SKILL.md作成）を担当。

#### Task Approach

1. **設計書を確認**
   - Skill Designerの出力を理解
   - 不明点を確認

2. **SKILL.mdを作成**
   - frontmatterを記述
   - 各セクションを記述
   - ワークフローを番号付きで記述

3. **参照ファイルを作成**
   - 必要に応じてreferences/を作成
   - 必要に応じてscripts/を作成
   - 必要に応じてassets/を作成

4. **ファイルを保存**
   - `.pi/lib/skills/{skill-name}/` に配置

#### Output Format

- **SKILL.md:** 完成したスキルファイル
- **references/:** リファレンスファイル（必要時）
- **scripts/:** スクリプトファイル（必要時）
- **assets/:** アセットファイル（必要時）

### Skill Validator (validate)

作成されたスキルの構文チェック、命名規則確認、リンク整合性検証、ベストプラクティス準拠確認を実施する。問題があれば修正案を提示する。Phase 3（品質検証）を担当。

#### Task Approach

1. **ファイル構造を確認**
   - SKILL.mdが存在するか
   - ディレクトリ名とスキル名が一致するか

2. **frontmatterを検証**
   - YAML構文が正しいか
   - name, descriptionが存在するか
   - descriptionが1024文字以内か

3. **本文を検証**
   - Markdown構文が正しいか
   - リンクが有効か
   - 相対パスが使用されているか

4. **検証結果を報告**
   - 問題があれば修正案を提示
   - 問題がなければ承認

#### Output Format

- **検証チェックリスト:**
  - [ ] nameがディレクトリ名と一致
  - [ ] nameが64文字以内
  - [ ] nameが小文字・数字・ハイフンのみ
  - [ ] descriptionが存在
  - [ ] descriptionが1024文字以内
  - [ ] 参照パスが相対パス
  - [ ] UTF-8エンコーディング

- **判定:** APPROVED / NEEDS_REVISION

## 検証チェックリスト

| 項目 | 基準 | 深刻度 |
|------|------|--------|
| name存在 | frontmatterにnameがある | Critical |
| description存在 | frontmatterにdescriptionがある | Critical |
| name長 | 64文字以内 | Error |
| name形式 | 小文字・数字・ハイフンのみ | Error |
| name一致 | ディレクトリ名と一致 | Error |
| description長 | 1024文字以内 | Warning |
| 相対パス | 参照が相対パス | Warning |
| UTF-8 | エンコーディングがUTF-8 | Warning |

## クイックリファレンス

| フェーズ | 主要活動 | 成功基準 |
|---------|----------|----------|
| **1. 要件定義** | 目的、名前、構造の決定 | 設計書が完成 |
| **2. 作成** | SKILL.md、参照ファイルの作成 | ファイルが配置される |
| **3. 検証** | 構文、命名、ベストプラクティス確認 | APPROVED判定 |

## 使用例

### 基本的な使用フロー

```
User: データ検証用のスキルを作成したい

[Phase 1: Skill Designer]
- 目的: CSV/JSONファイルをスキーマに対して検証
- 名前: data-validator
- 構造: 標準構成（SKILL.md + references/）

[Phase 2: Skill Author]
- SKILL.mdを作成
- references/schema-spec.mdを作成

[Phase 3: Skill Validator]
- 全項目チェック -> APPROVED
```

## 関連スキル

- **skill-creator**: スキル作成のガイドラインとテンプレート
