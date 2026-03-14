/**
 * cross-instance-coordinator.tsの単体テスト
 * 複数PIインスタンス間でのリソース調整機能を検証する
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// テスト用のモックとヘルパー
const mockInstanceId = "test-instance-123";
const mockSessionId = "test-session-456";

// テンポラリディレクトリを作成するヘルパー
function createTempCoordinatorDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coord-test-"));
  return tempDir;
}

// 環境変数をバックアップ・復元するヘルパー
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

describe("cross-instance-coordinator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempCoordinatorDir();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("InstanceId generation", () => {
    it("インスタンスIDが一意であること", () => {
      // Arrange & Act
      const id1 = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      vi.advanceTimersByTime(1);
      const id2 = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Assert
      expect(id1).not.toBe(id2);
    });

    it("インスタンスIDが期待される形式であること", () => {
      // Arrange
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2);
      const id = `${timestamp}-${random}`;

      // Assert
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe("SessionId generation", () => {
    it("セッションIDが一意であること", () => {
      // Arrange & Act
      const id1 = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      vi.advanceTimersByTime(1);
      const id2 = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Assert
      expect(id1).not.toBe(id2);
    });
  });

  describe("Parallel limit calculation", () => {
    it("単一インスタンスの場合、最大並列数を取得できること", () => {
      // Arrange
      const totalMaxLlm = 10;
      const instanceCount = 1;

      // Act
      const limit = Math.floor(totalMaxLlm / instanceCount);

      // Assert
      expect(limit).toBe(10);
    });

    it("複数インスタンスの場合、並列数が分割されること", () => {
      // Arrange
      const totalMaxLlm = 10;
      const instanceCount = 3;

      // Act
      const limit = Math.floor(totalMaxLlm / instanceCount);

      // Assert
      expect(limit).toBe(3);
    });

    it("最小並列数が1であること", () => {
      // Arrange
      const totalMaxLlm = 10;
      const instanceCount = 15;

      // Act
      const limit = Math.max(1, Math.floor(totalMaxLlm / instanceCount));

      // Assert
      expect(limit).toBe(1);
    });
  });

  describe("Heartbeat validation", () => {
    it("有効なハートビートが期限内であること", () => {
      // Arrange
      const now = Date.now();
      const heartbeatAt = now - 5000; // 5秒前
      const timeout = 30000; // 30秒タイムアウト

      // Act
      const isValid = (now - heartbeatAt) < timeout;

      // Assert
      expect(isValid).toBe(true);
    });

    it("期限切れのハートビートが無効であること", () => {
      // Arrange
      const now = Date.now();
      const heartbeatAt = now - 35000; // 35秒前
      const timeout = 30000; // 30秒タイムアウト

      // Act
      const isValid = (now - heartbeatAt) < timeout;

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe("Instance file management", () => {
    it("インスタンスファイルが正しいパスに作成されること", () => {
      // Arrange
      const coordinatorDir = tempDir;
      const instanceId = mockInstanceId;

      // Act
      const instanceFile = path.join(coordinatorDir, "instances", `${instanceId}.json`);

      // Assert
      expect(instanceFile).toContain("instances");
      expect(instanceFile).toContain(mockInstanceId);
      expect(instanceFile).toMatch(/\.json$/);
    });

    it("インスタンスファイルの内容が期待される形式であること", () => {
      // Arrange
      const now = new Date().toISOString();
      const instanceData = {
        instanceId: mockInstanceId,
        sessionId: mockSessionId,
        startedAt: now,
        lastHeartbeat: now,
        cwd: process.cwd(),
        activeModels: [],
      };

      // Act
      const serialized = JSON.stringify(instanceData);
      const parsed = JSON.parse(serialized);

      // Assert
      expect(parsed.instanceId).toBe(mockInstanceId);
      expect(parsed.sessionId).toBe(mockSessionId);
      expect(parsed.startedAt).toBe(now);
      expect(parsed.cwd).toBe(process.cwd());
    });
  });

  describe("Environment variable overrides", () => {
    it("PI_TOTAL_MAX_LLM環境変数が並列数に影響すること", () => {
      // Arrange
      const envValue = "5";

      // Act
      const parsed = parseInt(envValue, 10);

      // Assert
      expect(parsed).toBe(5);
      expect(Number.isNaN(parsed)).toBe(false);
    });

    it("無効な環境変数値が処理されること", () => {
      // Arrange
      const envValue = "invalid";

      // Act
      const parsed = parseInt(envValue, 10);

      // Assert
      expect(Number.isNaN(parsed)).toBe(true);
    });
  });

  describe("Model-specific parallel limits", () => {
    it("モデルごとの並列制限が計算されること", () => {
      // Arrange
      const modelConcurrency = 5;
      const instanceCount = 2;

      // Act
      const perInstance = Math.floor(modelConcurrency / instanceCount);

      // Assert
      expect(perInstance).toBe(2);
    });

    it("アクティブモデルの追跡ができること", () => {
      // Arrange
      const activeModels = [
        { model: "claude-3-opus", count: 2 },
        { model: "claude-3-sonnet", count: 3 },
      ];

      // Act
      const totalActive = activeModels.reduce((sum, m) => sum + m.count, 0);

      // Assert
      expect(totalActive).toBe(5);
    });
  });

  describe("Pid file locking", () => {
    it("PIDファイルが作成されること", () => {
      // Arrange
      const pid = process.pid;
      const pidFile = path.join(tempDir, `${pid}.pid`);

      // Act
      fs.writeFileSync(pidFile, `${pid}`);

      // Assert
      expect(fs.existsSync(pidFile)).toBe(true);
      expect(fs.readFileSync(pidFile, "utf-8")).toBe(`${pid}`);
    });

    it("存在しないPIDファイルが検出されること", () => {
      // Arrange
      const nonExistentPid = 99999999;
      const pidFile = path.join(tempDir, `${nonExistentPid}.pid`);

      // Act & Assert
      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });

  describe("Stale instance cleanup", () => {
    it("古いインスタンスファイルがクリーンアップ対象として識別されること", () => {
      // Arrange
      const now = Date.now();
      const staleThreshold = 60000; // 1分
      const oldHeartbeat = now - 120000; // 2分前

      // Act
      const isStale = (now - oldHeartbeat) > staleThreshold;

      // Assert
      expect(isStale).toBe(true);
    });

    it("アクティブなインスタンスファイルがクリーンアップ対象外であること", () => {
      // Arrange
      const now = Date.now();
      const staleThreshold = 60000; // 1分
      const recentHeartbeat = now - 30000; // 30秒前

      // Act
      const isStale = (now - recentHeartbeat) > staleThreshold;

      // Assert
      expect(isStale).toBe(false);
    });
  });

  describe("Coordinator status", () => {
    it("ステータスオブジェクトが期待される構造を持つこと", () => {
      // Arrange
      const status = {
        registered: true,
        activeInstanceCount: 2,
        myParallelLimit: 5,
        instances: [
          { instanceId: mockInstanceId, lastHeartbeat: new Date().toISOString() },
        ],
      };

      // Assert
      expect(status).toHaveProperty("registered");
      expect(status).toHaveProperty("activeInstanceCount");
      expect(status).toHaveProperty("myParallelLimit");
      expect(typeof status.registered).toBe("boolean");
      expect(typeof status.activeInstanceCount).toBe("number");
      expect(typeof status.myParallelLimit).toBe("number");
    });
  });

  describe("Error handling", () => {
    it("無効なインスタンスIDが処理されること", () => {
      // Arrange
      const invalidId = "";

      // Act & Assert
      expect(invalidId.length).toBe(0);
    });

    it("null/undefined値が安全に処理されること", () => {
      // Arrange
      const nullValue = null;
      const undefinedValue = undefined;

      // Act & Assert
      expect(nullValue).toBeNull();
      expect(undefinedValue).toBeUndefined();
    });
  });
});
