---
name: reasoning-bonds
description: Long CoT推論の分子構造分析スキル。3つのボンド（Deep Reasoning, Self-Reflection, Self-Exploration）の遷移パターンと構造安定性を分析し、委任フローの品質を「分子構造の安定性」という観点から評価する。論文「The Molecular Structure of Thought」に基づく。
license: MIT
tags: [reasoning, chain-of-thought, molecular-structure, delegation, bond-analysis, entropy-convergence]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  theoretical-foundation: "arXiv:2601.06002 - The Molecular Structure of Thought: Mapping the Topology of Long Chain-of-Thought Reasoning"
---

# Reasoning Bonds（推論ボンド）- 分子構造分析

Long Chain-of-Thought推論を「分子的構造」としてモデル化し、3つのボンド（Deep Reasoning、Self-Reflection、Self-Exploration）の遷移パターンと構造安定性を分析するスキル。

**このスキルは、委任フローの品質を「構造安定性」という観点から評価し、構造的カオスを回避するための指針を提供する。**

---

## 3つの推論ボンド

論文「The Molecular Structure of Thought」は、Long CoT推論を「分子構造」としてモデル化し、3つのボンドを定義している：

| ボンド | 化学的類推 | 特徴 | 距離 | エネルギー |
|--------|-----------|------|------|-----------|
| **Deep Reasoning** | 共有結合 | 論理の骨格、密な局所クラスター | 近距離 | 低（強い結合） |
| **Self-Reflection** | 水素結合 | 過去ステップへのフィードバック、安定化 | 中距離 | 中 |
| **Self-Exploration** | ファンデルワールス力 | 遠距離クラスタ間の弱い橋渡し | 長距離 | 高（弱い結合） |

---

## システムへの適用

### 委任システムとの対応

| 論文の概念 | piシステムでの対応 |
|-----------|------------------|
| Deep Reasoning | 委任フロー内の専門的実行（subagent_run） |
| Self-Reflection | self-reflectionスキル、Verification Workflow |
| Self-Exploration | agent_team_run_parallel（並列探索） |

### 構造安定性の評価

チーム実行後のJudge判定において、以下のメトリクスを評価する：

1. **構造安定性スコア**（0-1）：遷移グラフの自己ループと反射の割合
2. **エントロピー収束速度**：議論が収束に向かっているか
3. **ボンド分布の健全性**：各ボンドが最適範囲内にあるか

### 構造的カオスの回避

論文の重要な発見：**異なる安定構造を混合するとパフォーマンスが低下する**。

これを委任システムに適用すると：
- 異なる委任パターン（直列 vs 並列）を混在させると、構造的カオスが発生
- 解決策：一貫した委任パターンを使用するか、明確に分離する

---

## 実践的ガイドライン

### 委任パターンの選択

```markdown
## タスクタイプと推奨ボンド分布

| タスクタイプ | 推奨ボンド分布 |
|-------------|---------------|
| 複雑な分析 | Deep Reasoning > 40% |
| 品質レビュー | Self-Reflection > 30% |
| 探索的調査 | Self-Exploration > 20% |
| 通常実行 | バランス型（25%-25%-25%+25%） |
```

### エントロピー収束の促進

```markdown
## 収束を促進するパターン

1. 通信ラウンドを適切に設定（communicationRounds: 1-2）
2. 最終Judgeの前に合意形成ステップを追加
3. 失敗したメンバーの再試行を制限（failedMemberRetryRounds: 1）
```

### 構造的カオスの警告サイン

```markdown
## カオスの検出

- 警告1: メンバー間で信頼度の分散が大きい
- 警告2: 通信ラウンドが収束せず振動している
- 警告3: 支配的ボンドが存在しない（均等分布）
- 警告4: エントロピーが減少していない
```

---

## 7つの哲学的視座との関係

このスキルは、self-improvementスキルの7つの哲学的視座と以下のように関係する：

| 視座 | 推論ボンドとの関係 |
|------|------------------|
| **脱構築** | 構造の不安定性を暴露（ボンド分布の偏りを分析） |
| **スキゾ分析** | 欲望の生産性（Self-Explorationの創造性を肯定） |
| **幸福論** | 「善き推論」とは何か（構造安定性としての卓越性） |
| **ユートピア/ディストピア** | 構造的カオスへの警戒（ディストピア的傾向の回避） |
| **思考哲学** | 思考の分子的構造（思考のトポロジー分析） |
| **思考分類学** | 3つのボンド（思考モードの分類） |
| **論理学** | 推論の妥当性（エントロピー収束としての論理的一貫性） |

---

## 自己点検への統合

推論ボンド分析を自己点検プロセスに統合する場合、以下のチェックリストを使用する：

```markdown
## 推論ボンド チェックリスト

### タスク開始前

- [ ] このタスクに適したボンド分布は何か？
- [ ] 委任パターンが一貫しているか？
- [ ] 構造的カオスのリスクがあるか？

### タスク実行中

- [ ] メンバー間の信頼度が収束に向かっているか？
- [ ] エントロピーが増加していないか？
- [ ] 支配的ボンドが存在するか？

### タスク完了後

- [ ] 構造安定性スコアは許容範囲内か？
- [ ] 推奨事項がある場合、次回どう改善するか？
- [ ] 「完了」と言うことで、どのような構造的問題を見過ごしていないか？
```

---

## 技術的詳細

### 遷移確率グラフ

ボンド遷移を確率グラフとしてモデル化し、類似度をPearson相関で測定する。

```
P(b' | b) = count(b -> b') / count(b)
```

### エントロピー収束

エントロピー収束速度を以下のように計算する：

```
convergenceRate = (initialEntropy - finalEntropy) / initialEntropy
```

### 最適範囲

論文のFigure 5-8に基づく推定値：

| ボンド | 最小 | 最適 | 最大 |
|--------|-----|------|------|
| Deep Reasoning | 25% | 35% | 45% |
| Self-Reflection | 15% | 25% | 35% |
| Self-Exploration | 10% | 15% | 25% |
| Normal Operation | 15% | 25% | 35% |

---

## 関連ファイル

- `.pi/lib/reasoning-bonds.ts` - 分子構造分析ライブラリ
- `.pi/lib/reasoning-bonds-evaluator.ts` - チーム評価器
- `.pi/extensions/agent-teams/bond-integration.ts` - Judge統合モジュール
- `tests/unit/lib/reasoning-bonds.test.ts` - 単体テスト
- `tests/unit/lib/reasoning-bonds-evaluator.test.ts` - 評価器テスト

---

## 参考文献

- 論文: "The Molecular Structure of Thought: Mapping the Topology of Long Chain-of-Thought Reasoning" (arXiv:2601.06002)
- 関連スキル: self-improvement, self-reflection, harness-engineering
