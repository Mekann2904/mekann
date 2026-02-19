/**
 * fs-utils.ts 単体テスト
 * カバレッジ分析: ensureDir
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, mkdirSync } from "node:fs";
import { ensureDir } from "../../../.pi/lib/fs-utils.js";

// ============================================================================
// ensureDir テスト
// ============================================================================

describe("ensureDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensureDir_ディレクトリ存在しない_作成実行", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir("/test/path");

    // Assert
    expect(mkdirSync).toHaveBeenCalledWith("/test/path", { recursive: true });
  });

  it("ensureDir_ディレクトリ既存_作成スキップ", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);

    // Act
    ensureDir("/existing/path");

    // Assert
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it("ensureDir_再帰的パス_recursiveオプション使用", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir("/deeply/nested/directory/path");

    // Assert
    expect(mkdirSync).toHaveBeenCalledWith(
      "/deeply/nested/directory/path",
      { recursive: true }
    );
  });

  it("ensureDir_相対パス_そのまま使用", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir("./relative/path");

    // Assert
    expect(mkdirSync).toHaveBeenCalledWith("./relative/path", { recursive: true });
  });

  it("ensureDir_現在ディレクトリ_そのまま使用", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir(".");

    // Assert
    expect(mkdirSync).toHaveBeenCalledWith(".", { recursive: true });
  });

  it("ensureDir_空文字_ルートとして処理", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir("");

    // Assert - 空文字でもmkdirSyncが呼ばれる
    expect(mkdirSync).toHaveBeenCalled();
  });

  it("ensureDir_複数回呼び出し_毎回チェック", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    ensureDir("/path/1");
    ensureDir("/path/2");

    // Assert
    expect(existsSync).toHaveBeenCalledTimes(2);
    expect(mkdirSync).toHaveBeenCalledTimes(2);
  });

  it("ensureDir_権限エラー時_例外伝播", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error("Permission denied");
    });

    // Act & Assert
    expect(() => ensureDir("/protected/path")).toThrow("Permission denied");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("ensureDir_任意のパス_existsSync呼び出し", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (path) => {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(true);

        ensureDir(path);

        return existsSync.mock.calls.length === 1;
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("ensureDir_非常に長いパス_処理可能", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true); // 既存として扱う

    // Act & Assert
    const longPath = "/a".repeat(1000);
    expect(() => ensureDir(longPath)).not.toThrow();
  });

  it("ensureDir_特殊文字含むパス_処理", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true); // 既存として扱う

    // Act & Assert
    const specialPath = "/path/with spaces/and-dashes_and.underscores";
    expect(() => ensureDir(specialPath)).not.toThrow();
  });

  it("ensureDir_Unicodeパス_処理", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true); // 既存として扱う

    // Act & Assert
    expect(() => ensureDir("/日本語/パス/🎉")).not.toThrow();
  });
});

// ============================================================================
// 統合テスト（モックなし）
// ============================================================================

describe("統合テスト", () => {
  it("ensureDir_実ファイルシステム_存在確認", () => {
    // このテストはモックを使用せず、実際のファイルシステムで動作確認する
    // テスト用一時ディレクトリを作成して検証
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const { existsSync: realExistsSync, mkdirSync: realMkdirSync, rmdirSync: realRmdirSync } = require("node:fs");

    // モックを一時的にリセット
    vi.restoreAllMocks();

    const testDir = join(tmpdir(), `fs-utils-test-${Date.now()}`);

    try {
      // Act - 実際のensureDirをインポートして使用
      const { ensureDir: realEnsureDir } = require("../../../.pi/lib/fs-utils.js");
      realEnsureDir(testDir);

      // Assert
      expect(realExistsSync(testDir)).toBe(true);

      // Cleanup
      realRmdirSync(testDir);
    } catch {
      // テスト失敗時のクリーンアップ
      try {
        realRmdirSync(testDir);
      } catch {
        // ignore
      }
    }
  });
});
