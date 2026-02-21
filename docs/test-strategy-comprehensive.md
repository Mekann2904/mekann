---
title: 包括的テスト戦略（mekannプロジェクト全体）
category: development
audience: developer
last_updated: 2026-02-21
tags: [testing, comprehensive, strategy]
related: [.pi/skills/test-engineering/SKILL.md, docs/test-strategy.md]
---

# 包括的テスト戦略（mekannプロジェクト全体）

## 実行サマリー

- 作成日: 2026-02-21
- 作成者: Test Engineering Team - Strategy Architect
- 対象範囲: .pi/extensions配下および.pi/lib配下のTypeScriptファイル全体
- 現在のテスト状況: 148テストファイル、4947テスト（4921パス、26失敗）

## 現状分析

### テストカバレッジ概況

| カテゴリ | テスト済みファイル数 | 未テストファイル数 | カバレッジ |
|---------|---------------------|-------------------|-----------|
| .pi/lib（単独） | 59 | 3 | 95.2% |
| .pi/lib/dynamic-tools | 2 | 5 | 28.6% |
| .pi/extensions/agent-teams | 5 | 1 | 83.3% |
| .pi/extensions/subagents | 3 | 3 | 50.0% |
| .pi/extensions/search/utils | 2 | 6 | 25.0% |
| .pi/extensions/search/tools | 6 | 2 | 75.0% |

### 失敗しているテスト（26件）

**.pi/extensions/search/tools関連（22件）**
- call_graph.test.ts: 5件失敗
- code_search.test.ts: 全テスト失敗
- file_candidates.test.ts: 全テスト失敗
- semantic_search.test.ts: 全テスト失敗
- sym_find.test.ts: 全テスト失敗

**E2Eテスト（3件）**
- plan.e2e.test.ts: 3件失敗
- question.e2e.test.ts: 2件失敗

**その他（1件）**
- usage-tracker.test.ts: モック関連のエラー

### 未テストモジュール（重要度別）

| 重要度 | モジュール | 状態 | 理由 |
|-------|----------|------|------|
| P0 | .pi/lib/dynamic-tools/types.ts | **完了** (42テスト) | 動的ツールシステムの型定義、他モジュールから参照される |
| P0 | .pi/extensions/search/utils/metrics.ts | **完了** (48テスト) | 検索パフォーマンス計測、全検索ツールで使用 |
| P0 | .pi/lib/dynamic-tools/audit.ts | 未着手 | 監査機能、セキュリティに関連 |
| P1 | .pi/lib/dynamic-tools/quality.ts | 未着手 | 品質メトリクス計算 |
| P1 | .pi/lib/dynamic-tools/reflection.ts | 未着手 | リフレクション機能 |
| P1 | .pi/extensions/search/utils/cache.ts | 未着手 | 検索結果キャッシュ、パフォーマンスに影響 |
| P1 | .pi/extensions/search/utils/history.ts | 未着手 | 検索履歴管理 |
| P2 | .pi/extensions/search/utils/cli.ts | CLIユーティリティ |
| P2 | .pi/extensions/search/utils/constants.ts | 定数定義 |
| P2 | .pi/extensions/search/utils/search-helpers.ts | 検索ヘルパー関数 |
| P3 | .pi/lib/index.ts | バレルファイル |
| P3 | .pi/lib/pi-coding-agent-compat.ts | declare moduleのみ |

## テストピラミッド設計

```
        ┌─────────────────────────────────────┐
        │  E2Eテスト（〜10テスト）             │
        │  - ユーザージャーニーの最終検証       │
        │  - 複数拡張機能の連携動作確認         │
        ├─────────────────────────────────────┤
        │  統合テスト（〜50テスト）            │
        │  - searchツールの外部CLI連携        │
        │  - agent-teamsのメンバー間通信       │
        │  - subagentsのストレージ連携        │
        ├─────────────────────────────────────┤
        │  単体テスト（〜5000テスト）          │
        │  - 各モジュールの個別機能            │
        │  - エッジケースと境界条件            │
        │  - プロパティベーステスト           │
        └─────────────────────────────────────┘
```

## 実行フェーズ

### Phase 1: 基盤安定化（1週間）

**目標: 既存テストの失敗を解消**

| タスク | 対象 | 担当 | 優先度 |
|-------|------|------|-------|
| searchツールのモック修正 | tools/code_search, file_candidates, semantic_search, sym_find | integration-engineer | P0 |
| E2Eテストの環境設定 | plan.e2e, question.e2e | e2e-engineer | P0 |
| usage-trackerのモック修正 | usage-tracker.test.ts | unit-test-engineer | P1 |

**完了条件:**
- 全4947テストがパスすること
- `npm run ci` が成功すること

### Phase 2: 単体テスト拡充（2週間）

**目標: P0/P1未テストモジュールのカバレッジを100%に**

| モジュール | テストファイル | 状態 | 責務 | 実績テスト数 |
|----------|--------------|------|------|------------|
| .pi/lib/dynamic-tools/types.ts | tests/unit/lib/dynamic-tools-types.test.ts | **完了** | 型定義検証 | 42 |
| .pi/lib/dynamic-tools/audit.ts | tests/unit/lib/dynamic-tools-audit.test.ts | 未着手 | 監査機能 | - |
| .pi/lib/dynamic-tools/quality.ts | tests/unit/lib/dynamic-tools-quality.test.ts | 未着手 | 品質計算 | - |
| .pi/lib/dynamic-tools/reflection.ts | tests/unit/lib/dynamic-tools-reflection.test.ts | 未着手 | リフレクション | - |
| .pi/extensions/search/utils/metrics.ts | tests/unit/extensions/search/utils/metrics.test.ts | **完了** | メトリクス収集 | 48 |
| .pi/extensions/search/utils/cache.ts | tests/unit/extensions/search/utils/cache.test.ts | 未着手 | キャッシュ管理 | - |
| .pi/extensions/search/utils/history.ts | tests/unit/extensions/search/utils/history.test.ts | 未着手 | 履歴管理 | - |

**完了条件:**
- P0/P1モジュールのテストカバレッジ90%以上
- 全テストが `npm run test:unit` でパス

### Phase 3: 統合テスト実装（1週間）

**目標: 外部依存との統合を検証**

| 統合ポイント | テスト対象 | 検証内容 |
|------------|----------|---------|
| search CLI | tools/code_search, semantic_search | 外部CLIツールとの連携 |
| storage | subagents/storage | ファイルシステム操作 |
| embeddings | lib/embeddings | OpenAI API連携 |
| agent-teams | agent-teams/member-execution | チームメンバー間通信 |

**完了条件:**
- 統合テストが50件以上
- 外部依存を適切にモック化

### Phase 4: E2Eテスト拡充（1週間）

**目標: 主要ユーザージャーニーを網羅**

| ユーザージャーニー | 対象拡張機能 | テストシナリオ |
|------------------|-------------|--------------|
| エージェント作成〜実行 | agent-runtime, subagents | サブエージェントのライフサイクル |
| チーム実行 | agent-teams | 並列実行と結果集約 |
| 検索〜コード生成 | search, dynamic-tools | 検索結果からツール生成 |
| 計画作成〜実行 | plan, loop | 反復的な計画実行 |

**完了条件:**
- E2Eテストが10件以上
- 主要ユーザージャーニーを網羅

## テスト設計原則

### 単体テスト

**テスト構造: AAAパターン**

```typescript
describe('MetricsCollector', () => {
  describe('setFilesSearched', () => {
    it('正常系: ファイル数を設定できる', () => {
      // Arrange
      const collector = new MetricsCollector('test-tool');

      // Act
      const result = collector.setFilesSearched(10);

      // Assert
      expect(result).toBe(collector);
      expect(result).toBeInstanceOf(MetricsCollector);
    });
  });
});
```

**プロパティベーステスト（fast-check）**

```typescript
describe('aggregateMetrics', () => {
  it('PBT: 空の配列でゼロ統計を返す', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        durationMs: fc.nat(),
        filesSearched: fc.nat(),
        toolName: fc.string(),
      })),
      (metrics) => {
        const result = aggregateMetrics(metrics);
        expect(result.operationCount).toBe(metrics.length);
      }
    ));
  });
});
```

### 統合テスト

**外部依存のモック化**

```typescript
import { vi } from 'vitest';

describe('SearchTools Integration', () => {
  beforeEach(() => {
    // 外部CLIをモック化
    vi.mock('node:child_process', () => ({
      exec: vi.fn((cmd, cb) => cb(null, 'mock output', '')),
    }));
  });

  it('外部CLIを呼び出して結果を取得する', async () => {
    const result = await codeSearch({ query: 'test' });
    expect(result.matches).toHaveLength(1);
  });
});
```

### E2Eテスト

**ユーザージャーニーの検証**

```typescript
describe('エージェント作成〜実行 E2E', () => {
  it('ユーザーはサブエージェントを作成し、タスクを実行できる', async () => {
    // Given: 新しいサブエージェント定義
    const definition = {
      name: 'test-agent',
      description: 'Test agent',
    };

    // When: サブエージェントを作成・実行
    const createResult = await subagent_run({
      name: 'create-agent',
      definition,
    });

    const executeResult = await subagent_run({
      name: 'execute-task',
      agentId: createResult.agentId,
      task: 'simple-task',
    });

    // Then: 正常に実行される
    expect(executeResult.success).toBe(true);
  });
});
```

## カバレッジ目標

| レベル | 目標カバレッジ | 測定対象 |
|-------|-------------|---------|
| 単体テスト | 90% | .pi/lib/*.ts, .pi/extensions/**/*.ts |
| 統合テスト | 80% | 外部連携ポイント |
| E2Eテスト | 70% | 主要ユーザージャーニー |

## 優先順位付けのロジック

**重要度評価基準:**

| 基準 | P0 | P1 | P2 | P3 |
|-----|----|----|----|----|
| システム安定性への影響 | 高 | 中 | 低 | なし |
| 他モジュールからの参照数 | 多い | 中程度 | 少ない | なし |
| 複雑度 | 高 | 中 | 低 | なし |
| セキュリティ/監査 | 関連あり | 関連あり | なし | なし |

## リスクと対策

| リスク | 対策 |
|--------|------|
| 外部CLIの挙動変更 | モックを更新、統合テストを追加 |
| テスト実行時間の増加 | 並列実行、テストスイート分割 |
| モックの不整合 | モックを一元管理、定期的なレビュー |

## 完了条件

- [x] テスト戦略ドキュメントの作成
- [ ] Phase 1: 既存テストの失敗を解消（26件失敗中）
- [x] Phase 2-1: P0単体テストを実装（metrics.ts: 48テスト, types.ts: 42テスト）
- [ ] Phase 2-2: P0/P1単体テストを全て実装（残り5モジュール）
- [ ] Phase 3: 統合テストを実装
- [ ] Phase 4: E2Eテストを実装
- [ ] 全テストがパス
- [ ] カバレッジ目標を達成

## 参照

- Test Engineering Skill: .pi/skills/test-engineering/SKILL.md
- 既存テスト戦略: docs/test-strategy.md
- Phase 2分割計画: docs/phase2-split-plan.md
