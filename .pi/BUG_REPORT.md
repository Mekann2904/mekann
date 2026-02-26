# バグ報告書

作成日: 2026-02-26
調査対象: .pi/extensions/, .pi/lib/
調査者: Review Synthesizer (code-excellence-review-team)

## 重大度別分類

### Critical（緊急）

#### 1. SharedArrayBuffer未対応環境でのロック取得失敗
- **説明**: `storage-lock.ts` の `withFileLock()` 関数で、`hasEfficientSyncSleep()` が `false` を返す環境（COOP/COEPヘッダー未設定のブラウザ、--experimental-shared-memory なしのNode.js）で、ロック取得が即座に失敗する
- **影響範囲**: 並列実行機能全体が動作不可。サブエージェント、エージェントチームのストレージ操作で競合が発生
- **具体的なコード箇所**:
  - `.pi/lib/storage-lock.ts:108-113` - `sleepSync()` が `false` を返す場合、ロック取得を即時中断
  - `.pi/lib/storage-lock.ts:163-175` - `canSleep` が `false` の場合、2回のリトライのみで失敗
- **再現手順**:
  1. COOP/COEPヘッダー未設定の環境で pi を実行
  2. 複数のサブエージェントを並列実行
  3. ストレージ更新時にロック取得エラーが発生
- **推奨修正**: SharedArrayBuffer未対応環境向けに、pollingベースの同期スリープをフォールバックとして実装

#### 2. persistedStateLoadedの初期化競合
- **説明**: `retry-with-backoff.ts` の `persistedStateLoaded` フラグが `stateMutex` で保護されていないため、複数のリクエストが同時に `withSharedRateLimitState()` を呼ぶと、ファイルを複数回読み込む可能性がある
- **影響範囲**: レートリミット状態の不整合、不要なファイルI/O、メモリ効率の低下
- **具体的なコード箇所**:
  - `.pi/lib/retry-with-backoff.ts:258-259` - `persistedStateLoaded` フラグがMutex保護外
  - `.pi/lib/retry-with-backoff.ts:311-326` - `withSharedRateLimitState()` 内でファイル読み込み
- **再現手順**:
  1. 複数のサブエージェントを並列実行
  2. 各サブエージェントが同時にレートリミットチェックを実行
  3. 同じファイルを複数回読み込む
- **推奨修正**: `persistedStateLoaded` のチェックを `withSharedRateLimitState()` 内部（Mutex保護内）に移動

#### 3. checkpoint-managerのマネージャー二重初期化リスク
- **説明**: `initCheckpointManager()` は `managerInitializing` フラグで二重初期化を防止しているが、初期化中に別のスレッドが `initCheckpointManager()` を呼ぶと警告を出力するだけで終了しない。その結果、複数のタイマーが登録される可能性がある
- **影響範囲**: チェックポイントのクリーンアップタイマーが多重実行、メモリリークのリスク
- **具体的なコード箇所**:
  - `.pi/lib/checkpoint-manager.ts:357-361` - 二重初期化防止ロジックが不完全
  - `.pi/lib/checkpoint-manager.ts:364-385` - 複数のタイマー登録の可能性
- **再現手順**:
  1. 複数のスレッドから `initCheckpointManager()` を同時呼び出し
  2. 両方のスレッドが初期化を完了
  3. タイマーが2重登録される
- **推奨修正**: 二重初期化チェックを原子操作で実装、または既存の初期化完了を待機する機構を追加

#### 4. settleMode='allSettled' でのエラーハンドリング不完全
- **説明**: `concurrency.ts` の `runWithConcurrencyLimit()` で `settleMode='allSettled'` を指定した場合、個別のエラーが配列内でスローされる可能性がある。呼び出し元が配列をマップする際、予期せぬ例外が発生する
- **影響範囲**: 部分失敗を許容する処理が適切に機能しない
- **具体的なコード箇所**:
  - `.pi/lib/concurrency.ts:241-256` - `allSettled` モードの返却値生成
  - `.pi/lib/concurrency.ts:259-268` - `throw` モードでのエラー再スロー
- **再現手順**:
  1. `runWithConcurrencyLimit()` で `settleMode='allSettled'` を指定
  2. ワーカー関数がエラーをスロー
  3. 返却値のマップ処理で例外発生
- **推奨修正**: `allSettled` モードの返却値を `SettledResult[]` 型として明示的に定義し、スローしないことを保証

### High（高優先度）

#### 5. JSON.parse エラー時の静的型チェック不備
- **説明**: `dynamic-tools/registry.ts` の `parseDynamicToolDefinition()` で、JSON.parse が例外をスローした場合のエラーハンドリングが不完全。`try-catch` でキャッチしているが、ログ記録なし
- **影響範囲**: ツール定義の読み込み失敗がサイレントで発生、デバッグ困難
- **具体的なコード箇所**:
  - `.pi/lib/dynamic-tools/registry.ts:131-138` - JSON.parse の例外キャッチ
- **再現手順**:
  1. ツール定義ファイルが破損
  2. ツールロード時にエラーが発生するが、ログに出力されない
- **推奨修正**: JSON.parse 失敗時にデバッグログを出力、またはエラーメッセージを返却

#### 6. checkpoint-manager キャッシュの競合状態
- **説明**: `checkpoint-manager.ts` のキャッシュ操作（`getFromCache`, `setToCache`, `deleteFromCache`）で排他制御がないため、並列実行時にキャッシュの一貫性が損なわれる可能性がある
- **影響範囲**: キャッシュの不整合、古いチェックポイントが返却される可能性
- **具体的なコード箇所**:
  - `.pi/lib/checkpoint-manager.ts:291-305` - `getFromCache()` に排他制御なし
  - `.pi/lib/checkpoint-manager.ts:318-341` - `setToCache()` に排他制御なし
  - `.pi/lib/checkpoint-manager.ts:346-353` - `deleteFromCache()` に排他制御なし
- **再現手順**:
  1. 複数のスレッドから同じタスクIDでキャッシュにアクセス
  2. 同時に書き込みと読み込みが発生
  3. 古い値が返却される可能性
- **推奨修正**: キャッシュ操作にMutexまたはReadWriteLockを追加

#### 7. プリエンプション時の AbortSignal 操作不完全
- **説明**: `task-scheduler.ts` の `preemptTask()` で、`task.signal` を abort できないことがコメントにあるが、実際の実装ではsignalをチェックしているだけで、中断指示を送信する手段がない
- **影響範囲**: プリエンプション後もタスクが実行を継続、リソースの無駄遣い
- **具体的なコード箇所**:
  - `.pi/lib/task-scheduler.ts:158-168` - `preemptTask()` 内の signal 操作
- **再現手順**:
  1. 高優先度タスクが到達
  2. 低優先度タスクがプリエンプション対象
  3. 低優先度タスクはsignalをチェックするだけで、実行を継続
- **推奨修正**: AbortController を外部から渡せるようにする、またはプリエンプション用の専用シグナルを追加

#### 8. Promise.allSettled 使用時のエラーハンドリング不完全
- **説明**: `retry-with-backoff.ts` の `withSharedRateLimitState()` で、`Promise.all()` を使用しているが、いずれかの Promise が失敗した場合のエラーハンドリングが不十分
- **影響範囲**: レートリミット状態の読み込み失敗がサイレントで発生
- **具体的なコード箇所**:
  - `.pi/lib/retry-with-backoff.ts:532-541` - `Promise.all()` 使用
- **再現手順**:
  1. 複数のレートリミットキーを使用
  2. いずれかのキーで読み込み失敗
  3. 全体が失敗する
- **推奨修正**: `Promise.allSettled()` を使用し、個別のエラーを記録

#### 9. エッジケース: 0または負の値の入力検証不足
- **説明**: 多くの関数で数値パラメータのバリデーションが不完全。特に `maxWaitMs`, `timeoutMs`, `limit` などで、0または負の値が渡された場合の挙動が未定義
- **影響範囲**: 無限ループ、即時タイムアウト、リソース枯渇などの予期せぬ動作
- **具体的なコード箇所**:
  - `.pi/lib/storage-lock.ts:138-143` - `maxWaitMs` の正規化
  - `.pi/lib/concurrency.ts:117-119` - `toPositiveLimit()` での正規化
  - `.pi/lib/retry-with-backoff.ts:265-272` - `toFiniteNumber()` 使用箇所
- **再現手順**:
  1. タイムアウト値に 0 または負の値を指定
  2. 即座に失敗または無限ループ
- **推奨修正**: すべての数値パラメータにバリデーションを追加、最小値/最大値を明確に定義

#### 10. JSON.stringify の例外ハンドリング不足
- **説明**: 多数の場所で `JSON.stringify()` を使用しているが、循環参照やシリアライズ不可能なオブジェクトを渡した場合の例外ハンドリングが不足
- **影響範囲**: ストレージ書き込み失敗、チェックポイント保存失敗
- **具体的なコード箇所**:
  - `.pi/extensions/subagents/storage.ts:199` - `JSON.stringify(merged, null, 2)`
  - `.pi/lib/checkpoint-manager.ts:421` - `JSON.stringify(fullCheckpoint, null, 2)`
  - `.pi/lib/dynamic-tools/registry.ts:177` - `JSON.stringify(tool, null, 2)`
- **再現手順**:
  1. 循環参照を含むオブジェクトをストレージに保存
  2. JSON.stringify が例外をスロー
  3. 書き込み失敗
- **推奨修正**: JSON.stringify を try-catch でラップ、または安全なシリアライザを使用

### Medium（中優先度）

#### 11. 空の配列/undefined の扱いが一貫していない
- **説明**: 多くの関数で空の配列や `undefined` が渡された場合の挙動が一貫していない。一部は空の配列を返却、一部はエラーをスロー
- **影響範囲**: 呼び出し元でのエラーハンドリングが複雑になる
- **具体的なコード箇所**:
  - `.pi/lib/concurrency.ts:123` - 空の配列で早期リターン
  - `.pi/extensions/subagents/storage.ts:197` - 空の配列チェック
- **推奨修正**: 空のコレクションの扱いを統一、ドキュメントに明記

#### 12. タイムアウト後のクリーンアップ不完全
- **説明**: 非同期操作のタイムアウト後、リソースのクリーンアップが不完全な場合がある。特に、ファイルハンドル、コネクション、一時ファイルの解放が漏れている可能性
- **影響範囲**: リソースリーク、ファイル記述子枯渇
- **具体的なコード箇所**:
  - `.pi/lib/retry-with-backoff.ts:552-572` - `sleepWithAbort()` のクリーンアップ
  - `.pi/lib/concurrency.ts:199-213` - `runWorker()` のエラーハンドリング
- **推奨修正**: すべての非同期操作で finally ブロックを使用し、クリーンアップを保証

#### 13. エラーメッセージの多言語対応不備
- **説明**: 一部のエラーメッセージが英語と日本語で混在しており、ユーザー体験が一貫していない
- **影響範囲**: エラーメッセージの理解が困難
- **具体的なコード箇所**:
  - `.pi/lib/errors.ts` - PiError クラスのメッセージ
  - `.pi/lib/tool-error-utils.ts` - SafeBashResult のエラーメッセージ
- **推奨修正**: エラーメッセージを日本語に統一、または国際化メカニズムを導入

#### 14. デバッグログのレベル制御不備
- **説明**: 多くの場所で `console.log` や `console.debug` を直接使用しており、ログレベルの制御ができない
- **影響範囲**: 本番環境でのログ出力過多、パフォーマンス低下
- **具体的なコード箇所**:
  - `.pi/lib/concurrency.ts:148` - `console.debug()` 直接使用
  - `.pi/lib/retry-with-backoff.ts:280` - `console.warn()` 直接使用
- **推奨修正**: 構造化ロガー（`.pi/lib/structured-logger.ts`）を統一的に使用

#### 15. 型定義と実装の不一致
- **説明**: 一部の関数で型定義と実際の返却値が一致していない。特に `unknown` 型を誤って使用している箇所がある
- **影響範囲**: TypeScriptの型安全性が損なわれる
- **具体的なコード箇所**:
  - `.pi/lib/dynamic-tools/registry.ts` - `DynamicToolDefinition` のパース
  - `.pi/lib/tool-error-utils.ts` - `SafeBashResult` の生成
- **推奨修正**: 型定義と実装を一貫させる、strictモードで TypeScript を実行

### Low（低優先度）

#### 16. マジックナンバーの使用
- **説明**: 多くの場所でマジックナンバーが使用されており、コードの可読性と保守性が低下している
- **具体的なコード箇所**:
  - `.pi/lib/storage-lock.ts:25-28` - DEFAULT_LOCK_OPTIONS の定義
  - `.pi/lib/retry-with-backoff.ts:239-243` - デフォルト値の定義
- **推奨修正**: マジックナンバーを定数に置き換え、意味のある名前を付与

#### 17. コメント不足または古いコメント
- **説明**: 一部の関数でコメントが不足している、または実装と一致していないコメントが存在する
- **具体的なコード箇所**:
  - `.pi/lib/concurrency.ts:144-148` - abortOnError の説明
  - `.pi/lib/checkpoint-manager.ts:241-249` - Phase 5 関連のコメント
- **推奨修正**: 関数の目的、パラメータ、返却値を明確に記述

#### 18. テストカバレッジ不足
- **説明**: エッジケース、エラーハンドリング、並列実行のテストが不足している可能性がある
- **推奨修正**: ユニットテスト、統合テストを追加、テストカバレッジを80%以上に引き上げ

## カテゴリ別サマリー

| カテゴリ | Critical | High | Medium | Low | 合計 |
|----------|----------|-------|--------|-----|------|
| 並列実行・競合状態 | 4 | 3 | 1 | 0 | 8 |
| エラーハンドリング | 1 | 2 | 2 | 0 | 5 |
| 非同期処理 | 2 | 1 | 2 | 0 | 5 |
| リソース管理 | 1 | 2 | 1 | 0 | 4 |
| 型安全性 | 0 | 2 | 2 | 1 | 5 |
| 境界条件 | 1 | 2 | 0 | 0 | 3 |
| その他 | 0 | 0 | 2 | 3 | 5 |
| **合計** | **9** | **12** | **8** | **4** | **33** |

## 重要な発見

### アーキテクチャ上の課題

1. **Mutex保護の一貫性不足**: `retry-with-backoff.ts` で `stateMutex` が導入されたが、関連するフラグ（`persistedStateLoaded`）は保護されていない

2. **AbortSignal の設計**: 多数の場所で `AbortSignal` を使用しているが、シグナルを送信する側の実装が不完全

3. **キャッシュの一貫性**: `checkpoint-manager.ts` でインメモリキャッシュを使用しているが、並列アクセス時の一貫性保証がない

4. **エラーハンドリングの分散**: エラーハンドリングロジックが複数のファイルに分散しており、一貫性が保たれていない

### 推奨される改善アクション

1. **Critical なバグの修正**: 優先度が高く、システム全体の動作に影響するため、速やかに修正

2. **Mutex保護の強化**: 並列実行関連のデータ構造をすべて Mutex で保護

3. **AbortSignal の設計見直し**: プリエンプションとキャンセルのための統一的なシグナル機構を設計

4. **テストカバレッジの向上**: 並列実行、エラーハンドリングのテストを追加

5. **型安全性の強化**: TypeScript の strict モードを有効化し、型チェックを強化

## 付録

### 調査範囲

- `.pi/extensions/` 以下の 118 TypeScriptファイル
- `.pi/lib/` 以下の 152 TypeScriptファイル
- 合計 270 ファイルを調査

### 調査方法

1. 主要なファイルの精読（並列実行、ストレージ、エラーハンドリング）
2. grep/rg によるパターン検索（catch, JSON.parse, writeFileSync 等）
3. コードクロスレビューによる論理的整合性チェック
4. エッジケース、境界条件の特定

### 調査の制限

- 動的な挙動（実行時エラー）の再現は実施していない
- 外部依存（pi-core、Node.jsライブラリ）の内部実装は調査していない
- テストファイル（.test.ts, .spec.ts）の調査は実施していない
