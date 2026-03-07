// /Users/mekann/github/pi-plugin/mekann/tests/unit/lib/prompt-templates.test.ts
// このファイルは、prompt template への semi-formal reasoning 統合を検証します。
// なぜ存在するか: 自動注入フローから template が外れる回帰を防ぐためです。
// 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/lib/prompt-templates.ts, /Users/mekann/github/pi-plugin/mekann/.pi/extensions/subagents.ts

import { describe, expect, it } from "vitest";

import {
  buildPromptWithTemplates,
  getTemplatesForAgent,
} from "../../../.pi/lib/prompt-templates.js";

describe("prompt-templates", () => {
  it("default agent に semi-formal-reasoning template を含める", () => {
    expect(getTemplatesForAgent("default")).toContain("semi-formal-reasoning");
  });

  it("analysis-heavy roles に semi-formal-reasoning template を含める", () => {
    expect(getTemplatesForAgent("planner")).toContain("semi-formal-reasoning");
    expect(getTemplatesForAgent("reviewer")).toContain("semi-formal-reasoning");
    expect(getTemplatesForAgent("tester")).toContain("semi-formal-reasoning");
  });

  it("semi-formal-reasoning template を含む prompt を構築できる", () => {
    const prompt = buildPromptWithTemplates(
      ["semi-formal-reasoning"],
      "## Task\nInspect patch equivalence.",
    );

    expect(prompt).toContain("Semi-formal Reasoning Policy");
    expect(prompt).toContain("DEFINITIONS");
    expect(prompt).toContain("TRACE");
    expect(prompt).toContain("COUNTEREXAMPLE");
    expect(prompt).toContain("Inspect patch equivalence.");
  });
});
