---
title: 単体テスト戦略
category: development
audience: developer
last_updated: 2026-02-21
tags: [testing, unit-test, strategy]
related: [docs/03-development/02-test-engineering.md]
---

# 単体テスト戦略

## 実行サマリー

- 作成日: 2026-02-21
- 作成者: Test Engineering Team - Unit Test Engineer
- 対象範囲: .pi/extensions配下および.pi/lib配下のTypeScriptファイル
- 既存テスト状況: 4247件のテスト、118個のテストファイルが既に存在

## 現状分析

### 既存テストカバレッジ

**テスト済みモジュール（.pi/extensions）**
- abbr, abdd, agent-idle-indicator, agent-runtime, agent-usage-tracker
- append-system-loader, code-panel, code-viewer, context-usage-dashboard
- cross-instance-runtime, dynamic-tools, enhanced-read, github-agent
- invariant-pipeline, kitty-status-integration, loop, plan, question
- rate-limit-retry-budget, rpm-throttle, skill-inspector, startup-context
- subagents, ul-dual-mode, usage-tracker

**テスト済みモジュール（.pi/lib）**
- abdd-types, abort-utils, adaptive-penalty, adaptive-rate-controller
- adaptive-total-limit, agent, agent-common, agent-errors, agent-types
- agent-utils, checkpoint-manager, comprehensive-logger系
- concurrency, context-engineering, core, cost-estimator
- cross-instance-coordinator, dynamic-parallelism, error-utils
- errors, execution-rules, format-utils, fs-utils
- intent-aware-limits, live-view-utils, metrics-collector, model-timeouts
- output-schema, output-validation, pattern-extraction, plan-mode-shared
- priority-scheduler, process-utils, provider-limits, retry-with-backoff
- run-index, runtime-config, runtime-error-builders, runtime-utils
- semantic-memory, semantic-repetition, skill-registry, storage系
- structured-logger, subagent-types, task-dependencies, task-scheduler
- team-types, text-parsing, token-bucket, tool-error-utils
- unified-limit-resolver, validation-utils, verification-workflow

### テスト未実装モジュール

**.pi/lib**
- frontmatter - 重要度: 中（複数モジュールで使用）
- index - 重要度: 低（@deprecated）
- pi-coding-agent-compat - 重要度: 低（declare moduleのみ）

**.pi/lib/dynamic-tools**
- audit, index, reflection, registry, types

**.pi/extensions/agent-teams**
- index - 重要度: 低（バレルファイル）
- member-execution - 重要度: 高（チーム実行ロジック）
- parallel-execution - 重要度: 高（並列容量管理）
- result-aggregation - 重要度: 高（結果集約・エラー分類）

**.pi/extensions/subagents**
- live-monitor, parallel-execution, storage, task-execution

**.pi/extensions/search**
- call-graph関連全モジュール
- tools/call_graph, tools/code_search, tools/file_candidates
- tools/semantic_index, tools/semantic_search, tools/sym_find, tools/sym_index
- utils/cli, utils/metrics

**.pi/extensions/code-structure-analyzer**
- tools/extract-structure, tools/generate-diagrams, tools/generate-doc

**.pi/extensions/shared**
- pi-print-executor, runtime-helpers, verification-hooks

**.pi/lib/tui**
- live-monitor-base, tui-utils

## テスト戦略

### 優先順位付け（重要度 × リスク）

| 優先度 | モジュール | 理由 |
|-------|----------|------|
| P0 | agent-teams/member-execution | チーム実行の中心ロジック、複雑度が高い |
| P0 | agent-teams/parallel-execution | 並列実行容量管理、システム安定性に直結 |
| P0 | agent-teams/result-aggregation | 結果集約・エラー分類、ダウンストリームに影響大 |
| P0 | subagents/task-execution | サブエージェント実行ロジック、重要度が高い |
| P0 | subagents/storage | ストレージ管理、データ整合性が重要 |
| P1 | lib/frontmatter | 複数モジュールで使用、単純だが重要 |
| P1 | dynamic-tools/types | 型定義、重要度が高い |
| P1 | dynamic-tools/registry | レジストリ管理 |
| P1 | dynamic-tools/reflection | 反射機能 |
| P1 | dynamic-tools/audit | 監査機能 |
| P2 | subagents/live-monitor | ライブ監視機能 |
| P2 | subagents/parallel-execution | 並列実行機能 |
| P2 | shared/runtime-helpers | ランタイムヘルパー |
| P2 | shared/verification-hooks | 検証フック |
| P3 | search/* | 既存テストスイートが大きく、補完テストのみ実施 |
| P3 | code-structure-analyzer/* | 特定用途のモジュール |
| P3 | tui/* | テスト環境依存度が高い |

### テストピラミッド設計

```
           /\
          /  \
         / E2E \  (テスト対象外)
        /------\
       / 統合   \ (P2-P3: agent-teams統合テスト)
      /----------\
     /  契約     \ (P2: agent-runtime contract tests)
    /------------\
   /   単体      \ (P0-P1: 本戦略の対象)
  /--------------\
```

**単体テスト（今回の対象）**
- 関数レベルのテスト
- モック/スタブの使用
- エッジケースのカバレッジ

**契約テスト（今後の検討）**
- モジュール間のインターフェース契約
- agent-runtimeとの契約テスト

**統合テスト（今後の検討）**
- agent-teamsの完全なワークフロー
- subagentsの完全なワークフロー

### カバレッジ目標

| レイヤ | 目標カバレッジ | 優先度 |
|-------|---------------|-------|
| P0モジュール | 90%以上 | 即時実施 |
| P1モジュール | 80%以上 | 早期実施 |
| P2モジュール | 70%以上 | 中期実施 |
| P3モジュール | 50%以上 | 長期実施 |

## テスト設計原則

### AAA構造（Arrange-Act-Assert）

すべてのテストは以下の構造に従う:

```typescript
describe("関数名または機能", () => {
  describe("条件またはシナリオ", () => {
    it("期待される動作", () => {
      // Arrange: 準備
      const input = ...;

      // Act: 実行
      const result = functionUnderTest(input);

      // Assert: 検証
      expect(result).toEqual(expected);
    });
  });
});
```

### Given-When-Thenパターン

複雑なビジネスロジックにはGiven-When-Thenを使用:

```typescript
describe("チーム並列容量解決", () => {
  describe("リソース不足時", () => {
    it("並列度を削減して容量を確保する", () => {
      // Given: 最大容量が1に設定された状態で
      const maxCapacity = 1;
      const requestedParallelism = 3;

      // When: 並列実行を試行したとき
      const result = resolveTeamParallelCapacity({
        requestedTeamParallelism: requestedParallelism,
        requestedMemberParallelism: 1,
        candidates: buildTeamAndMemberParallelCandidates(requestedParallelism, 1),
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      // Then: 要求より低い並列度が適用される
      expect(result.allowed).toBe(true);
      expect(result.appliedTeamParallelism).toBeLessThan(requestedParallelism);
      expect(result.reduced).toBe(true);
    });
  });
});
```

### モック/スタブの使用

外部依存にはモックを使用:

```typescript
import { vi } from "vitest";

describe("サブエージェント実行", () => {
  it("プロンプトに従ってタスクを実行する", () => {
    // Mock external dependencies
    const mockRunPiPrintMode = vi.fn().mockResolvedValue({
      output: "SUMMARY: テスト完了\nRESULT: 結果\nNEXT_STEP: none",
      latencyMs: 100,
    });

    // Test with mocked dependency
    // ...
  });
});
```

### エッジケースのカバレッジ

以下のエッジケースを考慮:

- 空文字、null、undefined
- 異常入力、境界値
- 例外エラー、タイムアウト
- 並列実行、競合状態

## 実装計画

### フェーズ1: P0モジュール（高優先度）

1. agent-teams/member-execution.ts
   - buildTeamMemberPrompt
   - normalizeTeamMemberOutput
   - buildSkillsSectionWithContent
   - loadSkillContent
   - runMember

2. agent-teams/parallel-execution.ts
   - buildMemberParallelCandidates
   - buildTeamAndMemberParallelCandidates
   - resolveTeamParallelCapacity

3. agent-teams/result-aggregation.ts
   - isRetryableTeamMemberError
   - resolveTeamFailureOutcome
   - resolveTeamMemberAggregateOutcome
   - resolveTeamParallelRunOutcome
   - buildTeamResultText

4. subagents/task-execution.ts
   - normalizeSubagentOutput
   - isRetryableSubagentError
   - isEmptyOutputFailureMessage

5. subagents/storage.ts
   - ensurePaths
   - mergeSubagentStorageWithDisk
   - pruneRunArtifacts

### フェーズ2: P1モジュール（中優先度）

1. lib/frontmatter.ts
   - parseFrontmatter

2. lib/dynamic-tools/types.ts
   - 動的ツール型定義のテスト

3. lib/dynamic-tools/registry.ts
   - ツールレジストリ操作

4. lib/dynamic-tools/reflection.ts
   - 反射機能

5. lib/dynamic-tools/audit.ts
   - 監査機能

### フェーズ3: P2モジュール（中優先度）

1. subagents/live-monitor.ts
2. subagents/parallel-execution.ts
3. shared/runtime-helpers.ts
4. shared/verification-hooks.ts

### フェーズ4: P3モジュール（低優先度）

1. search/* (補完テスト)
2. code-structure-analyzer/*
3. tui/*

## テスト実行コマンド

```bash
# 全テスト実行
npm run test

# 特定のテストファイル実行
npm run test tests/unit/extensions/agent-teams/member-execution.test.ts

# ウォッチモード
npm run test:watch

# カバレッジ（@vitest/coverage-v8インストール後）
npm run test:coverage

# 特定のテストスイート
npx vitest run agent-teams
```

## プロパティベーステスト

複雑な関数にはfast-checkを使用したプロパティベーステストを実装:

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

describe("frontmatter解析（プロパティベース）", () => {
  it("常に有効なfrontmatterとbodyを返す", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const result = parseFrontmatter(content);
        expect(result).toHaveProperty("frontmatter");
        expect(result).toHaveProperty("body");
        expect(typeof result.frontmatter).toBe("object");
        expect(typeof result.body).toBe("string");
      })
    );
  });
});
```

## 成功基準

- [x] テスト戦略ドキュメントの作成
- [ ] P0モジュールのテスト実装（カバレッジ90%以上）
- [ ] P1モジュールのテスト実装（カバレッジ80%以上）
- [ ] 全テストがパスすること
- [ ] テスト実行時間が30秒以内であること
- [ ] テストカバレッジレポートの生成

## リスクと課題

### 既知の課題

1. **カバレッジ計測ツールの不足**
   - @vitest/coverage-v8がインストールされていない
   - 解決: npm installで追加インストールが必要

2. **テスト環境依存**
   - tui関連のモジュールはテスト環境での動作が困難
   - 解決: モックを活用して依存を分離

3. **既存のテスト警告**
   - requireからesmへの変換警告が多数
   - 解決: 将来的にesmへ移行

### 追加の考慮事項

- 非同期処理のテストには適切なタイムアウト設定が必要
- ファイルシステム操作のテストにはテンポラリディレクトリを使用
- 並列実行のテストにはモックを使用して副作用を分離

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-02-21 | 初版作成 |
