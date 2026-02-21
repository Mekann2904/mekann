---
title: テスト戦略
category: development
audience: developer
last_updated: 2026-02-21
tags: [testing, strategy, vitest, fast-check]
related: [./04-testing.md, ../02-user-guide/01-extensions.md]
---

# テスト戦略

> パンくず: [Home](../../README.md) > [Developer Guide](./) > テスト戦略

このドキュメントでは、mekannプロジェクトの包括的なテスト戦略について説明します。test-engineeringスキルのガイドラインに基づき、テストピラミッドを設計し、高速で信頼性が高く、メンテナンス性に優れたテストポートフォリオを構築します。

## テスト戦略の目的

1. **リグレッション検出**: 既存機能の破損を早期に検出
2. **迅速なフィードバック**: 高速テストで開発サイクルを加速
3. **リファクタリングの安心感**: テスト網羅性で安全なコード変更を支援
4. **品質の可視化**: カバレッジ指標で品質状況を把握

## テストピラミッド

### 基本構造

```
        ┌─────────────────┐
        │   E2Eテスト     │  ← 2-5%、重要なユーザージャーニーのみ
        ├─────────────────┤
        │  統合・契約テスト │  ← 15-25%、拡張機能間の連携
        ├─────────────────┤
        │   単体テスト     │  ← 70-85%、大多数を占める
        └─────────────────┘
```

### 重要原則

1. **異なる粒度レベルでテストを記述する**
2. **テストの抽象度が高くなるほど、作成すべきテスト数は減少する**
3. **重複を避ける**: 上位テストで検出したエラーは下位テストで再現
4. **可能な限り下位層でテストする**

## テスト対象の分析

### ファイル数の概要

| カテゴリ | ファイル数 | 既存テスト | 未テスト |
|---------|-----------|-----------|---------|
| 拡張機能 (.pi/extensions) | 75 | 2 | 73 |
| ライブラリ (.pi/lib) | 77 | 13 | 64 |
| 合計 | 152 | 15 | 137 |

### テスト優先順位

#### 優先度P0（最重要）

| モジュール | 重要性 | 理由 | 推奨テスト数 |
|----------|--------|------|------------|
| .pi/lib/agent-common.ts | 高 | エージェント実行の共通設定 | 10-15 |
| .pi/lib/comprehensive-logger.ts | 高 | システム全体のログ記録 | 20-30 |
| .pi/lib/dynamic-tools/registry.ts | 高 | 動的ツールの管理 | 15-20 |
| .pi/lib/dynamic-tools/safety.ts | 高 | コード安全性検証 | 10-15 |
| .pi/lib/embeddings/utils.ts | 中 | ベクトル演算ユーティリティ（既存テストあり） | - |

#### 優先度P1（重要）

| モジュール | 重要性 | 理由 | 推奨テスト数 |
|----------|--------|------|------------|
| .pi/lib/agent-utils.ts | 中 | エージェントユーティリティ（既存テストあり） | - |
| .pi/lib/error-utils.ts | 中 | エラーユーティリティ（既存テストあり） | - |
| .pi/lib/validation-utils.ts | 中 | バリデーションユーティリティ（既存テストあり） | - |
| .pi/lib/format-utils.ts | 中 | フォーマットユーティリティ（既存テストあり） | - |
| .pi/lib/fs-utils.ts | 中 | ファイルシステムユーティリティ（既存テストあり） | - |
| .pi/lib/concurrency.ts | 中 | 並行性制御 | 15-20 |
| .pi/lib/adaptive-penalty.ts | 中 | 適応的ペナルティ制御 | 10-15 |
| .pi/extensions/subagents.ts | 高 | サブエージェント実行 | 30-40 |
| .pi/extensions/agent-teams/extension.ts | 高 | エージェントチーム調整 | 40-50 |
| .pi/extensions/dynamic-tools.ts | 中 | 動的ツール拡張機能 | 20-25 |
| .pi/extensions/loop.ts | 中 | 自律タスクループ実行 | 15-20 |

#### 優先度P2（中程度）

| モジュール | 重要性 | 理由 | 推奨テスト数 |
|----------|--------|------|------------|
| .pi/lib/abort-utils.ts | 中 | 中断ユーティリティ | 10-15 |
| .pi/lib/runtime-error-builders.ts | 中 | ランタイムエラー構築 | 10-15 |
| .pi/lib/output-validation.ts | 中 | 出力バリデーション | 10-15 |
| .pi/lib/semantic-memory.ts | 中 | セマンティックメモリ | 15-20 |
| .pi/lib/text-parsing.ts | 中 | テキスト解析 | 10-15 |
| .pi/extensions/question.ts | 中 | ユーザー選択UI | 15-20 |
| .pi/extensions/plan.ts | 中 | プラン管理 | 15-20 |
| .pi/extensions/search/index.ts | 中 | コード検索 | 20-25 |

#### 優先度P3（低優先度）

以下のモジュールは、定数・型定義のみ、または簡易な機能を提供するため、優先度を下げる：

| モジュール | 理由 |
|----------|------|
| .pi/lib/agent-types.ts | 型定義のみ |
| .pi/lib/comprehensive-logger-config.ts | 定数・型定義のみ |
| .pi/lib/comprehensive-logger-types.ts | 型定義のみ |
| .pi/lib/dynamic-tools/types.ts | 型定義のみ |
| .pi/lib/embeddings/types.ts | 型定義のみ |
| .pi/extensions/code-panel.ts | UI表示（E2Eテストで対応） |
| .pi/extensions/code-viewer.ts | UI表示（E2Eテストで対応） |

## テストレイヤー詳細

### 1. 単体テスト（Unit Tests）

テストスイートの基盤。最も狭いスコープで、最も多数のテスト。

#### 特徴

- 高速実行（数千テストを数分で）
- 外部依存をスタブ化・フェイク化
- 1つの生産クラスにつき1つのテストクラス

#### テスト構造（AAA）

```typescript
test('should_return_success_for_valid_input', () => {
  // Arrange（準備）
  const input = 'valid input';
  const expected = 'expected output';

  // Act（実行）
  const result = functionUnderTest(input);

  // Assert（確認）
  expect(result).toBe(expected);
});
```

#### プロパティベーステスト

fast-checkを使用して、ランダム生成された多数の入力でプロパティを検証。

```typescript
test('PBT: 可逆性: decode(encode(x)) === x', () => {
  fc.assert(
    fc.property(
      fc.string(),
      (input) => {
        const encoded = encode(input);
        const decoded = decode(encoded);
        return decoded === input;
      }
    ),
    { numRuns: 100 }
  );
});
```

#### モック/スタブの使用方針

| 依存関係 | 優先度 | 理由 |
|---------|-------|------|
| 実際の実装 | 優先度1 | 最高の忠実度 |
| フェイク | 優先度2 | 高い忠実度、高速 |
| モック | 優先度3 | 低い忠実度、稀なエラー条件のみ |

#### 何をテストすべきか

- 公開インターフェースをテスト
- エッジケースを含むすべての非自明なコードパス
- エラーハンドリングと例外処理

#### 避けるべきこと

- 実装詳細への過度な依存
- プライベートメソッドの直接テスト
- 単純なコード（ゲッター/セッター等）

### 2. 統合テスト（Integration Tests）

外部コンポーネントとの連携を検証。

#### 対象

- ファイルシステム連携
- 外部API連携
- 拡張機能間の連携
- ランタイムとの連携

#### 原則

- 各統合ポイントを個別にテスト（狭域統合テスト）
- ローカル環境で外部依存を動作させる
- フェイク実装を優先的に使用

### 3. E2Eテスト（End-to-End Tests）

完全に統合されたシステム全体をテスト。

#### 特徴

- 最高の信頼性
- 実行が遅い
- メンテナンスコストが高い

#### 原則

- **最も価値のあるユーザージャーニーのみをテスト**
- 可能な限り最小限に抑える（2-5%）
- 下位層でカバー済みの条件を再テストしない

#### 例

```typescript
// サブエージェント作成→実行→結果確認
test('E2E: should create and execute subagent successfully', async () => {
  // Arrange
  const task = 'Calculate sum of 1 and 2';

  // Act
  const result = await subagentRun(task);

  // Assert
  expect(result.summary).toContain('3');
});
```

## テスト作成のベストプラクティス

### 1. 命名規則

```
[メソッド名]_[シナリオ条件]_[期待動作]
```

例:
- `calculateSum_withPositiveNumbers_returnsCorrectSum`
- `createSubagent_withValidInput_returnsSuccess`

### 2. テストの分離

```typescript
// 良い例: ヘルパーメソッド（明示的）
test('should add numbers', () => {
  const calculator = createDefaultCalculator();
  expect(calculator.add('0,1')).toBe(1);
});

function createDefaultCalculator(): Calculator {
  return new Calculator();
}
```

### 3. 単一Actタスク

```typescript
// 良い例: パラメータ化で分離
test.each([
  ['', 0],
  [',', 0],
])('should treat "%s" as zero', (input, expected) => {
  expect(add(input)).toBe(expected);
});
```

### 4. テストコードの品質

- **DAMP（Descriptive And Meaningful Phrases）を優先**: テストでは「読みやすさ」を優先し、重複があっても構わない
- **最小限の条件でパス**: テスト入力は、検証に必要な最小限の情報にする
- **マジックストリングを避ける**: コメントや定数で意図を明確化する

## カバレッジ目標

### Googleのガイドライン（採用）

| カバレッジ率 | 評価 | 目標 |
|-------------|------|------|
| 60% | 許容範囲 | 最低限の水準 |
| 75% | 称賛に値する | 短期目標 |
| 90% | 模範的 | 長期目標 |

### フェーズごとの目標

| フェーズ | 期間 | カバレッジ目標 |
|---------|------|--------------|
| フェーズ1 | 初回 | 60% |
| フェーズ2 | 2週間後 | 70% |
| フェーズ3 | 1ヶ月後 | 75% |
| フェーズ4 | 3ヶ月後 | 80% |

### 重要な原則

1. **カバレッジ≠品質**: 高いカバレッジが高品質なテストを保証しない
2. **低いカバレッジ＝高リスク**: テスト不足は確実にリスクを示す
3. **未カバー部分が重要**: カバレッジ分析の真価は、カバーされていない部分を特定すること

## 実装計画

### フェーズ1: 単体テストの基盤構築（優先度P0）

**期間**: 初回〜2週間
**目標**: 重要なライブラリの単体テストを作成

| タスク | 優先度 | 責任者 | 期限 |
|-------|-------|--------|------|
| .pi/lib/agent-common.tsの単体テスト | P0 | unit-test-writer | 初回 |
| .pi/lib/comprehensive-logger.tsの単体テスト | P0 | unit-test-writer | 初回 |
| .pi/lib/dynamic-tools/registry.tsの単体テスト | P0 | unit-test-writer | 初回 |
| .pi/lib/dynamic-tools/safety.tsの単体テスト | P0 | unit-test-writer | 初回 |

### フェーズ2: 拡張機能の単体テスト（優先度P1）

**期間**: 2週間〜1ヶ月
**目標**: 主要な拡張機能の単体テストを作成

| タスク | 優先度 | 責任者 | 期限 |
|-------|-------|--------|------|
| .pi/extensions/subagents.tsの単体テスト | P1 | unit-test-writer | 2週間 |
| .pi/extensions/agent-teams/extension.tsの単体テスト | P1 | unit-test-writer | 2週間 |
| .pi/extensions/dynamic-tools.tsの単体テスト | P1 | unit-test-writer | 2週間 |
| .pi/extensions/loop.tsの単体テスト | P1 | unit-test-writer | 3週間 |

### フェーズ3: 統合テストの実装（優先度P1-P2）

**期間**: 1ヶ月〜2ヶ月
**目標**: 拡張機能間の統合テストを作成

| タスク | 優先度 | 責任者 | 期限 |
|-------|-------|--------|------|
| subagentsとdynamic-toolsの統合テスト | P1 | integration-test-writer | 1ヶ月 |
| agent-teamsとsubagentsの統合テスト | P1 | integration-test-writer | 1ヶ月 |
| embeddingsとsemantic-memoryの統合テスト | P2 | integration-test-writer | 6週間 |

### フェーズ4: E2Eテストの実装

**期間**: 2ヶ月〜3ヶ月
**目標**: 重要なユーザージャーニーのE2Eテストを作成

| タスク | 優先度 | 責任者 | 期限 |
|-------|-------|--------|------|
| サブエージェント作成→実行→結果確認 | P0 | e2e-test-writer | 2ヶ月 |
| エージェントチーム調整→並列実行→多数決 | P0 | e2e-test-writer | 2ヶ月 |
| 動的ツール作成→実行→検証 | P1 | e2e-test-writer | 6週間 |

## テスト実行

### ローカルでの実行

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジレポート
npm run test:coverage

# 単体テストのみ
npm run test:unit
```

### CIでの実行

```yaml
# .github/workflows/test.yml（将来実装予定）
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run test:coverage
```

## テストカバレッジの計測

### カバレッジレポートの生成

```bash
npm run test:coverage
```

レポートは以下の場所に出力されます：

- コンソール出力: テキスト形式
- coverage/index.html: HTML形式
- coverage/coverage-final.json: JSON形式

### カバレッジの目標値

| ファイル | 目標カバレッジ |
|---------|--------------|
| .pi/lib/comprehensive-logger.ts | 90% |
| .pi/lib/dynamic-tools/registry.ts | 85% |
| .pi/lib/dynamic-tools/safety.ts | 85% |
| .pi/extensions/subagents.ts | 80% |
| .pi/extensions/agent-teams/extension.ts | 80% |
| その他 | 75% |

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| テストがタイムアウトする | 実行時間が長すぎる | テストを分割する、タイムアウト値を調整する |
| フレーキーテスト | 非決定的なテスト | 外部依存をフェイク化、タイミング関連の処理を修正 |
| モックが複雑すぎる | 実装詳細への過度な依存 | フェイク実装を使用する、インターフェースを導入する |
| カバレッジが上がらない | テスト不足 | 未カバーのパスを特定し、テストを追加する |

## 関連トピック

- [テスト](./04-testing.md) - テストの基本概念
- [Getting Started](./01-getting-started.md) - 開発環境のセットアップ
- [貢献](./05-contributing.md) - プロジェクトへの貢献方法
- [ABDD](../../ABDD/index.md) - As-Built Driven Development

## 参考資料

- test-engineeringスキル: `.pi/skills/test-engineering/SKILL.md`
- Vitestドキュメント: https://vitest.dev/
- fast-checkドキュメント: https://fast-check.dev/
