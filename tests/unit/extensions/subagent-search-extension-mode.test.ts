/**
 * path: tests/unit/extensions/subagent-search-extension-mode.test.ts
 * what: subagent DAG 向けの search 拡張有効化判定と pi 引数生成を検証する
 * why: research タスクだけで `--no-extensions` を外す回帰を固定する
 * related: .pi/extensions/subagents/task-execution.ts, .pi/extensions/shared/pi-print-executor.ts, .pi/extensions/search/index.ts
 */

import { afterEach, describe, expect, it } from "vitest";

import { buildPiPrintModeArgs } from "../../../.pi/extensions/shared/pi-print-executor.js";
import registerSubagentExtension from "../../../.pi/extensions/subagents.js";
import registerUlWorkflowExtension from "../../../.pi/extensions/ul-workflow.js";
import {
  buildSubagentChildEnvOverrides,
  buildSubagentPrompt,
  shouldEnableSubagentExtensions,
} from "../../../.pi/extensions/subagents/task-execution";
import { buildTurnExecutionContext } from "../../../.pi/lib/agent/turn-context-builder.js";

function createFakePi() {
  const tools = new Map<string, any>();
  return {
    tools,
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    registerCommand() {
      // no-op
    },
  };
}

afterEach(() => {
  delete process.env.PI_CHILD_DISABLE_ORCHESTRATION;
});

describe("shouldEnableSubagentExtensions", () => {
  it("調査タスクでは拡張を有効化する", () => {
    expect(shouldEnableSubagentExtensions("この不具合の原因を検索して調査して")).toBe(true);
  });

  it("明示的な internal 指示でも拡張を有効化する", () => {
    expect(
      shouldEnableSubagentExtensions(
        "実装前の論点を整理して",
        "OUTPUT MODE: INTERNAL\nMax: 250 tokens",
      ),
    ).toBe(true);
  });

  it("通常の実装タスクでは拡張を無効のままにする", () => {
    expect(shouldEnableSubagentExtensions("この関数を修正してテストも更新して")).toBe(false);
  });

  it("plan mode の turn context では調査タスクでも拡張を有効化しない", () => {
    const baseContext = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["file_candidates", "code_search", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 50,
    });
    const turnContext = {
      ...baseContext,
      policy: {
        ...baseContext.policy,
        mode: "plan" as const,
      },
    };

    expect(
      shouldEnableSubagentExtensions("この不具合の原因を検索して調査して", undefined, turnContext),
    ).toBe(false);
  });
});

describe("buildPiPrintModeArgs", () => {
  it("既定では --no-extensions を付ける", () => {
    const args = buildPiPrintModeArgs({
      prompt: "hello",
    });

    expect(args).toContain("--no-extensions");
  });

  it("research 実行では --no-extensions を外せる", () => {
    const args = buildPiPrintModeArgs({
      prompt: "hello",
      provider: "openai",
      model: "gpt-5",
      noExtensions: false,
    });

    expect(args).not.toContain("--no-extensions");
    expect(args).toEqual(["--mode", "json", "-p", "--provider", "openai", "--model", "gpt-5", "hello"]);
  });
});

describe("buildSubagentPrompt", () => {
  it("research タスクでは search ツールのガイドラインを含める", () => {
    const turnContext = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["read", "code_search"],
      startupKind: "baseline",
      isFirstTurn: true,
      previousContextAvailable: false,
      sessionElapsedMs: 10,
    });
    const prompt = buildSubagentPrompt({
      agent: {
        id: "researcher",
        name: "Researcher",
        description: "Investigates code paths",
        systemPrompt: "Inspect the repository carefully.",
      } as any,
      task: "この機能の関連ファイルを検索して調査して",
      turnContext,
    });

    expect(prompt).toContain("file_candidates");
    expect(prompt).toContain("code_search");
    expect(prompt).toContain("sym_find");
    expect(prompt).toContain("# Turn Execution Context");
  });

  it("plan mode では runtime notification を prompt に含める", () => {
    const turnContext = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["read", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 40,
    });
    const prompt = buildSubagentPrompt({
      agent: {
        id: "implementer",
        name: "Implementer",
        description: "Implements code changes",
        systemPrompt: "Keep the implementation minimal.",
      } as any,
      task: "この関数を修正して",
      enforcePlanMode: true,
      turnContext,
    });

    expect(prompt).toContain("# Runtime Notifications");
    expect(prompt).toContain("plan-mode");
    expect(prompt).toContain("PLAN MODE");
    expect(prompt).toContain("respect_cwd_as_workspace_anchor=true");
  });
});

describe("child orchestration guard", () => {
  it("child subagent env overrides でオーケストレーションを無効化する", () => {
    expect(buildSubagentChildEnvOverrides()).toEqual({
      PI_CHILD_DISABLE_ORCHESTRATION: "1",
    });
  });

  it("child process では subagent tools を登録しない", () => {
    process.env.PI_CHILD_DISABLE_ORCHESTRATION = "1";
    const pi = createFakePi();

    registerSubagentExtension(pi as any);

    expect(pi.tools.has("subagent_run_dag")).toBe(false);
  });

  it("child process では UL workflow tools を登録しない", () => {
    process.env.PI_CHILD_DISABLE_ORCHESTRATION = "1";
    const pi = createFakePi();

    registerUlWorkflowExtension(pi as any);

    expect(pi.tools.has("ul_workflow_start")).toBe(false);
  });
});
