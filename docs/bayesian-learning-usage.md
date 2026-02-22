---
title: 思考・推論自己改善モジュールの使用例
category: reference
audience: developer
last_updated: 2026-02-22
tags: [bayesian, learning, thinking, experience-replay]
related: [../.pi/lib/belief-updater.ts, ../.pi/lib/learnable-mode-selector.ts, ../.pi/lib/experience-replay.ts]
---

# 思考・推論自己改善モジュールの使用例

> パンくず: [Home](../README.md) > [Reference](./) > 思考・推論自己改善

## 概要

本ドキュメントでは、ベイズ信念更新、学習可能な思考モード選択器、経験再生システムの3つのモジュールの使用例を示す。これらは既存の`thinking-process.ts`および`aporia-handler.ts`と連携して動作する。

## モジュール概要

| モジュール | 役割 | 主な機能 |
|-----------|------|---------|
| `belief-updater.ts` | ベイズ信念更新 | 確率論的推論、事後分布計算 |
| `learnable-mode-selector.ts` | 学習可能モード選択 | 経験に基づく思考モード選択 |
| `experience-replay.ts` | 経験再生 | セッション保存、類似検索、パターン学習 |

## 基本的な使用例

### 1. ベイズ信念更新

```typescript
import {
  createPrior,
  updateBelief,
  createEvidence,
  getMostProbable,
  evaluateBeliefStrength
} from './.pi/lib/belief-updater';

// 事前分布を作成（仮説リスト）
const prior = createPrior(['hypothesis-a', 'hypothesis-b', 'hypothesis-c']);

// 証拠を作成（各仮説に対する尤度）
const evidence = createEvidence(
  'observation',
  '観測データ',
  new Map([
    ['hypothesis-a', 0.8],  // 仮説Aは80%の尤度
    ['hypothesis-b', 0.15], // 仮説Bは15%の尤度
    ['hypothesis-c', 0.05]  // 仮説Cは5%の尤度
  ]),
  0.7  // 証拠の強さ
);

// ベイズ更新を実行
const posterior = updateBelief(prior, evidence);

// 最も確率の高い仮説を取得
const { hypothesis, probability } = getMostProbable(posterior);
console.log(`最も可能性が高い仮説: ${hypothesis} (${(probability * 100).toFixed(1)}%)`);

// 信念の強さを評価
const evaluation = evaluateBeliefStrength({
  hypothesis: 'hypothesis-a',
  prior,
  likelihood: prior,
  posterior,
  evidence: [evidence],
  lastUpdated: new Date()
});
console.log(`信頼度: ${(evaluation.confidence * 100).toFixed(1)}%`);
```

### 2. 学習可能な思考モード選択器

```typescript
import {
  createLearnableSelector,
  selectMode,
  updatePriors,
  evaluateSelectorPerformance
} from './.pi/lib/learnable-mode-selector';
import { createThinkingContext } from './.pi/lib/thinking-process';

// 選択器を作成
const selector = createLearnableSelector({
  learningRate: 0.15,     // 学習率
  explorationRate: 0.05   // 探索率（新しいモードを試す確率）
});

// 思考コンテキストを作成
const context = createThinkingContext('APIの設計と実装', {
  phase: 'strategy-development'
});

// モードを選択
const result = selectMode(selector, context);
console.log(`選択されたモード: ${result.selectedMode}`);
console.log(`信頼度: ${(result.confidence * 100).toFixed(1)}%`);
console.log(`理由: ${result.reasoning}`);

// フィードバックを提供して学習
const updatedSelector = updatePriors(selector, {
  result,
  outcome: 'success',       // 成功/失敗/部分的成功
  effectiveness: 0.85       // 有効性スコア (0-1)
});

// パフォーマンスを評価
const performance = evaluateSelectorPerformance(updatedSelector);
console.log(`成功率: ${(performance.successRate * 100).toFixed(1)}%`);
console.log(`傾向: ${performance.recentTrend}`);
```

### 3. 経験再生システム

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
} from './.pi/lib/experience-replay';
import { createThinkingContext } from './.pi/lib/thinking-process';

// 経験再生システムを作成
let replay = createExperienceReplay({
  maxSessions: 500,
  similarityThreshold: 0.3,
  learningInterval: 10
});

// 思考セッションを作成
let session = createThinkingSession('ユーザー認証機能の実装', {
  phase: 'problem-discovery',
  mode: 'analytical',
  taskType: 'implementation',
  complexity: 'high',
  tags: ['auth', 'security']
});

// 思考ステップを追加
session = addStepToSession(session, {
  mode: 'analytical',
  phase: 'problem-discovery',
  thought: '認証方式の選択肢を分析する',
  confidence: 0.7,
  timestamp: new Date()
});

session = addStepToSession(session, {
  mode: 'critical',
  phase: 'solution-evaluation',
  thought: 'JWTのセキュリティリスクを評価',
  confidence: 0.8,
  timestamp: new Date()
});

// セッションを完了
session = completeSession(session, {
  status: 'success',
  effectiveness: 0.85,
  lessonsLearned: ['JWT + リフレッシュトークンの組み合わせが効果的']
});

// セッションを保存
replay = store(replay, session);

// 類似経験を検索
const currentContext = createThinkingContext('認証システムの設計');
const similarExperiences = retrieve(replay, currentContext, {
  maxResults: 5,
  minSimilarity: 0.4
});

console.log(`類似経験が${similarExperiences.length}件見つかりました`);
similarExperiences.forEach(exp => {
  console.log(`- ${exp.session.context.task} (類似度: ${(exp.similarity * 100).toFixed(0)}%)`);
});

// パターン学習
const learningResult = learn(replay);
console.log(`学習済みパターン数: ${learningResult.patterns.size}`);

// 適用可能なパターンを検索
const patterns = findApplicablePatterns(learningResult.replay, currentContext);
const recommendations = generateRecommendations(patterns, currentContext);

console.log('推奨事項:');
recommendations.forEach(rec => console.log(`- ${rec}`));
```

## 統合使用例

3つのモジュールを統合して使用する例を示す。

```typescript
import { createThinkingContext, addThinkingStep } from './.pi/lib/thinking-process';
import { createLearnableSelector, selectMode, updatePriors } from './.pi/lib/learnable-mode-selector';
import {
  createExperienceReplay,
  createThinkingSession,
  addStepToSession,
  completeSession,
  store,
  retrieve,
  learn
} from './.pi/lib/experience-replay';

// システムを初期化
let modeSelector = createLearnableSelector();
let experienceReplay = createExperienceReplay();

async function thinkWithLearning(task: string): Promise<void> {
  // 1. 類似経験を検索
  const context = createThinkingContext(task);
  const similarExperiences = retrieve(experienceReplay, context);

  // 2. 過去の経験から初期コンテキストを調整
  if (similarExperiences.length > 0) {
    const bestExperience = similarExperiences[0];
    console.log(`過去の類似経験を参照: ${bestExperience.session.context.task}`);
  }

  // 3. 思考セッションを開始
  let session = createThinkingSession(task);

  // 4. モードを選択
  const selection = selectMode(modeSelector, context);
  console.log(`選択モード: ${selection.selectedMode} (${(selection.confidence * 100).toFixed(0)}%)`);

  // 5. 思考を実行
  const step = {
    mode: selection.selectedMode,
    phase: context.phase,
    thought: `${selection.selectedMode}モードで${task}を分析`,
    confidence: selection.confidence,
    timestamp: new Date()
  };
  session = addStepToSession(session, step);

  // 6. 結果を評価（実際にはここで何らかの処理結果を得る）
  const effectiveness = 0.75; // 仮の有効性スコア
  const outcome = effectiveness > 0.7 ? 'success' : 'partial';

  // 7. セッションを完了
  session = completeSession(session, {
    status: outcome,
    effectiveness,
    lessonsLearned: [`${selection.selectedMode}モードが効果的`]
  });

  // 8. 経験を保存
  experienceReplay = store(experienceReplay, session);

  // 9. 選択器を更新（学習）
  modeSelector = updatePriors(modeSelector, {
    result: selection,
    outcome,
    effectiveness
  });

  // 10. 定期的にパターン学習
  if (experienceReplay.stats.totalSessions % 10 === 0) {
    const learningResult = learn(experienceReplay);
    console.log(`パターン学習完了: ${learningResult.patterns.size}パターン`);
  }
}

// 使用例
(async () => {
  const tasks = [
    'APIの設計と実装',
    'パフォーマンス分析',
    'コードレビュー',
    'ユーザーインタビューの設計',
    'セキュリティ監査'
  ];

  for (const task of tasks) {
    await thinkWithLearning(task);
  }
})();
```

## 既存コードとの互換性

### thinking-process.tsとの連携

```typescript
import {
  ThinkingMode,
  ThinkingPhase,
  ThinkingContext,
  selectThinkingMode as staticSelectMode,
  createThinkingContext
} from './.pi/lib/thinking-process';
import { selectMode, createLearnableSelector } from './.pi/lib/learnable-mode-selector';

// 静的選択と学習可能選択の比較
const context = createThinkingContext('データの分析');

// 従来の静的選択
const staticMode = staticSelectMode(context);
console.log(`静的選択: ${staticMode}`);

// 学習可能選択
const selector = createLearnableSelector();
const dynamicResult = selectMode(selector, context);
console.log(`動的選択: ${dynamicResult.selectedMode}`);
```

### aporia-handler.tsとの連携

```typescript
import { detectAporia, handleAporia } from './.pi/lib/aporia-handler';
import { createThinkingSession, addStepToSession } from './.pi/lib/experience-replay';

// アポリア検出をセッションに記録
function detectAndRecordAporia(session: any, text: string) {
  const aporias = detectAporia(text);

  aporias.forEach(aporia => {
    const resolution = handleAporia(aporia);
    console.log(`アポリア検出: ${aporia.description}`);
    console.log(`対処戦略: ${resolution.strategy}`);

    // アポリア情報をセッションに記録
    // (実際の型定義に合わせて調整)
  });

  return { session, aporias };
}
```

## 設定オプション

### belief-updater.ts

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `smoothingFactor` | number | 0.001 | 平滑化係数（ゼロ除算防止） |
| `normalize` | boolean | true | 更新後に正規化するか |
| `preservePrior` | boolean | true | 事前分布を保持するか |
| `maxEvidenceAge` | number | 604800000 | 証拠の最大保持期間（ms） |

### learnable-mode-selector.ts

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `learningRate` | number | 0.1 | 学習率 |
| `explorationRate` | number | 0.1 | 探索率 |
| `useStaticFallback` | boolean | true | 静的選択へのフォールバック |

### experience-replay.ts

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `maxSessions` | number | 1000 | 最大セッション数 |
| `similarityThreshold` | number | 0.3 | 類似度閾値 |
| `patternConfidenceThreshold` | number | 0.6 | パターン信頼度閾値 |
| `learningInterval` | number | 10 | 学習間隔（セッション数） |
| `maxAge` | number | 2592000000 | セッション最大保持期間（ms） |

## エラーハンドリング

```typescript
import { updateBelief, createPrior, createEvidence } from './.pi/lib/belief-updater';

// 数値的安定性の確保
const prior = createPrior(['a', 'b']);

// 極端な尤度値でも安全に処理
const extremeEvidence = createEvidence('observation', 'test', new Map([
  ['a', 0.0000001],
  ['b', 0.9999999]
]), 1.0);

try {
  const posterior = updateBelief(prior, extremeEvidence);
  // 正規化により安全な値に補正される
  console.log('更新成功:', posterior.probabilities);
} catch (error) {
  console.error('更新エラー:', error);
}
```

## パフォーマンス考慮事項

1. **セッション数の管理**: `maxSessions`を適切に設定し、メモリ使用量を制御
2. **学習間隔**: `learningInterval`を調整して計算負荷を最適化
3. **インデックス活用**: フェーズ・モード・タグによる高速検索
4. **証拠の期限切れ**: `maxEvidenceAge`で古い証拠を自動除外

---

## 関連トピック

- [thinking-process.ts](../.pi/lib/thinking-process.ts) - 基本的な思考プロセス
- [aporia-handler.ts](../.pi/lib/aporia-handler.ts) - アポリア対処
- [self-improvement/SKILL.md](../.pi/skills/self-improvement/SKILL.md) - 哲学的視座

## 次のトピック

[ → コードレビュースキル](../.pi/skills/code-review/SKILL.md)
