---
title: scripts/add-jsdoc.ts リファクタリング計画
category: development
audience: developer
last_updated: 2026-02-18
tags: [refactoring, optimization, jsdoc, technical-debt]
related: [tech-debt-detector, quality-grader]
---

# scripts/add-jsdoc.ts リファクタリング計画

## 概要

Garbage Collection Team（tech-debt-detector、quality-grader、refactor-planner）の合同分析に基づく、JSDoc自動生成スクリプトの効率化計画。

## 特定された技術的負債

tech-debt-detectorの分析結果:

1. **ファイルI/Oの重複読み込み** - 高優先度
2. **過度に保守的な並列制限** - 中優先度
3. **ストリーミングAPIの不必要な使用** - 低優先度（変更しない）
4. **プロンプトテンプレートの再生成** - 低優先度（効果限定的）
5. **インクリメンタル処理の欠如** - 高優先度

quality-graderの分析結果:

- 品質指標の可視化不足
- テストカバレッジ不足

## 優先度マトリクス

| 改善項目 | 効果 | リスク | 工数 | 優先度 |
|---------|------|--------|------|--------|
| ファイルI/Oの重複読み込み解消 | 高 | 低 | 小 | P0 |
| インクリメンタル処理の実装 | 高 | 中 | 中 | P1 |
| 並列制限のアダプティブ化 | 中 | 中 | 小 | P2 |
| バッチプロンプト化 | 高 | 高 | 大 | P3 |
| 品質指標の可視化 | 低 | 低 | 小 | P4 |

---

## Phase 0: ファイルI/O最適化（P0）

### 現状

```typescript
// scripts/add-jsdoc.ts:208
const sourceCode = readFileSync(filePath, 'utf-8');

// scripts/add-jsdoc.ts:457
const sourceCode = readFileSync(element.filePath, 'utf-8');
```

### 実装計画

1. ファイルパス -> ソースコードのメモリ内キャッシュを導入
2. `extractElements()`を`extractElementsFromSource()`に変更（ソースコードを引数に）
3. `insertJsDoc()`にキャッシュを渡す

### 期待効果

- ファイルI/O回数を50%削減
- 100ファイル処理時: 200回 -> 100回の読み込み

### リスク

低。キャッシュは同一実行内のみで有効。

---

## Phase 1: インクリメンタル処理（P1）

### 実装計画

1. キャッシュファイル（`.pi/cache/jsdoc-cache.json`）の導入
2. ファイルハッシュベースの変更検出
3. `--incremental`（デフォルト）/ `--force`オプションの追加

### 期待効果

- 日常的な実行時間を80-90%削減
- CI/CDでの実行も高速化

### リスク

中。キャッシュ破損時の復旧処理が必要。

---

## Phase 2: 並列制限のアダプティブ化（P2）

### 現状

```typescript
// scripts/add-jsdoc.ts:346-348
function resolveJSDocParallelLimit(model: Model, taskCount: number): number {
  const modelParallelLimit = model.maxParallelGenerations || 3;
  return Math.min(modelParallelLimit, 3);
}
```

### 実装計画

1. `getSchedulerAwareLimit()`との統合
2. 成功時の並列数増加、429エラー時の減少

### 期待効果

- 安定環境で30-50%短縮
- レート制限環境でエラー率低下

### リスク

中。アダプティブ制御のバグが無限ループを引き起こす可能性。

---

## Phase 3: バッチプロンプト化（P3）

### 実装計画

1. 同一ファイルの要素をバッチ化（最大5要素）
2. バッチプロンプトの生成
3. バッチレスポンスのパース

### 期待効果

- API呼び出し回数を80%削減
- コンテキスト活用による品質向上

### リスク

高。LLMが一部要素のJSDocを生成し忘れる可能性。

---

## Phase 4: 品質指標の可視化（P4）

### 実装計画

1. 処理統計の収集
2. `--output json`オプションの追加
3. CI/CDでの活用

### リスク

低。

---

## 実装スケジュール

| フェーズ | 期間 | マイルストーン |
|---------|------|---------------|
| Phase 0 | 1日 | ファイルI/O最適化 |
| Phase 1 | 2-3日 | インクリメンタル処理 |
| Phase 2 | 1日 | アダプティブ並列制御 |
| Phase 3 | 3-5日 | バッチプロンプト化 |
| Phase 4 | 1日 | 品質指標出力 |

---

## チーム間合意事項

- ファイルI/O最適化とインクリメンタル処理を最優先
- 並列制限はアダプティブ制御で段階的に改善
- ストリーミングAPIの変更は行わない
- バッチ処理は十分なテスト後に導入

## 残存リスク

1. キャッシュ破損リスク -> `--force`で復旧
2. レート制限変動リスク -> アダプティブ制御で緩和
3. バッチ処理の品質リスク -> 検出メカニズムが必要
4. テストカバレッジ不足 -> テストコードの追加が前提
