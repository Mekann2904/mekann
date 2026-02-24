# テストコード作成のための調査レポート

作成日: 2026-02-24

---

## 1. 現在のテスト状況の全体像

### 1.1 テストフレームワーク

- **フレームワーク**: Vitest v3.2.4
- **カバレッジツール**: @vitest/coverage-v8
- **プロパティベーステスト**: fast-check v4.5.3
- **テストランナー**: vitest
- **スクリプト**:
  - `npm test` / `npm run test`: 単体テスト実行
  - `npm run test:watch`: ウォッチモード
  - `npm run test:coverage`: カバレッジ計測
  - `npm run test:unit`: 単体テストのみ
  - `npm run test:e2e`: E2Eテストのみ

### 1.2 テストディレクトリ構造

```
tests/
├── unit/
│   ├── extensions/      # 拡張機能の単体テスト
│   ├── lib/             # 共有ライブラリの単体テスト
│   ├── static/          # 静的解析関連テスト
│   └── search/          # 検索機能の単体テスト
├── integration/         # 統合テスト
├── e2e/                # エンドツーエンドテスト
└── *.test.ts           # トップレベルテスト

.pi/tests/
├── integration/         # .pi内部の統合テスト
├── extensions/         # 拡張機能の追加テスト
├── lib/                # ライブラリの追加テスト
├── bug-reproduction/   # バグ再現テスト
├── skills/             # スキル関連テスト
└── e2e/                # .pi内部のE2Eテスト
```

### 1.3 テストパターン

既存のテストで使用されているパターン:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

describe("モジュール名", () => {
  describe("正常系", () => {
    it("should_do_something", async () => {
      // Arrange
      const items = [1, 2, 3];
      const worker = vi.fn(async (item) => item * 2);

      // Act
      const result = await runWithConcurrencyLimit(items, 2, worker);

      // Assert
      expect(result).toEqual([2, 4, 6]);
      expect(worker).toHaveBeenCalledTimes(3);
    });
  });

  describe("異常系", () => {
    it("should_throw_error_for_invalid_input", async () => {
      // Arrange
      const invalidInput = null;

      // Act & Assert
      await expect(() => process(invalidInput)).rejects.toThrow();
    });
  });

  describe("境界値", () => {
    it("should_handle_empty_array", async () => {
      // Arrange
      const items: number[] = [];

      // Act
      const result = await process(items);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_satisfy_property", () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          return add(a, b) === a + b;
        })
      );
    });
  });
});
```

---

## 2. 拡張機能のテスト状況

### 2.1 テスト済み拡張機能（32個）

| 拡張機能 | テストファイル |
|---------|---------------|
| abbr | tests/unit/extensions/abbr.test.ts |
| abdd | tests/unit/extensions/abdd.test.ts |
| agent-idle-indicator | tests/unit/extensions/agent-idle-indicator.test.ts |
| agent-runtime | tests/unit/extensions/agent-runtime.test.ts |
| agent-usage-tracker | tests/unit/extensions/agent-usage-tracker.test.ts |
| append-system-loader | tests/unit/extensions/append-system-loader.test.ts |
| code-panel | tests/unit/extensions/code-panel.test.ts |
| code-viewer | tests/unit/extensions/code-viewer.test.ts |
| context-usage-dashboard | tests/unit/extensions/context-usage-dashboard.test.ts |
| cross-instance-runtime | tests/unit/extensions/cross-instance-runtime.test.ts |
| dynamic-tools | tests/unit/extensions/dynamic-tools.test.ts |
| enhanced-read | tests/unit/extensions/enhanced-read.test.ts |
| github-agent | tests/unit/extensions/github-agent.test.ts |
| invariant-pipeline | tests/unit/extensions/invariant-pipeline.test.ts |
| kitty-status-integration | tests/unit/extensions/kitty-status-integration.test.ts |
| loop | tests/unit/extensions/loop.test.ts |
| pi-ai-abort-fix | tests/unit/extensions/pi-ai-abort-fix.test.ts |
| pi-coding-agent-lock-fix | tests/unit/extensions/pi-coding-agent-lock-fix.test.ts |
| pi-coding-agent-rate-limit-fix | tests/unit/extensions/pi-coding-agent-rate-limit-fix.test.ts |
| plan | tests/unit/extensions/plan.test.ts |
| question | tests/unit/extensions/question.test.ts |
| rate-limit-retry-budget | tests/unit/extensions/rate-limit-retry-budget.test.ts |
| rpm-throttle | tests/unit/extensions/rpm-throttle.test.ts |
| self-improvement-loop | tests/unit/extensions/self-improvement-loop.test.ts |
| skill-inspector | tests/unit/extensions/skill-inspector.test.ts |
| startup-context | tests/unit/extensions/startup-context.test.ts |
| subagents | tests/unit/extensions/subagents.test.ts |
| ul-dual-mode | tests/unit/extensions/ul-dual-mode.test.ts |
| usage-tracker | tests/unit/extensions/usage-tracker.test.ts |
| agent-teams/extension | tests/unit/extensions/agent-teams/extension.test.ts |
| communication-* | 多数のテストファイル |

### 2.2 テスト未実装の拡張機能（5個）

| 拡張機能 | 重要度 | 理由 |
|---------|--------|------|
| **mediator** | 高 | Mediator論文（arXiv:2602.07338v1）に基づく重要な機能。ユーザー入力解釈と確認質問生成。 |
| **self-improvement-dashboard** | 中 | 自己改善データのTUI可視化ダッシュボード。 |
| **self-improvement-reflection** | 高 | 自己改善データ基盤のエントリーポイント。 |
| **tool-compiler** | 中 | ツールコンパイル機能。 |
| **ul-diagnostic** | 中 | ULモードの診断機能。 |
| **ul-workflow** | 高 | Research-Plan-Annotate-Implementワークフロー（計画承認必須）。 |

---

## 3. 共有ライブラリのテスト状況

### 3.1 テスト未実装のライブラリ（30個）

| ライブラリ | 重要度 | カテゴリ | 理由 |
|-----------|--------|---------|------|
| **aporia-handler** | 高 |哲学的推論 | Aporia（哲学的無知）のハンドリング。 |
| **belief-updater** | 中 | 自己認識 | 信念更新機能。 |
| **circuit-breaker** | 高 | 信頼性 | サーキットブレーカーパターン。 |
| **context-repository** | 中 | コンテキスト管理 | コンテキストのリポジトリ。 |
| **dag-errors** | 中 | DAG実行 | DAG実行のエラー型定義。 |
| **dag-executor** | 高 | DAG実行 | DAG実行エンジン。 |
| **dag-types** | 高 | DAG実行 | DAGの型定義。 |
| **dag-validator** | 高 | DAG実行 | DAGバリデーション。 |
| **dag-weight-calculator** | 中 | DAG実行 | DAG重み計算。 |
| **dag-weight-updater** | 中 | DAG実行 | DAG重み更新。 |
| **delegation-quality** | 高 | 委任品質 | 委任品質の評価。 |
| **error-classifier** | 中 | エラーハンドリング | エラー分類器。 |
| **experience-replay** | 高 | 学習 | 経験再生機能（ALMA）。 |
| **file-filter** | 低 | ユーティリティ | ファイルフィルタ。 |
| **index** | 低 | ユーティリティ | インデックス関連。 |
| **intent-mediator** | 高 | Mediator | 意図メディエータ。 |
| **learnable-mode-selector** | 高 | 自己改善 | 学習可能モード選択。 |
| **long-running-support** | 中 | ランタイム | 長時間実行サポート。 |
| **parallel-search** | 中 | 検索 | 並列検索。 |
| **performance-monitor** | 中 | パフォーマンス | パフォーマンスモニタリング。 |
| **sbfl** | 高 | デバッグ | Spectrum-Based Fault Localization。 |
| **self-improvement-data-platform** | 高 | 自己改善 | 自己改善データ基盤（3層アーキテクチャ）。 |
| **structured-analysis-output** | 中 | 出力 | 構造化分析出力。 |
| **thinking-process** | 高 | 推論 | 思考プロセス。 |
| **tool-compiler-types** | 中 | ツール | ツールコンパイラ型定義。 |
| **tool-executor** | 高 | ツール実行 | ツール実行エンジン。 |
| **tool-fuser** | 中 | ツール | ツールフュージョン。 |
| **verification-high-stakes** | 高 | 検証 | 高リスク検証。 |
| **verification-simple** | 高 | 検証 | シンプル検証。 |
| **verification-workflow** | 高 | 検証 | 検証ワークフロー。 |

---

## 4. テストギャップの分析

### 4.1 優先度：高い（High Priority）

以下のモジュールは、機能的重要性または使用頻度が高いため、優先的にテストを追加すべきです。

#### 拡張機能
1. **mediator** - Mediator論文に基づくユーザー入力解釈機能
2. **self-improvement-reflection** - 自己改善データ基盤のエントリーポイント
3. **ul-workflow** - Research-Plan-Annotate-Implementワークフロー

#### 共有ライブラリ
1. **dag-executor** - DAG実行エンジン（subagent_run_dagで使用）
2. **dag-validator** - DAGバリデーション
3. **dag-types** - DAGの型定義
4. **tool-executor** - ツール実行エンジン
5. **verification-workflow** - 検証ワークフロー
6. **sbfl** - Spectrum-Based Fault Localization
7. **experience-replay** - 経験再生機能（ALMA）
8. **self-improvement-data-platform** - 自己改善データ基盤
9. **delegation-quality** - 委任品質の評価
10. **circuit-breaker** - サーキットブレーカーパターン
11. **intent-mediator** - 意図メディエータ
12. **learnable-mode-selector** - 学習可能モード選択
13. **thinking-process** - 思考プロセス
14. **aporia-handler** - Aporiaハンドリング

### 4.2 優先度：中（Medium Priority）

1. **self-improvement-dashboard** - 自己改善ダッシュボード
2. **tool-compiler** - ツールコンパイル
3. **ul-diagnostic** - UL診断
4. **dag-weight-calculator** - DAG重み計算
5. **dag-weight-updater** - DAG重み更新
6. **error-classifier** - エラー分類器
7. **performance-monitor** - パフォーマンスモニタリング
8. **parallel-search** - 並列検索
9. **long-running-support** - 長時間実行サポート
10. **context-repository** - コンテキストリポジトリ
11. **verification-simple** - シンプル検証
12. **verification-high-stakes** - 高リスク検証

---

## 5. 推奨されるテスト戦略

### 5.1 テストチームの活用

agent-teamsのテスト関連チームを使用して、テスト作成を並列実行することを推奨：

- **verification-phase-team**: 検証フェーズ専門チーム（Inspector/Challengerパターン）
- **test-team**: （存在する場合）テスト作成専門チーム

### 5.2 テスト作成のアプローチ

1. **単体テストから開始**: 個別の関数・クラスのテスト
2. **統合テストを追加**: 複数のモジュール間の連携テスト
3. **プロパティベーステスト**: 重要な関数に対してfast-checkを使用
4. **E2Eテスト**: ユーザー視点のエンドツーエンドテスト

### 5.3 テストカバレッジ目標

- **行カバレッジ**: 80%以上
- **分岐カバレッジ**: 70%以上
- **関数カバレッツ**: 90%以上

### 5.4 モックとスタブの使用

- **LLM呼び出し**: vi.fn()でモック化
- **ファイルシステム**: vi.mock('fs')でモック化
- **外部API**: vi.mock()でモック化

---

## 6. 次のステップ（Planフェーズへの入力）

この調査結果を基に、以下の内容を含むテスト作成計画を作成します：

1. 優先度別のテスト作成タスク
2. 各タスクの担当チーム（またはサブエージェント）
3. テスト作成の依存関係
4. テスト実行と検証の手順
