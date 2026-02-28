/**
 * @file .pi/extensions/web-ui/lib/instance-registry.ts のバッファリング最適化テスト
 * @description 子プロセス向けのバッファリング機能をテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// テスト対象をインポート
import {
  ContextHistoryStorage,
  createChildProcessStorage,
  type ContextHistoryStorageOptions,
  type ContextHistoryEntry,
} from "../../../extensions/web-ui/lib/instance-registry.js";

// ============================================================================
// Helpers
// ============================================================================

const SHARED_DIR = path.join(os.homedir(), ".pi-shared");
const getTestHistoryPath = (pid: number) =>
  path.join(SHARED_DIR, `context-history-${pid}.json`);

const TEST_PID = 99999;

// ============================================================================
// ContextHistoryStorage - Child Process Mode
// ============================================================================

describe("ContextHistoryStorage - Child Process Mode", () => {
  let storage: ContextHistoryStorage;
  const testFile = getTestHistoryPath(TEST_PID);

  beforeEach(() => {
    // テスト用ファイルをクリーンアップ
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch {
      // Ignore
    }
  });

  afterEach(() => {
    if (storage) {
      storage.dispose();
    }
    // テスト用ファイルをクリーンアップ
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch {
      // Ignore
    }
  });

  describe("子プロセスモードの設定", () => {
    it("should_use_smaller_buffer_for_child_process", () => {
      storage = new ContextHistoryStorage(TEST_PID, { isChildProcess: true });

      expect(storage.getChildProcessMode()).toBe(true);
      expect(storage.getBufferSize()).toBe(0);
    });

    it("should_use_larger_buffer_for_main_process", () => {
      storage = new ContextHistoryStorage(TEST_PID, { isChildProcess: false });

      expect(storage.getChildProcessMode()).toBe(false);
    });

    it("should_use_custom_buffer_size", () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 1,
      });

      // 1件でフラッシュされる
      storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

      expect(storage.getBufferSize()).toBe(0); // フラッシュ済み
      expect(fs.existsSync(testFile)).toBe(true);
    });
  });

  describe("バッファリング動作", () => {
    it("should_buffer_entries_until_threshold", () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 3,
        flushIntervalMs: 0, // タイマー無効
      });

      storage.add({ timestamp: "2025-01-01T00:00:01Z", input: 100, output: 50 });
      storage.add({ timestamp: "2025-01-01T00:00:02Z", input: 100, output: 50 });

      // バッファサイズ未満なのでまだ書き込まれない
      expect(fs.existsSync(testFile)).toBe(false);
      expect(storage.getBufferSize()).toBe(2);

      // 3件目でフラッシュ
      storage.add({ timestamp: "2025-01-01T00:00:03Z", input: 100, output: 50 });

      expect(fs.existsSync(testFile)).toBe(true);
      expect(storage.getBufferSize()).toBe(0);
    });

    it("should_flush_on_dispose", () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 10, // 大きく設定
        flushIntervalMs: 0,
      });

      storage.add({ timestamp: "2025-01-01T00:00:01Z", input: 100, output: 50 });

      expect(fs.existsSync(testFile)).toBe(false);

      storage.dispose();

      expect(fs.existsSync(testFile)).toBe(true);
      const content = fs.readFileSync(testFile, "utf-8");
      const history = JSON.parse(content) as ContextHistoryEntry[];
      expect(history).toHaveLength(1);
    });
  });

  describe("タイムアウトベースのフラッシュ", () => {
    it("should_flush_after_timeout", async () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 10, // 大きく設定
        flushIntervalMs: 50, // 50ms
      });

      storage.add({ timestamp: "2025-01-01T00:00:01Z", input: 100, output: 50 });

      expect(fs.existsSync(testFile)).toBe(false);

      // タイムアウト待機
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fs.existsSync(testFile)).toBe(true);
      expect(storage.getBufferSize()).toBe(0);
    });

    it("should_not_flush_when_buffer_empty", async () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 10,
        flushIntervalMs: 50,
      });

      // エントリを追加しない

      await new Promise((resolve) => setTimeout(resolve, 100));

      // ファイルは作成されない
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });
});

// ============================================================================
// createChildProcessStorage Factory
// ============================================================================

describe("createChildProcessStorage", () => {
  const testFile = getTestHistoryPath(TEST_PID);
  let storage: ContextHistoryStorage;

  beforeEach(() => {
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch {
      // Ignore
    }
  });

  afterEach(() => {
    if (storage) {
      storage.dispose();
    }
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch {
      // Ignore
    }
  });

  it("should_create_storage_with_child_process_defaults", () => {
    storage = createChildProcessStorage(TEST_PID);

    expect(storage.getChildProcessMode()).toBe(true);
    expect(storage.getPid()).toBe(TEST_PID);
  });

  it("should_allow_custom_buffer_size", () => {
    storage = createChildProcessStorage(TEST_PID, { maxBufferSize: 1 });

    // 1件でフラッシュ
    storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

    expect(fs.existsSync(testFile)).toBe(true);
  });

  it("should_allow_custom_flush_interval", () => {
    storage = createChildProcessStorage(TEST_PID, {
      maxBufferSize: 10,
      flushIntervalMs: 30,
    });

    storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

    expect(fs.existsSync(testFile)).toBe(false);

    // タイムアウト待機
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fs.existsSync(testFile)).toBe(true);
        resolve();
      }, 50);
    });
  });
});

// ============================================================================
// Idempotent dispose
// ============================================================================

describe("dispose idempotency", () => {
  it("should_be_safe_to_call_dispose_multiple_times", () => {
    const testPid = 88881;
    const testFile = getTestHistoryPath(testPid);

    try {
      const storage = new ContextHistoryStorage(testPid, { flushIntervalMs: 0 });
      storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

      // 複数回呼び出してもエラーにならない
      expect(() => {
        storage.dispose();
        storage.dispose();
        storage.dispose();
      }).not.toThrow();

      // ファイルが正しく書き込まれる
      expect(fs.existsSync(testFile)).toBe(true);
    } finally {
      try {
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
        }
      } catch {
        // Ignore
      }
    }
  });
});
