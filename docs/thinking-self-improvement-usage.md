---
title: 思考・推論自己改善モジュール使用例
category: reference
audience: developer
last_updated: 2026-02-22
tags: [bayesian, learning, experience-replay, thinking-process]
related: [thinking-process.ts, belief-updater.ts, learnable-mode-selector.ts, experience-replay.ts]
---

# 思考・推論自己改善モジュール使用例

本ドキュメントでは、ベイズ信念更新、学習可能モード選択、経験再生システムの使用方法を説明します。

## 概要

これら3つのモジュールは連携して動作し、エージェントの推論能力を継続的に改善します：

1. **belief-updater.ts**: ベイズ推論による信念更新
2. **learnable-mode-selector.ts**: 経験から学習する思考モード選択
3. **experience-replay.ts**: 過去のセッションからの学習と再利用

## 基本的な使用フロー

### 1. ベイズ信念更新

```typescript
import {
  createPrior,
  updateBelief,
  createBayesianBelief,
  getMostProbable,
  Evidence
} from './.pi/lib/belief-updater';

// 事前分布を作成
const prior = createPrior(['hypothesis-a', 'hypothesis-b', 'hypothesis-c']);

// 証拠を作成
const evidence: Evidence = {
  type: 'positive',
  value: 'hypothesis-aを支持するデータ',
  strength: 0.8,
  source: 'observation',
  timestamp: new Date()
};

// ベイズ更新を実行
const posterior = updateBelief(prior, evidence);

// 最も確率の高い仮説を取得
const { hypothesis, probability } = getMostProbable(posterior);
console.log(`最も可能性が高い仮説: ${hypothesis} (${(probability * 100).toFixed(1)}%)`);
```

### 2. 学習可能な思考モード選択

```typescript
import {
  createLearnableSelector,
  selectMode,
  updatePriors
} from './.pi/lib/learnable-mode-selector';
import { createThinkingContext } from './.pi/lib/thinking-process';

// セレクターを作成
let selector = createLearnableSelector({
  learningRate: 0.1,
  explorationRate: 0.1
});

// 思考コンテキストを作成
const context = createThinkingContext('パフォーマンスを分析する');

// モードを選択
const result = selectMode(selector, context);
console.log(`選択されたモード: ${result.selectedMode}`);
console.log(`信頼度: ${(result.confidence * 100).toFixed(1)}%`);

// フィードバックに基づいて学習
selector = updatePriors(selector, result.selectedMode, {
  mode: result.selectedMode,
  context,
  success: true,
  effectiveness: 0.8,
  timestamp: new Date()
});
```

### 3. 経験再生システム

```typescript
import {
  createExperienceReplay,
  store,
  retrieve,
  learn,
  createThinkingSession,
  completeSession
} from './.pi/lib/experience-replay';
import { createThinkingContext } from './.pi/lib/thinking-process';

// 経験再生システムを作成
let replay = createExperienceReplay({
  maxSessions: 1000,
  similarityThreshold: 0.3
});

// セッションを作成
const context = createThinkingContext('コードをレビューする');
let session = createThinkingSession(context);

// セッションを完了
session = completeSession(session, {
  status: 'success',
  effectiveness: 0.85,
  lessonsLearned: ['criticalモードが有効だった']
});

// セッションを保存
replay = store(replay, session);

// 類似経験を検索
const similarExperiences = retrieve(replay, context);
similarExperiences.forEach(exp => {
  console.log(`類似度: ${(exp.similarity * 100).toFixed(1)}%`);
  console.log(`適用可能性: ${exp.applicability}`);
});

// パターンを学習
const learningResult = learn(replay);
console.log(`抽出されたパターン数: ${learningResult.patterns.size}`);
```

## 統合使用例

以下は、3つのモジュールを統合して使用する完全な例です：

```typescript
import {
  createLearnableSelector,
  selectMode,
  updatePriors
} from './.pi/lib/learnable-mode-selector';
import {
  createExperienceReplay,
  store,
  retrieve,
  learn,
  createThinkingSession,
  addStepToSession,
  completeSession
} from './.pi/lib/experience-replay';
import {
  createThinkingContext,
  addThinkingStep,
  ThinkingMode
} from './.pi/lib/thinking-process';

// 初期化
let selector = createLearnableSelector();
let replay = createExperienceReplay();

async function processTask(task: string): Promise<void> {
  // 1. コンテキスト作成
  const context = createThinkingContext(task);

  // 2. 類似経験を検索
  const similarExperiences = retrieve(replay, context, { maxResults: 3 });

  // 3. 類似経験から学習があれば適用
  if (similarExperiences.length > 0) {
    console.log(`類似経験が${similarExperiences.length}件見つかりました`);
    similarExperiences.forEach(exp => {
      console.log(`- 類似度: ${(exp.similarity * 100).toFixed(1)}%`);
      exp.session.outcome.lessonsLearned.forEach(lesson => {
        console.log(`  教訓: ${lesson}`);
      });
    });
  }

  // 4. 思考モードを選択
  const modeResult = selectMode(selector, context);
  console.log(`選択されたモード: ${modeResult.selectedMode}`);

  // 5. セッションを開始
  let session = createThinkingSession(context);

  // 6. 思考プロセスを実行（簡易版）
  const updatedContext = addThinkingStep(
    context,
    `タスク「${task}」を${modeResult.selectedMode}モードで分析`,
    modeResult.confidence
  );

  session = addStepToSession(session, {
    mode: modeResult.selectedMode,
    phase: context.phase,
    thought: `タスク「${task}」を${modeResult.selectedMode}モードで分析`,
    confidence: modeResult.confidence,
    timestamp: new Date()
  });

  // 7. セッションを完了
  const effectiveness = modeResult.confidence; // 簡易的な有効性評価
  session = completeSession(session, {
    status: effectiveness > 0.5 ? 'success' : 'partial',
    effectiveness,
    lessonsLearned: [`${modeResult.selectedMode}モードが使用された`]
  });

  // 8. 経験を保存
  replay = store(replay, session);

  // 9. フィードバックに基づいて学習
  selector = updatePriors(selector, modeResult.selectedMode, {
    mode: modeResult.selectedMode,
    context,
    success: effectiveness > 0.5,
    effectiveness,
    timestamp: new Date()
  });

  console.log(`タスク完了: 有効性 ${(effectiveness * 100).toFixed(1)}%`);
}

// 使用例
processTask('パフォーマンスボトルネックを分析する');
processTask('新しいAPIを設計する');
processTask('コードをレビューする');

// 定期的にパターンを学習
const learningResult = learn(replay);
console.log(`学習済みパターン: ${learningResult.patterns.size}件`);
```

## API リファレンス

### belief-updater

| 関数 | 説明 |
|------|------|
| `createPrior(hypotheses)` | 事前分布を作成 |
| `updateBelief(prior, evidence)` | ベイズ更新を実行 |
| `getMostProbable(distribution)` | 最も確率の高い仮説を取得 |
| `calculateEntropy(distribution)` | エントロピーを計算 |
| `klDivergence(p, q)` | KLダイバージェンスを計算 |

### learnable-mode-selector

| 関数 | 説明 |
|------|------|
| `createLearnableSelector(config)` | セレクターを作成 |
| `selectMode(selector, context)` | 思考モードを選択 |
| `updatePriors(selector, mode, outcome)` | フィードバックから学習 |
| `evaluateSelectorPerformance(selector)` | パフォーマンス統計を取得 |

### experience-replay

| 関数 | 説明 |
|------|------|
| `createExperienceReplay(config)` | 経験再生システムを作成 |
| `store(replay, session)` | セッションを保存 |
| `retrieve(replay, context, options)` | 類似経験を検索 |
| `learn(replay)` | パターンを抽出 |
| `createThinkingSession(context)` | セッションを作成 |
| `completeSession(session, outcome)` | セッションを完了 |

## 設定オプション

### LearnableSelectorConfig

```typescript
{
  learningRate: number;      // 学習率（0-1、デフォルト0.1）
  explorationRate: number;   // 探索率（0-1、デフォルト0.1）
  initialPriors?: Record<ThinkingMode, number>;  // 初期事前分布
}
```

### ExperienceReplayConfig

```typescript
{
  maxSessions: number;           // 最大セッション数（デフォルト1000）
  similarityThreshold: number;   // 類似度閾値（0-1、デフォルト0.3）
  learningInterval: number;      // 学習間隔（セッション数、デフォルト10）
  patternMinOccurrences: number; // パターン最小出現回数（デフォルト3）
}
```

## ベストプラクティス

1. **定期的な学習**: 10〜20セッションごとに `learn()` を呼び出してパターンを更新
2. **フィードバックループ**: 各タスク完了後に `updatePriors()` で学習
3. **類似経験の活用**: 新規タスク開始時に `retrieve()` で過去の経験を参照
4. **統計の監視**: `evaluateSelectorPerformance()` で選択器のパフォーマンスを監視
5. **メモリ管理**: `maxSessions` を適切に設定してメモリ使用量を制御

## 既知の制限事項

1. パターン抽出は単純な頻度ベースのアプローチを使用
2. 類似度計算はキーワードベースの簡易実装
3. 大量のセッション（10000以上）では検索性能が低下する可能性

## 関連ファイル

- `.pi/lib/thinking-process.ts`: 思考プロセス基盤
- `.pi/lib/belief-updater.ts`: ベイズ信念更新
- `.pi/lib/learnable-mode-selector.ts`: 学習可能モード選択
- `.pi/lib/experience-replay.ts`: 経験再生システム
- `tests/belief-updater.test.ts`: ベイズ更新テスト
- `tests/learnable-mode-selector.test.ts`: モード選択テスト
- `tests/experience-replay.test.ts`: 経験再生テスト
