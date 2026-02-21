/**
 * storage-lock.ts 単体テスト
 * カバレッジ分析: withFileLock, atomicWriteTextFile
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:crypto", () => ({
  randomBytes: vi.fn(() => Buffer.from("abc123", "hex")),
}));

vi.mock("node:fs", () => ({
  closeSync: vi.fn(),
  openSync: vi.fn(() => 42),
  readFileSync: vi.fn(() => "12345:1700000000000\n"),
  renameSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import {
  withFileLock,
  atomicWriteTextFile,
  type FileLockOptions,
} from "../../../.pi/lib/storage-lock.js";

// ============================================================================
// withFileLock テスト
// ============================================================================

describe("withFileLock", () => {
  let processKillSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);
  });

  afterEach(() => {
    processKillSpy.mockRestore();
  });

  it("withFileLock_基本_ロック取得と実行", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    let executed = false;
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result = withFileLock(targetFile, () => {
      executed = true;
      return "success";
    });

    // Assert
    expect(executed).toBe(true);
    expect(result).toBe("success");
    expect(openSync).toHaveBeenCalledWith(
      expect.stringContaining(".lock"),
      "wx",
      expect.any(Number)
    );
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("withFileLock_ロック取得失敗_タイムアウトエラー", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    const error = new Error("EEXIST");
    (error as any).code = "EEXIST";
    vi.mocked(openSync).mockImplementation(() => {
      throw error;
    });
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as any);

    // Act & Assert
    try {
      expect(() =>
        withFileLock(targetFile, () => "never", { maxWaitMs: 100, pollMs: 10 })
      ).toThrow("file lock timeout");
    } finally {
      vi.mocked(openSync).mockReturnValue(42);
      vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as any);
    }
  });

  it("withFileLock_関数例外_ロック解放", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    vi.mocked(openSync).mockReturnValue(42);

    // Act & Assert
    expect(() =>
      withFileLock(targetFile, () => {
        throw new Error("Test error");
      })
    ).toThrow("Test error");
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("withFileLock_カスタムオプション_適用", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    const options: FileLockOptions = {
      maxWaitMs: 5000,
      pollMs: 100,
      staleMs: 60000,
    };
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    withFileLock(targetFile, () => "done", options);

    // Assert
    expect(openSync).toHaveBeenCalled();
  });

  it("withFileLock_戻り値_そのまま返却", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    const complexResult = { key: "value", nested: { a: 1 } };
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result = withFileLock(targetFile, () => complexResult);

    // Assert
    expect(result).toEqual(complexResult);
  });

  it("withFileLock_ロック解放エラー_無視", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    vi.mocked(openSync).mockReturnValue(42);
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error("Cannot unlink");
    });

    // Act & Assert - エラーを投げない
    expect(() => withFileLock(targetFile, () => "done")).not.toThrow();
  });

  it("withFileLock_陳腐化ロック_削除", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    let callCount = 0;
    const error = new Error("EEXIST");
    (error as any).code = "EEXIST";

    vi.mocked(openSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw error;
      }
      return 42;
    });
    vi.mocked(statSync).mockReturnValue({
      mtimeMs: Date.now() - 60000,
    } as any);

    // Act
    withFileLock(targetFile, () => "done", { maxWaitMs: 1000, staleMs: 30000 });

    // Assert
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining(".lock"));
  });

  it("withFileLock_死活不明PIDロック_即時回収", () => {
    const targetFile = "/test/storage.json";
    let callCount = 0;
    const error = new Error("EEXIST");
    (error as any).code = "EEXIST";

    vi.mocked(openSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw error;
      }
      return 42;
    });
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as any);
    vi.mocked(readFileSync).mockReturnValue("999999:1700000000000\n" as any);
    processKillSpy.mockImplementation(() => {
      const dead = new Error("dead");
      (dead as any).code = "ESRCH";
      throw dead;
    });

    const result = withFileLock(targetFile, () => "done", { maxWaitMs: 1000, staleMs: 30_000 });

    expect(result).toBe("done");
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining(".lock"));
  });

  it("withFileLock_ゼロ待機_即座失敗", () => {
    // Arrange
    const targetFile = "/test/storage.json";
    const error = new Error("EEXIST");
    (error as any).code = "EEXIST";
    vi.mocked(openSync).mockImplementation(() => {
      throw error;
    });

    // Act & Assert
    try {
      expect(() =>
        withFileLock(targetFile, () => "never", { maxWaitMs: 0 })
      ).toThrow("file lock timeout");
    } finally {
      vi.mocked(openSync).mockReturnValue(42);
    }
  });

  it("withFileLock_SAB未対応_スピンせず失敗", () => {
    const targetFile = "/test/storage.json";
    const error = new Error("EEXIST");
    (error as any).code = "EEXIST";
    vi.mocked(openSync).mockImplementation(() => {
      throw error;
    });

    const originalSharedArrayBuffer = globalThis.SharedArrayBuffer;
    Object.defineProperty(globalThis, "SharedArrayBuffer", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      expect(() =>
        withFileLock(targetFile, () => "never", { maxWaitMs: 10_000, pollMs: 1 })
      ).toThrow("file lock timeout");
      expect(openSync).toHaveBeenCalledTimes(2);
    } finally {
      vi.mocked(openSync).mockReturnValue(42);
      Object.defineProperty(globalThis, "SharedArrayBuffer", {
        configurable: true,
        writable: true,
        value: originalSharedArrayBuffer,
      });
    }
  });
});

// ============================================================================
// atomicWriteTextFile テスト
// ============================================================================

describe("atomicWriteTextFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("atomicWriteTextFile_基本_一時ファイル経由で書込", () => {
    // Arrange
    const filePath = "/test/file.json";
    const content = '{"key": "value"}';

    // Act
    atomicWriteTextFile(filePath, content);

    // Assert
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".tmp-"),
      content,
      "utf-8"
    );
    expect(renameSync).toHaveBeenCalledWith(
      expect.stringContaining(".tmp-"),
      filePath
    );
  });

  it("atomicWriteTextFile_リネームエラー_一時ファイル削除", () => {
    // Arrange
    const filePath = "/test/file.json";
    vi.mocked(renameSync).mockImplementation(() => {
      throw new Error("Rename failed");
    });

    // Act & Assert
    expect(() => atomicWriteTextFile(filePath, "content")).toThrow(
      "Rename failed"
    );
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining(".tmp-"));
  });

  it("atomicWriteTextFile_空コンテンツ_書込可能", () => {
    // Arrange
    const filePath = "/test/file.json";

    // Act
    atomicWriteTextFile(filePath, "");

    // Assert
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      "",
      "utf-8"
    );
  });

  it("atomicWriteTextFile_長いコンテンツ_書込可能", () => {
    // Arrange
    const filePath = "/test/file.json";
    const content = "x".repeat(100000);

    // Act
    atomicWriteTextFile(filePath, content);

    // Assert
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      content,
      "utf-8"
    );
  });

  it("atomicWriteTextFile_Unicode_書込可能", () => {
    // Arrange
    const filePath = "/test/file.json";
    const content = '{"日本語": "テスト🎉"}';

    // Act
    atomicWriteTextFile(filePath, content);

    // Assert
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      content,
      "utf-8"
    );
  });

  it("atomicWriteTextFile_一時ファイル名_ユニーク", () => {
    // Arrange
    const filePath = "/test/file.json";

    // Act
    atomicWriteTextFile(filePath, "content1");
    const tmpFile1 = vi.mocked(writeFileSync).mock.calls[0][0];

    vi.clearAllMocks();

    atomicWriteTextFile(filePath, "content2");
    const tmpFile2 = vi.mocked(writeFileSync).mock.calls[0][0];

    // Assert - PIDとランダムバイトでユニークなファイル名
    expect(tmpFile1).not.toBe(tmpFile2);
  });

  it("atomicWriteTextFile_削除エラー後_元エラー投げ", () => {
    // Arrange
    const filePath = "/test/file.json";
    vi.mocked(renameSync).mockImplementation(() => {
      throw new Error("Rename failed");
    });
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error("Unlink failed");
    });

    // Act & Assert - 元のRenameエラーを投げる
    expect(() => atomicWriteTextFile(filePath, "content")).toThrow(
      "Rename failed"
    );
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("atomicWriteTextFile_任意コンテンツ_書込呼び出し", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (content) => {
        vi.clearAllMocks();

        atomicWriteTextFile("/test/file.json", content);

        const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1];
        return writtenContent === content;
      }),
      { numRuns: 10 }
    );
  });

  it("withFileLock_任意戻り値_そのまま返却", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 50 }),
          fc.integer(),
          fc.boolean(),
          fc.record({ value: fc.string({ maxLength: 50 }) })
        ),
        (returnValue) => {
          vi.clearAllMocks();
          vi.mocked(openSync).mockReturnValue(42);

          const result = withFileLock("/test/file.json", () => returnValue);
          return result === returnValue;
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("withFileLock_最小待機時間_即座実行", () => {
    // Arrange
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result = withFileLock("/test/file.json", () => "done", {
      maxWaitMs: 1,
      pollMs: 1,
    });

    // Assert
    expect(result).toBe("done");
  });

  it("withFileLock_最大待機時間_設定可能", () => {
    // Arrange
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result = withFileLock("/test/file.json", () => "done", {
      maxWaitMs: 60000,
    });

    // Assert
    expect(result).toBe("done");
  });

  it("atomicWriteTextFile_非常大的ファイル_処理可能", () => {
    // Arrange
    const largeContent = "x".repeat(1024); // 1KB（実用的なサイズに縮小）

    // Act & Assert
    expect(() =>
      atomicWriteTextFile("/test/large.json", largeContent)
    ).not.toThrow();
  });

  it("withFileLock_パス長_長いパス許容", () => {
    // Arrange
    const longPath = "/test/" + "a".repeat(200) + "/file.json";
    vi.mocked(openSync).mockReturnValue(42);

    // Act & Assert
    expect(() => withFileLock(longPath, () => "done")).not.toThrow();
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("withFileLock_複数回呼び出し_独立動作", () => {
    // Arrange
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result1 = withFileLock("/test/file1.json", () => "first");
    const result2 = withFileLock("/test/file2.json", () => "second");

    // Assert
    expect(result1).toBe("first");
    expect(result2).toBe("second");
    expect(unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("withFileLock_ネスト呼び出し_異なるファイルで動作", () => {
    // Arrange
    vi.mocked(openSync).mockReturnValue(42);

    // Act
    const result = withFileLock("/test/outer.json", () => {
      return withFileLock("/test/inner.json", () => "nested");
    });

    // Assert
    expect(result).toBe("nested");
  });

  it("atomicWriteTextFile_特殊文字パス_処理可能", () => {
    // Arrange
    const specialPath = "/test/path with spaces/file.json";

    // Act & Assert
    expect(() =>
      atomicWriteTextFile(specialPath, "content")
    ).not.toThrow();
  });
});
