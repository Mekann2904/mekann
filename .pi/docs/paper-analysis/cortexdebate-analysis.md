---
title: CortexDebate論文分析レポート
category: development
audience: developer
last_updated: 2026-03-01
tags: [paper-analysis, multi-agent, debate, llm]
related: [../03-development/awo-integration-design.md, ../04-reference/agent-teams.md]
---

# CortexDebate論文分析レポート

**論文**: CortexDebate: Debating Sparsely and Equally for Multi-Agent Debate
**arXiv**: 2507.03928v1
**発表日**: 2025年7月5日
**著者**: Yiliu Sun, Zicheng Zhao, Sheng Wan, Chen Gong

## 1. 論文の概要

### 1.1 解決する問題

既存のMulti-Agent Debate (MAD)メソッドには2つの重大な問題がある:

| 問題 | 説明 | 影響 |
|------|------|------|
| **長すぎる入力コンテキスト** | 各LLMエージェントが他のすべてのエージェントと議論するため、コンテキストが膨大化 | エージェントが情報の海で迷子になり、パフォーマンスが低下 |
| **過信のジレンマ** | 自信過剰なエージェントが議論を支配 | 他の「弱い」エージェントからの有用な情報が無視される |

### 1.2 提案手法: CortexDebate

人間の脳の皮質の動作モードにヒントを得た新しいMAD手法:

```
┌─────────────────────────────────────────────────────────────┐
│                    CortexDebate概要                          │
├─────────────────────────────────────────────────────────────┤
│  人間の脳                                                      │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                 │
│  │ 皮質領域 │←──→│  白質   │←──→│ 皮質領域 │                 │
│  └─────────┘     └─────────┘     └─────────┘                 │
│       ↓               ↓               ↓                      │
│  CortexDebate                                                 │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                 │
│  │LLM Agent│←──→│  MDM    │←──→│LLM Agent│                 │
│  └─────────┘     └─────────┘     └─────────┘                 │
│       ↓               ↓               ↓                      │
│  疎な議論グラフ (有益な相手とのみ議論)                          │
└─────────────────────────────────────────────────────────────┘
```

#### 2つの主要コンポーネント

1. **疎な議論グラフ (Sparse Debating Graph)**
   - 各エージェントは自分に有益なエージェントとのみ議論
   - エッジの重みが平均以下なら削除
   - 結果: 入力コンテキストを大幅に削減

2. **McKinsey-based Debate Matter (MDM)**
   - 人工的な「白質」として機能
   - McKinsey Trust Formulaでエッジの重みを計算
   - グラフを動的に最適化

### 1.3 McKinsey Trust Formulaの適用

元の公式: `T = C × R × I / S`

MAD文脈への適応:

| 要素 | 元の意味 | MAD文脈での意味 | 計算方法 |
|------|----------|-----------------|----------|
| **C** (Credibility) | 専門的能力 | モデルの能力 | Scaling Lawによる損失値の逆数 |
| **R** (Reliability) | パフォーマンスの安定性 | 平均自信スコア | 過去ラウンドの自信スコア平均 |
| **I** (Intimacy) | 他者との関係性 | 視点の違い | 1 - コサイン類似度 |
| **S** (Self-orientation) | 自己志向レベル | 参加度の低さ | 最大可能参加回数 - 実際の参加回数 |

### 1.4 実験結果

| データセット | タスクタイプ | 精度向上 | コンテキスト削減率 |
|-------------|-------------|----------|-------------------|
| GSM-IC | 数学 | +9.00% | - |
| MATH | 数学 | +10.00% | 最大70.79%削減 |
| GPQA | 推論 | +9.00% | - |
| ARC-C | 推論 | +12.33% | - |
| MMLU-pro | 世界知識 | - | - |
| LongBench | 長文理解 | - | - |

---

## 2. 現在のシステムへの導入可能性

### 2.1 既存システムとの比較

| 側面 | 現在のpiシステム | CortexDebate |
|------|-----------------|--------------|
| **通信トポロジー** | 全対全または順次 | 動的・疎なグラフ |
| **エージェント選択** | 固定または手動設定 | 信頼度に基づく自動選択 |
| **過信対策** | なし（自信スコアのみ） | McKinsey Trust Formula |
| **コンテキスト管理** | 全出力を共有 | 有益な出力のみ共有 |

### 2.2 統合ポイント

```
.pi/extensions/agent-teams/
├── extension.ts          # チーム実行のオーケストレーション
├── member-execution.ts   # メンバー実行ロジック
├── communication.ts      # メンバー間通信
└── judge.ts              # 最終審査
```

**統合が必要な箇所**:

1. **communication.ts**: 通信トポロジーを全対全から疎グラフに変更
2. **member-execution.ts**: 入力コンテキストの選択的フィルタリング
3. **新規ファイル mdm.ts**: MDMモジュールの実装

---

## 3. メリット・デメリット分析

### 3.1 メリット

| メリット | 詳細 | 影響度 |
|----------|------|--------|
| **トークンコスト削減** | 入力コンテキストを最大70%削減 | 高 |
| **精度向上** | 従来MAD比で最大12%向上 | 高 |
| **過信の緩和** | 自信過剰なエージェントの影響を抑制 | 中 |
| **スケーラビリティ** | エージェント数増加でも性能維持 | 中 |
| **動的最適化** | タスクに応じて最適な通信パターンを自動生成 | 中 |

### 3.2 デメリット

| デメリット | 詳細 | 影響度 |
|------------|------|--------|
| **実装複雑性** | MDMモジュール、グラフ最適化ロジックが必要 | 高 |
| **追加API呼び出し** | コサイン類似度計算のためEmbedding APIが必要 | 中 |
| **オーバーヘッド** | グラフ構築・最適化の計算コスト | 低 |
| **パラメータ調整** | 閾値設定の調整が必要 | 低 |
| **評価の難しさ** | 「有益な」エージェントの評価が間違う可能性 | 中 |

### 3.3 コスト・ベネフィット分析

```
導入コスト:
├── 実装工数: 約3-5日
│   ├── MDMモジュール: 1日
│   ├── グラフ構築: 1日
│   ├── communication.ts修正: 1日
│   └── テスト・検証: 1-2日
├── API コスト増加:
│   └── Embedding API呼び出し（エージェントペアごと）
└── 保守コスト:
    └── 複雑性増加による保守負担

期待効果:
├── トークンコスト: -30%〜-70%
├── 精度: +5%〜+12%
└── レイテンシ: 大規模チームで改善（通信削減により）
```

---

## 4. pi拡張機能としての実装可能性

### 4.1 実装アーキテクチャ案

```typescript
// 新規ファイル: .pi/extensions/agent-teams/mdm.ts

/**
 * McKinsey-based Debate Matter (MDM) モジュール
 * エッジ重み計算とグラフ最適化を行う
 */

interface EdgeWeight {
  credibility: number;    // C: モデル能力
  reliability: number;    // R: 平均自信スコア
  intimacy: number;       // I: 視点の違い
  selfOrientation: number;// S: 自己志向
  total: number;          // T = C × R × I / S
}

interface DebatingGraph {
  nodes: string[];              // エージェントID
  edges: Map<string, number>;   // "from->to" -> 重み
}

/**
 * MDMモジュールの主な機能
 */
class MDMModule {
  /**
   * エッジ重みを計算
   * @summary McKinsey式で信頼度スコア算出
   */
  calculateEdgeWeight(
    fromAgent: AgentInfo,
    toAgent: AgentInfo,
    history: DebateHistory
  ): EdgeWeight;

  /**
   * 疎な議論グラフを構築
   * @summary 平均以上の重みを持つエッジのみ保持
   */
  buildSparseGraph(
    agents: AgentInfo[],
    history: DebateHistory
  ): DebatingGraph;

  /**
   * エージェントの議論相手を取得
   * @summary 指定エージェントが議論すべき相手を返す
   */
  getDebatingPartners(
    agentId: string,
    graph: DebatingGraph
  ): string[];
}
```

### 4.2 既存コードへの統合ポイント

#### 4.2.1 communication.ts の修正

```typescript
// 現在: 全対全通信
async function runCommunicationRound(
  members: TeamMember[],
  outputs: Map<string, string>
): Promise<void> {
  // 全メンバーの出力を全員に共有
  for (const member of members) {
    const allOutputs = Array.from(outputs.entries());
    // ... 全員の出力を入力に含める
  }
}

// 修正後: 疎グラフベースの通信
async function runCommunicationRound(
  members: TeamMember[],
  outputs: Map<string, string>,
  graph: DebatingGraph  // 追加: 疎グラフ
): Promise<void> {
  for (const member of members) {
    // このメンバーの議論相手のみ取得
    const partners = mdm.getDebatingPartners(member.id, graph);
    const relevantOutputs = partners.map(p => outputs.get(p));
    // ... 選択された出力のみを入力に含める
  }
}
```

#### 4.2.2 extension.ts の修正

```typescript
// チーム実行ループにMDMを統合
async function executeTeamWithMDM(
  team: TeamDefinition,
  task: string
): Promise<TeamRunRecord> {
  const mdm = new MDMModule();
  let history: DebateHistory = [];

  for (let round = 0; round < maxRounds; round++) {
    // 疎グラフを構築
    const graph = mdm.buildSparseGraph(team.members, history);

    // グラフに基づいて通信
    const outputs = await runCommunicationRound(
      team.members,
      previousOutputs,
      graph  // 疎グラフを渡す
    );

    // 履歴を更新
    history = updateHistory(history, outputs);
  }
}
```

### 4.3 設定オプション

```typescript
// .pi/config/agent-teams.json に追加

{
  "cortexDebate": {
    "enabled": true,
    "mdm": {
      "embeddingModel": "text-embedding-3-large",
      "sparsityThreshold": "average",  // "average" | "median" | "top-k"
      "recalibration": {
        "thresholds": [0.8, 0.6, 0.3]  // 自信スコア再校正の閾値
      }
    },
    "graphOptimization": {
      "updateFrequency": "perRound",   // 各ラウンドでグラフを再構築
      "minEdgeWeight": 0.1             // 最小エッジ重み
    }
  }
}
```

### 4.4 必要な外部依存

| 依存先 | 用途 | 必須/オプション |
|--------|------|-----------------|
| OpenAI Embedding API | テキスト類似度計算 | 必須 |
| コサイン類似度関数 | Intimacy計算 | 必須（内部実装可能） |

---

## 5. 段階的導入ロードマップ

### Phase 1: 基礎実装（1-2日）

- [ ] MDMモジュールの基本実装
- [ ] エッジ重み計算ロジック
- [ ] 単体テスト

### Phase 2: グラフ構築（1日）

- [ ] 疎グラフ構築ロジック
- [ ] 平均ベースのエッジ刈り込み
- [ ] グラフ可視化（デバッグ用）

### Phase 3: 統合（1日）

- [ ] communication.tsへの統合
- [ ] extension.tsの修正
- [ ] 設定オプション追加

### Phase 4: 検証（1-2日）

- [ ] 既存テストとの互換性確認
- [ ] ベンチマークテスト
- [ ] トークン使用量の比較

---

## 6. 結論と推奨事項

### 6.1 導入判定

| 観点 | 評価 | コメント |
|------|------|----------|
| 技術的実現可能性 | ◎ | 既存アーキテクチャと互換性あり |
| コスト対効果 | ○ | 実装コストは中程度だが、トークン削減効果が大きい |
| リスク | △ | 新規機能による複雑性増加 |
| 優先度 | 中 | 大規模チーム利用がない場合は緊急性低 |

### 6.2 推奨事項

1. **条件付き導入推奨**: チームメンバーが5人以上の場合に有効
2. **オプトイン方式**: デフォルトは無効、設定で有効化
3. **段階的ロールアウト**: まずは実験的機能として提供
4. **メトリクス収集**: トークン削減率と精度への影響を測定

### 6.3 代替案

CortexDebateの完全実装が重い場合、軽量版として:

1. **簡易版**: 自信スコアベースのフィルタリングのみ
2. **ハイブリッド版**: 初回ラウンドは全対全、2回目以降は疎グラフ
3. **設定ベース**: ユーザーが手動で通信パターンを指定

---

## 7. 参考情報

- 論文URL: https://arxiv.org/html/2507.03928v1
- 関連スキル: `.pi/skills/dyntaskmas/SKILL.md` (動的タスク割り当て)
- 関連ドキュメント: `docs/03-development/awo-integration-design.md` (AWO統合設計)
