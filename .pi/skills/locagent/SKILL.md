---
name: locagent
description: LocAgent論文に基づくコードローカライゼーションスキル。異種グラフ（directory/file/class/function）と多段探索で、Issue/バグ報告から変更箇所を特定。RepoGraph（行レベル）との連携で高精度なローカライゼーションを実現。
license: MIT
tags: [localization, heterogeneous-graph, multi-hop, agent, locagent]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  based-on: LocAgent-paper-ACL-2025
  last-updated: 2026-03-04
  paper:
    title: "LocAgent: Graph-Guided LLM Agent for Code Localization"
    improvement: "+12% Pass@10 on GitHub issue resolution"
    url: "https://github.com/gersteinlab/LocAgent"
---

# LocAgent Localization Skill

LocAgent論文（ACL 2025）に基づくコードローカライゼーションスキル。異種グラフ（directory/file/class/function）と多段ホップ探索で、Issue/バグ報告から変更箇所を特定する。

**主な機能:**
- **異種グラフ**: directory/file/class/functionノード + contain/import/invoke/inheritエッジ
- **多段探索**: BFSベースのグラフトラバーサル
- **セマンティック検索**: キーワードベース + （将来的に）埋め込みベース
- **RepoGraph連携**: 粗い局所化 → 行レベル詳細取得

**使用ツール:**
- `locagent_index`: 異種グラフインデックスを構築
- `locagent_query`: グラフをクエリ（search/traverse/retrieve/symbol/semantic/stats）

## 使用タイミング

以下の場合にこのスキルを読み込む：
- GitHub Issue解決タスク
- バグ修正のために関連コードを特定する場合
- 新機能実装前に既存コードを理解する場合
- リファクタリングの影響範囲を調査する場合
- コードの依存関係を階層的に追跡する場合

---

## ワークフロー（CRITICAL）

### Phase 1: インデックス構築

タスク開始前にインデックスを構築する：

```typescript
// プロジェクト全体をインデックス
locagent_index({
  path: "./src",
  force: false  // 既存インデックスがあれば再利用
})
```

**インデックスの特性:**
- 保存先: `.pi/search/locagent/index.json`
- 自動更新: 24時間経過またはソース変更時に再構築
- 対応言語: TypeScript, JavaScript, Python

### Phase 2: キーワード抽出

Issue/タスク説明からキーワードを抽出：

```typescript
// 例: "Fix the bug in parseConfig that causes timeout on large files"
// キーワード: parseConfig, timeout, large files, bug

locagent_query({
  type: "search",
  keywords: ["parseConfig", "timeout", "large"],
  limit: 20
})
```

### Phase 3: 多段探索

関連エンティティから多段探索：

```typescript
// parseConfig関数から2ホップ探索
locagent_query({
  type: "traverse",
  nodeIds: ["src/config.ts:parseConfig"],
  direction: "both",  // upstream + downstream
  hops: 2,
  edgeTypes: ["invoke", "import"],
  limit: 50
})
```

### Phase 4: 詳細取得

候補エンティティの詳細を取得：

```typescript
locagent_query({
  type: "retrieve",
  nodeIds: [
    "src/config.ts:parseConfig",
    "src/utils.ts:validateInput"
  ]
})
```

### Phase 5: RepoGraph連携（オプション）

行レベルの詳細が必要な場合：

```typescript
// RepoGraphインデックスを構築
repograph_index({ path: "./src" })

// 特定ファイルの行レベル詳細
repograph_query({
  type: "file",
  file: "src/config.ts"
})
```

---

## ツール選択ガイド

| 目的 | 使用ツール | 例 |
|------|-----------|-----|
| 初回インデックス構築 | `locagent_index` | `locagent_index({ path: "./src" })` |
| キーワード検索 | `locagent_query` (search) | `locagent_query({ type: "search", keywords: [...] })` |
| セマンティック検索 | `locagent_query` (semantic) | `locagent_query({ type: "semantic", keywords: [...] })` |
| 依存関係探索 | `locagent_query` (traverse) | `locagent_query({ type: "traverse", nodeIds: [...] })` |
| エンティティ詳細 | `locagent_query` (retrieve) | `locagent_query({ type: "retrieve", nodeIds: [...] })` |
| シンボル検索 | `locagent_query` (symbol) | `locagent_query({ type: "symbol", keywords: ["foo"] })` |
| グラフ統計 | `locagent_query` (stats) | `locagent_query({ type: "stats" })` |

---

## ノードタイプ

| タイプ | 説明 | ID形式 |
|--------|------|--------|
| directory | ディレクトリ | `src/utils` |
| file | ファイル | `src/utils.ts` |
| class | クラス | `src/utils.ts:ConfigParser` |
| function | 関数/メソッド | `src/utils.ts:parseConfig` |

## エッジタイプ

| タイプ | 説明 |
|--------|------|
| contain | 包含関係（directory→file, file→class, class→function） |
| import | インポート関係（file→class/function） |
| invoke | 呼び出し関係（function→function） |
| inherit | 継承関係（class→class） |

---

## 探索方向

| 方向 | 説明 | 用途 |
|------|------|------|
| downstream | 呼び出し先へ | 影響範囲調査 |
| upstream | 呼び出し元へ | 依存元調査 |
| both | 双方向 | 全体的な関係把握 |

---

## LocAgent vs RepoGraph

| 特徴 | LocAgent | RepoGraph |
|------|----------|-----------|
| 粒度 | 要素レベル（file/class/function） | 行レベル |
| ノードタイプ | directory, file, class, function | def, ref, import |
| エッジタイプ | contain, import, invoke, inherit | invoke, contain, define, reference, next |
| 用途 | 粗い局所化、階層的探索 | 詳細な行レベル特定 |
| 連携 | LocAgentで候補絞り込み → RepoGraphで詳細取得 |

---

## 他ツールとの連携

### search-toolsとの組み合わせ

```typescript
// 1. LocAgentで大まかな位置を特定
const locations = locagent_query({
  type: "search",
  keywords: ["parseConfig"]
})

// 2. code_searchで詳細なコードを確認
code_search({
  pattern: "parseConfig",
  path: locations.results[0].file
})

// 3. sym_findでシンボル定義を確認
sym_find({
  name: "parseConfig",
  file: locations.results[0].file
})
```

### RepoGraphとの連携

```typescript
// 1. LocAgentで候補ファイルを特定
const locagentResult = locagent_query({
  type: "search",
  keywords: ["parseConfig", "validation"]
})

// 2. RepoGraphで行レベル詳細を取得
const repographResult = repograph_query({
  type: "file",
  file: locagentResult.results[0].file
})

// 3. 関連行を特定
repograph_query({
  type: "related",
  nodeId: `${locagentResult.results[0].file}:${locagentResult.results[0].line}`,
  depth: 1
})
```

---

## パフォーマンスガイド

### インデックスサイズ

| プロジェクト規模 | ファイル数 | ノード数 | インデックスサイズ |
|-----------------|-----------|----------|------------------|
| 小規模 | <100 | <1,000 | <500KB |
| 中規模 | 100-500 | 1,000-10,000 | 500KB-2MB |
| 大規模 | >500 | >10,000 | >2MB |

### 最適化のヒント

1. **必要なディレクトリのみインデックス**
   ```typescript
   locagent_index({ path: "./src/core" })
   ```

2. **limitで結果を制限**
   ```typescript
   locagent_query({ type: "search", keywords: [...], limit: 20 })
   ```

3. **edgeTypesで探索を絞り込み**
   ```typescript
   locagent_query({
     type: "traverse",
     nodeIds: [...],
     edgeTypes: ["invoke"]  // 呼び出し関係のみ
   })
   ```

---

## トラブルシューティング

### インデックスが見つからない

```
Error: LocAgent index not found. Run locagent_index first.
```

**解決策:**
```typescript
locagent_index({ path: "./src" })
```

### キーワードが抽出されない

```
No entities found.
```

**解決策:**
- キーワードを具体的に指定
- 関数名、クラス名、ファイル名を明示的に記載

### 結果が空

**原因:**
- インデックスに対象ファイルが含まれていない
- キーワードがコードベースに存在しない

**解決策:**
```typescript
// インデックスの統計を確認
locagent_query({ type: "stats" })
```

---

## 参考資料

- [LocAgent論文](https://arxiv.org/abs/2502.19648)
- [LocAgent GitHub](https://github.com/gersteinlab/LocAgent)
- [RepoGraphスキル](../repograph-localization/SKILL.md)
- [SWE-bench](https://www.swebench.com/)
