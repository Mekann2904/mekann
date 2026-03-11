// Path: tests/unit/extensions/pi-print-executor.test.ts
// What: pi print child process 用の隔離 agent dir 準備を検証する
// Why: bug_hunt の内部 pi 実行が user package の自動導入で壊れる回帰を防ぐため
// Related: .pi/extensions/shared/pi-print-executor.ts, .pi/extensions/bug-hunt/runner.ts, .pi/extensions/subagents/task-execution.ts

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPiChildEnv,
  preparePiChildAgentDir,
  sanitizePiChildAgentSettings,
} from "../../../.pi/extensions/shared/pi-print-executor.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sanitizePiChildAgentSettings", () => {
  it("resource loader 系の設定を空にしつつ他は維持する", () => {
    const sanitized = sanitizePiChildAgentSettings({
      theme: "dark",
      defaultProvider: "zai",
      packages: ["npm:@juanibiapina/pi-tokyonight"],
      extensions: ["./ext.ts"],
      skills: ["./skills"],
      prompts: ["./prompts"],
      themes: ["./themes"],
    });

    expect(sanitized).toEqual({
      theme: "dark",
      defaultProvider: "zai",
      packages: [],
      extensions: [],
      skills: [],
      prompts: [],
      themes: [],
    });
  });
});

describe("preparePiChildAgentDir", () => {
  it("settings を sanitize しつつ auth/models を引き継ぐ", () => {
    const sourceDir = createTempDir("pi-print-source-");
    const childDir = createTempDir("pi-print-child-");

    writeFileSync(join(sourceDir, "settings.json"), JSON.stringify({
      theme: "dark",
      packages: ["npm:@juanibiapina/pi-tokyonight"],
      extensions: ["./ext.ts"],
      prompts: ["./prompts"],
    }));
    writeFileSync(join(sourceDir, "auth.json"), JSON.stringify({ zai: { apiKey: "secret" } }));
    writeFileSync(join(sourceDir, "models.json"), JSON.stringify({ models: ["glm-5"] }));

    preparePiChildAgentDir(sourceDir, childDir);

    const childSettings = JSON.parse(readFileSync(join(childDir, "settings.json"), "utf-8"));
    expect(childSettings.packages).toEqual([]);
    expect(childSettings.extensions).toEqual([]);
    expect(childSettings.prompts).toEqual([]);
    expect(childSettings.theme).toBe("dark");
    expect(JSON.parse(readFileSync(join(childDir, "auth.json"), "utf-8"))).toEqual({ zai: { apiKey: "secret" } });
    expect(JSON.parse(readFileSync(join(childDir, "models.json"), "utf-8"))).toEqual({ models: ["glm-5"] });
  });
});

describe("buildPiChildEnv", () => {
  it("明示 override があればそれを優先する", () => {
    const env = buildPiChildEnv({
      PI_CODING_AGENT_DIR: "/tmp/custom-agent",
      PI_CHILD_DISABLE_ORCHESTRATION: "1",
    });

    expect(env.PI_CODING_AGENT_DIR).toBe("/tmp/custom-agent");
    expect(env.PI_CHILD_DISABLE_ORCHESTRATION).toBe("1");
  });
});
