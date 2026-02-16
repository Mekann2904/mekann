---
name: alma-memory
description: ALMA（Automated meta-Learning of Memory designs for Agentic systems）に基づくメモリ設計スキル。実行履歴からのパターン抽出、セマンティック検索、継続的学習を支援。
tags: [memory, meta-learning, alma, semantic-search, pattern-extraction]
version: 1.0.0
---

# ALMA Memory Skill

## 概要

このスキルは、ALMA論文（arXiv:2602.07755）の概念に基づき、mekannの実行履歴から学習するメモリシステムを提供します。

## コア機能

### 1. Run Index（実行履歴インデックス）

過去のサブエージェント・チーム実行をインデックス化し、キーワード検索を可能にします。

```typescript
import {
  getOrBuildRunIndex,
  searchRuns,
  findSimilarRuns,
} from "../../lib/run-index.js";

// インデックス取得
const index = getOrBuildRunIndex(cwd);

// 類似タスク検索
const results = findSimilarRuns(index, "バグ修正", 5);
```

### 2. Pattern Extraction（パターン抽出）

成功・失敗パターンを抽出し、再利用可能な知識として蓄積します。

```typescript
import {
  extractAllPatterns,
  getTopSuccessPatterns,
  getFailurePatternsToAvoid,
  findRelevantPatterns,
} from "../../lib/pattern-extraction.js";

// 全パターン抽出
const patterns = extractAllPatterns(cwd);

// 関連パターン検索
const relevant = findRelevantPatterns(cwd, "現在のタスク", 5);
```

### 3. Semantic Memory（セマンティック検索）

OpenAI Embeddings APIを使用したセマンティック検索を提供します。

```typescript
import {
  semanticSearch,
  buildSemanticMemoryIndex,
  isSemanticMemoryAvailable,
} from "../../lib/semantic-memory.js";

// セマンティック検索（要OPENAI_API_KEY）
if (isSemanticMemoryAvailable()) {
  const results = await semanticSearch(cwd, "似たようなバグ", { limit: 5 });
}
```

## 使用パターン

### パターン1: 過去の解決策を参照

```
タスク開始前に:
1. findSimilarRuns で類似タスクを検索
2. 関連する成功パターンを特定
3. 過去のアプローチを参考に計画を立てる
```

### パターン2: 失敗を避ける

```
タスク実行前に:
1. getFailurePatternsToAvoid で失敗パターンを確認
2. 同じ間違いを繰り返さないよう注意
3. 代替アプローチを検討
```

### パターン3: セマンティック検索

```
複雑なクエリの場合:
1. isSemanticMemoryAvailable() でAPI確認
2. semanticSearch で意味的に類似する実行を検索
3. コンテキストとして活用
```

## ALMA概念との対応

| ALMA概念 | mekann実装 |
|---------|-----------|
| Meta Agent | このスキルを使用するエージェント |
| Search Space | lib/run-index.ts + lib/semantic-memory.ts |
| general_update() | addRunToPatterns() |
| general_retrieve() | searchRuns(), semanticSearch() |
| Archive | .pi/memory/ ディレクトリ |
| Evaluation | 既存のverification-workflow |

## 設定

### 環境変数

- `OPENAI_API_KEY`: セマンティック検索用（オプション）

### ストレージ場所

- `.pi/memory/run-index.json`: 実行インデックス
- `.pi/memory/patterns.json`: 抽出されたパターン
- `.pi/memory/semantic-memory.json`: 埋め込みベクトル

## 制約事項

1. セマンティック検索にはOpenAI APIキーが必要
2. インデックスは自動更新されない（必要時にgetOrBuildRunIndexを呼ぶ）
3. 大量の実行履歴がある場合、初回インデックス作成に時間がかかる

## 参考資料

- ALMA論文: arXiv:2602.07755
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
