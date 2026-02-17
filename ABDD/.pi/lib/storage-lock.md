---
title: Storage Lock
category: reference
audience: developer
last_updated: 2026-02-18
tags: [storage, lock, atomic, write, file]
related: [storage-base, subagents, agent-teams, plan]
---

# Storage Lock

拡張機能ストレージファイル用の同期ファイルロックとアトミック書き込みヘルパーを提供する。並列エージェント実行中のストレージ書き込みの競合を防ぐ。

## 型定義

### FileLockOptions

ファイルロックオプション。

```typescript
interface FileLockOptions {
  maxWaitMs?: number;   // ロック取得の最大待機時間（デフォルト: 4000ms）
  pollMs?: number;      // ポーリング間隔（デフォルト: 25ms）
  staleMs?: number;     // 古いロックとみなす時間（デフォルト: 30000ms）
}
```

## 定数

### DEFAULT_LOCK_OPTIONS

デフォルトのロックオプション。

```typescript
const DEFAULT_LOCK_OPTIONS: Required<FileLockOptions> = {
  maxWaitMs: 4_000,
  pollMs: 25,
  staleMs: 30_000,
};
```

## 関数

### withFileLock

ファイルロックを取得して関数を実行する。ロックが取得できない場合はエラーをスローする。

```typescript
function withFileLock<T>(
  targetFile: string,
  fn: () => T,
  options?: FileLockOptions,
): T
```

#### パラメータ

- `targetFile`: ロックするターゲットファイル
- `fn`: ロック内で実行する関数
- `options`: ロックオプション

#### 戻り値

関数の戻り値

#### 例外

- `Error`: ロックタイムアウト時

#### 使用例

```typescript
import { withFileLock } from "./storage-lock.js";

const result = withFileLock("/path/to/storage.json", () => {
  // ファイル操作を実行
  return JSON.parse(readFileSync("/path/to/storage.json", "utf-8"));
});
```

### atomicWriteTextFile

アトミックにテキストファイルを書き込む。一時ファイルに書き込み、その後リネームすることで、部分的な書き込みを防ぐ。

```typescript
function atomicWriteTextFile(filePath: string, content: string): void
```

#### パラメータ

- `filePath`: 書き込み先のファイルパス
- `content`: 書き込むコンテンツ

#### 例外

- リネームまたは書き込みエラー時

#### 使用例

```typescript
import { atomicWriteTextFile } from "./storage-lock.js";

atomicWriteTextFile(
  "/path/to/storage.json",
  JSON.stringify(data, null, 2)
);
```

## 実装詳細

### 同期スリープ

SharedArrayBuffer + Atomics.waitを使用した効率的な同期スリープをサポートする。SharedArrayBufferが利用できない環境では、CPUスピンを避けるために高速フェイルする。

```typescript
function hasEfficientSyncSleep(): boolean
function sleepSync(ms: number): boolean
```

### ロックファイル

ロックファイルは `<targetFile>.lock` という名前で作成され、以下の内容を含む:

```
<process.pid>:<timestamp>
```

### 古いロックのクリア

`staleMs` より古いロックファイルは自動的に削除される。これにより、クラッシュしたプロセスが残したロックを回復できる。

## 注意事項

- 同期APIであるため、Node.jsのイベントループをブロックする可能性がある
- SharedArrayBufferが利用できない環境では、ロック取得が早期に失敗する可能性がある
- ロックはプロセス内でのみ有効（異なるマシン間では機能しない）
