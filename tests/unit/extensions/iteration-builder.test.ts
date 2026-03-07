/**
 * @file .pi/extensions/loop/iteration-builder.ts の単体テスト
 * @description loop の iteration prompt が新しいレイヤ構造で構築されることを検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  LOOP_JSON_BLOCK_TAG,
  buildIterationPrompt,
} from "../../../.pi/extensions/loop/iteration-builder";
import { buildTurnExecutionContext } from "../../../.pi/lib/agent/turn-context-builder.js";

describe("iteration-builder", () => {
  it("verification command は runtime notification として含まれる", () => {
    const turnContext = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["read"],
      startupKind: "baseline",
      isFirstTurn: true,
      previousContextAvailable: false,
      sessionElapsedMs: 10,
    });
    const prompt = buildIterationPrompt({
      task: "Fix the failing behavior",
      goal: "All tests pass",
      verificationCommand: "npm test",
      iteration: 1,
      maxIterations: 4,
      references: [],
      previousOutput: "",
      validationFeedback: [],
      modelProvider: "openai",
      modelId: "gpt-5",
      turnContext,
    });

    expect(prompt).toContain("# Runtime Notifications");
    expect(prompt).toContain("npm test");
    expect(prompt).toContain(`<${LOOP_JSON_BLOCK_TAG}>`);
    expect(prompt).toContain("# Turn Execution Context");
  });

  it("validation feedback は runtime notification として含まれる", () => {
    const turnContext = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["read"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 20,
    });
    const prompt = buildIterationPrompt({
      task: "Refine the answer",
      iteration: 2,
      maxIterations: 4,
      references: [],
      previousOutput: "previous answer",
      validationFeedback: ["Missing citations", "Goal status unclear"],
      modelProvider: "anthropic",
      modelId: "claude-sonnet-4-5",
      turnContext,
    });

    expect(prompt).toContain("# Runtime Notifications");
    expect(prompt).toContain("Missing citations");
    expect(prompt).toContain("Previous iteration output:");
    expect(prompt).toContain("respect_cwd_as_workspace_anchor=true");
  });
});
