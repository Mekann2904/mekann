---
name: repograph-localization
description: RepoGraph手法に基づくコードローカライゼーションスキル。SWE-benchで+32.8%の改善を達成した論文の手法を実装。タスク説明からキーワードを抽出し、行レベルの依存グラフから関連コード位置を特定する。
license: MIT
tags: [localization, graph, tree-sitter, code-navigation, repograph]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  based-on: RepoGraph-paper-SWE-bench
  last-updated: 2026-02-24
  paper:
    title: "RepoGraph: Enhancing AI Software Engineering with Repository-Level Code Graph"
    improvement: "+32.8% on SWE-bench"
    url: "https://github.com/ozyyshr/RepoGraph"
---

# RepoGraph Localization Skill

RepoGraph論文（SWE-benchで+32.8%改善）に基づくコードローカライゼーションスキル。行レベルの依存グラフを構築し、タスクに関連するコード位置を特定する。

**主な機能:**
- **行レベルグラフ**: コード行をノード、依存関係をエッジとするグラフ構築
- **AST解析**: tree-sitterによる正確な定義/参照抽出
- **標準ライブラリフィルタリング**: ノイズとなる標準ライブラリを除外
- **エゴグラフ検索**: キーワードからk-hopサブグラフを抽出
- **自動コンテキスト拡張**: サブエージェント/エージェントチームへの統合

**使用ツール:**
- `repograph_index`: RepoGraphインデックスを構築
- `repograph_query`: インデックスをクエリ
- `repograph_localize`: タスクからコード位置を特定

## 使用タイミング

以下の場合にこのスキルを読み込む：
- バグ修正のために関連コードを特定する場合
- 新機能実装前に既存コードを理解する場合
- コードの依存関係を追跡する場合
- リファクタリングの影響範囲を調査する場合
- SWE-benchタイプのタスク（GitHub issue解決）を処理する場合

---

## ワークフロー（CRITICAL）

### Phase 1: インデックス構築

タスク開始前にインデックスを構築する：

```typescript
// プロジェクト全体をインデックス
repograph_index({
  path: "./src",
  force: false  // 既存インデックスがあれば再利用
})
```

**インデックスの特性:**
- 保存先: `.pi/search/repograph/index.json`
- 自動更新: 24時間経過またはソース変更時に再構築
- 対応言語: TypeScript, JavaScript, Python

### Phase 2: ローカライゼーション

タスク説明から関連コードを特定：

```typescript
repograph_localize({
  task: "Fix the bug in parseConfig that causes timeout on large files",
  k: 2,        // 2ホップ探索
  maxNodes: 50 // 最大50ノード
})
```

### Phase 3: 詳細クエリ

特定のシンボルについて詳しく調べる：

```typescript
// シンボル検索
repograph_query({
  type: "symbol",
  symbol: "parseConfig"
})

// 定義を検索
repograph_query({
  type: "definitions",
  symbol: "Config"
})

// 関連ノードを探索
repograph_query({
  type: "related",
  nodeId: "src/config.ts:42",
  depth: 2
})
```

---

## ツール選択ガイド

| 目的 | 使用ツール | 例 |
|------|-----------|-----|
| 初回インデックス構築 | `repograph_index` | `repograph_index({ path: "./src" })` |
| タスクからコード特定 | `repograph_localize` | `repograph_localize({ task: "..." })` |
| 特定シンボル検索 | `repograph_query` (symbol) | `repograph_query({ type: "symbol", symbol: "foo" })` |
| 定義場所を知りたい | `repograph_query` (definitions) | `repograph_query({ type: "definitions", symbol: "Config" })` |
| 使用箇所を知りたい | `repograph_query` (references) | `repograph_query({ type: "references", symbol: "parse" })` |
| 依存関係を探索 | `repograph_query` (related) | `repograph_query({ type: "related", nodeId: "..." })` |
| グラフ統計を見る | `repograph_query` (stats) | `repograph_query({ type: "stats" })` |

---

## キーワード抽出の仕組み

`repograph_localize`は以下のパターンでキーワードを抽出：

1. **関数/メソッド名**: `functionName(` → `functionName`
2. **クラス名**: `ClassName` （先頭大文字）
3. **変数名**: `variableName =` → `variableName`
4. **ファイルパス**: `'path/to/file.ts'`
5. **エラー識別子**: `ERROR_CODE`
6. **キャメルケース/スネークケース**: `camelCase`, `snake_case`
7. **引用符内の文字列**: `'stringLiteral'`

**ストップワード除外:**
- 英語のストップワード（the, a, is, ...）
- コードの予約語（function, class, const, ...）

---

## エゴグラフ（k-hop探索）

RepoGraphの核心機能。キーワードからk-hopのサブグラフを抽出：

```
seed node (keyword match)
  └── 1-hop: 直接的な呼び出し元/呼び出し先
      └── 2-hop: 間接的な依存関係
          └── 3-hop: さらに遠い関係（デフォルトでは使用しない）
```

**推奨設定:**
- `k=1`: 直接的な関連のみ（高速、精度高）
- `k=2`: バランス型（デフォルト、推奨）
- `k=3`: 広範囲（遅い、ノイズ増加）

---

## ノードタイプ

| タイプ | 記号 | 説明 |
|--------|------|------|
| def | D | 定義（関数、クラス、変数の定義行） |
| ref | R | 参照（関数呼び出し、変数使用） |
| import | I | インポート（外部モジュール参照） |

## エッジタイプ

| タイプ | 説明 |
|--------|------|
| invoke | 関数呼び出し関係 |
| contain | 包含関係（ファイル→関数） |
| reference | 参照関係 |
| next | 連続行関係 |

---

## 他ツールとの連携

### search-toolsとの組み合わせ

```typescript
// 1. RepoGraphで大まかな位置を特定
const locations = repograph_localize({ task: "..." })

// 2. code_searchで詳細なコードを確認
code_search({
  pattern: "parseConfig",
  path: locations.locations[0].file
})

// 3. sym_findでシンボル定義を確認
sym_find({
  name: "parseConfig",
  file: locations.locations[0].file
})
```

### call_graphとの比較

| 機能 | call_graph | RepoGraph |
|------|-----------|-----------|
| 粒度 | 関数レベル | 行レベル |
| 解析方法 | 正規表現 | AST（tree-sitter） |
| 信頼度 | 0.1-1.0 | 1.0（定義）/ 0.8（参照） |
| ノイズ | 多め | 少ない（標準ライブラリ除外） |
| 用途 | 呼び出し関係の概要 | 詳細なローカライゼーション |

---

## パフォーマンスガイド

### インデックスサイズ

| プロジェクト規模 | ファイル数 | ノード数 | インデックスサイズ |
|-----------------|-----------|----------|------------------|
| 小規模 | <100 | <5,000 | <1MB |
| 中規模 | 100-1000 | 5,000-50,000 | 1-10MB |
| 大規模 | >1000 | >50,000 | >10MB |

### 最適化のヒント

1. **必要なディレクトリのみインデックス**
   ```typescript
   repograph_index({ path: "./src/core" })  // プロジェクト全体ではなく
   ```

2. **maxNodesで結果を制限**
   ```typescript
   repograph_localize({ task: "...", maxNodes: 30 })  // 50ではなく30
   ```

3. **キャッシュを活用**
   ```typescript
   repograph_index({ force: false })  // force: trueを避ける
   ```

---

## トラブルシューティング

### インデックスが見つからない

```
Error: RepoGraph index not found. Run repograph_index first.
```

**解決策:**
```typescript
repograph_index({ path: "./src" })
```

### キーワードが抽出されない

```
Error: No keywords could be extracted from the task description.
```

**解決策:**
- タスク説明に具体的な識別子を含める
- 関数名、クラス名、ファイル名を明示的に記載

### 結果が空

**原因:**
- インデックスに対象ファイルが含まれていない
- キーワードがコードベースに存在しない

**解決策:**
```typescript
// インデックスの統計を確認
repograph_query({ type: "stats" })

// 対象ファイルが含まれているか確認
repograph_query({ type: "file", file: "path/to/file.ts" })
```

---

## 自動コンテキスト拡張

サブエージェントとエージェントチームは自動的にRepoGraphコンテキストを受け取ります：

```typescript
// 自動的にenrichContextが呼ばれる
// subagent:before_task フック
// agent_team:before_task フック
```

**コンテキストの形式:**
```markdown
## RepoGraph Localization

Found 15 relevant code locations:

### src/config.ts
- `42` [D] parseConfig
- `58` [R] parseConfig
- `72` [D] validateConfig

### Summary
Found 8 definitions and 7 references. Key symbols: parseConfig, validateConfig, loadSettings.
```

---

## 参考資料

- [RepoGraph論文](https://arxiv.org/abs/2412.14601)
- [RepoGraph GitHub](https://github.com/ozyyshr/RepoGraph)
- [SWE-bench](https://www.swebench.com/)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/)
