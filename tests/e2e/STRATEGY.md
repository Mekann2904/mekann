---
title: E2Eテスト戦略 - Test Engineering Team
category: development
audience: developer
last_updated: 2026-02-21
tags: [testing, e2e, strategy]
related: [.pi/skills/test-engineering/SKILL.md, tests/e2e/README.md]
---

# E2Eテスト戦略 - Test Engineering Team

## 実行サマリー

**担当役割**: E2E & Acceptance Engineer (e2e-engineer)
**フェーズ**: コミュニケーション（ラウンド2）
**完了ステータス**: 部分的完了

## 連携コンテキストの分析

### integration-engineer (status=failed)
統合テストの実装に失敗した可能性がある。これはE2Eテストの難しさを示唆しており、外部依存のモック化戦略を慎重に検討する必要がある。

### strategy-architect (status=completed)
- **主張**: テストピラミッドに基づき、まずP0モジュールの単体テストを優先的に実装することで、システム安定性と信頼性を向上させる
- **同意点**: テストピラミッドの原則は正しい。単体テストが基盤となるべき
- **不同意点**: テストファイル数（118個）とカバレッジ（77%）に関する事実認識が誤っている。実際は14個のテストファイルで、.pi/lib/のカバレッジは約18%と推定される
- **結論の更新**: unit-test-engineerの反論を踏まえると、単体テストの不備が明らかであるため、E2Eテストの重要性が相対的に高まる

### unit-test-engineer
- **主張**: strategy-architectの「既存のテストファイル118個、カバレッジ77%」という主張は事実と異なる。実際には14個のテストファイルしか存在せず、.pi/lib/のカバレッジは約18%に過ぎない
- **同意点**: 14個のテストファイルという事実は確認済み。重要度の高い共有ライブラリ（storage-lock、retry-with-backoff等）のテストが不足している
- **合意**: 重要な共有ライブラリのE2Eテストを優先的に実装することで合意

### 反例の検討
- E2Eテストは高コストであり、外部APIの統合や並列実行のシナリオは再現が難しい
- モック化されたpi SDKの挙動が実際の環境と乖離する可能性がある
- E2Eテスト自体にバグが含まれる可能性がある

### 「AならばB」の検証
「単体テストが不備ならば、E2Eテストを優先する」という結論について、「E2Eテストを優先するならば、単体テストが不備である」という逆は成立しない。E2Eテストを優先する理由は他にもあり得るため（例：統合テストの失敗、特定のユーザージャーニーの検証など）、因果関係と相関関係を区別する必要がある。

## 実装したE2Eテスト

### storage-lock-parallel.e2e.test.ts

**ファイル**: `tests/e2e/storage-lock-parallel.e2e.test.ts`
**テスト数**: 14個
**成功**: 14個
**失敗**: 0個

#### テストシナリオ

| カテゴリ | テスト名 | 説明 |
|---------|---------|------|
| 正常系 | should_allow_sequential_writes | 順次書き込みが成功すること |
| 正常系 | should_provide_mutual_exclusion_for_concurrent_operations | 並列操作時の排他制御が正常に動作すること |
| 正常系 | should_cleanup_lock_file_after_successful_operation | 正常終了後にロックファイルが削除されること |
| 正常系 | should_clear_stale_locks_from_nonexistent_process | 存在しないPIDを持つ陳腐化したロックがクリアされること |
| 境界条件 | should_timeout_when_lock_cannot_be_acquired | ロック取得タイムアウトが正しく動作すること |
| 境界条件 | should_handle_zero_wait_ms_immediately | maxWaitMs=0の場合、即時にタイムアウトすること |
| 境界条件 | should_handle_negative_options_gracefully | 負のオプション値が適切に処理されること |
| エラー処理 | should_release_lock_on_error_in_callback | コールバック内でエラーが発生した場合でもロックが解放されること |
| エラー処理 | should_propagate_error_from_callback | コールバック内のエラーが正しく伝播されること |
| atomicWriteTextFile | should_write_atomically | アトミック書き込みが正しく動作すること |
| atomicWriteTextFile | should_overwrite_existing_file | 既存ファイルを正しく上書きすること |
| atomicWriteTextFile | should_handle_empty_content | 空の内容を正しく書き込めること |
| 実行環境検証 | should_diagnose_sync_sleep_availability | 同期スリープの可用性診断が正しく動作すること |
| 複数ファイルの並列ロック | should_allow_concurrent_locks_on_different_files | 異なるファイルへの並列ロックが成功すること |

## E2Eテスト戦略

### プライオリティ順

**P0: 重要な共有ライブラリのE2Eテスト**（実装済み: storage-lock）
- [x] storage-lock.ts: 並列プロセス間のファイルロック競合の検証
- [ ] retry-with-backoff.ts: リトライ付き非同期操作の検証（429エラー、レート制限）

**P1: 主要なユーザージャーニーのE2Eテスト**
- [x] subagent-lifecycle.e2e.test.ts: サブエージェントのライフサイクル（既存、9個のテスト）
- [x] plan-lifecycle.e2e.test.ts: 計画管理のライフサイクル（既存、11個のテスト）
- [x] multi-extension-integration.e2e.test.ts: 複数拡張機能の統合（既存、11個のテスト）
- [ ] subagents.ts: サブエージェントの作成から実行、エラーハンドリングまでの完全フロー
- [ ] agent-teams.ts: エージェントチームの作成から実行、並列調整までの完全フロー

**P2: 他の重要なユーザージャーニー**
- [ ] verification-workflow.ts: Inspector/Challenger検証メカニズムのエッジケース
- [ ] question.ts: ユーザー対話フローの検証

### 外部依存のモック化戦略

- **pi SDK**: ExtensionAPI等のインターフェースを簡易的にモック化
  - FakeExtensionAPIクラスを使用
- **ファイルシステム**: 一時ディレクトリを使用し、テスト終了後にクリーンアップ
- **外部プロセス**: 使用しない（Vitest内で並列タスクを使用）
- **環境変数**: NODE_ENV=test等でテスト環境を識別

### カバレッジ目標

| カテゴリ | 目標カバレッジ | 現在のカバレッジ |
|---------|---------------|-----------------|
| 重要な共有ライブラリ | 70%以上 | 未測定 |
| 主要な拡張機能 | 50%以上 | 未測定 |

注: E2Eテスト自体のカバレッジ指標は二次的（モック化の制約）

## 設定ファイルの更新

### vitest.config.ts
- E2Eテスト用のプロジェクト設定を追加
- テストタイムアウトを30秒に設定

### package.json
- `test:e2e`: E2Eテストの実行
- `test:e2e:watch`: E2Eテストのウォッチモード

### tests/setup-e2e.ts
- E2Eテスト用のセットアップファイルを作成

## 完了基準

### 達成された項目
- [x] 連携コンテキストの分析と合意形成
- [x] E2Eテスト戦略の策定
- [x] storage-lockのE2Eテスト実装（14個のテスト、すべて成功）
- [x] vitest.config.tsのE2Eテスト用設定更新
- [x] package.jsonにE2Eテストスクリプト追加
- [x] tests/setup-e2e.ts作成

### 未達成の項目
- [ ] retry-with-backoffのE2Eテスト実装
- [ ] subagents.tsの完全フローE2Eテスト実装
- [ ] agent-teams.tsのE2Eテスト実装
- [ ] verification-workflow.tsのE2Eテスト実装
- [ ] question.tsのE2Eテスト実装
- [ ] カバレッジ測定

## 残存リスク

1. **既存のE2Eテストファイルの問題**
   - `plan.e2e.test.ts`, `question.e2e.test.ts`, `subagents.e2e.test.ts` で `describe is not defined` エラー
   - `tests/helpers/bdd-helpers.ts` の問題

2. **外部依存のモック化**
   - pi SDKのモック化が不完全な可能性
   - 実際の環境と挙動が乖離する可能性

3. **並列実行の再現性**
   - E2Eテストでの並列実行シナリオは完全に再現可能ではない可能性

4. **カバレッジ測定**
   - カバレッジレポートの生成でエラーが発生している

## 推奨される次のステップ

1. **既存のE2Eテストファイルの修正**
   - `tests/helpers/bdd-helpers.ts` の問題を修正
   - `describe is not defined` エラーを解決

2. **retry-with-backoffのE2Eテスト実装**
   - リトライ付き非同期操作の検証
   - 429エラー、レート制限のシナリオ

3. **subagents.tsの完全フローE2Eテスト実装**
   - サブエージェントの作成から実行、エラーハンドリングまでの完全フロー

4. **カバレッジ測定と報告**
   - カバレッジレポートの生成問題を修正
   - カバレッジ目標の達成状況を確認

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-21 | E2Eテスト戦略の策定、storage-lockのE2Eテスト実装（14個のテスト成功） |
