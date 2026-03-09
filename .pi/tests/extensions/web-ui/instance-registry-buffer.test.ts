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

// SQLiteストレージヘルパーをインポート
import {
  readJsonState,
  deleteJsonState,
} from "../../../lib/storage/sqlite-state-store.js";

// ============================================================================
// Helpers
// ============================================================================

const TEST_PID = 99999;

/**
 * テスト用の履歴データが保存されているか確認（SQLiteベース）
 */
function hasHistoryData(pid: number): boolean {
  try {
    const data = readJsonState<{ history: ContextHistoryEntry[] }>({
      stateKey: `webui_context_history:${pid}`,
      createDefault: () => ({ history: [] }),
    });
    return data.history.length > 0;
  } catch {
    return false;
  }
}

/**
 * テスト用の履歴データを取得
 */
function getHistoryData(pid: number): ContextHistoryEntry[] {
  const data = readJsonState<{ history: ContextHistoryEntry[] }>({
    stateKey: `webui_context_history:${pid}`,
    createDefault: () => ({ history: [] }),
  });
  return data.history;
}

/**
 * テスト用の履歴データを削除
 */
function cleanupHistoryData(pid: number): void {
  try {
    deleteJsonState(`webui_context_history:${pid}`);
  } catch {
    // Ignore
  }
}

// ============================================================================
// ContextHistoryStorage - Child Process Mode
// ============================================================================

describe("ContextHistoryStorage - Child Process Mode", () => {
  let storage: ContextHistoryStorage;

  beforeEach(() => {
    // テスト用データをクリーンアップ
    cleanupHistoryData(TEST_PID);
  });

  afterEach(() => {
    if (storage) {
      storage.dispose();
    }
    // テスト用データをクリーンアップ
    cleanupHistoryData(TEST_PID);
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
      expect(hasHistoryData(TEST_PID)).toBe(true);
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
      expect(hasHistoryData(TEST_PID)).toBe(false);
      expect(storage.getBufferSize()).toBe(2);

      // 3件目でフラッシュ
      storage.add({ timestamp: "2025-01-01T00:00:03Z", input: 100, output: 50 });

      expect(hasHistoryData(TEST_PID)).toBe(true);
      expect(storage.getBufferSize()).toBe(0);
    });

    it("should_flush_on_dispose", () => {
      storage = new ContextHistoryStorage(TEST_PID, {
        isChildProcess: true,
        maxBufferSize: 10, // 大きく設定
        flushIntervalMs: 0,
      });

      storage.add({ timestamp: "2025-01-01T00:00:01Z", input: 100, output: 50 });

      expect(hasHistoryData(TEST_PID)).toBe(false);

      storage.dispose();

      expect(hasHistoryData(TEST_PID)).toBe(true);
      const history = getHistoryData(TEST_PID);
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

      expect(hasHistoryData(TEST_PID)).toBe(false);

      // タイムアウト待機
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(hasHistoryData(TEST_PID)).toBe(true);
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

      // データは作成されない
      expect(hasHistoryData(TEST_PID)).toBe(false);
    });
  });
});

// ============================================================================
// createChildProcessStorage Factory
// ============================================================================

describe("createChildProcessStorage", () => {
  let storage: ContextHistoryStorage;

  beforeEach(() => {
    cleanupHistoryData(TEST_PID);
  });

  afterEach(() => {
    if (storage) {
      storage.dispose();
    }
    cleanupHistoryData(TEST_PID);
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

    expect(hasHistoryData(TEST_PID)).toBe(true);
  });

  it("should_allow_custom_flush_interval", async () => {
    storage = createChildProcessStorage(TEST_PID, {
      maxBufferSize: 10,
      flushIntervalMs: 30,
    });

    storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

    expect(hasHistoryData(TEST_PID)).toBe(false);

    // タイムアウト待機（より長く待機して確実にフラッシュされるように）
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(hasHistoryData(TEST_PID)).toBe(true);
  });
});

// ============================================================================
// Idempotent dispose
// ============================================================================

describe("dispose idempotency", () => {
  it("should_be_safe_to_call_dispose_multiple_times", () => {
    const testPid = 88881;

    try {
      const storage = new ContextHistoryStorage(testPid, { flushIntervalMs: 0 });
      storage.add({ timestamp: "2025-01-01T00:00:00Z", input: 100, output: 50 });

      // 複数回呼び出してもエラーにならない
      expect(() => {
        storage.dispose();
        storage.dispose();
        storage.dispose();
      }).not.toThrow();

      // データが正しく書き込まれる
      expect(hasHistoryData(testPid)).toBe(true);
    } finally {
      cleanupHistoryData(testPid);
    }
  });
});
