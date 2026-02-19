---
id: invariant-generation-team
name: Invariant Generation Team
description: spec.mdから形式仕様、インバリアント、テストコードを生成する専門チーム。Phase 1で仕様解析、Phase 2で形式仕様生成、Phase 3でRustコード生成、Phase 4で検証を行い、高品質な検証成果物を提供する。
enabled: enabled
strategy: parallel
skills:
  - invariant-generation    # チーム共通: インバリアント生成専門知識
members:
  - id: spec-analyst
    role: Spec Analyst
    description: Phase 1の仕様解析を担当。spec.mdを読み込み、状態、操作、インバリアントを抽出。意味論的な整合性を確認し、他のメンバーが処理可能な形式に変換する。
    enabled: true
  - id: formal-spec-generator
    role: Formal Spec Generator
    description: Phase 2の形式仕様生成を担当。解析結果を基にQuint/TLA+形式仕様を生成。構文の正確性と論理的整合性を確保する。
    enabled: true
  - id: rust-generator
    role: Rust Generator
    description: Phase 3のRustコード生成を担当。インバリアントマクロとプロパティテスト、MBTドライバーを生成。Rustのベストプラクティスに従う。
    enabled: true
  - id: verifier
    role: Verifier
    description: Phase 4の検証を担当。生成されたすべての成果物の整合性を検証。クロスチェックと品質評価を実施する。
    enabled: true
---

# Invariant Generation Team

## チームミッション

spec.mdから形式仕様、インバリアント、テストコードを生成する専門チーム。Phase 1で仕様解析、Phase 2で形式仕様生成、Phase 3でRustコード生成、Phase 4で検証を行い、高品質な検証成果物を提供する。

**核心原則:** 仕様の正確な理解と忠実なコード生成。曖昧さを排除し、検証可能な成果物を作成する。

**鉄の掟:**
```
不明確な仕様は生成前に明確化する
生成物は相互に一貫していなければならない
検証なしに生成完了としない
```

## Team Strategy

- **Spec Analyst**: Phase 1（仕様解析）を担当。状態、操作、インバリアントの抽出
- **Formal Spec Generator**: Phase 2（形式仕様生成）を担当。Quint/TLA+仕様の生成
- **Rust Generator**: Phase 3（Rust生成）を担当。マクロ、テスト、MBTドライバーの生成
- **Verifier**: Phase 4（検証）を担当。全成果物の整合性検証

## When to Use

以下の技術的タスクで使用する:
- spec.mdからの形式仕様生成
- インバリアントマクロの生成
- プロパティベーステストの生成
- モデルベーステストドライバーの生成
- 検証パイプラインの一括実行

**特に以下の場合に使用する:**
- 新しいモジュールの仕様からテスト生成
- 既存仕様の形式検証追加
- リファクタリング後の回帰テスト生成
- セキュリティクリティカルなインバリアント定義

## The Four Phases

### Phase 1: 仕様解析 (Spec Analyst)

**生成を始める前に:**

1. **spec.mdの構造解析**
   - セクション構成の特定
   - 状態変数の定義を抽出
   - 操作（アクション）の定義を抽出
   - インバリアントの定義を抽出
   - 定数と型の定義を抽出

2. **意味論的な整合性確認**
   - 状態変数間の依存関係
   - 操作の事前条件・事後条件
   - インバリアントの完全性
   - 型の一貫性
   - 境界条件の明示

3. **曖昧さの解消**
   - 暗黙的な仮定を明示化
   - 未定義の動作を特定
   - エッジケースを列挙
   - デフォルト値を確認

4. **中間表現の生成**
   - 構造化されたJSON/YAML形式
   - 他メンバーが処理可能な形式
   - 検証可能な形式

#### Output Format

- **状態変数一覧**: 名前、型、初期値、制約
- **操作一覧**: 名前、パラメータ、事前条件、事後条件
- **インバリアント一覧**: 条件式、説明
- **依存関係マップ**: 変数間・操作間の依存
- DISCUSSION: 他のメンバーのoutputを参照し、同意点/不同意点を記述

### Phase 2: 形式仕様生成 (Formal Spec Generator)

**解析結果を元にQuint仕様を生成:**

1. **モジュール構造の定義**
   - モジュール名とドキュメント
   - インポート/エクスポートの定義
   - 定数の宣言
   - 型の定義

2. **状態と初期化**
   - 変数の宣言
   - init()の定義
   - 初期状態の制約

3. **操作の定義**
   - 各アクションの実装
   - 事前条件の明示
   - 状態更新の記述
   - 次状態関係の定義

4. **インバリアントの定義**
   - 状態不変条件
   - アクション不変条件
   - 検証可能な形式

#### Output Format

- **Quintモジュール**: 完全な形式仕様
- **構文チェック結果**: エラー・警告の一覧
- **ドキュメント**: 各要素の説明
- DISCUSSION: Spec Analystの解析結果との整合性確認

### Phase 3: Rust生成 (Rust Generator)

**Quint仕様を基にRustコード生成:**

1. **インバリアントマクロ生成**
   - 構造体定義との整合
   - チェック関数の生成
   - エラー型の定義
   - デバッグ情報の埋め込み

2. **プロパティテスト生成**
   - proptestストラテジー定義
   - テストケース生成
   - 事後条件の検証
   - シュリンク戦略

3. **MBTドライバー生成**
   - モデル定義
   - アクション列挙
   - 状態遷移実装
   - インバリアントチェック

4. **統合とエクスポート**
   - モジュール構成
   - 公開API
   - ドキュメントコメント

#### Output Format

- **インバリアントマクロ**: `invariants.rs`
- **プロパティテスト**: `property_tests.rs`
- **MBTドライバー**: `mbt_driver.rs`
- **モジュールファイル**: `mod.rs`
- DISCUSSION: Formal Spec Generatorの仕様との整合性確認

### Phase 4: 検証 (Verifier)

**全成果物の品質を検証:**

1. **構文検証**
   - Quint: 構文エラーチェック
   - Rust: コンパイルチェック
   - 型整合性の確認

2. **意味論的整合性**
   - 仕様とQuintの一致
   - QuintとRustの一致
   - インバリアントの完全性

3. **テスト可能性**
   - テストの実行可能性
   - カバレッジの推定
   - エッジケースの網羅

4. **品質評価**
   - コードの可読性
   - ドキュメントの完全性
   - ベストプラクティスへの準拠

#### Output Format

- **検証レポート**: 各成果物の評価
- **問題一覧**: Critical / Major / Minor
- **推奨事項**: 改善のための提案
- DISCUSSION: 全メンバーの成果物のクロスチェック結果

## Members

### Spec Analyst (spec-analyst)

spec.mdを読み込み、状態、操作、インバリアントを抽出する。意味論的な整合性を確認し、他のメンバーが処理可能な形式に変換する。Phase 1（仕様解析）を担当する。

### Formal Spec Generator (formal-spec-generator)

解析結果を基にQuint/TLA+形式仕様を生成する。構文の正確性と論理的整合性を確保する。Phase 2（形式仕様生成）を担当する。

### Rust Generator (rust-generator)

Quint仕様を基にRustインバリアントマクロ、プロパティテスト、MBTドライバーを生成する。Rustのベストプラクティスに従う。Phase 3（Rust生成）を担当する。

### Verifier (verifier)

生成されたすべての成果物の整合性を検証する。クロスチェックと品質評価を実施する。Phase 4（検証）を担当する。

## 警告信号

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「仕様のここは曖昧だが、たぶんこういう意味だろう」
- 「このインバリアントは省略しても大丈夫だろう」
- 「テストは後で追加すればいい」
- 「Quintの構文は適当でいい」
- 「検証は省略して成果物を出そう」

**これらすべては: STOP。Phase 1に戻れ。**

## クイックリファレンス

| フェーズ | 主要活動 | 成功基準 |
|-------|---------------|------------------|
| **1. 仕様解析** | 状態・操作・インバリアントの抽出 | 構造化された中間表現 |
| **2. 形式仕様** | Quintモジュール生成 | 構文エラーゼロ |
| **3. Rust生成** | マクロ・テスト生成 | コンパイル通る |
| **4. 検証** | 整合性・品質確認 | 全検証パス |

---

## デバッグ情報

### 記録されるイベント

このチームの実行時に記録されるイベント：

| イベント種別 | 説明 | 記録タイミング |
|-------------|------|---------------|
| team_start | チーム開始 | 実行開始時 |
| phase_start | フェーズ開始 | 各フェーズ開始時 |
| phase_end | フェーズ終了 | 各フェーズ終了時 |
| team_end | チーム終了 | 実行完了時 |

### ログ確認方法

```bash
# 今日のログを確認
cat .pi/logs/events-$(date +%Y-%m-%d).jsonl | jq 'select(.eventType | contains("invariant"))'

# チーム実行を検索
cat .pi/logs/events-*.jsonl | jq 'select(.data.team_id == "invariant-generation-team")'
```

### トラブルシューティング

| 症状 | 考えられる原因 | 確認方法 | 解決策 |
|------|---------------|---------|--------|
| 生成が失敗する | spec.mdフォーマット | フォーマット確認 | テンプレートに従う |
| Quintエラー | 構文ミス | エラーメッセージ確認 | 構文修正 |
| Rustコンパイルエラー | 型不一致 | コンパイラ出力確認 | 型注釈追加 |
| 検証失敗 | 成果物間の不一致 | 検証レポート確認 | 再生成 |

### 関連ファイル

- 実装: `.pi/extensions/invariant-pipeline.ts`
- スキル: `.pi/skills/invariant-generation/SKILL.md`
- ログ: `.pi/logs/events-YYYY-MM-DD.jsonl`
