import { describe, it, expect, vi, beforeEach } from "vitest";
import { KittyController } from "./kittyControl.js";
import type { AgentDisplayRef } from "./types.js";

describe("KittyController", () => {
  let controller: KittyController;

  beforeEach(() => {
    controller = new KittyController("echo");
  });

  const baseParams = {
    agentId: "agent-1",
    agentPath: "/root/task1",
    cwd: "/tmp/test",
    socketPath: "/tmp/test.sock",
    initialMessage: "hello",
  };

  describe("launchPiWindow", () => {
    it("returns open display with kitty-pi kind", async () => {
      const result = await controller.launchPiWindow(baseParams);
      expect(result.kind).toBe("kitty-pi");
      expect(result.status).toBe("open");
      expect(result.agentId).toBe("agent-1");
      expect(result.title).toBe("pi subagent /root/task1");
    });

    it("uses custom title when provided", async () => {
      const result = await controller.launchPiWindow({ ...baseParams, title: "Custom Title" });
      expect(result.title).toBe("Custom Title");
    });

    it("uses custom piCommand when provided", async () => {
      const result = await controller.launchPiWindow({ ...baseParams, piCommand: "custom-pi" });
      expect(result.status).toBe("open");
    });

    it("uses model and thinking when provided", async () => {
      const result = await controller.launchPiWindow({ ...baseParams, modelId: "gpt-4", thinkingLevel: "low" });
      expect(result.status).toBe("open");
      expect(result.windowId).toContain("--model");
      expect(result.windowId).toContain("gpt-4");
      expect(result.windowId).toContain("--thinking");
      expect(result.windowId).toContain("low");
    });

    it("creates log directory and file when logPath provided", async () => {
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = mkdtempSync(path.join(tmpdir(), "kitty-test-"));
      const logPath = path.join(tmp, "logs", "test.log");
      try {
        const result = await controller.launchPiWindow({ ...baseParams, logPath });
        expect(result.logPath).toBe(logPath);
      } finally {
        try { rmSync(tmp, { recursive: true }); } catch {}
      }
    });
  });

  describe("launchPiSplit", () => {
    it("returns open display with kitty-split kind", async () => {
      const result = await controller.launchPiSplit(baseParams);
      expect(result.kind).toBe("kitty-split");
      expect(result.status).toBe("open");
    });

    it("uses vertical split when specified", async () => {
      const result = await controller.launchPiSplit({ ...baseParams, splitDirection: "vertical" });
      expect(result.status).toBe("open");
    });

    it("uses horizontal split by default", async () => {
      const result = await controller.launchPiSplit(baseParams);
      expect(result.status).toBe("open");
    });
  });

  describe("appendLog", () => {
    it("does nothing when display has no logPath", async () => {
      const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp" };
      // Should not throw
      await controller.appendLog(display, "test line");
    });

    it("appends to log file when logPath is set", async () => {
      const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = mkdtempSync(path.join(tmpdir(), "kitty-log-"));
      const logPath = path.join(tmp, "test.log");
      try {
        const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", logPath };
        await controller.appendLog(display, "hello world");
        const content = readFileSync(logPath, "utf8");
        expect(content).toContain("hello world");
      } finally {
        try { rmSync(tmp, { recursive: true }); } catch {}
      }
    });

    it("adds newline if not present", async () => {
      const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = mkdtempSync(path.join(tmpdir(), "kitty-newline-"));
      const logPath = path.join(tmp, "test.log");
      try {
        const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", logPath };
        await controller.appendLog(display, "no newline");
        const content = readFileSync(logPath, "utf8");
        expect(content.endsWith("\n")).toBe(true);
      } finally {
        try { rmSync(tmp, { recursive: true }); } catch {}
      }
    });

    it("preserves existing newline", async () => {
      const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = mkdtempSync(path.join(tmpdir(), "kitty-preserve-"));
      const logPath = path.join(tmp, "test.log");
      try {
        const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", logPath };
        await controller.appendLog(display, "with newline\n");
        const content = readFileSync(logPath, "utf8");
        expect(content).toBe("with newline\n");
      } finally {
        try { rmSync(tmp, { recursive: true }); } catch {}
      }
    });
  });

  describe("focus", () => {
    it("focuses using window id when available", async () => {
      const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", windowId: "42" };
      // Using echo as kittenBin, so it should succeed without error
      // But the actual kitten @ focus-window command will fail, so we need to catch
      // Actually with "echo" as the bin, it will just echo the args and return successfully
      await expect(controller.focus(display)).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("closes using window id when available", async () => {
      const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", windowId: "42" };
      await expect(controller.close(display)).resolves.toBeUndefined();
    });

    it("closes using var match when no window id", async () => {
      const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", agentId: "my-agent" };
      await expect(controller.close(display)).resolves.toBeUndefined();
    });
  });

  describe("setTitle", () => {
    it("sets title on window", async () => {
      const display: AgentDisplayRef = { kind: "kitty-pi", status: "open", title: "test", cwd: "/tmp", windowId: "42" };
      await expect(controller.setTitle(display, "New Title")).resolves.toBeUndefined();
    });
  });
});
