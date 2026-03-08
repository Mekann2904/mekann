/**
 * path: tests/unit/extensions/web-ui/workpad-reader.test.ts
 * role: web-ui 用 workpad reader の一覧取得と task match を検証する
 * why: durable workpad が API 経由で安定して読めることを守るため
 * related: .pi/extensions/web-ui/lib/workpad-reader.ts, .pi/lib/workflow-workpad.ts, .pi/extensions/web-ui/src/routes/workpads.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findWorkpadsByTask,
  getAllWorkpads,
  getLatestWorkpad,
} from "../../../../.pi/extensions/web-ui/lib/workpad-reader.js";

function writeWorkpad(cwd: string, name: string, task: string, updatedAt: string, issueId?: string): void {
  const dir = join(cwd, ".pi", "workpads");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.md`), `<!-- ${name} -->
---
id: ${name}
task: ${JSON.stringify(task)}
issue_id: ${JSON.stringify(issueId ?? "")}
created_at: 2026-03-08T00:00:00.000Z
updated_at: ${updatedAt}
workflow_path: "/repo/WORKFLOW.md"
---

# Workpad

## Context

- workflow

## Plan

- plan

## Progress

- progress

## Verification

- verification

## Review

- review

## Next

- next
`);
}

describe("workpad-reader", () => {
  it("最新順で workpad を返し、task で match できる", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mekann-workpad-reader-"));
    writeWorkpad(cwd, "wp-old", "Fix drift", "2026-03-08T00:00:00.000Z", "MK-1");
    writeWorkpad(cwd, "wp-new", "Implement Symphony orchestration", "2026-03-08T01:00:00.000Z", "MK-2");

    const all = getAllWorkpads(cwd);
    const latest = getLatestWorkpad(cwd);
    const matched = findWorkpadsByTask(cwd, "Symphony orchestration");

    expect(all.map((item) => item.id)).toEqual(["wp-new", "wp-old"]);
    expect(latest?.id).toBe("wp-new");
    expect(matched).toHaveLength(1);
    expect(matched[0]?.issueId).toBe("MK-2");
  });
});
