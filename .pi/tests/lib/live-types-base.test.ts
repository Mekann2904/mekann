/**
 * @abdd.meta
 * path: .pi/tests/lib/live-types-base.test.ts
 * role: live-types-base.tsの単体テスト
 * why: BaseLiveSnapshotインターフェースの型安全性とLiveStatus再エクスポートを検証するため
 * related: .pi/lib/live-types-base.ts
 * public_api: テストケースの実行
 * invariants: テストは型レベルの検証を主眼とする
 * side_effects: なし
 * failure_modes: 型の不整合によるコンパイルエラー
 * @abdd.explain
 * overview: BaseLiveSnapshotインターフェースとLiveStatus型の型安全性を検証する
 */

import { describe, it, expect } from "vitest";
import type { BaseLiveSnapshot, LiveStatus } from "../../lib/live-types-base.js";

describe("live-types-base", () => {
  describe("BaseLiveSnapshot型", () => {
    it("必須フィールドを持つスナップショットを作成できる", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "running",
        stdoutTail: "output",
        stderrTail: "error",
        stdoutBytes: 100,
        stderrBytes: 50,
        stdoutNewlineCount: 5,
        stderrNewlineCount: 2,
        stdoutEndsWithNewline: true,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.status).toBe("running");
      expect(snapshot.stdoutTail).toBe("output");
      expect(snapshot.stderrTail).toBe("error");
    });

    it("オプションフィールドを省略できる", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "pending",
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.startedAtMs).toBeUndefined();
      expect(snapshot.finishedAtMs).toBeUndefined();
      expect(snapshot.lastChunkAtMs).toBeUndefined();
    });

    it("全フィールドを含む完全なスナップショットを作成できる", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "completed",
        startedAtMs: 1000,
        finishedAtMs: 5000,
        lastChunkAtMs: 4900,
        stdoutTail: "complete output",
        stderrTail: "",
        stdoutBytes: 500,
        stderrBytes: 0,
        stdoutNewlineCount: 10,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: true,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.status).toBe("completed");
      expect(snapshot.startedAtMs).toBe(1000);
      expect(snapshot.finishedAtMs).toBe(5000);
      expect(snapshot.lastChunkAtMs).toBe(4900);
    });

    it("各種ステータス値を設定できる", () => {
      // Arrange
      const statuses: LiveStatus[] = ["pending", "running", "completed", "failed"];

      // Act & Assert
      for (const status of statuses) {
        const snapshot: BaseLiveSnapshot = {
          status,
          stdoutTail: "",
          stderrTail: "",
          stdoutBytes: 0,
          stderrBytes: 0,
          stdoutNewlineCount: 0,
          stderrNewlineCount: 0,
          stdoutEndsWithNewline: false,
          stderrEndsWithNewline: false,
        };
        expect(snapshot.status).toBe(status);
      }
    });
  });

  describe("型の不変条件", () => {
    it("stdoutBytesとstderrBytesは非負整数である", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "running",
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.stdoutBytes).toBeGreaterThanOrEqual(0);
      expect(snapshot.stderrBytes).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(snapshot.stdoutBytes)).toBe(true);
      expect(Number.isInteger(snapshot.stderrBytes)).toBe(true);
    });

    it("stdoutNewlineCountとstderrNewlineCountは非負整数である", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "running",
        stdoutTail: "line1\nline2",
        stderrTail: "error\n",
        stdoutBytes: 12,
        stderrBytes: 6,
        stdoutNewlineCount: 1,
        stderrNewlineCount: 1,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: true,
      };

      // Assert
      expect(snapshot.stdoutNewlineCount).toBeGreaterThanOrEqual(0);
      expect(snapshot.stderrNewlineCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("境界値テスト", () => {
    it("空の出力を正しく表現できる", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "pending",
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.stdoutTail).toBe("");
      expect(snapshot.stderrTail).toBe("");
      expect(snapshot.stdoutBytes).toBe(0);
      expect(snapshot.stderrBytes).toBe(0);
    });

    it("大量のデータを正しく表現できる", () => {
      // Arrange
      const largeOutput = "x".repeat(10000);

      // Act
      const snapshot: BaseLiveSnapshot = {
        status: "running",
        stdoutTail: largeOutput,
        stderrTail: "",
        stdoutBytes: 1000000,
        stderrBytes: 0,
        stdoutNewlineCount: 500,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: true,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.stdoutTail.length).toBe(10000);
      expect(snapshot.stdoutBytes).toBe(1000000);
    });

    it("タイムスタンプの境界値を正しく処理できる", () => {
      // Arrange & Act
      const snapshot: BaseLiveSnapshot = {
        status: "completed",
        startedAtMs: 0,
        finishedAtMs: Number.MAX_SAFE_INTEGER,
        lastChunkAtMs: Number.MAX_SAFE_INTEGER - 1,
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      };

      // Assert
      expect(snapshot.startedAtMs).toBe(0);
      expect(snapshot.finishedAtMs).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
