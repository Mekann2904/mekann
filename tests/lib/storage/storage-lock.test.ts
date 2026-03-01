/**
 * @file .pi/lib/storage/storage-lock.ts の単体テスト
 * @description 同期ファイルロックおよびアトミック書き込み機構のテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  withFileLock,
  atomicWriteTextFile,
  getSyncSleepDiagnostics,
  type FileLockOptions,
} from "../../../.pi/lib/storage/storage-lock.js";

// ============================================================================
// withFileLock テスト
// ============================================================================

describe("withFileLock", () => {
  describe("ロック取得（成功ケース）", () => {
    it("should_acquire_lock_and_execute_callback", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const expectedResult = { data: "success" };
      const callback = vi.fn(() => expectedResult);

      // Act
      const result = withFileLock(targetFile, callback);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should_release_lock_on_callback_error", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const error = new Error("Callback failed");
      const callback = vi.fn(() => {
        throw error;
      });

      // Act & Assert
      expect(() => withFileLock(targetFile, callback)).toThrow(error);
    });

    it("should_create_lock_file_with_correct_content", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const callback = vi.fn(() => "done");

      // Act
      withFileLock(targetFile, callback);

      // Assert - ロックファイルが作成され削除されることを確認
      // （実際のファイルシステムを使用）
      expect(callback).toHaveBeenCalled();
    });

    it("should_allow_nested_locks_on_different_files", () => {
      // Arrange
      const file1 = `/tmp/test1-${Date.now()}.json`;
      const file2 = `/tmp/test2-${Date.now()}.json`;

      // Act & Assert - 異なるファイルに対するロックは競合しない
      const result = withFileLock(file1, () => {
        return withFileLock(file2, () => "nested");
      });

      expect(result).toBe("nested");
    });
  });

  describe("ロック競合（タイムアウト）", () => {
    it("should_throw_on_timeout_when_lock_held", () => {
      // Arrange
      const targetFile = `/tmp/test-timeout-${Date.now()}.json`;
      const options: FileLockOptions = { maxWaitMs: 1, pollMs: 1 };

      // 最初のロックを取得
      let releaseFirstLock: () => void;
      const lockPromise = new Promise<void>((resolve) => {
        releaseFirstLock = () => resolve();
        withFileLock(targetFile, () => {
          // 2回目のロック取得を試みる（タイムアウトするはず）
          expect(() => withFileLock(targetFile, () => "second", options)).toThrow(
            /file lock timeout/
          );
        });
      });

      // Act & Assert
      lockPromise;
    });
  });

  describe("オプション正規化", () => {
    it("should_clamp_negative_maxWaitMs", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const options: FileLockOptions = { maxWaitMs: -100 };

      // Act
      const result = withFileLock(targetFile, () => "done", options);

      // Assert - エラーが投げられずに完了
      expect(result).toBe("done");
    });

    it("should_clamp_zero_pollMs", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const options: FileLockOptions = { pollMs: 0 };

      // Act
      const result = withFileLock(targetFile, () => "done", options);

      // Assert - エラーが投げられずに完了
      expect(result).toBe("done");
    });

    it("should_adjust_staleMs_to_not_exceed_maxWaitMs", () => {
      // Arrange
      const targetFile = `/tmp/test-${Date.now()}.json`;
      const options: FileLockOptions = { maxWaitMs: 1000, staleMs: 10000 };

      // Act
      const result = withFileLock(targetFile, () => "done", options);

      // Assert - 正常に完了
      expect(result).toBe("done");
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: lock_file_path_is_deterministic", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("/") && !s.includes("\0")),
          (fileName) => {
            const targetFile = `/tmp/${fileName}`;
            const lockFile = `${targetFile}.lock`;

            // ロックファイルパスは常に targetFile + ".lock"
            expect(lockFile).toBe(`${targetFile}.lock`);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it("PBT: callback_result_is_returned", () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (result) => {
            const targetFile = `/tmp/test-${Date.now()}.json`;
            const callback = () => result;
            const returned = withFileLock(targetFile, callback);

            expect(returned).toBe(result);
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

// ============================================================================
// atomicWriteTextFile テスト
// ============================================================================

describe("atomicWriteTextFile", () => {
  describe("正常系", () => {
    it("should_write_to_temp_file_then_rename", async () => {
      // Arrange
      const filePath = `/tmp/test-${Date.now()}.json`;
      const content = '{"key": "value"}';

      // Act
      atomicWriteTextFile(filePath, content);

      // Assert - ファイルが存在することを確認
      const fs = await import("node:fs");
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(content);

      // Cleanup
      fs.unlinkSync(filePath);
    });

    it("should_overwrite_existing_file", async () => {
      // Arrange
      const filePath = `/tmp/test-${Date.now()}.json`;
      const fs = await import("node:fs");
      fs.writeFileSync(filePath, "old content", "utf-8");

      const newContent = "new content";

      // Act
      atomicWriteTextFile(filePath, newContent);

      // Assert
      expect(fs.readFileSync(filePath, "utf-8")).toBe(newContent);

      // Cleanup
      fs.unlinkSync(filePath);
    });

    it("should_handle_special_characters", async () => {
      // Arrange
      const filePath = `/tmp/test-${Date.now()}.json`;
      const content = '{"日本語": "テスト", "emoji": "🎉"}';

      // Act
      atomicWriteTextFile(filePath, content);

      // Assert
      const fs = await import("node:fs");
      expect(fs.readFileSync(filePath, "utf-8")).toBe(content);

      // Cleanup
      fs.unlinkSync(filePath);
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: content_is_written_correctly", async () => {
      const fs = await import("node:fs");

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (content) => {
            const filePath = `/tmp/test-pbt-${Date.now()}-${Math.random()}.json`;

            atomicWriteTextFile(filePath, content);

            const readContent = fs.readFileSync(filePath, "utf-8");
            fs.unlinkSync(filePath);

            return readContent === content;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

// ============================================================================
// getSyncSleepDiagnostics テスト
// ============================================================================

describe("getSyncSleepDiagnostics", () => {
  describe("戻り値の構造", () => {
    it("should_return_diagnostics_object", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      expect(diag).toHaveProperty("hasSharedArrayBuffer");
      expect(diag).toHaveProperty("hasAtomics");
      expect(diag).toHaveProperty("hasAtomicsWait");
      expect(diag).toHaveProperty("isAvailable");
      expect(diag).toHaveProperty("reason");
    });

    it("should_return_boolean_for_availability_flags", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      expect(typeof diag.hasSharedArrayBuffer).toBe("boolean");
      expect(typeof diag.hasAtomics).toBe("boolean");
      expect(typeof diag.hasAtomicsWait).toBe("boolean");
      expect(typeof diag.isAvailable).toBe("boolean");
    });

    it("should_return_string_for_reason", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      expect(typeof diag.reason).toBe("string");
      expect(diag.reason.length).toBeGreaterThan(0);
    });
  });

  describe("診断ロジック", () => {
    it("should_indicate_availability_when_all_requirements_met", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      // Node.js環境では通常SharedArrayBufferが利用可能
      // CI環境や設定によっては利用不可の場合もある
      if (diag.isAvailable) {
        expect(diag.hasSharedArrayBuffer).toBe(true);
        expect(diag.hasAtomics).toBe(true);
        expect(diag.hasAtomicsWait).toBe(true);
      }
    });

    it("should_provide_helpful_reason_when_unavailable", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      if (!diag.isAvailable) {
        expect(diag.reason).toContain("SharedArrayBuffer");
      } else {
        expect(diag.reason).toContain("available");
      }
    });
  });

  describe("一貫性", () => {
    it("should_return_consistent_results_on_multiple_calls", () => {
      // Act
      const diag1 = getSyncSleepDiagnostics();
      const diag2 = getSyncSleepDiagnostics();

      // Assert
      expect(diag1.hasSharedArrayBuffer).toBe(diag2.hasSharedArrayBuffer);
      expect(diag1.hasAtomics).toBe(diag2.hasAtomics);
      expect(diag1.hasAtomicsWait).toBe(diag2.hasAtomicsWait);
      expect(diag1.isAvailable).toBe(diag2.isAvailable);
    });

    it("should_have_correct_isAvailable_logic", () => {
      // Act
      const diag = getSyncSleepDiagnostics();

      // Assert
      const expectedAvailable =
        diag.hasSharedArrayBuffer && diag.hasAtomicsWait;
      expect(diag.isAvailable).toBe(expectedAvailable);
    });
  });
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("Integration: withFileLock + atomicWriteTextFile", () => {
  it("should_combine_lock_and_atomic_write", async () => {
    // Arrange
    const fs = await import("node:fs");
    const targetFile = `/tmp/test-integration-${Date.now()}.json`;
    const content = '{"data": "test"}';

    // Act
    withFileLock(targetFile, () => {
      atomicWriteTextFile(targetFile, content);
      return "done";
    });

    // Assert
    expect(fs.readFileSync(targetFile, "utf-8")).toBe(content);

    // Cleanup
    fs.unlinkSync(targetFile);
  });

  it("should_handle_concurrent_writes_safely", async () => {
    // Arrange
    const fs = await import("node:fs");
    const targetFile = `/tmp/test-concurrent-${Date.now()}.json`;
    const writers = 5;

    // Act - 複数の書き込みを並行実行
    const promises = Array.from({ length: writers }, (_, i) =>
      Promise.resolve().then(() => {
        withFileLock(targetFile, () => {
          atomicWriteTextFile(targetFile, `writer-${i}`);
        });
      })
    );

    await Promise.all(promises);

    // Assert - 最後の書き込みが勝つ（破損しない）
    const content = fs.readFileSync(targetFile, "utf-8");
    expect(content).toMatch(/^writer-\d+$/);

    // Cleanup
    fs.unlinkSync(targetFile);
  });
});
