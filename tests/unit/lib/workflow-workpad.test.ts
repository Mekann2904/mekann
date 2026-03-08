/**
 * path: tests/unit/lib/workflow-workpad.test.ts
 * role: workflow workpad ライブラリの workflow 読み込みと workpad 永続化を検証する
 * why: repo-native workflow と durable workpad の基盤が壊れないようにするため
 * related: .pi/lib/workflow-workpad.ts, WORKFLOW.md, .pi/extensions/workflow-workpad.ts, tests/unit/extensions/workflow-workpad.test.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createWorkpad,
  listWorkpads,
  loadWorkflowDocument,
  loadWorkpad,
  updateWorkpad,
} from "../../../.pi/lib/workflow-workpad.js";

describe("workflow-workpad lib", () => {
  it("WORKFLOW.md を読み込める", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mekann-workflow-"));
    writeFileSync(join(cwd, "WORKFLOW.md"), `---
kind: mekann-agent-first-workflow
verification:
  required_commands:
    - npm test
---

# WORKFLOW

body
`);

    const workflow = loadWorkflowDocument(cwd);

    expect(workflow.exists).toBe(true);
    expect(workflow.frontmatter.kind).toBe("mekann-agent-first-workflow");
    expect(workflow.body).toContain("body");
  });

  it("workpad を作成して更新できる", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mekann-workpad-"));
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, "WORKFLOW.md"), `---
verification:
  required_commands:
    - npm run lint
---

# WORKFLOW
`);

    const created = createWorkpad(cwd, { task: "Fix verification drift", issueId: "MK-1" });
    const updated = updateWorkpad(cwd, {
      id: created.metadata.id,
      section: "progress",
      content: "- inspected related files",
      mode: "append",
    });
    const loaded = loadWorkpad(cwd, created.metadata.id);

    expect(updated.sections.progress).toContain("inspected related files");
    expect(loaded?.metadata.issueId).toBe("MK-1");
    expect(listWorkpads(cwd)).toHaveLength(1);
  });
});
