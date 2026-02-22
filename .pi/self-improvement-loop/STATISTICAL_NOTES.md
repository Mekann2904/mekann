---
title: 自己改善ループモード - 統計解析ノート
category: development
audience: developer
last_updated: 2026-02-22
tags: [self-improvement, loop, statistics, philosophical-viewpoints]
related: [../skills/self-improvement/SKILL.md, ../extensions/loop.ts]
---

# 自己改善ループモード - 統計解析ノート

## 概要

Statistician（統計学者）として、自己改善ループモードの設計・実装における統計的側面を管理する。

## 1. 既存実装の分析

### 1.1 loop.ts の状態遷移モデル

```
状態空間: S = {run_start, iteration_N, run_done}
停止条件: T = {model_done, max_iterations, stagnation, iteration_error}
```

**統計的指標:**

| 指標 | 定義 | 現在の設定 |
|------|------|-----------|
| 最大イテレーション数 | N_max | 4-16 (stable profile: 4) |
| タイムアウト | T_timeout | 60,000ms (1分) |
| 停滞閾値 | θ_stagnation | 0.85 (類似度) |
| 連続失敗許容数 | F_max | 2 |

### 1.2 セマンティック停滞検出

**検出手法:**

1. **完全一致**: O(1) - 高速パス
2. **埋め込みベース**: O(n) - セマンティック類似度計算

**類似度計算式:**

```
similarity = cos(θ) = (A · B) / (||A|| * ||B||)
```

where:
- A, B: 埋め込みベクトル
- θ_stagnation = 0.85 (デフォルト)

**論文根拠:** "Agentic Search in the Wild" (arXiv:2601.17617v2)
- 軌跡の32.15%で反復パターン検出
- 反復は停滞を示唆し、早期停止の機会

## 2. 7つの哲学的視座の統計的設計

### 2.1 視座サイクル

```typescript
type PhilosophicalViewpoint =
  | "deconstruction"      // I. 脱構築
  | "schizoanalysis"      // II. スキゾ分析
  | "eudaimonia"          // III. 幸福論
  | "utopia_dystopia"     // IV. ユートピア/ディストピア
  | "philosophy_of_thought" // V. 思考哲学
  | "taxonomy_of_thought" // VI. 思考分類学
  | "logic";              // VII. 論理学

const VIEWPOINT_CYCLE: PhilosophicalViewpoint[] = [
  "deconstruction",
  "schizoanalysis",
  "eudaimonia",
  "utopia_dystopia",
  "philosophy_of_thought",
  "taxonomy_of_thought",
  "logic",
];
```

### 2.2 視座別の評価指標

| 視座 | 主要評価軸 | 期待される出力変化 |
|------|-----------|-------------------|
| 脱構築 | 二項対立の検出数 | 前提の問題化 |
| スキゾ分析 | 欲望投資の方向性 | 創造的再構成 |
| 幸福論 | エウダイモニア指標 | 目的の再定義 |
| ユートピア/ディストピア | 環境影響評価 | 全体主義への警戒 |
| 思考哲学 | メタ認知レベル | 思考の自覚 |
| 思考分類学 | 思考モード適合性 | 状況適応 |
| 論理学 | 推論妥当性 | 誤謬の回避 |

### 2.3 サイクル完了の統計的基準

**1サイクル（7イテレーション）完了時の評価:**

- 全視座を1回ずつ適用
- 各視座での出力を比較し、収束・発散を判定
- 収束の場合: 終了判定を検討
- 発散の場合: 追加サイクルを検討

## 3. 安全停止メカニズム

### 3.1 停止条件の統計的妥当性

| 停止条件 | 統計的根拠 | リスク |
|----------|-----------|--------|
| ユーザー停止要求 | 外部制約 | 低 |
| 全視座完了 | 設計完了 | 低 |
| max_iterations到達 | 資源制約 | 中（未完了リスク） |
| stagnation検出 | 効率性 | 中（過早停止リスク） |
| 連続エラー | 安定性 | 低 |

### 3.2 信頼区間による停止判定

```typescript
interface StoppingCriteria {
  // 統計的停止条件
  convergenceThreshold: number;  // 収束閾値 (default: 0.95)
  minIterations: number;         // 最小イテレーション (default: 7)
  maxCycles: number;             // 最大サイクル数 (default: 3)

  // 早期停止
  earlyStopEnabled: boolean;     // 早期停止有効化
  confidenceLevel: number;       // 信頼水準 (default: 0.95)
}
```

## 4. Git連携の統計的考慮

### 4.1 コミット頻度

- **推奨**: 各視座完了時（7コミット/サイクル）
- **代替**: サイクル完了時（1コミット/サイクル）

### 4.2 変更規模の推定

| 視座 | 期待される変更規模 | 想定ファイル数 |
|------|-------------------|---------------|
| 脱構築 | 中程度 | 3-5 |
| スキゾ分析 | 大きい | 5-10 |
| 幸福論 | 小さく | 1-3 |
| ユートピア/ディストピア | 中程度 | 3-5 |
| 思考哲学 | 小さく | 1-3 |
| 思考分類学 | 中程度 | 3-5 |
| 論理学 | 小さく | 1-3 |

## 5. 検証統計

### 5.1 検出力分析

```typescript
interface PowerAnalysis {
  // 検出力 (1 - β)
  powerToDetectStagnation: number;  // 停滞検出力
  powerToDetectCompletion: number;  // 完了検出力

  // 効果量 (Cohen's d)
  effectSizeForStagnation: number;  // 停滞の効果量
  effectSizeForImprovement: number; // 改善の効果量
}
```

### 5.2 第一種・第二種過誤

| 過誤タイプ | 定義 | 影響 | 緩和策 |
|-----------|------|------|--------|
| 第一種（偽陽性） | 完了していないのに完了判定 | 過早停止 | 厳格な閾値設定 |
| 第二種（偽陰性） | 完了しているのに継続 | 資源浪費 | 複数指標の併用 |

## 6. 出力品質評価

### 6.1 CLAIM-RESULT整合性チェック

```typescript
interface ClaimResultConsistency {
  claim: string;           // 主張
  result: string;          // 結果
  isConsistent: boolean;   // 整合性
  confidence: number;      // 信頼度
  evidence: string[];      // 証拠
}
```

### 6.2 信頼度評価基準

| CONFIDENCE範囲 | 評価 | 必要なアクション |
|---------------|------|-----------------|
| 0.95-1.00 | 非常に高い | なし |
| 0.85-0.94 | 高い | 通常確認 |
| 0.70-0.84 | 中程度 | 追加検証 |
| 0.50-0.69 | 低い | 再実行検討 |
| 0.00-0.49 | 不十分 | 必ず再実行 |

## 7. 実験計画

### 7.1 A/Bテスト設計

- **A群**: 従来のloop実装
- **B群**: 7視座サイクル実装

**評価指標:**
1. 完了率
2. 平均イテレーション数
3. 出力品質スコア
4. ユーザー満足度

### 7.2 サンプルサイズ算出

```typescript
// 検出力0.8、有意水準0.05、効果量0.5の場合
const sampleSizePerGroup = 64; // 各群64回の実行
```

## 8. 更新履歴

| 日付 | 内容 | 作成者 |
|------|------|--------|
| 2026-02-22 | 初版作成 | Statistician |

---

*このノートは統計学者（Statistician）の視点から、自己改善ループモードの設計を支援する。*
