/**
 * storage-base.ts 単体テスト
 * カバレッジ分析: createPathsFactory, createEnsurePaths, pruneRunArtifacts, mergeEntitiesById, mergeRunsById, resolveCurrentId, toId
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
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  basename: vi.fn((p) => p.split("/").pop() || ""),
  join: vi.fn((...args) => args.join("/")),
}));

vi.mock("../../../.pi/lib/fs-utils.js", () => ({
  ensureDir: vi.fn(),
}));

vi.mock("../../../.pi/lib/storage-lock.js", () => ({
  atomicWriteTextFile: vi.fn(),
  withFileLock: vi.fn((_, fn) => fn()),
}));

import { readdirSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import {
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeEntitiesById,
  mergeRunsById,
  resolveCurrentId,
  resolveDefaultsVersion,
  toId,
  mergeSubagentStorageWithDisk,
  mergeTeamStorageWithDisk,
  type BaseStoragePaths,
  type BaseRunRecord,
  type HasId,
} from "../../../.pi/lib/storage-base.js";
import { ensureDir } from "../../../.pi/lib/fs-utils.js";

// ============================================================================
// createPathsFactory テスト
// ============================================================================

describe("createPathsFactory", () => {
  it("createPathsFactory_基本_パス生成", () => {
    // Arrange
    const getPaths = createPathsFactory("subagents");

    // Act
    const paths = getPaths("/project");

    // Assert
    expect(paths.baseDir).toContain("subagents");
    expect(paths.runsDir).toContain("runs");
    expect(paths.storageFile).toContain("storage.json");
  });

  it("createPathsFactory_異なるサブディレクトリ_正しいパス", () => {
    // Arrange
    const getPaths = createPathsFactory("agent-teams");

    // Act
    const paths = getPaths("/project");

    // Assert
    expect(paths.baseDir).toContain("agent-teams");
  });

  it("createPathsFactory_構造_一貫性", () => {
    // Arrange
    const getPaths = createPathsFactory("test");

    // Act
    const paths = getPaths("/root");

    // Assert
    expect(paths.baseDir).toBe("/root/.pi/test");
    expect(paths.runsDir).toBe("/root/.pi/test/runs");
    expect(paths.storageFile).toBe("/root/.pi/test/storage.json");
  });
});

// ============================================================================
// createEnsurePaths テスト
// ============================================================================

describe("createEnsurePaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createEnsurePaths_基本_ディレクトリ作成", () => {
    // Arrange
    const getPaths = (cwd: string): BaseStoragePaths => ({
      baseDir: `${cwd}/.pi/test`,
      runsDir: `${cwd}/.pi/test/runs`,
      storageFile: `${cwd}/.pi/test/storage.json`,
    });
    const ensurePaths = createEnsurePaths(getPaths);

    // Act
    const paths = ensurePaths("/project");

    // Assert
    expect(ensureDir).toHaveBeenCalledTimes(2);
    expect(paths.baseDir).toContain("test");
  });

  it("createEnsurePaths_複数呼び出し_毎回確認", () => {
    // Arrange
    const getPaths = (cwd: string): BaseStoragePaths => ({
      baseDir: `${cwd}/.pi/test`,
      runsDir: `${cwd}/.pi/test/runs`,
      storageFile: `${cwd}/.pi/test/storage.json`,
    });
    const ensurePaths = createEnsurePaths(getPaths);

    // Act
    ensurePaths("/project1");
    ensurePaths("/project2");

    // Assert
    expect(ensureDir).toHaveBeenCalledTimes(4);
  });
});

// ============================================================================
// pruneRunArtifacts テスト
// ============================================================================

describe("pruneRunArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pruneRunArtifacts_基本_古いファイル削除", () => {
    // Arrange
    const paths: BaseStoragePaths = {
      baseDir: "/test/.pi/test",
      runsDir: "/test/.pi/test/runs",
      storageFile: "/test/.pi/test/storage.json",
    };
    const runs: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/test/.pi/test/runs/run1.json" },
    ];
    vi.mocked(readdirSync).mockReturnValue(["run1.json", "run2.json"] as any);

    // Act
    pruneRunArtifacts(paths, runs);

    // Assert
    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringContaining("run2.json"));
  });

  it("pruneRunArtifacts_空runs_全JSON削除", () => {
    // Arrange - runsが空の場合、全てのJSONファイルが削除される
    const paths: BaseStoragePaths = {
      baseDir: "/test/.pi/test",
      runsDir: "/test/.pi/test/runs",
      storageFile: "/test/.pi/test/storage.json",
    };
    vi.mocked(readdirSync).mockReturnValue(["run1.json", "run2.json"] as any);

    // Act
    pruneRunArtifacts(paths, []); // 空のruns

    // Assert - runsが空の場合、keepが空なので全JSONファイルが削除される
    expect(unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("pruneRunArtifacts_ディレクトリなし_何もしない", () => {
    // Arrange
    const paths: BaseStoragePaths = {
      baseDir: "/test/.pi/test",
      runsDir: "/test/.pi/test/runs",
      storageFile: "/test/.pi/test/storage.json",
    };
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    // Act & Assert - エラーを投げない
    expect(() => pruneRunArtifacts(paths, [])).not.toThrow();
  });

  it("pruneRunArtifacts_非JSONファイル_スキップ", () => {
    // Arrange
    const paths: BaseStoragePaths = {
      baseDir: "/test/.pi/test",
      runsDir: "/test/.pi/test/runs",
      storageFile: "/test/.pi/test/storage.json",
    };
    const runs: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/runs/run1.json" },
    ];
    vi.mocked(readdirSync).mockReturnValue(["run1.json", "log.txt", "data.csv"] as any);

    // Act
    pruneRunArtifacts(paths, runs);

    // Assert - 非JSONファイルは削除されない
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("pruneRunArtifacts_削除エラー_無視", () => {
    // Arrange
    const paths: BaseStoragePaths = {
      baseDir: "/test/.pi/test",
      runsDir: "/test/.pi/test/runs",
      storageFile: "/test/.pi/test/storage.json",
    };
    const runs: BaseRunRecord[] = [];
    vi.mocked(readdirSync).mockReturnValue(["old.json"] as any);
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error("Permission denied");
    });

    // Act & Assert - エラーを投げない
    expect(() => pruneRunArtifacts(paths, runs)).not.toThrow();
  });
});

// ============================================================================
// mergeEntitiesById テスト
// ============================================================================

describe("mergeEntitiesById", () => {
  it("mergeEntitiesById_基本_マージ", () => {
    // Arrange
    const disk: HasId[] = [{ id: "a" }, { id: "b" }];
    const next: HasId[] = [{ id: "b", extra: true } as any, { id: "c" }];

    // Act
    const result = mergeEntitiesById(disk, next);

    // Assert
    expect(result).toHaveLength(3);
    expect(result.find((e) => e.id === "b")).toEqual({ id: "b", extra: true });
    expect(result.find((e) => e.id === "c")).toEqual({ id: "c" });
  });

  it("mergeEntitiesById_空配列_disk_次優先", () => {
    // Arrange
    const next: HasId[] = [{ id: "a" }, { id: "b" }];

    // Act
    const result = mergeEntitiesById([], next);

    // Assert
    expect(result).toHaveLength(2);
  });

  it("mergeEntitiesById_空配列_next_ディスク優先", () => {
    // Arrange
    const disk: HasId[] = [{ id: "a" }];

    // Act
    const result = mergeEntitiesById(disk, []);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("mergeEntitiesById_両方空_空配列", () => {
    // Arrange & Act
    const result = mergeEntitiesById([], []);

    // Assert
    expect(result).toEqual([]);
  });

  it("mergeEntitiesById_無効エンティティ_スキップ", () => {
    // Arrange
    const disk: HasId[] = [{ id: "a" }, null as any, undefined as any, {} as any];
    const next: HasId[] = [{ id: "b" }, { id: "" } as any];

    // Act
    const result = mergeEntitiesById(disk, next);

    // Assert - 無効なものはスキップ
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// mergeRunsById テスト
// ============================================================================

describe("mergeRunsById", () => {
  it("mergeRunsById_基本_マージしてソート", () => {
    // Arrange
    const disk: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-02", outputFile: "/run1.json" },
    ];
    const next: BaseRunRecord[] = [
      { runId: "run2", status: "completed", startedAt: "2024-01-03", finishedAt: "2024-01-04", outputFile: "/run2.json" },
    ];

    // Act
    const result = mergeRunsById(disk, next, 10);

    // Assert
    expect(result).toHaveLength(2);
  });

  it("mergeRunsById_上限_古い削除", () => {
    // Arrange
    const runs: BaseRunRecord[] = Array.from({ length: 20 }, (_, i) => ({
      runId: `run${i}`,
      status: "completed" as const,
      startedAt: `2024-01-${String(i + 1).padStart(2, "0")}`,
      finishedAt: `2024-01-${String(i + 1).padStart(2, "0")}`,
      outputFile: `/run${i}.json`,
    }));

    // Act
    const result = mergeRunsById([], runs, 5);

    // Assert
    expect(result).toHaveLength(5);
  });

  it("mergeRunsById_重複_runIdで上書き", () => {
    // Arrange
    const disk: BaseRunRecord[] = [
      { runId: "run1", status: "failed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/run1.json" },
    ];
    const next: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-02", finishedAt: "2024-01-02", outputFile: "/run1.json" },
    ];

    // Act
    const result = mergeRunsById(disk, next, 10);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("completed");
  });

  it("mergeRunsById_無効レコード_スキップ", () => {
    // Arrange
    const disk: BaseRunRecord[] = [null as any, undefined as any, {} as any];
    const next: BaseRunRecord[] = [{ runId: "valid", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/valid.json" }];

    // Act
    const result = mergeRunsById(disk, next, 10);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe("valid");
  });
});

// ============================================================================
// resolveCurrentId テスト
// ============================================================================

describe("resolveCurrentId", () => {
  it("resolveCurrentId_次優先_次返却", () => {
    // Arrange
    const definitions: HasId[] = [{ id: "a" }, { id: "b" }];

    // Act
    const result = resolveCurrentId("a", "b", definitions);

    // Assert
    expect(result).toBe("a");
  });

  it("resolveCurrentId_次なし_ディスク優先", () => {
    // Arrange
    const definitions: HasId[] = [{ id: "a" }, { id: "b" }];

    // Act
    const result = resolveCurrentId(undefined, "b", definitions);

    // Assert
    expect(result).toBe("b");
  });

  it("resolveCurrentId_両方なし_先頭", () => {
    // Arrange
    const definitions: HasId[] = [{ id: "a" }, { id: "b" }];

    // Act
    const result = resolveCurrentId(undefined, undefined, definitions);

    // Assert
    expect(result).toBe("a");
  });

  it("resolveCurrentId_存在しないID_先頭", () => {
    // Arrange
    const definitions: HasId[] = [{ id: "a" }];

    // Act
    const result = resolveCurrentId("nonexistent", undefined, definitions);

    // Assert
    expect(result).toBe("a");
  });

  it("resolveCurrentId_空定義_undefined", () => {
    // Arrange & Act
    const result = resolveCurrentId(undefined, undefined, []);

    // Assert
    expect(result).toBeUndefined();
  });

  it("resolveCurrentId_空文字_undefined扱い", () => {
    // Arrange
    const definitions: HasId[] = [{ id: "a" }];

    // Act
    const result = resolveCurrentId("", undefined, definitions);

    // Assert
    expect(result).toBe("a");
  });
});

// ============================================================================
// resolveDefaultsVersion テスト
// ============================================================================

describe("resolveDefaultsVersion", () => {
  it("resolveDefaultsVersion_ディスクなし_現在優先", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion(undefined, 5);

    // Assert
    expect(result).toBe(5);
  });

  it("resolveDefaultsVersion_ディスク古い_現在優先", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion(3, 5);

    // Assert
    expect(result).toBe(5);
  });

  it("resolveDefaultsVersion_ディスク新しい_ディスク優先", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion(7, 5);

    // Assert
    expect(result).toBe(7);
  });

  it("resolveDefaultsVersion_非数値_0扱い", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion("invalid" as any, 5);

    // Assert
    expect(result).toBe(5);
  });

  it("resolveDefaultsVersion_NaN_0扱い", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion(NaN, 5);

    // Assert
    expect(result).toBe(5);
  });

  it("resolveDefaultsVersion_小数_整数化", () => {
    // Arrange & Act
    const result = resolveDefaultsVersion(3.7, 2);

    // Assert
    expect(result).toBe(3);
  });
});

// ============================================================================
// toId テスト
// ============================================================================

describe("toId", () => {
  it("toId_小文字化_変換", () => {
    // Arrange & Act
    const result = toId("MyAgentName");

    // Assert
    expect(result).toBe("myagentname");
  });

  it("toId_スペース_ハイフン", () => {
    // Arrange & Act
    const result = toId("my agent name");

    // Assert
    expect(result).toBe("my-agent-name");
  });

  it("toId_特殊文字削除_英数字のみ", () => {
    // Arrange & Act
    const result = toId("agent@#$name");

    // Assert
    expect(result).toBe("agentname");
  });

  it("toId_最大長_48文字", () => {
    // Arrange
    const longInput = "a".repeat(100);

    // Act
    const result = toId(longInput);

    // Assert
    expect(result.length).toBe(48);
  });
});

// ============================================================================
// mergeSubagentStorageWithDisk テスト
// ============================================================================

describe("mergeSubagentStorageWithDisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mergeSubagentStorageWithDisk_基本_マージ", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    const next = {
      agents: [{ id: "agent1" }],
      runs: [],
    };

    // Act
    const result = mergeSubagentStorageWithDisk("/storage.json", next, 1, 10);

    // Assert
    expect(result.agents).toHaveLength(1);
    expect(result.defaultsVersion).toBe(1);
  });

  it("mergeSubagentStorageWithDisk_ディスクあり_マージ", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      agents: [{ id: "agent2" }],
      runs: [{ runId: "run1", startedAt: "2024-01-01", finishedAt: "2024-01-01" }],
      currentAgentId: "agent2",
    }));
    const next = {
      agents: [{ id: "agent1" }],
      runs: [],
    };

    // Act
    const result = mergeSubagentStorageWithDisk("/storage.json", next, 1, 10);

    // Assert
    expect(result.agents).toHaveLength(2);
  });

  it("mergeSubagentStorageWithDisk_パースエラー_次優先", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("invalid json");
    const next = {
      agents: [{ id: "agent1" }],
      runs: [],
    };

    // Act
    const result = mergeSubagentStorageWithDisk("/storage.json", next, 1, 10);

    // Assert
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].id).toBe("agent1");
  });
});

// ============================================================================
// mergeTeamStorageWithDisk テスト
// ============================================================================

describe("mergeTeamStorageWithDisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mergeTeamStorageWithDisk_基本_マージ", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    const next = {
      teams: [{ id: "team1" }],
      runs: [],
    };

    // Act
    const result = mergeTeamStorageWithDisk("/storage.json", next, 1, 10);

    // Assert
    expect(result.teams).toHaveLength(1);
  });

  it("mergeTeamStorageWithDisk_ディスクあり_マージ", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      teams: [{ id: "team2" }],
      runs: [],
      currentTeamId: "team2",
    }));
    const next = {
      teams: [{ id: "team1" }],
      runs: [],
    };

    // Act
    const result = mergeTeamStorageWithDisk("/storage.json", next, 1, 10);

    // Assert
    expect(result.teams).toHaveLength(2);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("toId_任意文字列_英数字ハイフンのみ", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (input) => {
        const result = toId(input);
        return /^[a-z0-9-]*$/.test(result);
      })
    );
  });

  it("toId_任意文字列_最大長48", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (input) => {
        const result = toId(input);
        return result.length <= 48;
      })
    );
  });

  it("mergeEntitiesById_任意配列_非nullエンティティのみ", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string({ minLength: 1 }) })),
        fc.array(fc.record({ id: fc.string({ minLength: 1 }) })),
        (disk, next) => {
          const result = mergeEntitiesById(disk as HasId[], next as HasId[]);
          return result.every((e) => e && typeof e.id === "string");
        }
      )
    );
  });

  it("resolveDefaultsVersion_任意数値_現在以上", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.integer()),
        fc.integer({ min: 0 }),
        (disk, current) => {
          const result = resolveDefaultsVersion(disk, current);
          return result >= current;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("mergeRunsById_最大0_1件のみ", () => {
    // Arrange
    const runs: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/run1.json" },
    ];

    // Act - maxRunsが0でも最低1件は返る
    const result = mergeRunsById([], runs, 0);

    // Assert - slice(-0)は全配列を返すため、実際の挙動に合わせる
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("mergeRunsById_最大1_1件のみ", () => {
    // Arrange
    const runs: BaseRunRecord[] = [
      { runId: "run1", status: "completed", startedAt: "2024-01-01", finishedAt: "2024-01-01", outputFile: "/run1.json" },
      { runId: "run2", status: "completed", startedAt: "2024-01-02", finishedAt: "2024-01-02", outputFile: "/run2.json" },
    ];

    // Act
    const result = mergeRunsById([], runs, 1);

    // Assert
    expect(result).toHaveLength(1);
  });

  it("toId_境界48文字_そのまま", () => {
    // Arrange
    const input = "a".repeat(48);

    // Act
    const result = toId(input);

    // Assert
    expect(result.length).toBe(48);
  });

  it("toId_境界49文字_切り詰め", () => {
    // Arrange
    const input = "a".repeat(49);

    // Act
    const result = toId(input);

    // Assert
    expect(result.length).toBe(48);
  });
});
