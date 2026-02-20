/**
 * path: tests/unit/lib/dynamic-tools-registry.test.ts
 * role: dynamic-toolsレジストリのJSONランタイム検証を検証する
 * why: 壊れたツール定義ファイル読み込み時のランタイムエラーを防ぐため
 * related: .pi/lib/dynamic-tools/registry.ts, .pi/lib/dynamic-tools/types.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  loadAllToolDefinitions,
  loadToolDefinition,
} from "../../../.pi/lib/dynamic-tools/registry.js";
import type { DynamicToolsPaths } from "../../../.pi/lib/dynamic-tools/types.js";

function createPaths(root: string): DynamicToolsPaths {
  const toolsDir = join(root, "tools");
  const logsDir = join(root, "logs");
  mkdirSync(toolsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  return {
    toolsDir,
    skillsDir: join(root, "skills"),
    auditLogFile: join(logsDir, "audit.jsonl"),
    metricsFile: join(logsDir, "metrics.json"),
  };
}

describe("dynamic tools registry runtime validation", () => {
  const cleanupTargets: string[] = [];

  afterEach(() => {
    for (const target of cleanupTargets.splice(0)) {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("returns null for malformed tool definition", () => {
    const root = mkdtempSync(join(tmpdir(), "dynamic-tools-registry-"));
    cleanupTargets.push(root);
    const paths = createPaths(root);
    writeFileSync(join(paths.toolsDir, "dt_invalid.json"), `{"id":"dt_invalid","name":"bad"}`, "utf-8");

    const loaded = loadToolDefinition("dt_invalid", paths);
    expect(loaded).toBeNull();
  });

  it("skips malformed files when listing all tools", () => {
    const root = mkdtempSync(join(tmpdir(), "dynamic-tools-registry-"));
    cleanupTargets.push(root);
    const paths = createPaths(root);

    writeFileSync(
      join(paths.toolsDir, "dt_valid.json"),
      JSON.stringify({
        id: "dt_valid",
        name: "valid_tool",
        description: "valid",
        mode: "function",
        parameters: [],
        code: "return 1;",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        confidenceScore: 0.8,
        verificationStatus: "passed",
        tags: [],
        createdBy: "test",
      }),
      "utf-8",
    );
    writeFileSync(join(paths.toolsDir, "dt_invalid.json"), `{"id":"dt_invalid","name":"bad"}`, "utf-8");

    const tools = loadAllToolDefinitions(paths);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.id).toBe("dt_valid");
  });
});
