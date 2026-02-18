---
title: storage-base
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# storage-base

## 概要

`storage-base` モジュールのAPIリファレンス。

## インポート

```typescript
import { existsSync, readdirSync, readFileSync... } from 'node:fs';
import { basename, join } from 'node:path';
import { ensureDir } from './fs-utils.js';
import { atomicWriteTextFile, withFileLock } from './storage-lock.js';
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createPathsFactory` | サブディレクトリ用のパスファクトリを作成 |
| 関数 | `createEnsurePaths` | ディレクトリを作成する関数を生成する |
| 関数 | `pruneRunArtifacts` | 古い実行アーティファクトを削除する |
| 関数 | `mergeEntitiesById` | IDを基にエンティティ配列をマージする。 |
| 関数 | `mergeRunsById` | runIdで配列を結合・ソートし上限を適用 |
| 関数 | `resolveCurrentId` | 現在のIDを解決し、定義内に存在するか確認 |
| 関数 | `resolveDefaultsVersion` | Extract defaults version from disk storage. |
| 関数 | `createStorageLoader` | ストレージローダー関数を作成する。 |
| 関数 | `createStorageSaver` | ストレージ保存用関数を作成する |
| 関数 | `toId` | Convert string to ID format (lowercase, hyphen-sep |
| 関数 | `mergeSubagentStorageWithDisk` | サブエージェントストレージとディスク状態をマージ |
| 関数 | `mergeTeamStorageWithDisk` | チームストレージとディスクの状態をマージする。 |
| インターフェース | `HasId` | IDを持つエンティティの基底インターフェース |
| インターフェース | `BaseRunRecord` | 実行記録の基本インターフェース。runIdを一意識別子とする。 |
| インターフェース | `BaseStoragePaths` | ストレージの基本パスを定義するインターフェース |
| インターフェース | `BaseStorage` | 定義と実行を含むストレージの基底インターフェース |
| インターフェース | `CreateStorageLoaderOptions` | ストレージローダー作成用のオプション |
| インターフェース | `CreateStorageSaverOptions` | ストレージ保存機能の作成オプション。 |

## 図解

### クラス図

```mermaid
classDiagram
  class HasId {
    <<interface>>
    +id: string
  }
  class BaseRunRecord {
    <<interface>>
    +runId: string
    +status: completed_failed
    +startedAt: string
    +finishedAt: string
    +outputFile: string
  }
  class BaseStoragePaths {
    <<interface>>
    +baseDir: string
    +runsDir: string
    +storageFile: string
  }
  class BaseStorage {
    <<interface>>
    +definitions: TDefinition
    +runs: TRun
    +currentId: TCurrentKey
    +defaultsVersion: number
  }
  class CreateStorageLoaderOptions {
    <<interface>>
    +ensurePaths: cwd_string_TPaths
    +createDefaults: nowIso_string_TSt
    +validateStorage: parsed_unknown_nowI
    +defaultsVersion: number
    +storageKey: string
  }
  class CreateStorageSaverOptions {
    <<interface>>
    +ensurePaths: cwd_string_TPaths
    +normalizeStorage: storage_TStorage
    +mergeWithDisk: storageFile_string
    +getRuns: storage_TStorage
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[storage-base]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    fs_utils["fs-utils"]
    storage_lock["storage-lock"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  createPathsFactory["createPathsFactory()"]
  createEnsurePaths["createEnsurePaths()"]
  pruneRunArtifacts["pruneRunArtifacts()"]
  mergeEntitiesById["mergeEntitiesById()"]
  mergeRunsById["mergeRunsById()"]
  resolveCurrentId["resolveCurrentId()"]
  createPathsFactory -.-> createEnsurePaths
  createEnsurePaths -.-> pruneRunArtifacts
  pruneRunArtifacts -.-> mergeEntitiesById
  mergeEntitiesById -.-> mergeRunsById
  mergeRunsById -.-> resolveCurrentId
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant storage_base as "storage-base"
  participant fs_utils as "fs-utils"
  participant storage_lock as "storage-lock"

  Caller->>storage_base: createPathsFactory()
  storage_base->>fs_utils: 内部関数呼び出し
  fs_utils-->>storage_base: 結果
  storage_base-->>Caller: void

  Caller->>storage_base: createEnsurePaths()
  storage_base-->>Caller: cwd_string_TPaths
```

## 関数

### createPathsFactory

```typescript
createPathsFactory(subdir: string): void
```

サブディレクトリ用のパスファクトリを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| subdir | `string` | はい |

**戻り値**: `void`

### createEnsurePaths

```typescript
createEnsurePaths(getPaths: (cwd: string) => TPaths): (cwd: string) => TPaths
```

ディレクトリを作成する関数を生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| getPaths | `(cwd: string) => TPaths` | はい |

**戻り値**: `(cwd: string) => TPaths`

### pruneRunArtifacts

```typescript
pruneRunArtifacts(paths: BaseStoragePaths, runs: TRun[]): void
```

古い実行アーティファクトを削除する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| paths | `BaseStoragePaths` | はい |
| runs | `TRun[]` | はい |

**戻り値**: `void`

### mergeEntitiesById

```typescript
mergeEntitiesById(disk: TEntity[], next: TEntity[]): TEntity[]
```

IDを基にエンティティ配列をマージする。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| disk | `TEntity[]` | はい |
| next | `TEntity[]` | はい |

**戻り値**: `TEntity[]`

### mergeRunsById

```typescript
mergeRunsById(disk: TRun[], next: TRun[], maxRuns: number): TRun[]
```

runIdで配列を結合・ソートし上限を適用

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| disk | `TRun[]` | はい |
| next | `TRun[]` | はい |
| maxRuns | `number` | はい |

**戻り値**: `TRun[]`

### resolveCurrentId

```typescript
resolveCurrentId(nextId: string | undefined, diskId: string | undefined, definitions: TEntity[]): string | undefined
```

現在のIDを解決し、定義内に存在するか確認

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| nextId | `string | undefined` | はい |
| diskId | `string | undefined` | はい |
| definitions | `TEntity[]` | はい |

**戻り値**: `string | undefined`

### resolveDefaultsVersion

```typescript
resolveDefaultsVersion(diskVersion: unknown, currentVersion: number): number
```

Extract defaults version from disk storage.

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| diskVersion | `unknown` | はい |
| currentVersion | `number` | はい |

**戻り値**: `number`

### createStorageLoader

```typescript
createStorageLoader(options: CreateStorageLoaderOptions<TStorage, TPaths>): (cwd: string) => TStorage
```

ストレージローダー関数を作成する。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `CreateStorageLoaderOptions<TStorage, TPaths>` | はい |

**戻り値**: `(cwd: string) => TStorage`

### createStorageSaver

```typescript
createStorageSaver(options: CreateStorageSaverOptions<TStorage, TPaths>): (cwd: string, storage: TStorage) => void
```

ストレージ保存用関数を作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| options | `CreateStorageSaverOptions<TStorage, TPaths>` | はい |

**戻り値**: `(cwd: string, storage: TStorage) => void`

### toId

```typescript
toId(input: string): string
```

Convert string to ID format (lowercase, hyphen-separated).

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| input | `string` | はい |

**戻り値**: `string`

### mergeSubagentStorageWithDisk

```typescript
mergeSubagentStorageWithDisk(storageFile: string, next: {
    agents: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentAgentId?: string;
    defaultsVersion?: number;
  }, defaultsVersion: number, maxRuns: number): typeof next
```

サブエージェントストレージとディスク状態をマージ

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storageFile | `string` | はい |
| next | `object` | はい |
| &nbsp;&nbsp;↳ agents | `Array<{ id: string }>` | はい |
| &nbsp;&nbsp;↳ runs | `Array<{ runId: string; startedAt?: string; finishedAt?: string }>` | はい |
| &nbsp;&nbsp;↳ currentAgentId | `string` | いいえ |
| &nbsp;&nbsp;↳ defaultsVersion | `number` | いいえ |
| defaultsVersion | `number` | はい |
| maxRuns | `number` | はい |

**戻り値**: `typeof next`

### mergeTeamStorageWithDisk

```typescript
mergeTeamStorageWithDisk(storageFile: string, next: {
    teams: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentTeamId?: string;
    defaultsVersion?: number;
  }, defaultsVersion: number, maxRuns: number): typeof next
```

チームストレージとディスクの状態をマージする。

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| storageFile | `string` | はい |
| next | `object` | はい |
| &nbsp;&nbsp;↳ teams | `Array<{ id: string }>` | はい |
| &nbsp;&nbsp;↳ runs | `Array<{ runId: string; startedAt?: string; finishedAt?: string }>` | はい |
| &nbsp;&nbsp;↳ currentTeamId | `string` | いいえ |
| &nbsp;&nbsp;↳ defaultsVersion | `number` | いいえ |
| defaultsVersion | `number` | はい |
| maxRuns | `number` | はい |

**戻り値**: `typeof next`

## インターフェース

### HasId

```typescript
interface HasId {
  id: string;
}
```

IDを持つエンティティの基底インターフェース

### BaseRunRecord

```typescript
interface BaseRunRecord {
  runId: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  outputFile: string;
  error?: string;
}
```

実行記録の基本インターフェース。runIdを一意識別子とする。

### BaseStoragePaths

```typescript
interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}
```

ストレージの基本パスを定義するインターフェース

### BaseStorage

```typescript
interface BaseStorage {
  definitions: TDefinition[];
  runs: TRun[];
  currentId?: TCurrentKey;
  defaultsVersion?: number;
}
```

定義と実行を含むストレージの基底インターフェース

### CreateStorageLoaderOptions

```typescript
interface CreateStorageLoaderOptions {
  ensurePaths: (cwd: string) => TPaths;
  createDefaults: (nowIso: string) => TStorage;
  validateStorage: (parsed: unknown, nowIso: string) => TStorage;
  defaultsVersion: number;
  storageKey: string;
}
```

ストレージローダー作成用のオプション

### CreateStorageSaverOptions

```typescript
interface CreateStorageSaverOptions {
  ensurePaths: (cwd: string) => TPaths;
  normalizeStorage: (storage: TStorage) => TStorage;
  mergeWithDisk: (storageFile: string, storage: TStorage) => TStorage;
  getRuns: (storage: TStorage) => BaseRunRecord[];
}
```

ストレージ保存機能の作成オプション。

---
*自動生成: 2026-02-18T07:48:45.270Z*
