---
title: File System Utilities
category: reference
audience: developer
last_updated: 2026-02-18
tags: [filesystem, directory, fs]
related: [storage-base]
---

# File System Utilities

拡張機能間で共有されるファイルシステムユーティリティ。

## 概要

`agent-teams.ts`、`agent-usage-tracker.ts`、`subagents.ts` から重複実装を統合した共通ユーティリティ。

## 関数

### ensureDir(path)

ディレクトリが存在することを保証する。必要に応じて再帰的に作成する。

```typescript
function ensureDir(path: string): void
```

**パラメータ:**
- `path` - 保証するディレクトリパス

**動作:**
- ディレクトリが存在しない場合、`mkdirSync` を `{ recursive: true }` オプションで実行
- 既に存在する場合は何もしない

**例:**
```typescript
import { ensureDir } from "./fs-utils.js";

// 単一ディレクトリ
ensureDir("./output");

// ネストしたディレクトリ（再帰的に作成）
ensureDir("./data/runs/2026/02");
```

## 使用例

```typescript
import { ensureDir } from "./fs-utils.js";

// ログディレクトリの確保
ensureDir("./logs");

// データディレクトリの確保
ensureDir("./data/agent-runs");

// 設定ディレクトリの確保
ensureDir("./.pi/config");
```

## 関連ファイル

- `./storage-base.ts` - ストレージベースユーティリティ
- `./checkpoint-manager.ts` - チェックポイント管理
