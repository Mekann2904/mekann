---
title: Enhanced Read
category: user-guide
audience: daily-user
last_updated: 2026-02-25
tags: [read, file, enhanced]
related: [./01-extensions.md, ./08-subagents.md, ./09-agent-teams.md]
---

# Enhanced Read

> パンくず: [Home](../../README.md) > [User Guide](../README.md) > Enhanced Read

## 概要

Enhanced Readは、ファイル読み込み機能を拡張し、構文ハイライト、行番号、範囲指定機能を提供するツール拡張機能です。大きなファイルを効率的に確認するための部分的な読み込み機能と、コードの可読性を向上させるためのシンタックスハイライトを提供します。

## 主な機能

- **構文ハイライト**: プログラミング言語を自動検出し、シンタックスハイライトを適用
- **行番号表示**: コードに行番号を付与し、行を特定しやすくする
- **範囲指定読み込み**: `offset` と `limit` でファイルの一部を読み込み
- **言語自動検出**: ファイル拡張子から言語を自動的に識別

## 使用方法

### ファイル全体を読み込む

最も基本的な使用方法です。ファイル全体を読み込みます。

```typescript
await enhanced_read({
  path: "src/main.ts"
});
```

**出力例**:
```
ファイル: src/main.ts | 言語: TypeScript | 範囲: 1-50 行 / 総行数: 50 行
────────────────────────────────────────────────────────────────────
 1 | import { useState } from "react";
 2 | import { Button } from "./components/Button";
 3 |
 4 | export function App() {
 5 |   const [count, setCount] = useState(0);
 6 |
 7 |   return (
 8 |     <div>
 9 |       <h1>Count: {count}</h1>
10 |       <Button onClick={() => setCount(c => c + 1)}>
11 |         Increment
12 |       </Button>
13 |     </div>
14 |   );
15 | }
```

### 指定行から読み込む

`offset` パラメータで開始行を指定します。行番号は1始まりです。

```typescript
await enhanced_read({
  path: "src/main.ts",
  offset: 10
});
```

**出力例**:
```
ファイル: src/main.ts | 言語: TypeScript | 範囲: 10-50 行 / 総行数: 50 行
────────────────────────────────────────────────────────────────────
10 |       <Button onClick={() => setCount(c => c + 1)}>
11 |         Increment
12 |       </Button>
...
```

### 範囲を指定して読み込む

`offset` と `limit` の両方を指定して、特定の範囲だけを読み込みます。

```typescript
await enhanced_read({
  path: "src/main.ts",
  offset: 10,
  limit: 20
});
```

**出力例**:
```
ファイル: src/main.ts | 言語: TypeScript | 範囲: 10-29 行 / 総行数: 50 行
────────────────────────────────────────────────────────────────────
10 |       <Button onClick={() => setCount(c => c + 1)}>
11 |         Increment
12 |       </Button>
13 |     </div>
14 |   );
15 | }
```

## パラメータ詳細

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `path` | string | はい | 読み込むファイルのパス（絶対パスまたは相対パス） |
| `offset` | number | いいえ | 開始行番号（1始まり）。省略時はファイルの先頭（1） |
| `limit` | number | いいえ | 読み込む最大行数。省略時はファイルの末尾まで |

### パラメータの関係

```
offset と limit の関係:
┌─────────────────────────────────────────┐
│ ファイル全体                            │
│                                         │
│  offset で開始行を指定                   │
│       ┌──────────────────┐             │
│       │ 指定範囲          │             │
│       │ (limit行分)       │             │
│       └──────────────────┘             │
│                                         │
└─────────────────────────────────────────┘
```

**計算式**:
- 開始行インデックス = `offset - 1`（配列は0始まり）
- 終了行インデックス = `Math.min(総行数, 開始行インデックス + limit)`
- 表示される行範囲 = `[offset, offset + limit - 1]`（1始まり）

## 使用事例

### 事例1: 大きなファイルの確認

数千行あるファイルで、特定のセクションだけを確認したい場合:

```typescript
// ファイルの総行数を確認
await enhanced_read({
  path: "src/large-component.ts"
});
// 出力: 総行数: 2500 行

// 中間部分を確認
await enhanced_read({
  path: "src/large-component.ts",
  offset: 500,
  limit: 100
});
// 500-599行目が表示される
```

### 事例2: エラー箇所の調査

エラーメッセージに行番号が含まれている場合:

```typescript
// エラー: TypeError at src/utils/helper.ts:42:15

// エラー箇所周辺を確認
await enhanced_read({
  path: "src/utils/helper.ts",
  offset: 35,
  limit: 20
});
// 35-54行目が表示され、エラー行42を含む
```

### 事例3: 関数定義の確認

関数の実装を確認する場合:

```typescript
// ファイル全体を読み込まず、必要な部分だけ確認
await enhanced_read({
  path: "src/service/AuthService.ts",
  offset: 120,
  limit: 50
});
// 関数定義（120行目付近）と実装を確認
```

### 事例4: 段階的なファイル探索

大きなファイルを効率的に探索:

```typescript
// まず最初の100行を確認
await enhanced_read({
  path: "src/api/Client.ts",
  offset: 1,
  limit: 100
});

// 目的の関数が見つかったら、その周辺を詳しく確認
await enhanced_read({
  path: "src/api/Client.ts",
  offset: 150,
  limit: 50
});
```

## 言語自動検出

Enhanced Readはファイル拡張子からプログラミング言語を自動的に検出し、適切な構文ハイライトを適用します。

### 対応言語の例

| 拡張子 | 検出される言語 |
|--------|--------------|
| `.ts`, `.tsx` | TypeScript |
| `.js`, `.jsx` | JavaScript |
| `.py` | Python |
| `.rs` | Rust |
| `.go` | Go |
| `.java` | Java |
| `.cpp`, `.cc`, `.cxx` | C++ |
| `.c`, `.h` | C |
| `.sh` | Shell Script |
| `.md` | Markdown |
| `.json` | JSON |
| `.yaml`, `.yml` | YAML |
| `.xml` | XML |

**例**:

```typescript
// TypeScriptファイル
await enhanced_read({ path: "src/main.ts" });
// 言語: TypeScript

// Pythonファイル
await enhanced_read({ path: "script.py" });
// 言語: Python

// 設定ファイル
await enhanced_read({ path: "config.yaml" });
// 言語: YAML
```

## エラーハンドリング

### ファイルが見つからない場合

```typescript
await enhanced_read({
  path: "non-existent.ts"
});
// エラー: ファイルが見つかりません: non-existent.ts
```

### 不正なoffsetを指定した場合

```typescript
await enhanced_read({
  path: "src/main.ts",
  offset: 0
});
// エラー: offset は1以上の値を指定してください。指定値: 0

await enhanced_read({
  path: "src/main.ts",
  offset: -5
});
// エラー: offset は1以上の値を指定してください。指定値: -5
```

### ファイルの範囲外を指定した場合

```typescript
// ファイルが50行の場合
await enhanced_read({
  path: "src/main.ts",
  offset: 100
});
// エラー: offset 100 はファイルの総行数 50 を超えています。
```

### 不正なlimitを指定した場合

```typescript
await enhanced_read({
  path: "src/main.ts",
  limit: 0
});
// エラー: limit は1以上の値を指定してください。指定値: 0
```

## ベストプラクティス

### 1. 大きなファイルを扱う際

大きなファイルを扱う際は、まず全体を確認してから必要な部分を絞り込む:

```typescript
// ❌ 非効率: 全体を読み込む（数千行）
await enhanced_read({
  path: "src/large-file.ts"
});

// ✅ 効率的: 必要な部分だけ読み込む
await enhanced_read({
  path: "src/large-file.ts",
  offset: 1,
  limit: 50
});
```

### 2. エラー調査の際

エラー箇所を含む範囲を指定して、文脈を確認:

```typescript
// エラー行を含む前後20行程度を確認
const errorLine = 42;
await enhanced_read({
  path: "src/component.ts",
  offset: Math.max(1, errorLine - 20),
  limit: 40
});
```

### 3. 関数やクラスの調査

定義から実装までを確認するために適切な範囲を指定:

```typescript
// 関数定義（行120）とその実装（約50行）を確認
await enhanced_read({
  path: "src/service.ts",
  offset: 120,
  limit: 50
});
```

### 4. 設定ファイルの確認

設定ファイル全体を確認する場合:

```typescript
// 設定ファイルは通常小さいので全体を読み込む
await enhanced_read({
  path: "package.json"
});
```

## 出力形式の解釈

Enhanced Readの出力には以下の情報が含まれます:

```
ファイル: src/main.ts | 言語: TypeScript | 範囲: 10-29 行 / 総行数: 50 行
────────────────────────────────────────────────────────────────────
10 | export function App() {
11 |   return (
12 |     <div>Hello</div>
13 |   );
14 | }
```

**ヘッダー情報**:
- `ファイル`: ファイルパス
- `言語`: 検出されたプログラミング言語
- `範囲`: 表示されている行の範囲（開始行-終了行）
- `総行数`: ファイル全体の行数

**行番号形式**:
- `行番号 | コード`: 行番号は固定幅で右揃えされ、`|` でコードと区切られます

## トラブルシューティング

### 構文ハイライトが表示されない

**原因**: 言語が自動検出できていない可能性があります。

**解決策**: ファイル拡張子が正しいことを確認してください。

```typescript
// ❌ 拡張子がない場合、検出できない
await enhanced_read({ path: "src/component" });

// ✅ 拡張子を付ける
await enhanced_read({ path: "src/component.tsx" });
```

### 表示される行が期待と異なる

**原因**: `offset` と `limit` の計算を間違えている可能性があります。

**解決策**: 行番号は1始まりであることを確認してください。

```typescript
// 100行目から50行分読みたい場合:
await enhanced_read({
  path: "src/main.ts",
  offset: 100,  // 100行目から
  limit: 50     // 50行分
});
// 結果: 100-149行目が表示される
```

### ファイルのエンコーディング問題

**原因**: ファイルがUTF-8以外のエンコーディングで保存されている可能性があります。

**解決策**: ファイルをUTF-8で保存してください。

## 制限事項

- **最大表示行数**: 1回の呼び出しで読み込める行数に制限はありませんが、大きなファイルを一度に読み込むと表示が遅くなる場合があります
- **バイナリファイル**: バイナリファイルの読み込みはサポートされていません
- **特殊文字**: 特殊な文字セットが含まれるファイルでは表示が正しく行われない場合があります

## 関連トピック

- [拡張機能一覧](01-extensions.md) - すべての拡張機能の概要
- [検索ツール](15-search-tools.md) - ファイルを検索して特定する方法
- [GitHub Agent](21-github-agent.md) - リモートリポジトリのファイルを確認

## 次のトピック

[ → ABDD Extension](./23-abdd-extension.md)
