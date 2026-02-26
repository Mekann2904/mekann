# バグ報告書

## 重大度別分類

### Critical（緊急）

#### 1. retry-with-backoff.ts: 競合状態によるレート制限状態の二重初期化
- **説明**: `persistedStateLoaded` フラグが Mutex で保護されていないため、複数の非同期呼び出しが同時に `withSharedRateLimitState()` を実行すると、`readPersistedRateLimitState()` が複数回呼び出され、レート制限状態が不整合になる可能性がある。
- **影響範囲**: レート制限機能を使用する全サブエージェント・エージェントチーム
- **コード箇所**: `.pi/lib/retry-with-backoff.ts:295-307` (`withSharedRateLimitState` 関数)
- **再現手順**: 複数のサブエージェントが同時に `retryWithBackoff` を実行する

### High（高優先度）

#### 2. storage-base.ts: JSON.parseエラー時のデータ損失
- **説明**: `mergeSubagentStorageWithDisk` と `mergeTeamStorageWithDisk` で JSON.parse エラー時に `{}` を返しており、破損したファイルがある場合、既存のデータがすべて失われる可能性がある。破損したファイルのバックアップを作成すべき。
- **影響範囲**: サブエージェント・エージェントチームのストレージ
- **コード箇所**:
  - `.pi/lib/storage-base.ts:493-503` (`mergeSubagentStorageWithDisk`)
  - `.pi/lib/storage-base.ts:526-536` (`mergeTeamStorageWithDisk`)

#### 3. embeddings/registry.ts: 設定ファイルの競合状態
- **説明**: `saveConfig()` でファイルロックを使用しておらず、複数プロセスが同時に設定を書き込む場合、データが破損する可能性がある。
- **影響範囲**: 埋め込みモジュールの設定管理
- **コード箇所**: `.pi/lib/embeddings/registry.ts:268-276` (`saveConfig` メソッド)

#### 4. dag-executor.ts: undefinedタスクノードの可能性
- **説明**: `executeBatch` で `taskNodes.get(n.id)` が undefined を返す可能性がある場合、適切に処理されていない。動的な依存関係操作（`addDependency`/`removeDependency`）後に実行されると、存在しないタスクがスケジュールされる可能性がある。
- **影響範囲**: DAG実行エンジン
- **コード箇所**: `.pi/lib/dag-executor.ts:212-221` (`executeBatch` メソッド)

#### 5. tool-executor.ts: プライベートメソッドへの不正アクセス
- **説明**: `executeFusedOperation` (exported function) でプライベートメソッド `executor["executeFusedOperation"]` にアクセスするハックを使用している。これはTypeScriptのアクセス制限を回避するもので、将来的なリファクタリングで壊れる可能性がある。
- **影響範囲**: ツール実行エンジン
- **コード箇所**: `.pi/lib/tool-executor.ts:423-430` (`executeFusedOperation` 関数)

### Medium（中優先度）

#### 6. circuit-breaker.ts: メモリリークの可能性
- **説明**: グローバルMap `breakers` が定期的にクリーンアップされず、長時間実行するとキーが増え続けメモリ使用量が増加する可能性がある。
- **影響範囲**: サーキットブレーカー機能
- **コード箇所**: `.pi/lib/circuit-breaker.ts:43` (`breakers` 変数)

#### 7. storage-lock.ts: プラットフォーム依存のプロセスチェック
- **説明**: `process.kill(pid, 0)` を使用しているが、これはプロセスの存在確認を行うPOSIX準拠の手法であり、Windowsでは異なる動作になる可能性がある。
- **影響範囲**: ファイルロック機能
- **コード箇所**: `.pi/lib/storage-lock.ts:95-98` (`isLockOwnerDead` 関数)

#### 8. embeddings/index.ts: モジュール初期化時のエラーハンドリング不足
- **説明**: モジュールインポート時に `initializeEmbeddingModuleSync()` が呼ばれますが、エラーハンドリングがないため、プロバイダ登録時に例外が発生するとモジュール全体がロードに失敗する可能性がある。
- **影響範囲**: 埋め込みモジュールの初期化
- **コード箇所**: `.pi/lib/embeddings/index.ts:100-103` (`initializeEmbeddingModuleSync` 関数)

#### 9. concurrency.ts: cursorインクリメント忘れによる無限ループリスク
- **説明**: `runWorker` の無限ループ `while (true)` で、cursorのインクリメントを忘れた場合、無限ループになるリスクがある。現在の実装では正しくインクリメントされているが、将来の変更でバグが混入する可能性がある。
- **影響範囲**: 並列実行ライブラリ
- **コード箇所**: `.pi/lib/concurrency.ts:97-147` (`runWorker` 関数)

#### 10. retry-with-backoff.ts: unref呼び出しの型安全性
- **説明**: `scheduleWritePersistedState()` で `writeDebounceTimer.unref()` を呼んでいるが、`writeDebounceTimer` の型が `ReturnType<typeof setTimeout>` として推論される可能性があり、`unref()` が存在しない可能性がある（Node.js環境では問題ないが、型定義が不完全）。
- **影響範囲**: レート制限状態の永続化
- **コード箇所**: `.pi/lib/retry-with-backoff.ts:268` (`scheduleWritePersistedState` 関数)

### Low（低優先度）

#### 11. circuit-breaker.ts: 未使用パラメータ
- **説明**: `recordCircuitBreakerSuccess` で `_config` パラメータを受け取っているが使用しておらず、未使用のパラメータが混乱を招く可能性がある。
- **影響範囲**: サーキットブレーカー機能
- **コード箇所**: `.pi/lib/circuit-breaker.ts:107-116` (`recordCircuitBreakerSuccess` 関数)

#### 12. tool-executor.ts: Abortチェックの競合状態
- **説明**: `signal?.aborted` チェック後から実行までの間に abort される競合状態の可能性がある（軽微な問題、実際には `runWithConcurrencyLimit` 内で再度チェックされるため影響は限定的）。
- **影響範囲**: ツール実行エンジン
- **コード箇所**: `.pi/lib/tool-executor.ts:242-250` (`executeSingleTool` 関数)

#### 13. storage-base.ts: requireによる動的インポート
- **説明**: `createCorruptedBackup` で `require("node:fs")` を使用しているが、ファイルの先頭で `import` しているモジュールとは別。これは意図的な遅延ロードの可能性があるが、一貫性の問題。
- **影響範囲**: 破損ファイルのバックアップ機能
- **コード箇所**: `.pi/lib/storage-base.ts:392` (`createCorruptedBackup` 関数)

#### 14. storage-lock.ts: fsyncなしのファイル書き込み
- **説明**: `tryAcquireLock` で `writeFileSync(fd, ...)` を呼んでいるが、fsyncがないとバッファリングされたデータがディスクに書き込まれる前にロックが取得されたと見なされる可能性がある（実際には `closeSync` が暗黙的にフラッシュするため、問題は軽微）。
- **影響範囲**: ファイルロック機能
- **コード箇所**: `.pi/lib/storage-lock.ts:66` (`tryAcquireLock` 関数)

#### 15. embeddings/registry.ts: プロバイダ可用性チェックのエラーハンドリング不足
- **説明**: `getAvailable()` と `getAllStatus()` で各プロバイダーの `isAvailable()` を await していますが、これらの操作が失敗した場合のエラーハンドリングがありません。
- **影響範囲**: 埋め込みプロバイダーの状態確認
- **コード箇所**:
  - `.pi/lib/embeddings/registry.ts:83-90` (`getAvailable` メソッド)
  - `.pi/lib/embeddings/registry.ts:92-105` (`getAllStatus` メソッド)

#### 16. circuit-breaker.ts: console.errorの誤使用
- **説明**: `transitionTo` で環境変数チェックを行っていますが、`console.error` ではなく `console.debug` または `console.log` を使用すべきです（エラーではないため）。
- **影響範囲**: デバッグログ
- **コード箇所**: `.pi/lib/circuit-breaker.ts:190-196` (`transitionTo` 関数)

## カテゴリ別サマリー

- **競合状態**: 5件 (Critical: 1, High: 2, Medium: 1, Low: 1)
- **エラーハンドリング**: 4件 (High: 1, Medium: 2, Low: 1)
- **メモリリーク**: 1件 (Medium: 1)
- **型安全性**: 2件 (High: 1, Low: 1)
- **プラットフォーム依存**: 1件 (Medium: 1)
- **コード品質**: 3件 (High: 1, Low: 2)

### 総計: 16件

| 重大度 | 件数 |
|--------|------|
| Critical | 1 |
| High | 5 |
| Medium | 5 |
| Low | 5 |

## 推奨される対応順序

1. **最優先**: Critical #1 (retry-with-backoff.ts 競合状態)
2. **優先**: High #2, #3, #4, #5
3. **中優先**: Medium #6-#10
4. **低優先**: Low #11-#16

## 注意事項

- バグの修正は行っておらず、報告のみです。
- 重大度は「影響範囲」「発生確率」「深刻度」を総合的に評価しています。
- 一部の問題は環境依存（Windows vs POSIX）や使用状況（長時間実行）によって影響が異なる場合があります。
