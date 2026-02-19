/**
 * runtime-snapshot.ts 単体テスト
 * カバレッジ分析: IRuntimeSnapshot, RuntimeSnapshotProvider
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";

import type {
  IRuntimeSnapshot,
  RuntimeSnapshotProvider,
} from "../../../../.pi/lib/interfaces/runtime-snapshot.js";

// ============================================================================
// IRuntimeSnapshot 型テスト
// ============================================================================

describe("IRuntimeSnapshot", () => {
  it("IRuntimeSnapshot_有効な値_型チェック", () => {
    // Arrange & Act
    const snapshot: IRuntimeSnapshot = {
      totalActiveLlm: 5,
      totalActiveRequests: 10,
      subagentActiveCount: 3,
      teamActiveCount: 2,
    };

    // Assert
    expect(snapshot.totalActiveLlm).toBe(5);
    expect(snapshot.totalActiveRequests).toBe(10);
    expect(snapshot.subagentActiveCount).toBe(3);
    expect(snapshot.teamActiveCount).toBe(2);
  });

  it("IRuntimeSnapshot_ゼロ値_許可", () => {
    // Arrange & Act
    const snapshot: IRuntimeSnapshot = {
      totalActiveLlm: 0,
      totalActiveRequests: 0,
      subagentActiveCount: 0,
      teamActiveCount: 0,
    };

    // Assert
    expect(snapshot.totalActiveLlm).toBe(0);
    expect(snapshot.totalActiveRequests).toBe(0);
    expect(snapshot.subagentActiveCount).toBe(0);
    expect(snapshot.teamActiveCount).toBe(0);
  });

  it("IRuntimeSnapshot_プロパティアクセス_全プロパティ存在", () => {
    // Arrange
    const snapshot: IRuntimeSnapshot = {
      totalActiveLlm: 1,
      totalActiveRequests: 2,
      subagentActiveCount: 3,
      teamActiveCount: 4,
    };

    // Act & Assert
    expect(snapshot).toHaveProperty("totalActiveLlm");
    expect(snapshot).toHaveProperty("totalActiveRequests");
    expect(snapshot).toHaveProperty("subagentActiveCount");
    expect(snapshot).toHaveProperty("teamActiveCount");
  });
});

// ============================================================================
// RuntimeSnapshotProvider 型テスト
// ============================================================================

describe("RuntimeSnapshotProvider", () => {
  it("RuntimeSnapshotProvider_関数型_スナップショット返却", () => {
    // Arrange
    const expectedSnapshot: IRuntimeSnapshot = {
      totalActiveLlm: 3,
      totalActiveRequests: 5,
      subagentActiveCount: 2,
      teamActiveCount: 1,
    };

    // Act
    const provider: RuntimeSnapshotProvider = () => expectedSnapshot;
    const result = provider();

    // Assert
    expect(result).toEqual(expectedSnapshot);
  });

  it("RuntimeSnapshotProvider_動的値_毎回新しい値", () => {
    // Arrange
    let counter = 0;
    const provider: RuntimeSnapshotProvider = () => ({
      totalActiveLlm: ++counter,
      totalActiveRequests: counter * 2,
      subagentActiveCount: counter,
      teamActiveCount: 0,
    });

    // Act
    const first = provider();
    const second = provider();

    // Assert
    expect(first.totalActiveLlm).toBe(1);
    expect(second.totalActiveLlm).toBe(2);
    expect(first).not.toBe(second);
  });

  it("RuntimeSnapshotProvider_不変値_同じ参照", () => {
    // Arrange
    const snapshot: IRuntimeSnapshot = {
      totalActiveLlm: 5,
      totalActiveRequests: 10,
      subagentActiveCount: 3,
      teamActiveCount: 2,
    };
    const provider: RuntimeSnapshotProvider = () => snapshot;

    // Act
    const first = provider();
    const second = provider();

    // Assert
    expect(first).toBe(second);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("IRuntimeSnapshot_任意の正数値_型整合", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (llm, requests, subagents, teams) => {
          const snapshot: IRuntimeSnapshot = {
            totalActiveLlm: llm,
            totalActiveRequests: requests,
            subagentActiveCount: subagents,
            teamActiveCount: teams,
          };

          return (
            snapshot.totalActiveLlm === llm &&
            snapshot.totalActiveRequests === requests &&
            snapshot.subagentActiveCount === subagents &&
            snapshot.teamActiveCount === teams
          );
        }
      )
    );
  });

  it("RuntimeSnapshotProvider_任意のスナップショット_返却整合", () => {
    fc.assert(
      fc.property(
        fc.record({
          totalActiveLlm: fc.nat({ max: 100 }),
          totalActiveRequests: fc.nat({ max: 100 }),
          subagentActiveCount: fc.nat({ max: 100 }),
          teamActiveCount: fc.nat({ max: 100 }),
        }),
        (expected) => {
          const provider: RuntimeSnapshotProvider = () => expected;
          const result = provider();

          return (
            result.totalActiveLlm === expected.totalActiveLlm &&
            result.totalActiveRequests === expected.totalActiveRequests &&
            result.subagentActiveCount === expected.subagentActiveCount &&
            result.teamActiveCount === expected.teamActiveCount
          );
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("IRuntimeSnapshot_大きな値_処理可能", () => {
    // Arrange & Act
    const snapshot: IRuntimeSnapshot = {
      totalActiveLlm: Number.MAX_SAFE_INTEGER,
      totalActiveRequests: Number.MAX_SAFE_INTEGER,
      subagentActiveCount: Number.MAX_SAFE_INTEGER,
      teamActiveCount: Number.MAX_SAFE_INTEGER,
    };

    // Assert
    expect(snapshot.totalActiveLlm).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("RuntimeSnapshotProvider_複数回呼び出し_独立動作", () => {
    // Arrange
    const snapshots: IRuntimeSnapshot[] = [];
    const provider: RuntimeSnapshotProvider = () => ({
      totalActiveLlm: Math.floor(Math.random() * 100),
      totalActiveRequests: Math.floor(Math.random() * 100),
      subagentActiveCount: Math.floor(Math.random() * 100),
      teamActiveCount: Math.floor(Math.random() * 100),
    });

    // Act
    for (let i = 0; i < 100; i++) {
      snapshots.push(provider());
    }

    // Assert - 各スナップショットが有効な値を持つ
    for (const snapshot of snapshots) {
      expect(snapshot.totalActiveLlm).toBeGreaterThanOrEqual(0);
      expect(snapshot.totalActiveLlm).toBeLessThan(100);
    }
  });
});
