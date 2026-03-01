---
name: trajectory-reduction
description: AgentDiet論文に基づく軌跡圧縮スキル。LLMエージェントの実行履歴から無駄な情報を削除し、コストを20-30%削減する。
license: MIT
tags: [cost-optimization, efficiency, trajectory, agent]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  paper: "Improving the Efficiency of LLM Agent Systems through Trajectory Reduction"
---

# Trajectory Reduction

AgentDiet論文に基づく軌跡圧縮スキル。LLMエージェントの実行履歴から無駄な情報を削除し、コストを20-30%削減する。

## 概要

マルチターンで実行されるLLMエージェントは、過去の履歴すべてを保持し続けるため、トークンが雪だるま式に増加します。Trajectory Reductionは、この履歴から「無駄な情報」を自動的に削除します。

### 3種類の「無駄」情報

| タイプ | 説明 | 例 |
|--------|------|-----|
| **Useless** | タスクに無関係 | 冗長なテスト出力、参照されないファイル内容 |
| **Redundant** | 重複情報 | 同じファイルの再読み込み、同じエラーメッセージ |
| **Expired** | 期限切れ情報 | 編集前のファイル内容、古い探索結果 |

## 使用ツール

### trajectory_stats

現在の軌跡圧縮統計を表示します。

```
trajectory_stats({
  runId: "optional-run-id",  // 省略時は全実行
  format: "markdown"          // markdown または json
})
```

### trajectory_config

軌跡圧縮の設定を表示・変更します。

```
trajectory_config({ action: "show" })      // 設定表示
trajectory_config({ action: "enable" })    // 有効化
trajectory_config({ action: "disable" })   // 無効化
trajectory_config({ action: "set", key: "threshold", value: "1000" })
```

### trajectory_reduce

指定した実行の軌跡を手動で圧縮します。

```
trajectory_reduce({
  runId: "run-id",
  step: 10  // 省略時は自動判定
})
```

## 設定パラメータ

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `enabled` | `true` | 有効フラグ |
| `reflectionModel` | `gpt-4o-mini` | リフレクションLLMモデル |
| `threshold` | `500` | トークン閾値 |
| `stepsAfter` | `2` | 何ステップ後ろを対象にするか |
| `stepsBefore` | `1` | 何ステップ前をコンテキストに含めるか |
| `skipShortTasks` | `true` | 短いタスクをスキップ |
| `minStepsForReduction` | `5` | 圧縮開始最小ステップ数 |
| `logReductions` | `true` | 圧縮ログを記録 |
| `skipOnCacheHit` | `true` | キャッシュヒット時はスキップ |
| `maxContextTokens` | `8000` | 最大コンテキスト長 |

## スラッシュコマンド

```
/trajectory stats [runId]           # 統計表示
/trajectory config show             # 設定表示
/trajectory config enable           # 有効化
/trajectory config disable          # 無効化
/trajectory reduce <runId>          # 手動圧縮
```

## アルゴリズム

```
1. エージェントが各ステップを実行
2. ステップ完了後、スライディングウィンドウで圧縮対象を決定
3. リフレクションモジュール（GPT-4o-mini）が無駄を検出
4. 圧縮結果を軌跡に適用
5. 次のステップに進む

パラメータ:
  a = stepsAfter = 2   (2ステップ後ろを圧縮)
  b = stepsBefore = 1  (1ステップ前をコンテキストに含める)
  θ = threshold = 500  (500トークン以下はスキップ)
```

## 効果

| 指標 | 論文の結果 |
|------|-----------|
| 入力トークン削減 | 39.9% - 59.7% |
| 最終コスト削減 | 21.1% - 35.9% |
| パフォーマンス影響 | -1% 〜 +2% |

## 注意事項

- **キャッシュとの相互作用**: キャッシュが効いている場合、効果は限定的
- **長いタスクで効果大**: 10分以上、50ステップ以上のタスクで最大効果
- **短いタスク**: 5ステップ未満ではオーバーヘッドが利益を上回る可能性

## ファイル構成

```
.pi/
├── extensions/
│   └── trajectory-reduction.ts    # 拡張機能
├── lib/
│   └── trajectory-reduction/
│       ├── index.ts               # メインモジュール
│       ├── types.ts               # 型定義
│       ├── serialization.ts       # シリアライズ
│       ├── sliding-window.ts      # ウィンドウ管理
│       └── reflection-module.ts   # LLM圧縮
└── data/
    └── trajectory-reduction-config.json  # 設定ファイル
```

## 参考文献

- 論文: "Improving the Efficiency of LLM Agent Systems through Trajectory Reduction" (Xiao et al., 2025)
- 調査レポート: `.pi/ul-workflow/research/trajectory-reduction-paper.md`
- 実装計画: `.pi/ul-workflow/plans/trajectory-reduction-implementation-plan.md`
