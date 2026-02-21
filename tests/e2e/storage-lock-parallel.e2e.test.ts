/**
 * @abdd.meta
 * path: tests/e2e/storage-lock-parallel.e2e.test.ts
 * role: storage-lockの並列実行E2Eテスト
 * why: 並列プロセス間のファイルロック競合、排他制御、ロック解放の正確性を検証するため
 * related: .pi/lib/storage-lock.ts, tests/e2e/subagent-lifecycle.e2e.test.ts
 * public_api: describe, it, expect (Vitest), withFileLock, atomicWriteTextFile (storage-lock.ts)
 * invariants: ロック取得成功時は排他的に実行される、エラー時もロックが解放される、陳腐化したロックは自動削除される
 * side_effects: 一時ファイルへの書き込み、ロックファイルの作成と削除
 * failure_modes: SharedArrayBuffer未対応環境での挙動、ロック取得タイムアウト、ファイルシステムエラー
 * @abdd.explain
 * overview: 並列実行環境下でのファイルロック機構のE2Eテストスイート
 * what_it_does:
 *   - 異なるプロセス（非同期タスク）からの順次書き込みをテスト
 *   - 並列書き込み時の排他制御をテスト
 *   - 正常終了後のロックファイル削除をテスト
 *   - 陳腐化したロックの自動クリアをテスト
 *   - ロック取得タイムアウトをテスト
 *   - エラー時のロック解放をテスト
 * why_it_exists:
 *   - 複数のサブエージェントやエージェントチームが並列実行される際、ストレージファイルの競合が発生しないことを保証するため
 *   - storage-lock.tsが提供する排他制御メカニズムの信頼性を検証するため
 * scope:
 *   in: withFileLock, atomicWriteTextFile, FileLockOptions
 *   out: テスト結果、カバレッジレポート
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync, unlinkSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withFileLock, atomicWriteTextFile, getSyncSleepDiagnostics } from '../../.pi/lib/storage-lock.ts';

// ============================================================================
// テストユーティリティ
// ============================================================================

interface TestConfig {
  tempDir: string;
  targetFile: string;
}

function createTestConfig(): TestConfig {
  const tempDir = join(tmpdir(), `storage-lock-e2e-${process.pid}-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return { tempDir, targetFile: join(tempDir, 'test-file.txt') };
}

function cleanupTestConfig(config: TestConfig): void {
  try {
    if (existsSync(config.targetFile)) {
      unlinkSync(config.targetFile);
    }
    if (existsSync(config.tempDir)) {
      rmSync(config.tempDir, { recursive: true, force: true });
    }
  } catch {
    // Cleanup best effort
  }
}

// ============================================================================
// E2Eテストシナリオ
// ============================================================================

describe('E2E: storage-lock 並列実行', () => {
  let config: TestConfig;

  beforeEach(() => {
    config = createTestConfig();
  });

  afterEach(() => {
    cleanupTestConfig(config);
  });

  describe('正常系', () => {
    it('should_allow_sequential_writes', () => {
      // テスト対象: 順次書き込みが成功すること
      withFileLock(config.targetFile, () => {
        writeFileSync(config.targetFile, 'First write\n');
      });

      withFileLock(config.targetFile, () => {
        writeFileSync(config.targetFile, 'Second write\n');
      });

      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toBe('Second write\n');
    });

    it('should_provide_mutual_exclusion_for_concurrent_operations', async () => {
      // テスト対象: 並列操作時の排他制御が正常に動作すること
      let executionOrder: string[] = [];
      const delay = 50; // ms

      const task1 = new Promise<void>((resolve) => {
        withFileLock(config.targetFile, () => {
          executionOrder.push('task1-start');
          // 時間がかかる操作をシミュレート
          const start = Date.now();
          while (Date.now() - start < delay) {
            // Busy wait
          }
          executionOrder.push('task1-end');
          writeFileSync(config.targetFile, 'Task 1 wrote this\n');
          resolve();
        });
      });

      const task2 = new Promise<void>((resolve) => {
        // 少し遅れて開始
        setTimeout(() => {
          withFileLock(config.targetFile, () => {
            executionOrder.push('task2-start');
            executionOrder.push('task2-end');
            writeFileSync(config.targetFile, 'Task 2 wrote this\n');
            resolve();
          });
        }, 10);
      });

      await Promise.all([task1, task2]);

      // 少なくとも1つのタスクが成功しているはず
      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toMatch(/Task [12] wrote this/);

      // 実行順序を確認（完全な排他制御）
      // task1-start, task1-end, task2-start, task2-end の順序か、
      // task2-start, task2-end, task1-start, task1-end の順序
      const pattern1 = executionOrder.join(',') === 'task1-start,task1-end,task2-start,task2-end';
      const pattern2 = executionOrder.join(',') === 'task2-start,task2-end,task1-start,task1-end';
      expect(pattern1 || pattern2).toBe(true);
    });

    it('should_cleanup_lock_file_after_successful_operation', () => {
      // テスト対象: 正常終了後にロックファイルが削除されること
      const lockFile = config.targetFile + '.lock';

      withFileLock(config.targetFile, () => {
        writeFileSync(config.targetFile, 'Test content\n');
      });

      // ロックファイルが存在しないことを確認
      expect(existsSync(lockFile)).toBe(false);
    });

    it('should_clear_stale_locks_from_nonexistent_process', () => {
      // テスト対象: 存在しないPIDを持つ陳腐化したロックがクリアされること
      const lockFile = config.targetFile + '.lock';

      // 陳腐化したロックファイルを手動で作成（存在しないPID）
      writeFileSync(lockFile, '99999:0\n');

      // staleMsを短く設定してロックをクリア
      withFileLock(config.targetFile, () => {
        writeFileSync(config.targetFile, 'Test content\n');
      }, { staleMs: 1000 });

      // 操作が成功することを確認
      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toBe('Test content\n');
    });
  });

  describe('境界条件', () => {
    it('should_timeout_when_lock_cannot_be_acquired', () => {
      // テスト対象: ロック取得タイムアウトが正しく動作すること
      const lockFile = `${config.targetFile}.lock`;
      // 既存の有効なロックを模擬（現在PID + 現在時刻）
      writeFileSync(lockFile, `${process.pid}:${Date.now()}\n`);

      expect(() => {
        withFileLock(config.targetFile, () => {
          writeFileSync(config.targetFile, 'Short operation\n');
        }, { maxWaitMs: 0, pollMs: 10, staleMs: 60_000 });
      }).toThrow('file lock timeout');
    });

    it('should_handle_zero_wait_ms_immediately', () => {
      // テスト対象: maxWaitMs=0の場合、即時にタイムアウトすること
      // まずロックを取得
      withFileLock(config.targetFile, () => {
        // ロック保持中
        try {
          withFileLock(config.targetFile, () => {
            writeFileSync(config.targetFile, 'Should not reach here\n');
          }, { maxWaitMs: 0 });
          expect.fail('Should have thrown timeout error');
        } catch (error) {
          expect((error as Error).message).toContain('file lock timeout');
        }
      });
    });

    it('should_handle_negative_options_gracefully', () => {
      // テスト対象: 負のオプション値が適切に処理されること
      withFileLock(config.targetFile, () => {
        writeFileSync(config.targetFile, 'Test\n');
      }, {
        maxWaitMs: -100,
        pollMs: -10,
        staleMs: -1000,
      });

      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toBe('Test\n');
    });
  });

  describe('エラー処理', () => {
    it('should_release_lock_on_error_in_callback', () => {
      // テスト対象: コールバック内でエラーが発生した場合でもロックが解放されること
      const lockFile = config.targetFile + '.lock';

      try {
        withFileLock(config.targetFile, () => {
          throw new Error('Intentional error');
        });
      } catch (error) {
        // エラーは期待通り
        expect((error as Error).message).toBe('Intentional error');
      }

      // ロックが解放されていることを確認
      expect(existsSync(lockFile)).toBe(false);
    });

    it('should_propagate_error_from_callback', () => {
      // テスト対象: コールバック内のエラーが正しく伝播されること
      expect(() => {
        withFileLock(config.targetFile, () => {
          throw new Error('Callback error');
        });
      }).toThrow('Callback error');
    });
  });

  describe('atomicWriteTextFile', () => {
    it('should_write_atomically', () => {
      // テスト対象: アトミック書き込みが正しく動作すること
      const content = 'Atomic write test\n';

      atomicWriteTextFile(config.targetFile, content);

      const readContent = readFileSync(config.targetFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should_overwrite_existing_file', () => {
      // テスト対象: 既存ファイルを正しく上書きすること
      atomicWriteTextFile(config.targetFile, 'First content\n');
      atomicWriteTextFile(config.targetFile, 'Second content\n');

      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toBe('Second content\n');
    });

    it('should_handle_empty_content', () => {
      // テスト対象: 空の内容を正しく書き込めること
      atomicWriteTextFile(config.targetFile, '');

      const content = readFileSync(config.targetFile, 'utf-8');
      expect(content).toBe('');
    });
  });

  describe('実行環境検証', () => {
    it('should_diagnose_sync_sleep_availability', () => {
      // テスト対象: 同期スリープの可用性診断が正しく動作すること
      const diag = getSyncSleepDiagnostics();

      expect(diag).toHaveProperty('hasSharedArrayBuffer');
      expect(diag).toHaveProperty('hasAtomics');
      expect(diag).toHaveProperty('hasAtomicsWait');
      expect(diag).toHaveProperty('isAvailable');
      expect(diag).toHaveProperty('reason');

      // 環境によって結果は異なるが、診断機能自体は動作するはず
      expect(typeof diag.hasSharedArrayBuffer).toBe('boolean');
      expect(typeof diag.hasAtomics).toBe('boolean');
      expect(typeof diag.hasAtomicsWait).toBe('boolean');
      expect(typeof diag.isAvailable).toBe('boolean');
      expect(typeof diag.reason).toBe('string');
    });
  });

  describe('複数ファイルの並列ロック', () => {
    it('should_allow_concurrent_locks_on_different_files', async () => {
      // テスト対象: 異なるファイルへの並列ロックが成功すること
      const targetFile2 = join(config.tempDir, 'test-file-2.txt');

      let executionOrder: string[] = [];

      const task1 = new Promise<void>((resolve) => {
        withFileLock(config.targetFile, () => {
          executionOrder.push('task1-start');
          executionOrder.push('task1-end');
          writeFileSync(config.targetFile, 'Task 1\n');
          resolve();
        });
      });

      const task2 = new Promise<void>((resolve) => {
        withFileLock(targetFile2, () => {
          executionOrder.push('task2-start');
          executionOrder.push('task2-end');
          writeFileSync(targetFile2, 'Task 2\n');
          resolve();
        });
      });

      await Promise.all([task1, task2]);

      // 両方のタスクが成功しているはず
      expect(existsSync(config.targetFile)).toBe(true);
      expect(existsSync(targetFile2)).toBe(true);

      const content1 = readFileSync(config.targetFile, 'utf-8');
      const content2 = readFileSync(targetFile2, 'utf-8');
      expect(content1).toBe('Task 1\n');
      expect(content2).toBe('Task 2\n');
    });
  });

});
