---
title: Semantic Repetition
category: reference
audience: developer
last_updated: 2026-02-18
tags: [semantic, repetition, detection, stagnation]
related: [semantic-memory, embeddings]
---

# Semantic Repetition Detection

連続する出力間のセマンティック類似度を検出し、停滞を特定するモジュール。「Agentic Search in the Wild」論文（arXiv:2601.17617v2）の発見に基づく:

- 軌跡の32.15%が繰り返しパターンを示す
- 繰り返しは停滞を示し、早期停止の機会を知らせる

## 型定義

### SemanticRepetitionResult

セマンティック繰り返し検出の結果。

```typescript
interface SemanticRepetitionResult {
  isRepeated: boolean;        // セマンティック繰り返しが検出されたか
  similarity: number;         // 類似度スコア (0.0-1.0)
  method: "embedding" | "exact" | "unavailable";  // 使用された検出方法
}
```

### SemanticRepetitionOptions

セマンティック繰り返し検出のオプション。

```typescript
interface SemanticRepetitionOptions {
  threshold?: number;         // 繰り返しと見なす類似度閾値（デフォルト: 0.85）
  useEmbedding?: boolean;     // エンベディングベースの検出を使用するか
  maxTextLength?: number;     // 比較するテキストの最大長（デフォルト: 2000）
}
```

### TrajectorySummary

監視用のセッショントレジェクトリサマリー。

```typescript
interface TrajectorySummary {
  totalSteps: number;             // 分析された総ステップ数
  repetitionCount: number;        // 繰り返し検出回数
  averageSimilarity: number;      // ステップ間の平均類似度
  similarityTrend: "increasing" | "decreasing" | "stable";  // 類似度のトレンド
  isStuck: boolean;               // セッションがスタックしているか
}
```

## 定数

### DEFAULT_REPETITION_THRESHOLD

セマンティック繰り返し検出のデフォルト閾値。論文の発見に基づく: 高い類似度での繰り返しは停滞を示す。

```typescript
export const DEFAULT_REPETITION_THRESHOLD = 0.85;
```

### DEFAULT_MAX_TEXT_LENGTH

エンベディング比較用の最大テキスト長。OpenAIエンベディングAPIにはトークン制限があるため、リクエストを管理可能に保つ。

```typescript
export const DEFAULT_MAX_TEXT_LENGTH = 2000;
```

### DEFAULT_MAX_TRAJECTORY_STEPS

トレジェクトリトラッカーに保持するデフォルトの最大ステップ数。境界のないメモリ蓄積を防ぐ。

```typescript
export const DEFAULT_MAX_TRAJECTORY_STEPS = 100;
```

## 関数

### detectSemanticRepetition

2つの出力間のセマンティック繰り返しを検出する。

この関数は以下のいずれかを使用して連続する出力を比較する:
1. エンベディングベースのコサイン類似度（OPENAI_API_KEYが利用可能な場合）
2. 完全文字列一致（フォールバック）

```typescript
async function detectSemanticRepetition(
  current: string,
  previous: string,
  options?: SemanticRepetitionOptions
): Promise<SemanticRepetitionResult>
```

### detectSemanticRepetitionFromEmbeddings

事前計算されたエンベディングを使用する同期バージョン。エンベディングが既に利用可能な場合に使用する。

```typescript
function detectSemanticRepetitionFromEmbeddings(
  currentEmbedding: number[],
  previousEmbedding: number[],
  threshold?: number
): SemanticRepetitionResult
```

### isSemanticRepetitionAvailable

セマンティック繰り返し検出が利用可能かどうかを確認する。embeddingsモジュールのプロバイダーレジストリを使用する。

```typescript
async function isSemanticRepetitionAvailable(): Promise<boolean>
```

### getRecommendedAction

繰り返しスコアに基づいて推奨アクションを取得する。論文の発見に基づく: 高い繰り返しは停滞を示す。

```typescript
function getRecommendedAction(
  repetitionCount: number,
  totalSteps: number,
  isStuck: boolean
): "continue" | "pivot" | "early_stop"
```

## クラス

### TrajectoryTracker

セッション進行を監視するためのシンプルなトレジェクトリトラッカー。DoSを防ぐためのメモリ境界を実装する。

#### メソッド

- `constructor(maxSteps?: number)` - 最大ステップ数を指定してトラッカーを作成
- `async recordStep(output: string, options?: SemanticRepetitionOptions): Promise<SemanticRepetitionResult>` - 新しいステップを記録し、繰り返しをチェック
- `getSummary(): TrajectorySummary` - トレジェクトリサマリーを取得
- `get stepCount(): number` - ステップ数を取得
- `reset(): void` - トラッカーをリセット
