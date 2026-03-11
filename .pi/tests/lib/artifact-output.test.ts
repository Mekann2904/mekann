// Path: .pi/tests/lib/artifact-output.test.ts
// Description: 成果物本文の選定ヘルパーを単体で検証します。
// Why: subagents と ul-workflow の保存挙動が再びズレないようにするためです。
// Related: .pi/lib/artifact-output.ts, .pi/extensions/subagents.ts, .pi/extensions/ul-workflow.ts

import { describe, expect, it } from "vitest";

import { extractDagTaskOutput, selectArtifactContent } from "../../lib/artifact-output.js";

describe("artifact output helper", () => {
  it("returns the preferred artifact task output when it exists", () => {
    const content = selectArtifactContent(
      [
        ["draft", { status: "completed", output: { output: "# Draft" } }],
        ["final", { status: "completed", output: { output: "# Final" } }],
      ],
      "final",
      "aggregated",
    );

    expect(content).toBe("# Final");
  });

  it("falls back to the last non-empty completed output when preferred output is empty", () => {
    const content = selectArtifactContent(
      [
        ["draft", { status: "completed", output: { output: "# Draft" } }],
        ["final", { status: "completed", output: { output: "" } }],
      ],
      "final",
      "aggregated",
    );

    expect(content).toBe("# Draft");
  });

  it("falls back to aggregated output when no completed output has content", () => {
    const content = selectArtifactContent(
      [
        ["draft", { status: "completed", output: { output: "" } }],
        ["final", { status: "failed", output: { output: "# Final" } }],
      ],
      "draft",
      "## draft\nStatus: COMPLETED",
    );

    expect(content).toBe("## draft\nStatus: COMPLETED");
  });

  it("extracts only string output values", () => {
    expect(extractDagTaskOutput({ output: "# Plan" })).toBe("# Plan");
    expect(extractDagTaskOutput({ output: 42 })).toBe("");
    expect(extractDagTaskOutput(null)).toBe("");
  });
});
