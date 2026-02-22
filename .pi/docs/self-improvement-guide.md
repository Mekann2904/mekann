---
title: 思考・推論自己改善システムガイド
category: user-guide
audience: developer
last_updated: 2026-02-22
tags: [self-improvement, philosophy, reasoning, metacognition]
related: [../skills/self-improvement/SKILL.md, ../lib/aporetic-reasoning.ts, ../lib/creative-destruction.ts]
---

# 思考・推論自己改善システムガイド

## 概要

本システムは、7つの哲学的視座（脱構築、スキゾ分析、幸福論、ユートピア/ディストピア、思考哲学、思考分類学、論理学）に基づき、AIエージェントの自己改善を支援する8つのモジュールで構成されています。

## 8つの哲学的モジュール

### モジュール一覧

| モジュール | ファイル | 役割 | 哲学的基盤 |
|-----------|---------|------|-----------|
| アポリア共生型推論 | `aporetic-reasoning.ts` | 解決不能な緊張関係を維持しながら推論 | デリダ的脱構築 |
| 創造的破壊 | `creative-destruction.ts` | 前提の破壊と再構築 | ニーチェ的転回、ドゥルーズ的微分 |
| 超メタ認知 | `hyper-metacognition.ts` | 4層構造のメタ認知 | 思考哲学 |
| 非線形思考 | `nonlinear-thought.ts` | 連想・直観による思考 | スキゾ分析 |
| ベイズ信念更新 | `belief-updater.ts` | 確率論的信念更新 | ベイズ推論 |
| 学習可能モード選択 | `learnable-mode-selector.ts` | 経験に基づく思考モード選択 | 経験主義 |
| アポリア対処 | `aporia-handler.ts` | アポリアの検出と適切な対処 | デリダ的脱構築 |
| 経験再生 | `experience-replay.ts` | 過去の経験からの学習 | 強化学習 |

## 使用方法

### インポート方法

これらのモジュールは`index.ts`からエクスポートされていないため、直接インポートしてください:

```typescript
// アポリア共生型推論
import {
  createAporeticEngine,
  performAporeticInference,
  type AporeticReasoningEngine,
  type AporiaDetection
} from './lib/aporetic-reasoning.js';

// 創造的破壊
import {
  createCreativeDestructionEngine,
  performDestruction,
  type CreativeDestructionEngine
} from './lib/creative-destruction.js';

// 超メタ認知
import {
  createHyperMetacognitionEngine,
  performHyperMetacognition,
  type HyperMetacognitionEngine
} from './lib/hyper-metacognition.js';

// 非線形思考
import {
  createNonLinearThoughtEngine,
  generateNonLinearThoughts,
  type NonLinearThoughtEngine
} from './lib/nonlinear-thought.js';

// ベイズ信念更新
import {
  createPrior,
  updateBelief,
  type Distribution,
  type Evidence
} from './lib/belief-updater.js';

// 学習可能モード選択
import {
  createLearnableSelector,
  selectMode,
  type LearnableModeSelector,
  type ModeSelectionResult
} from './lib/learnable-mode-selector.js';

// アポリア対処
import {
  detectAporia,
  handleAporia,
  type AporiaResolution
} from './lib/aporia-handler.js';

// 経験再生
import {
  createExperienceReplay,
  store,
  retrieve,
  learn,
  type ExperienceReplay,
  type ThinkingSession
} from './lib/experience-replay.js';
```

## 各モジュールの詳細

### 1. アポリア共生型推論 (aporetic-reasoning.ts)

アポリア（解決不能な緊張関係）を「解決」するのではなく、両極を維持しながら推論を行うモジュール。

#### 使用例

```typescript
import {
  createAporeticEngine,
  createInitialBeliefState,
  performAporeticInference,
  type AporiaDetection
} from './lib/aporetic-reasoning.js';

// エンジンの作成
const engine = createAporeticEngine({
  tensionThreshold: 0.7,
  decisionThreshold: 0.8
});

// アポリアの定義
const aporia: AporiaDetection = {
  type: 'value-conflict',
  description: '完全性と速度のトレードオフ',
  tensionLevel: 0.7,
  pole1: {
    concept: '完全性',
    value: '品質を最大化する',
  },
  pole2: {
    concept: '速度',
    value: '効率を最大化する',
  },
  context: '開発プロジェクト',
  detectedAt: new Date(),
};

// 推論の実行
const result = performAporeticInference(engine, aporia, evidenceList);

console.log('パレート最適解:', result.paretoFront);
console.log('推論信頼度:', result.inferenceConfidence);
console.log('回避すべき誘惑:', result.temptationsToAvoid);
```

#### 主な機能

- `createAporeticEngine()`: エンジンの作成
- `createInitialBeliefState()`: アポリアから初期信念状態を作成
- `updateBeliefState()`: 証拠に基づく信念の更新
- `performAporeticInference()`: 完全な推論の実行
- `paretoFrontToVisualization()`: パレート最適解の可視化

### 2. 創造的破壊 (creative-destruction.ts)

前提を破壊し、新たな視点を生成するモジュール。5つの哲学的破壊メソッドを提供。

#### 使用例

```typescript
import {
  createCreativeDestructionEngine,
  registerPremise,
  performDestruction,
  performChainDestruction,
  type PremiseType
} from './lib/creative-destruction.js';

// エンジンの作成
const engine = createCreativeDestructionEngine();

// 前提の登録
const premise = registerPremise(
  engine,
  '論理は普遍である',
  'epistemic' as PremiseType,
  0.9
);

// 単一破壊
const result = performDestruction(engine, premise.id);
console.log('破壊の残骸:', result.remnants);
console.log('再構築の方向性:', result.reconstructionDirection);

// 連鎖破壊
const chain = performChainDestruction(engine, premise.id, 3);
console.log('破壊チェーン:', chain.sequence);
```

#### 5つの破壊メソッド

| メソッド | 名前 | 適用対象 |
|---------|------|---------|
| nietzschean-inversion | ニーチェ的転回 | 規範的前提 |
| deleuzian-differentiation | ドゥルーズ的微分 | 方法論的前提 |
| derridean-deconstruction | デリダ的脱構築 | 知的前提 |
| heideggerian-ontological-difference | ハイデガー的存在論的差異 | 存在論的前提 |
| buddhist-emptiness | 仏教的空 | 文脈的前提 |

### 3. 超メタ認知 (hyper-metacognition.ts)

4層構造で思考を分析し、形式化の罠を検出するモジュール。

#### 使用例

```typescript
import {
  createHyperMetacognitionEngine,
  performHyperMetacognition,
  getThinkingQualityAssessment
} from './lib/hyper-metacognition.js';

// エンジンの作成
const engine = createHyperMetacognitionEngine();

// メタ認知の実行
const state = performHyperMetacognition(engine, '前提を確認して、二項対立を検出する。');

console.log('第0層（直接思考）:', state.layer0);
console.log('第1層（メタ認知）:', state.layer1);
console.log('第2層（超メタ認知）:', state.layer2);
console.log('第3層（限界認識）:', state.layer3);

// 品質評価
const assessment = getThinkingQualityAssessment(state);
console.log('総合スコア:', assessment.overallScore);
console.log('強み:', assessment.strengths);
console.log('弱み:', assessment.weaknesses);
```

#### 4層構造

| 層 | 内容 | 役割 |
|----|------|------|
| 第0層 | 直接的な思考 | 元の思考内容 |
| 第1層 | 思考についての思考 | 従来のメタ認知 |
| 第2層 | メタ認知についての思考 | 形式化リスクの検出 |
| 第3層 | 超メタ認知の限界認識 | 無限後退への気づき |

### 4. 非線形思考 (nonlinear-thought.ts)

論理的接続を必要としない連想・直観による思考を生成するモジュール。

#### 使用例

```typescript
import {
  createNonLinearThoughtEngine,
  registerSeed,
  generateNonLinearThoughts,
  generateParallelThoughts,
  extractSeedsFromText,
  getParetoOptimalInsights
} from './lib/nonlinear-thought.js';

// エンジンの作成
const engine = createNonLinearThoughtEngine();

// 種の登録
const seed = registerSeed(engine, '創造', 'concept');

// 非線形思考の生成
const chain = generateNonLinearThoughts(engine, seed.id, { maxDepth: 5 });
console.log('連想チェーン:', chain.associations);

// 並列思考の生成
const seeds = extractSeedsFromText(engine, '思考とは何か？創造と存在の関係について。');
const chains = generateParallelThoughts(
  engine,
  seeds.slice(0, 3).map(s => s.id)
);

// パレート最適な洞察の抽出
const insights = getParetoOptimalInsights(engine);
console.log('洞察:', insights);
```

### 5. ベイズ信念更新 (belief-updater.ts)

確率論的推論により、証拠に基づく信念の更新を行うモジュール。

#### 使用例

```typescript
import {
  createPrior,
  createEvidence,
  updateBelief,
  getMostProbable,
  type Distribution,
  type Evidence
} from './lib/belief-updater.js';

// 事前分布の作成
const prior = createPrior(
  new Map([
    ['hypothesis-a', 0.3],
    ['hypothesis-b', 0.5],
    ['hypothesis-c', 0.2],
  ])
);

// 証拠の作成
const evidence: Evidence = createEvidence(
  'observation',
  '観測データ',
  new Map([
    ['hypothesis-a', 0.8],
    ['hypothesis-b', 0.3],
    ['hypothesis-c', 0.1],
  ]),
  0.7
);

// 信念の更新
const posterior = updateBelief(prior, evidence);

// 最も確からしい仮説の取得
const mostProbable = getMostProbable(posterior);
console.log('最も確からしい仮説:', mostProbable);
```

### 6. 学習可能モード選択 (learnable-mode-selector.ts)

コンテキストに基づき思考モードを選択し、結果から学習して選択精度を向上させるモジュール。

#### 使用例

```typescript
import {
  createLearnableSelector,
  selectMode,
  provideFeedback,
  type ModeSelectionResult,
  type ModeSelectionFeedback
} from './lib/learnable-mode-selector.js';

// セレクターの作成
const selector = createLearnableSelector();

// モードの選択
const result: ModeSelectionResult = selectMode(selector, context);
console.log('選択されたモード:', result.selectedMode);
console.log('信頼度:', result.confidence);
console.log('代替モード:', result.alternatives);

// フィードバックの提供
const feedback: ModeSelectionFeedback = {
  result,
  outcome: 'success',
  effectiveness: 0.9,
  notes: '良好な結果'
};
const updatedSelector = provideFeedback(selector, feedback);
```

### 7. アポリア対処 (aporia-handler.ts)

アポリアの検出と、統合ではなく両極維持による対処を提供するモジュール。

#### 使用例

```typescript
import {
  detectAporia,
  handleAporia,
  type AporiaDetection,
  type AporiaResolution
} from './lib/aporia-handler.js';

// アポリアの検出
const aporia: AporiaDetection | null = detectAporia(
  '完全性を追求するべきだが、納期も守る必要がある'
);

if (aporia) {
  // アポリアへの対処
  const resolution: AporiaResolution = handleAporia(aporia, {
    urgencyLevel: 0.8,
    timePressure: true,
    informationCompleteness: 0.6
  });

  console.log('対処戦略:', resolution.strategy);
  console.log('根拠:', resolution.rationale);
  console.log('維持される両極:', resolution.maintainedPoles);
}
```

#### 対処戦略

| 戦略 | 説明 | 適用場面 |
|------|------|---------|
| maintain-tension | 緊張関係を維持 | 統合が不適切な場合 |
| acknowledge-undecidable | 決定不能性を認識 | 決断が不要な場合 |
| responsible-decision | 責任ある決断 | 決断が必要な場合 |
| contextual-negotiation | 文脈的交渉 | 両極のバランス調整 |

### 8. 経験再生 (experience-replay.ts)

過去の思考セッションから学習し、類似状況での意思決定を改善するモジュール。

#### 使用例

```typescript
import {
  createExperienceReplay,
  createThinkingSession,
  addStepToSession,
  completeSession,
  store,
  retrieve,
  learn,
  findApplicablePatterns,
  generateRecommendations
} from './lib/experience-replay.js';

// システムの作成
const replay = createExperienceReplay({
  maxSessions: 1000,
  similarityThreshold: 0.3
});

// セッションの作成と記録
let session = createThinkingSession('タスクの内容', {
  taskType: 'implementation',
  complexity: 'medium',
  priority: 'high'
});

// ステップの追加
session = addStepToSession(session, thinkingStep);

// セッションの完了
session = completeSession(session, {
  status: 'success',
  effectiveness: 0.85,
  lessonsLearned: ['教訓1', '教訓2']
});

// セッションの保存
const updatedReplay = store(replay, session);

// 類似経験の検索
const similarExperiences = retrieve(updatedReplay, currentContext);

// 学習の実行
const learningResult = learn(updatedReplay);

// 推奨の生成
const patterns = findApplicablePatterns(updatedReplay, currentContext);
const recommendations = generateRecommendations(patterns, currentContext);
```

## モジュール間の連携パターン

### パターン1: 破壊から洞察へのパイプライン

```typescript
// 1. 創造的破壊
const destructionEngine = createCreativeDestructionEngine();
const premise = registerPremise(destructionEngine, '前提', 'normative', 0.9);
const destruction = performDestruction(destructionEngine, premise.id);

// 2. 非線形思考による新たな視点の探索
const thoughtEngine = createNonLinearThoughtEngine();
for (const remnant of destruction.remnants) {
  registerSeed(thoughtEngine, remnant, 'concept');
}
const insights = getParetoOptimalInsights(thoughtEngine);

// 3. メタ認知による評価
const metaEngine = createHyperMetacognitionEngine();
const state = performHyperMetacognition(metaEngine, insights[0]?.content || '');
```

### パターン2: アポリア検出から対処への流れ

```typescript
// 1. アポリア検出
const aporia = detectAporia('矛盾を含むテキスト');

if (aporia) {
  // 2. アポリア共生型推論
  const aporeticEngine = createAporeticEngine();
  const result = performAporeticInference(aporeticEngine, aporia, []);

  // 3. アポリア対処
  const resolution = handleAporia(aporia, context);

  // 4. 経験再生に保存
  const session = createThinkingSession('アポリア対処');
  const updatedReplay = store(replay, completeSession(session, {
    status: 'success',
    effectiveness: result.inferenceConfidence
  }));
}
```

### パターン3: 学習可能モード選択のフィードバックループ

```typescript
// 1. モード選択
const selector = createLearnableSelector();
const selection = selectMode(selector, context);

// 2. 選択されたモードで思考を実行
const metaEngine = createHyperMetacognitionEngine();
const state = performHyperMetacognition(metaEngine, thoughtContent);

// 3. フィードバックの提供
const feedback: ModeSelectionFeedback = {
  result: selection,
  outcome: state.integratedEvaluation.thinkingQuality > 0.7 ? 'success' : 'partial',
  effectiveness: state.integratedEvaluation.thinkingQuality
};
const updatedSelector = provideFeedback(selector, feedback);
```

## 哲学的基盤とコードの対応表

| 哲学的視座 | 対応モジュール | 主な機能 |
|-----------|--------------|---------|
| 脱構築（デリダ） | aporetic-reasoning, aporia-handler | 二項対立の検出、アポリア維持 |
| スキゾ分析（ドゥルーズ＆ガタリ） | creative-destruction, nonlinear-thought | 欲望の生産性肯定、非線形連想 |
| 幸福論（アリストテレス） | belief-updater, learnable-mode-selector | 「善き生」の追求、経験からの学習 |
| ユートピア/ディストピア | hyper-metacognition | 全体主義への警戒、形式化リスク検出 |
| 思考哲学 | hyper-metacognition | 思考の性質の自覚、無限後退への気づき |
| 思考分類学 | learnable-mode-selector | 思考モードの選択、最適化 |
| 論理学 | belief-updater | ベイズ推論、確率論的更新 |

## トラブルシューティング

### よくある問題

#### 1. アポリアが正しく検出されない

**原因**: テキストに明確な対立構造が含まれていない可能性があります。

**対処**:
```typescript
// 明示的にアポリアを定義
const aporia: AporiaDetection = {
  type: 'value-conflict',
  description: '明確な説明',
  // ...
};
```

#### 2. 創造的破壊が期待した結果を生成しない

**原因**: 前提のタイプ（epistemic, normative等）と破壊メソッドの適合性を確認してください。

**対処**:
```typescript
// 適切な破壊メソッドを選択
const method = getRecommendedMethod('epistemic');
// -> 'derridean-deconstruction'
```

#### 3. メタ認知が形式化の罠に陥る

**原因**: 第2層の形式化リスク（formalizationRisk）が高い場合、分析自体が形式的パターンに陥っている可能性があります。

**対処**:
```typescript
if (state.layer2.formalizationRisk > 0.7) {
  // 非線形思考を導入して形式的パターンを打破
  const newSeeds = extractSeedsFromText(thoughtEngine, state.layer1.observation);
  generateNonLinearThoughts(thoughtEngine, newSeeds[0].id);
}
```

#### 4. 経験再生の類似検索が精度不足

**原因**: 類似度閾値（similarityThreshold）が高すぎる可能性があります。

**対処**:
```typescript
const replay = createExperienceReplay({
  similarityThreshold: 0.2  // デフォルトは0.3、低くすると更多くの結果を取得
});
```

#### 5. モジュール間で循環依存が発生する

**原因**: モジュール間の依存関係が複雑な場合、循環依存が発生する可能性があります。

**対処**:
```typescript
// 型のみをインポート
import type { AporiaDetection } from './aporia-handler.js';

// 実行時は動的インポートを使用
const { handleAporia } = await import('./aporia-handler.js');
```

## 参考リンク

- [自己改善スキル](../skills/self-improvement/SKILL.md)
- [自己点検スキル](../skills/self-reflection/SKILL.md)
- [ABDDスキル](../skills/abdd/SKILL.md)

---

*このドキュメントは自己改善システムの一部として継続的に更新されます。*
