---
title: context-engineering.ts
category: reference
audience: developer
last_updated: 2026-02-18
tags: [context, chunking, optimization, llm, tokens]
related: []
---

# context-engineering.ts

コンテキストエンジニアリング最適化モジュール。論文「Large Language Model Reasoning Failures」のP1推奨事項に基づく。

## 概要

コンテキストウィンドウ管理、チャンク戦略、状態サマリー最適化を提供する。優先度ベースのトリミング、意味的境界検出、作業メモリ管理を含む。

## 型定義

### ContextPriority

```typescript
type ContextPriority = "critical" | "high" | "medium" | "low" | "optional"
```

コンテキストコンテンツの優先度レベル。

### ContextCategory

```typescript
type ContextCategory =
  | "task-instruction"
  | "system-prompt"
  | "execution-rules"
  | "file-content"
  | "conversation"
  | "agent-output"
  | "verification-result"
  | "working-memory"
  | "skill-content"
  | "reference-doc"
  | "error-context"
```

コンテキストコンテンツのカテゴリ。

### ContextItem

```typescript
interface ContextItem {
  id: string;
  content: string;
  priority: ContextPriority;
  tokenEstimate: number;
  category: ContextCategory;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}
```

メタデータ付きのコンテキストアイテム。

### ContextWindowConfig

```typescript
interface ContextWindowConfig {
  maxTokens: number;
  reservedTokens: number;
  priorityWeights: Record<ContextPriority, number>;
  categoryLimits: Partial<Record<ContextCategory, number>>;
  preserveOrder: boolean;
  enableSummarization: boolean;
}
```

コンテキストウィンドウ管理の設定。

### OptimizedContext

```typescript
interface OptimizedContext {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
  utilizationRatio: number;
  trimmedItems: TrimmedItem[];
  summaryGenerated: boolean;
  warnings: string[];
}
```

コンテキストウィンドウ最適化の結果。

### TrimmedItem

```typescript
interface TrimmedItem {
  item: ContextItem;
  reason: "budget-exceeded" | "category-limit" | "low-priority" | "duplicate";
  originalTokens: number;
  preservedTokens: number;
}
```

トリムされたコンテンツの情報。

### SemanticBoundary

```typescript
interface SemanticBoundary {
  position: number;
  type: BoundaryType;
  confidence: number;
  metadata?: Record<string, unknown>;
}
```

チャンキング用の意味的境界。

### BoundaryType

```typescript
type BoundaryType =
  | "paragraph"
  | "section"
  | "code-block"
  | "list-end"
  | "dialogue-turn"
  | "topic-shift"
  | "file-boundary"
  | "agent-output"
  | "semantic-gap"
```

意味的境界の種類。

### TextChunk

```typescript
interface TextChunk {
  id: string;
  content: string;
  tokenEstimate: number;
  boundaries: SemanticBoundary[];
  priority: ContextPriority;
  metadata: {
    startPosition: number;
    endPosition: number;
    hasCodeBlock: boolean;
    hasMarkdownHeadings: boolean;
    lineCount: number;
  };
}
```

テキスト分割のチャンク結果。

### ChunkingConfig

```typescript
interface ChunkingConfig {
  maxChunkTokens: number;
  minChunkTokens: number;
  overlapTokens: number;
  respectBoundaries: boolean;
  boundaryTypes: BoundaryType[];
  preserveCodeBlocks: boolean;
  preserveMarkdownSections: boolean;
}
```

チャンキングの設定。

### StateSummary

```typescript
interface StateSummary {
  id: string;
  timestamp: number;
  carriedForward: string[];
  pendingTasks: string[];
  decisions: string[];
  blockers: string[];
  assumptions: string[];
  evidence: EvidenceSummary[];
  confidence: number;
}
```

作業メモリ用の状態サマリー。

### EvidenceSummary

```typescript
interface EvidenceSummary {
  claim: string;
  evidence: string;
  source: string;
  confidence: number;
  contradicted: boolean;
}
```

収集された証拠のサマリー。

### SummaryExtractionConfig

```typescript
interface SummaryExtractionConfig {
  maxCarriedForward: number;
  maxPendingTasks: number;
  maxDecisions: number;
  maxBlockers: number;
  maxAssumptions: number;
  maxEvidence: number;
  minConfidence: number;
}
```

状態サマリー抽出の設定。

## 定数

### DEFAULT_CONTEXT_WINDOW_CONFIG

```typescript
const DEFAULT_CONTEXT_WINDOW_CONFIG: ContextWindowConfig = {
  maxTokens: 128000,
  reservedTokens: 16000,
  priorityWeights: {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
    optional: 0.05,
  },
  categoryLimits: {
    "file-content": 50000,
    "agent-output": 20000,
    "conversation": 15000,
    "reference-doc": 10000,
    "working-memory": 5000,
  },
  preserveOrder: true,
  enableSummarization: true,
}
```

### DEFAULT_CHUNKING_CONFIG

```typescript
const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkTokens: 4000,
  minChunkTokens: 500,
  overlapTokens: 200,
  respectBoundaries: true,
  boundaryTypes: ["paragraph", "section", "code-block", "file-boundary", "semantic-gap"],
  preserveCodeBlocks: true,
  preserveMarkdownSections: true,
}
```

### DEFAULT_SUMMARY_CONFIG

```typescript
const DEFAULT_SUMMARY_CONFIG: SummaryExtractionConfig = {
  maxCarriedForward: 5,
  maxPendingTasks: 3,
  maxDecisions: 5,
  maxBlockers: 3,
  maxAssumptions: 3,
  maxEvidence: 5,
  minConfidence: 0.5,
}
```

## 関数

### トークン推定

#### estimateTokens

テキストのトークン数を推定する。

```typescript
function estimateTokens(text: string): number
```

#### estimateContextItemTokens

コンテキストアイテムのトークン数を推定する。

```typescript
function estimateContextItemTokens(item: ContextItem): number
```

### コンテキストウィンドウ管理

#### optimizeContextWindow

優先度ベースのトリミングでコンテキストウィンドウを最適化する。

```typescript
function optimizeContextWindow(
  items: ContextItem[],
  config?: ContextWindowConfig
): OptimizedContext
```

### 意味的境界検出

#### detectSemanticBoundaries

テキスト内の意味的境界を検出する。

```typescript
function detectSemanticBoundaries(text: string): SemanticBoundary[]
```

### チャンキング

#### chunkText

意味的境界に基づいてテキストをチャンクに分割する。

```typescript
function chunkText(
  text: string,
  config?: ChunkingConfig
): TextChunk[]
```

### 状態サマリー

#### extractStateSummary

出力テキストから状態サマリーを抽出する。

```typescript
function extractStateSummary(
  text: string,
  previousSummary?: StateSummary,
  config?: SummaryExtractionConfig
): StateSummary
```

#### formatStateSummary

状態サマリーをコンテキストに含めるためにフォーマットする。

```typescript
function formatStateSummary(summary: StateSummary): string
```

### ユーティリティ

#### createContextItem

テキストコンテンツからコンテキストアイテムを作成する。

```typescript
function createContextItem(
  content: string,
  category: ContextCategory,
  priority?: ContextPriority,
  options?: {
    id?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): ContextItem
```

#### mergeContextItems

複数のコンテキストアイテムを知的にマージする。

```typescript
function mergeContextItems(
  items: ContextItem[],
  strategy?: "concat" | "summarize" | "priority-first"
): ContextItem
```

#### calculateUtilization

コンテキストウィンドウ利用率を計算する。

```typescript
function calculateUtilization(
  items: ContextItem[],
  maxTokens: number
): {
  usedTokens: number;
  maxTokens: number;
  utilizationRatio: number;
  categoryBreakdown: Record<ContextCategory, number>;
  priorityBreakdown: Record<ContextPriority, number>;
}
```

## 使用例

```typescript
import {
  optimizeContextWindow,
  chunkText,
  extractStateSummary,
  createContextItem,
  DEFAULT_CONTEXT_WINDOW_CONFIG,
} from "./lib/context-engineering.js";

// コンテキストアイテム作成
const items = [
  createContextItem("タスク指示...", "task-instruction", "critical"),
  createContextItem("ファイル内容...", "file-content", "high"),
  createContextItem("会話履歴...", "conversation", "medium"),
];

// コンテキストウィンドウ最適化
const optimized = optimizeContextWindow(items, DEFAULT_CONTEXT_WINDOW_CONFIG);
console.log(`Utilization: ${(optimized.utilizationRatio * 100).toFixed(1)}%`);

// テキストチャンキング
const chunks = chunkText(longDocument);
console.log(`Created ${chunks.length} chunks`);

// 状態サマリー抽出
const summary = extractStateSummary(agentOutput);
console.log(`Carried forward: ${summary.carriedForward.length} items`);
```

## デフォルトエクスポート

```typescript
export default {
  estimateTokens,
  estimateContextItemTokens,
  optimizeContextWindow,
  detectSemanticBoundaries,
  chunkText,
  extractStateSummary,
  formatStateSummary,
  createContextItem,
  mergeContextItems,
  calculateUtilization,
  DEFAULT_CONTEXT_WINDOW_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_SUMMARY_CONFIG,
};
```
