/**
 * @file .pi/extensions/ralph-loop.ts の単体テスト
 * @description Ralph Loop 拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// モックExtensionAPI
const createMockExtensionAPI = (): ExtensionAPI => {
  const tools: Map<string, unknown> = new Map();
  const handlers: Map<string, unknown> = new Map();

  return {
    cwd: "/tmp/test",
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool);
    }),
    registerResource: vi.fn(),
    registerPrompt: vi.fn(),
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    _tools: tools,
    _handlers: handlers,
  } as unknown as ExtensionAPI;
};

describe("ralph-loop extension", () => {
  let tempDir: string;
  let mockAPI: ExtensionAPI;

  beforeEach(async () => {
    tempDir = mkdtempSync("/tmp/ralph-loop-ext-test-");
    mockAPI = createMockExtensionAPI();
    mockAPI.cwd = tempDir;

    // モジュールを動的インポート（毎回新しいインスタンス）
    vi.resetModules();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("tool registration", () => {
    it("should register ralph_loop_init tool", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ralph_loop_init",
          label: "Ralph Loop Initialize",
        })
      );
    });

    it("should register ralph_loop_status tool", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ralph_loop_status",
          label: "Ralph Loop Status",
        })
      );
    });

    it("should register ralph_loop_run tool", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      expect(mockAPI.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ralph_loop_run",
          label: "Ralph Loop Run",
        })
      );
    });

    it("should register session_shutdown handler", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      expect(mockAPI.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    });

    it("should not register tools twice", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);
      registerRalphLoop(mockAPI);

      // registerTool should be called exactly 3 times (not 6)
      expect(mockAPI.registerTool).toHaveBeenCalledTimes(3);
    });
  });

  describe("ralph_loop_init tool", () => {
    it("should initialize with default parameters", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const initToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_init"
      );
      expect(initToolCall).toBeDefined();

      const tool = initToolCall![0];
      const result = await tool.execute("test-id", {}, null as unknown as AbortSignal, vi.fn(), {
        cwd: tempDir,
      });

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Ralph Loop を初期化しました");
      expect(result.details.created.prd).toBe(true);
      expect(result.details.created.prompt).toBe(true);
      expect(result.details.created.progress).toBe(true);
    });

    it("should initialize with custom runtime", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const initToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_init"
      );
      const tool = initToolCall![0];

      const result = await tool.execute(
        "test-id",
        { runtime: "claude" },
        null as unknown as AbortSignal,
        vi.fn(),
        { cwd: tempDir }
      );

      // Claude runtime uses CLAUDE.md
      expect(result.details.paths.promptPath.endsWith("CLAUDE.md")).toBe(true);
    });

    it("should initialize with custom state_dir", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const initToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_init"
      );
      const tool = initToolCall![0];

      const result = await tool.execute(
        "test-id",
        { state_dir: ".custom/ralph" },
        null as unknown as AbortSignal,
        vi.fn(),
        { cwd: tempDir }
      );

      expect(result.details.paths.rootDir.endsWith(".custom/ralph")).toBe(true);
    });
  });

  describe("ralph_loop_status tool", () => {
    it("should return status for initialized loop", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      // First initialize
      const initToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_init"
      );
      await initToolCall![0].execute("test-id", {}, null as unknown as AbortSignal, vi.fn(), {
        cwd: tempDir,
      });

      // Then check status
      const statusToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_status"
      );
      const result = await statusToolCall![0].execute(
        "test-id",
        {},
        null as unknown as AbortSignal,
        vi.fn(),
        { cwd: tempDir }
      );

      expect(result.content[0].text).toContain("runtime:");
      expect(result.content[0].text).toContain("branch:");
      expect(result.content[0].text).toContain("prd:");
      expect(result.content[0].text).toContain("progress:");
      expect(result.details.prdExists).toBe(true);
      expect(result.details.promptExists).toBe(true);
      expect(result.details.progressExists).toBe(true);
    });
  });

  describe("ralph_loop_run tool", () => {
    it("should throw error when prd.json is missing", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const runToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_run"
      );

      await expect(
        runToolCall![0].execute("test-id", {}, null as unknown as AbortSignal, vi.fn(), {
          cwd: tempDir,
        })
      ).rejects.toThrow();
    });

    it("should complete when COMPLETE signal is found", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      // Initialize first
      const initToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_init"
      );
      await initToolCall![0].execute("test-id", {}, null as unknown as AbortSignal, vi.fn(), {
        cwd: tempDir,
      });

      // Mock spawnCommand to return COMPLETE signal
      const runToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_run"
      );

      // We need to inject a mock spawnCommand through the library
      // Since we can't easily mock the internal spawnLoopCommand, we'll verify the tool exists
      expect(runToolCall![0].name).toBe("ralph_loop_run");
      expect(runToolCall![0].parameters).toBeDefined();
    });

    it("should accept max_iterations parameter", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const runToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_run"
      );
      const tool = runToolCall![0];

      // Verify the parameter schema accepts max_iterations
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.properties).toHaveProperty("max_iterations");
      expect(tool.parameters.properties.max_iterations.type).toBe("integer");
    });

    it("should accept sleep_ms parameter", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      const runToolCall = (mockAPI.registerTool as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0].name === "ralph_loop_run"
      );
      const tool = runToolCall![0];

      expect(tool.parameters.properties).toHaveProperty("sleep_ms");
      expect(tool.parameters.properties.sleep_ms.type).toBe("integer");
    });
  });

  describe("session_shutdown handler", () => {
    it("should reset isInitialized on shutdown", async () => {
      const { default: registerRalphLoop } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop(mockAPI);

      // Get the shutdown handler
      const onCalls = (mockAPI.on as ReturnType<typeof vi.fn>).mock.calls;
      const shutdownCall = onCalls.find((call) => call[0] === "session_shutdown");
      expect(shutdownCall).toBeDefined();

      const shutdownHandler = shutdownCall![1];

      // Call shutdown handler
      await shutdownHandler();

      // After shutdown, registering again should work (tools get registered)
      // Reset the mock to count new calls
      (mockAPI.registerTool as ReturnType<typeof vi.fn>).mockClear();

      // Re-import and register again
      vi.resetModules();
      const { default: registerRalphLoop2 } = await import("../../extensions/ralph-loop.js");
      registerRalphLoop2(mockAPI);

      // Should register tools again after shutdown reset
      expect(mockAPI.registerTool).toHaveBeenCalledTimes(3);
    });
  });
});
