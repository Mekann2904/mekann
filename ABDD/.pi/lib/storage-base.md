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
// from 'node:fs': existsSync, readdirSync, readFileSync, ...
// from 'node:path': basename, join
// from './fs-utils.js': ensureDir
// from './storage-lock.js': atomicWriteTextFile, withFileLock
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `createPathsFactory` | パスファクトリを作成 |
| 関数 | `createEnsurePaths` | パス生成関数を作成 |
| 関数 | `pruneRunArtifacts` | 実行アーティファクトを削除 |
| 関数 | `mergeEntitiesById` | IDでエンティティをマージ |
| 関数 | `mergeRunsById` | runIdで配列を結合・ソートし上限を適用 |
| 関数 | `resolveCurrentId` | 現在のIDを解決 |
| 関数 | `resolveDefaultsVersion` | デフォルト版数を解決 |
| 関数 | `createStorageLoader` | ストレージローダー関数を作成する。 |
| 関数 | `createStorageSaver` | ストレージ保存用関数を作成する |
| 関数 | `toId` | IDを生成する |
| 関数 | `mergeSubagentStorageWithDisk` | サブエージェントストレージとディスク状態をマージ |
| 関数 | `mergeTeamStorageWithDisk` | チームストレージとディスクの状態をマージする。 |
| インターフェース | `HasId` | - |
| インターフェース | `BaseRunRecord` | 実行記録のインターフェース |
| インターフェース | `BaseStoragePaths` | ストレージパスのインターフェース |
| インターフェース | `BaseStorage` | ストレージの基底インターフェース |
| インターフェース | `CreateStorageLoaderOptions` | ストレージ読込用オプション |
| インターフェース | `CreateStorageSaverOptions` | ストレージ保存用オプション |

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
  createEnsurePaths["createEnsurePaths()"]
  createPathsFactory["createPathsFactory()"]
  createStorageLoader["createStorageLoader()"]
  createStorageSaver["createStorageSaver()"]
  mergeEntitiesById["mergeEntitiesById()"]
  mergeRunsById["mergeRunsById()"]
  mergeSubagentStorageWithDisk["mergeSubagentStorageWithDisk()"]
  mergeTeamStorageWithDisk["mergeTeamStorageWithDisk()"]
  pruneRunArtifacts["pruneRunArtifacts()"]
  resolveCurrentId["resolveCurrentId()"]
  resolveDefaultsVersion["resolveDefaultsVersion()"]
  toId["toId()"]
  createStorageSaver --> pruneRunArtifacts
  mergeSubagentStorageWithDisk --> mergeEntitiesById
  mergeSubagentStorageWithDisk --> mergeRunsById
  mergeSubagentStorageWithDisk --> resolveCurrentId
  mergeSubagentStorageWithDisk --> resolveDefaultsVersion
  mergeTeamStorageWithDisk --> mergeEntitiesById
  mergeTeamStorageWithDisk --> mergeRunsById
  mergeTeamStorageWithDisk --> resolveCurrentId
  mergeTeamStorageWithDisk --> resolveDefaultsVersion
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

パスファクトリを作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| subdir | `string` | はい |

**戻り値**: `void`

### createEnsurePaths

```typescript
createEnsurePaths(getPaths: (cwd: string) => TPaths): (cwd: string) => TPaths
```

パス生成関数を作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| getPaths | `(cwd: string) => TPaths` | はい |

**戻り値**: `(cwd: string) => TPaths`

### pruneRunArtifacts

```typescript
pruneRunArtifacts(paths: BaseStoragePaths, runs: TRun[]): void
```

実行アーティファクトを削除

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

IDでエンティティをマージ

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

現在のIDを解決

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

デフォルト版数を解決

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

IDを生成する

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

実行記録のインターフェース

### BaseStoragePaths

```typescript
interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}
```

ストレージパスのインターフェース

### BaseStorage

```typescript
interface BaseStorage {
  definitions: TDefinition[];
  runs: TRun[];
  currentId?: TCurrentKey;
  defaultsVersion?: number;
}
```

ストレージの基底インターフェース

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

ストレージ読込用オプション

### CreateStorageSaverOptions

```typescript
interface CreateStorageSaverOptions {
  ensurePaths: (cwd: string) => TPaths;
  normalizeStorage: (storage: TStorage) => TStorage;
  mergeWithDisk: (storageFile: string, storage: TStorage) => TStorage;
  getRuns: (storage: TStorage) => BaseRunRecord[];
}
```

ストレージ保存用オプション

---
*自動生成: 2026-02-18T15:54:41.523Z*
