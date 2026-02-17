---
title: Storage Base
category: reference
audience: developer
last_updated: 2026-02-18
tags: [storage, base, generic, patterns]
related: [storage-lock, subagents, agent-teams]
---

# Storage Base

汎用ストレージベースモジュール。拡張機能ストレージ（サブエージェント、エージェントチームなど）の共通パターンを提供し、同様のストレージ実装間のDRY違反を排除する。

## 型定義

### HasId

IDを持つエンティティのベースインターフェース。

```typescript
interface HasId {
  id: string;
}
```

### BaseRunRecord

実行レコードのベースインターフェース。一意識別子としてrunIdを使用する（idではない）。

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

### BaseStoragePaths

ストレージパスのベースインターフェース。

```typescript
interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}
```

### BaseStorage

定義と実行を持つストレージのベースインターフェース。

```typescript
interface BaseStorage<
  TDefinition extends HasId,
  TRun extends BaseRunRecord,
  TCurrentKey extends string,
> {
  definitions: TDefinition[];
  runs: TRun[];
  currentId?: TCurrentKey;
  defaultsVersion?: number;
}
```

## パスユーティリティ

### createPathsFactory

指定されたサブディレクトリのパスファクトリーを作成する。

```typescript
function createPathsFactory(subdir: string): (cwd: string) => BaseStoragePaths
```

### createEnsurePaths

ディレクトリを作成するensurePaths関数を作成する。

```typescript
function createEnsurePaths<TPaths extends BaseStoragePaths>(
  getPaths: (cwd: string) => TPaths,
): (cwd: string) => TPaths
```

## 実行アーティファクトのプルーニング

### pruneRunArtifacts

ディスクから古い実行アーティファクトをプルーニングする。任意の実行レコードタイプで動作する汎用バージョン。

```typescript
function pruneRunArtifacts<TRun extends BaseRunRecord>(
  paths: BaseStoragePaths,
  runs: TRun[],
): void
```

## ストレージマージユーティリティ

### mergeEntitiesById

IDで2つのエンティティ配列をマージし、重複の場合は2番目の配列を優先する。

```typescript
function mergeEntitiesById<TEntity extends HasId>(
  disk: TEntity[],
  next: TEntity[],
): TEntity[]
```

### mergeRunsById

runIdで2つの実行レコード配列をマージし、重複の場合は2番目の配列を優先する。finishedAt/startedAtでソートし、maxRunsに制限する。

```typescript
function mergeRunsById<TRun extends BaseRunRecord>(
  disk: TRun[],
  next: TRun[],
  maxRuns: number,
): TRun[]
```

### resolveCurrentId

現在のIDを解決し、マージされた定義に存在することを保証する。

```typescript
function resolveCurrentId<TEntity extends HasId>(
  nextId: string | undefined,
  diskId: string | undefined,
  definitions: TEntity[],
): string | undefined
```

### resolveDefaultsVersion

ディスクストレージからデフォルトバージョンを抽出する。

```typescript
function resolveDefaultsVersion(
  diskVersion: unknown,
  currentVersion: number,
): number
```

## ストレージロード/保存ファクトリー

### CreateStorageLoaderOptions

ストレージローダー作成用のオプション。

```typescript
interface CreateStorageLoaderOptions<
  TStorage,
  TPaths extends BaseStoragePaths,
> {
  ensurePaths: (cwd: string) => TPaths;
  createDefaults: (nowIso: string) => TStorage;
  validateStorage: (parsed: unknown, nowIso: string) => TStorage;
  defaultsVersion: number;
  storageKey: string; // エラーメッセージ用
}
```

### createStorageLoader

ストレージローダー関数を作成する。

```typescript
function createStorageLoader<
  TStorage,
  TPaths extends BaseStoragePaths,
>(
  options: CreateStorageLoaderOptions<TStorage, TPaths>,
): (cwd: string) => TStorage
```

### CreateStorageSaverOptions

ストレージセーバー作成用のオプション。

```typescript
interface CreateStorageSaverOptions<
  TStorage,
  TPaths extends BaseStoragePaths,
> {
  ensurePaths: (cwd: string) => TPaths;
  normalizeStorage: (storage: TStorage) => TStorage;
  mergeWithDisk: (storageFile: string, storage: TStorage) => TStorage;
  getRuns: (storage: TStorage) => BaseRunRecord[];
}
```

### createStorageSaver

ストレージセーバー関数を作成する。

```typescript
function createStorageSaver<
  TStorage,
  TPaths extends BaseStoragePaths,
>(
  options: CreateStorageSaverOptions<TStorage, TPaths>,
): (cwd: string, storage: TStorage) => void
```

## IDユーティリティ

### toId

文字列をID形式（小文字、ハイフン区切り）に変換する。

```typescript
function toId(input: string): string
```

## サブエージェント/チーム固有のヘルパー

### mergeSubagentStorageWithDisk

サブエージェントストレージをディスク状態とマージする。移行中にsubagents/storage.tsから直接使用される。

```typescript
function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: {
    agents: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentAgentId?: string;
    defaultsVersion?: number;
  },
  defaultsVersion: number,
  maxRuns: number,
): typeof next
```

### mergeTeamStorageWithDisk

チームストレージをディスク状態とマージする。移行中にagent-teams/storage.tsから直接使用される。

```typescript
function mergeTeamStorageWithDisk(
  storageFile: string,
  next: {
    teams: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentTeamId?: string;
    defaultsVersion?: number;
  },
  defaultsVersion: number,
  maxRuns: number,
): typeof next
```
