---
title: システム全体評価レポート
category: code-review-report
audience: developer
last_updated: 2026-03-04
tags: [evaluation, search, agent, task, documentation]
related: [ABDD/spec.md, philosophy.md]
---

# システム全体評価レポート

評価日: 2026-03-04
評価範囲: 機能別（検索系重点）
評価深度: 詳細

## サマリー

| フェーズ | 対象 | テスト数 | 結果 | 修正 |
|---------|------|---------|------|------|
| Phase 1 | 検索系 | 58 | 成功 | legacyテスト移行 |
| Phase 2 | エージェント系 | 192 | 成功 | async/await修正 |
| Phase 3 | タスク管理系 | 83 | 成功 | - |
| Phase 4 | コア基盤系 | 201 | 成功 | - |
| Phase 5 | ドキュメント系 | - | 完了 | - |

## 詳細

### Phase 1: 検索系（重点評価）

#### 構成

| コンポーネント | ファイル数 | 状況 |
|--------------|----------|------|
| tools/ | 19 | 良好 |
| locagent/ | 7 | 良好 |
| repograph/ | 3+ | 良好 |
| tree-sitter/ | 2 | 良好 |
| utils/ | 9 | 良好 |

#### 実施した改善

1. **legacyテスト移行**: 4ファイル削除、vitest版に移行
   - `search-tools.test.ts` (25 tests)
   - `semantic-repetition.test.ts` (5 tests)
   - `agentic-search.test.ts` (23 tests)
   - `semantic-repetition-security.test.ts` (5 tests)

2. **ABDDヘッダー**: 全ファイルに既に存在（追加不要）

### Phase 2: エージェント系

#### 構成

| コンポーネント | テスト数 | 結果 |
|--------------|---------|------|
| mediator系 | 111 | 成功 |
| subagent-team契約 | 21 | 成功 |
| communication | 60 | 3失敗→成功 |

#### 修正内容

**ファイル**: `tests/unit/extensions/agent-teams/communication.test.ts`

**問題**: `buildCommunicationContext` が async 関数なのに、テストで `await` していなかった

**修正**: 3つのテストに `async`/`await` を追加

```typescript
// 修正前
it('連携相手の要約を含める', () => {
  const context = buildCommunicationContext({...});
  expect(context).toContain('...');
});

// 修正後
it('連携相手の要約を含める', async () => {
  const context = await buildCommunicationContext({...});
  expect(context).toContain('...');
});
```

### Phase 3: タスク管理系

#### 構成

| コンポーネント | テスト数 | 結果 |
|--------------|---------|------|
| plan-mode-shared | 30 | 成功 |
| task-dependencies | 53 | 成功 |

#### 発見された課題

| カテゴリ | 課題 | 優先度 |
|---------|------|-------|
| ABDD生成 | TypeScript型チェックエラー | 低 |

### Phase 4: コア基盤系

#### サンプリングテスト結果

| カテゴリ | テスト数 | 結果 |
|---------|---------|------|
| concurrency | 19 | 成功 |
| retry-with-backoff | 32 | 成功 |
| errors | 55 | 成功 |
| intent-aware-limits | 28 | 成功 |
| format-utils | 39 | 成功 |
| circuit-breaker | 28 | 成功 |

### Phase 5: ドキュメント系

#### ABDD乖離分析

総検出数: 38件

| カテゴリ | 重要度 | 件数 | 判定 |
|---------|-------|------|------|
| 不変条件違反 | MEDIUM | 10 | 実態記述への反映が必要 |
| 価値観ミスマッチ | HIGH | 14 | 偽陽性（説明用テキスト） |
| 不変条件違反 | HIGH | 10 | 偽陽性（node_modules内） |
| 価値観ミスマッチ | HIGH | 4 | 要確認（dynamic-tools） |

#### 偽陽性の詳細

- `abbr.ts`, `abdd.ts`: 禁止パターンの説明用テキスト（問題なし）
- `node_modules/zod`: サードパーティライブラリ（除外対象）
- `dynamic-tools/reflection.ts`: 要確認

## テスト統計

### 最終結果

```
Test Files: 322 passed (323)
Tests: 8617 passed | 3 skipped (8620)
```

### 新規追加テスト

| ファイル | テスト数 |
|---------|---------|
| integration/search-tools.test.ts | 25 |
| integration/semantic-repetition.test.ts | 5 |
| lib/agentic-search.test.ts | 23 |
| lib/semantic-repetition-security.test.ts | 5 |
| **合計** | **58** |

## 推奨事項

### 高優先度

1. **dynamic-tools/reflection.ts の確認**
   - `git add .` の使用が意図的か確認
   - 必要に応じて修正

### 中優先度

2. **ABDD不変条件の実態記述への反映**
   - spec.md の10件の不変条件を実態記述に追加

### 低優先度

3. **ABDD生成スクリプトの修正**
   - TypeScript型チェックエラーの解消

## 変更ファイル一覧

### 新規作成

- `.pi/tests/integration/search-tools.test.ts`
- `.pi/tests/integration/semantic-repetition.test.ts`
- `.pi/tests/lib/agentic-search.test.ts`
- `.pi/tests/lib/semantic-repetition-security.test.ts`

### 削除

- `.pi/tests/legacy/agentic-search-test.ts`
- `.pi/tests/legacy/integration-test.ts`
- `.pi/tests/legacy/security-test.ts`
- `.pi/tests/legacy/search-tools-test.ts`

### 修正

- `tests/unit/extensions/agent-teams/communication.test.ts`
