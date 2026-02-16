---
name: search-tools
description: 検索ツール（file_candidates, code_search, sym_index, sym_find）の効果的な使用方法を支援するスキル。エージェントが適切なツールを選択し、パフォーマンスと精度を最適化するためのベストプラクティスを提供。
license: MIT
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
  based-on: search-tools-test-suite
---

# Search Tools Best Practices

検索ツール（file_candidates, code_search, sym_index, sym_find）の効果的な使用方法を支援するスキル。エージェントが適切なツールを選択し、パフォーマンスと精度を最適化するためのガイドラインを提供する。

**主な機能:**
- **ツール選択ガイド**: タスクに最適な検索ツールの選択
- **パフォーマンス最適化**: 高速かつ効率的な検索実行
- **エッジケース対応**: よくある失敗パターンと回避策
- **統合ワークフロー**: 複数ツールを組み合わせた検索パターン

## 使用タイミング

以下の場合にこのスキルを読み込む：
- ファイルやコードを検索する場合
- シンボル定義を探す場合
- コードベースの探索を行う場合
- 検索パフォーマンスを最適化する場合

---

## ツール選択ガイド（CRITICAL）

### 意思決定フローチャート

```
タスクの種類は？
│
├─ ファイル/ディレクトリを探す
│   └─ file_candidates を使用
│
├─ コードパターンを検索する
│   └─ code_search を使用
│
└─ 関数/クラス定義を探す
    │
    ├─ インデックス済み？
    │   ├─ Yes → sym_find を使用（高速）
    │   └─ No  → sym_index で生成後、sym_find を使用
    │
    └─ 1回限り？
        └─ code_search でも代用可能
```

### ツール比較表

| ツール | 用途 | 速度 | 精度 | 使用場面 |
|--------|------|------|------|----------|
| file_candidates | ファイル/ディレクトリ列挙 | 高速 | 高 | 拡張子、パス、深度でフィルタ |
| code_search | コードパターン検索 | 高速 | 中-高 | 正規表現、キーワード検索 |
| sym_index | シンボルインデックス生成 | 中速 | 高 | 大規模プロジェクトの事前準備 |
| sym_find | シンボル定義検索 | 超高速 | 高 | 関数、クラス、変数の定義位置特定 |

---

## file_candidates（fd wrapper）

### 概要

fdコマンドを使用した高速ファイル・ディレクトリ列挙。globパターン、拡張子フィルタ、深度制限などをサポート。

### 基本構文

```typescript
file_candidates({
  pattern: "*.ts",        // globパターン（--glob自動付与）
  type: "file",           // "file" | "dir"
  extension: ["ts", "tsx"], // 拡張子フィルタ
  exclude: ["node_modules", "dist"], // 除外パターン
  maxDepth: 3,            // 最大深度
  limit: 50               // 結果数制限
})
```

### ベストプラクティス

#### 1. 必ず除外パターンを指定する

```typescript
// 良い例: node_modules等を除外
file_candidates({
  pattern: "*.ts",
  exclude: ["node_modules", ".git", "dist", "build"]
})

// 悪い例: 除外なし（大量の不要なファイルが返る可能性）
file_candidates({
  pattern: "*.ts"
})
```

#### 2. limitを常に設定する

```typescript
// 良い例: 上限を設定
file_candidates({ limit: 100 })

// 悪い例: 無制限（大規模プロジェクトで問題発生）
file_candidates({}) // limit未指定
```

#### 3. 拡張子フィルタを活用する

```typescript
// 良い例: extensionフィルタ使用
file_candidates({
  extension: ["ts", "tsx"],
  limit: 50
})

// 悪い例: globパターンで拡張子指定（エラーになる可能性）
file_candidates({
  pattern: "*.ts"  // fdは正規表現として解釈
})
```

### アンチパターン

| パターン | 問題 | 解決策 |
|----------|------|--------|
| `pattern: "*.ts"` | 正規表現エラー | `extension: ["ts"]` を使用 |
| `limit: 0` | 無制限と解釈 | 適切な数値を設定 |
| 除外なし | node_modulesが含まれる | `exclude: ["node_modules"]` |

### パフォーマンスガイド

| スコープ | 推定時間 | 推奨limit |
|----------|----------|-----------|
| 小規模（<100ファイル） | <10ms | 50-100 |
| 中規模（<1000ファイル） | 10-50ms | 100-500 |
| 大規模（>1000ファイル） | 50-200ms | 500-1000 |

---

## code_search（rg wrapper）

### 概要

ripgrep（rg）を使用した高速コード検索。正規表現、型フィルタ、コンテキスト行をサポート。

### 基本構文

```typescript
code_search({
  pattern: "function \\w+",   // 検索パターン（正規表現）
  path: "src",                // 検索パス
  type: "ts",                 // ファイル型フィルタ
  context: 3,                 // 前後のコンテキスト行数
  ignoreCase: true,           // 大文字小文字無視
  literal: false,             // リテラル検索フラグ
  limit: 50                   // 結果数制限
})
```

### ベストプラクティス

#### 1. パスを絞り込む

```typescript
// 良い例: 具体的なパスを指定
code_search({
  pattern: "export function",
  path: "src/components",
  limit: 50
})

// 悪い例: プロジェクト全体を検索（遅い・結果過多）
code_search({
  pattern: "function",
  limit: 50
})
```

#### 2. 型フィルタを活用する

```typescript
// 良い例: TypeScriptファイルのみ検索
code_search({
  pattern: "interface",
  type: "ts",
  limit: 50
})

// 悪い例: 全ファイルを検索（markdown等も含む）
code_search({
  pattern: "interface"
})
```

#### 3. リテラル検索を適切に使い分ける

```typescript
// 正規表現メタ文字を含む場合はリテラル検索
code_search({
  pattern: "/* TODO */",
  literal: true  // 正規表現として解釈させない
})

// パターンマッチが必要な場合は正規表現
code_search({
  pattern: "function \\w+\\(\\)",
  literal: false
})
```

#### 4. 空パターンを避ける

```typescript
// 絶対に避ける: 空パターンは全行にマッチ
code_search({
  pattern: ""
})

// 代替案: 具体的なパターンを指定
code_search({
  pattern: "\\S"  // 空白以外の文字を含む行
})
```

### アンチパターン

| パターン | 問題 | 解決策 |
|----------|------|--------|
| `pattern: ""` | 全行マッチ（大量出力） | 具体的なパターンを指定 |
| 不正な正規表現 | エラー発生 | `literal: true` またはパターン修正 |
| パス未指定 | 全プロジェクト検索 | `path` を指定してスコープ限定 |

### 終了コードの意味

| コード | 意味 | 対応 |
|--------|------|------|
| 0 | マッチあり | 結果を処理 |
| 1 | マッチなし | 正常（エラーではない） |
| 2 | 正規表現エラー | パターンを修正 |

### パフォーマンスガイド

| 操作 | 推定時間 | 注意点 |
|------|----------|--------|
| 小規模検索（<100ファイル） | <25ms | 高速 |
| 中規模検索（<1000ファイル） | 25-100ms | パス絞り込み推奨 |
| 大規模検索（>1000ファイル） | 100-500ms | 型フィルタ必須 |
| 並列5回実行 | ~40ms | 逐次より高速 |

---

## sym_index（ctags wrapper）

### 概要

Universal Ctagsを使用してシンボルインデックスを生成。関数、クラス、変数などの定義位置を記録。

### 基本構文

```typescript
sym_index({
  path: "src",           // インデックス対象パス
  force: false           // 強制再生成フラグ
})
```

### ベストプラクティス

#### 1. 生成前に除外パターンを確認する

```typescript
// 良い例: インデックス生成前に除外を確認
// sym_index自体にはexcludeパラメータがないため、
// パスを絞り込むか、.ctags設定ファイルを使用

sym_index({
  path: "src"  // node_modulesを含まないパスを指定
})

// 悪い例: プロジェクトルートを指定（node_modulesが含まれる）
sym_index({
  path: "."  // 大量の警告が出る可能性
})
```

#### 2. 大規模プロジェクトでは事前にインデックス生成

```typescript
// セッション開始時に一度だけ実行
await sym_index({ path: "src" })

// 以降はsym_findで高速検索
await sym_find({ name: "execute", kind: ["function"] })
```

#### 3. インデックスの有効性を確認する

インデックスファイルが存在するか、`sym_find`で結果が返ってくるかで判断。

### アンチパターン

| パターン | 問題 | 解決策 |
|----------|------|--------|
| node_modulesを含む | 大量の警告、低速 | `src` などソースのみを指定 |
| 頻繁な再生成 | 不要なオーバーヘッド | `force: false` または必要時のみ |
| 小規模検索に使用 | オーバーヘッドが大きい | code_searchを使用 |

### パフォーマンスガイド

| スコープ | 推定時間 | 推奨するか |
|----------|----------|------------|
| 小規模（<100ファイル） | <100ms | code_searchで十分 |
| 中規模（<1000ファイル） | 1-5秒 | 使用推奨 |
| 大規模（>1000ファイル） | 5-20秒 | 必須（一度生成すれば高速化） |

---

## sym_find（シンボル検索）

### 概要

sym_indexで生成されたインデックスから、シンボル定義を高速検索。

### 基本構文

```typescript
sym_find({
  name: "execute",           // シンボル名（ワイルドカード可）
  kind: ["function"],        // 種別フィルタ
  file: "src/utils",         // ファイルパスフィルタ
  limit: 50                  // 結果数制限
})
```

### ベストプラクティス

#### 1. kindフィルタで種別を絞り込む

```typescript
// 良い例: 関数のみを検索
sym_find({
  name: "handle*",
  kind: ["function"],
  limit: 20
})

// 悪い例: 種別未指定（変数や定数も含まれる）
sym_find({
  name: "handle*"
})
```

#### 2. nameパターンを活用する

```typescript
// ワイルドカード使用
sym_find({ name: "use*" })      // useで始まるシンボル
sym_find({ name: "*Handler" })  // Handlerで終わるシンボル
sym_find({ name: "*State*" })   // Stateを含むシンボル
```

#### 3. ファイルパスで絞り込む

```typescript
// 特定ディレクトリ内のシンボルのみ
sym_find({
  name: "create",
  file: "src/factory",
  limit: 20
})
```

### kindの主要な値

| kind | 説明 | 例 |
|------|------|-----|
| function | 関数 | `function execute()` |
| class | クラス | `class User {}` |
| constant | 定数 | `const MAX_SIZE = 100` |
| variable | 変数 | `let count = 0` |
| interface | インターフェース | `interface Config {}` |
| method | メソッド | `class A { method() {} }` |

### アンチパターン

| パターン | 問題 | 解決策 |
|----------|------|--------|
| インデックス未生成 | 結果なし | 事前にsym_indexを実行 |
| 非常に広いパターン | 結果過多 | kindやfileで絞り込み |

### パフォーマンス

- インデックス済みの場合: **<20ms**（超高速）
- インデックス未生成の場合: 事前にsym_indexが必要

---

## 統合ワークフロー

### ワークフロー1: 新機能実装箇所の特定

```
1. file_candidates で関連ファイルを特定
   ↓
2. code_search でパターンを検索
   ↓
3. sym_find で具体的な関数定義を特定
```

```typescript
// Step 1: 関連ファイルを探す
const files = await file_candidates({
  pattern: "*auth*",
  extension: ["ts"],
  exclude: ["node_modules", "test"],
  limit: 20
})

// Step 2: 認証関連のコードを検索
const results = await code_search({
  pattern: "authenticate|login|token",
  path: files[0].path,
  type: "ts",
  limit: 30
})

// Step 3: 関数定義を特定
const definitions = await sym_find({
  name: "*auth*",
  kind: ["function"],
  limit: 10
})
```

### ワークフロー2: リファクタリング対象の調査

```
1. sym_index でインデックス生成（大規模プロジェクト）
   ↓
2. sym_find で対象シンボルを検索
   ↓
3. code_search で使用箇所を検索
```

```typescript
// Step 1: インデックス生成（一度だけ）
await sym_index({ path: "src" })

// Step 2: リファクタリング対象の関数を特定
const targets = await sym_find({
  name: "deprecated*",
  kind: ["function"],
  limit: 50
})

// Step 3: 使用箇所を検索
for (const target of targets) {
  const usages = await code_search({
    pattern: target.name,
    path: "src",
    type: "ts",
    limit: 20
  })
}
```

### ワークフロー3: 並列検索でパフォーマンス最大化

```typescript
// 複数の検索を並列実行
const [files, functions, patterns] = await Promise.all([
  file_candidates({
    extension: ["ts"],
    exclude: ["node_modules"],
    limit: 50
  }),
  sym_find({
    kind: ["function"],
    limit: 100
  }),
  code_search({
    pattern: "TODO|FIXME",
    type: "ts",
    limit: 30
  })
])
```

---

## エラーハンドリング

### 一般的なエラーと対応

| エラー | 原因 | 対応 |
|--------|------|------|
| ツールが見つからない | fd/rg/ctags未インストール | Native Fallbackを使用 |
| 正規表現エラー | 不正なパターン | `literal: true` を試す |
| 結果なし | マッチするものがない | パターンを緩める、除外を確認 |
| タイムアウト | 大規模検索 | limitを設定、パスを絞り込む |

### フォールバック戦略

```typescript
// 1. まず高速な検索を試す
let results = await code_search({
  pattern: targetPattern,
  limit: 50
})

// 2. 結果が空の場合、パターンを緩める
if (results.length === 0) {
  results = await code_search({
    pattern: simplifiedPattern,
    ignoreCase: true,
    limit: 100
  })
}

// 3. それでも見つからない場合はファイル探索
if (results.length === 0) {
  const files = await file_candidates({
    pattern: "*related*",
    limit: 20
  })
  // ファイル内容を直接確認
}
```

---

## クイックリファレンス

### タスク別ツール選択

| タスク | 推奨ツール | 理由 |
|--------|-----------|------|
| 「.tsファイルを探す」 | file_candidates | 拡張子フィルタが最適 |
| 「TODOコメントを探す」 | code_search | パターン検索が得意 |
| 「execute関数の定義を探す」 | sym_find | 高速・高精度 |
| 「認証関連のファイルを探す」 | file_candidates | パス/名前でフィルタ |
| 「特定パターンの使用箇所」 | code_search | 広範囲検索が得意 |
| 「クラス一覧を取得」 | sym_find + sym_index | kindフィルタが便利 |

### パフォーマンス最適化の優先順位

1. **除外パターンを設定**（node_modules, .git, dist等）
2. **limitを設定**（無制限を避ける）
3. **パスを絞り込む**（プロジェクト全体を避ける）
4. **型フィルタを使用**（type: "ts"等）
5. **並列実行を活用**（Promise.all）

---

## 設定例

### .ctags（プロジェクトルート）

```
--exclude=node_modules
--exclude=dist
--exclude=build
--exclude=.git
--languages=TypeScript,JavaScript
```

### 推奨除外パターン

```typescript
const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "vendor",
  "__pycache__",
  "*.min.js"
]
```
