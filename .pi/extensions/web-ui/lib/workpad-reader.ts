/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/workpad-reader.ts
 * @role workflow workpad を read-only で読み込み、web-ui 用の JSON へ変換する
 * @why WORKFLOW.md と durable workpad をブラウザから安全に参照できるようにするため
 * @related .pi/lib/workflow-workpad.ts, ../src/routes/workpads.ts, ../../lib/frontmatter.ts
 * @public_api getAllWorkpads, getLatestWorkpad, findWorkpadsByTask
 * @invariants 読み取り専用であり、workpad ファイルを変更しない
 * @side_effects なし
 * @failure_modes 壊れた frontmatter や section 欠損は空値で吸収する
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseFrontmatter } from "../../../lib/frontmatter.js";

const WORKPAD_DIR = path.join(".pi", "workpads");
const SECTION_NAMES = ["Context", "Plan", "Progress", "Verification", "Review", "Next"] as const;

export interface WorkpadView {
  id: string;
  task: string;
  source?: string;
  issueId?: string;
  createdAt: string;
  updatedAt: string;
  workflowPath?: string;
  path: string;
  sections: {
    context: string;
    plan: string;
    progress: string;
    verification: string;
    review: string;
    next: string;
  };
}

function normalizeFrontmatterInput(content: string): string {
  return String(content ?? "").replace(/^(?:<!--.*?-->\s*\n)+/g, "");
}

function parseSections(body: string): WorkpadView["sections"] {
  const result: WorkpadView["sections"] = {
    context: "",
    plan: "",
    progress: "",
    verification: "",
    review: "",
    next: "",
  };

  const keys = Object.keys(result) as Array<keyof WorkpadView["sections"]>;
  for (let index = 0; index < SECTION_NAMES.length; index += 1) {
    const current = SECTION_NAMES[index];
    const next = SECTION_NAMES[index + 1];
    const pattern = next
      ? new RegExp(`## ${current}\\n\\n([\\s\\S]*?)\\n\\n## ${next}`)
      : new RegExp(`## ${current}\\n\\n([\\s\\S]*)$`);
    const match = body.match(pattern);
    result[keys[index]] = (match?.[1] ?? "").trim();
  }

  return result;
}

function loadWorkpadFile(fullPath: string): WorkpadView | null {
  try {
    const raw = readFileSync(fullPath, "utf-8");
    const parsed = parseFrontmatter<Record<string, unknown>>(normalizeFrontmatterInput(raw));
    return {
      id: String(parsed.frontmatter.id ?? path.basename(fullPath, ".md")),
      task: String(parsed.frontmatter.task ?? ""),
      source: String(parsed.frontmatter.source ?? "") || undefined,
      issueId: String(parsed.frontmatter.issue_id ?? "") || undefined,
      createdAt: String(parsed.frontmatter.created_at ?? ""),
      updatedAt: String(parsed.frontmatter.updated_at ?? ""),
      workflowPath: String(parsed.frontmatter.workflow_path ?? "") || undefined,
      path: fullPath,
      sections: parseSections(parsed.body),
    };
  } catch {
    return null;
  }
}

export function getAllWorkpads(baseDir: string = process.cwd()): WorkpadView[] {
  const dir = path.join(baseDir, WORKPAD_DIR);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => loadWorkpadFile(path.join(dir, name)))
    .filter((item): item is WorkpadView => Boolean(item))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getLatestWorkpad(baseDir: string = process.cwd()): WorkpadView | null {
  return getAllWorkpads(baseDir)[0] ?? null;
}

export function findWorkpadsByTask(baseDir: string, taskText: string, issueId?: string): WorkpadView[] {
  const needle = taskText.trim().toLowerCase();
  return getAllWorkpads(baseDir).filter((item) => {
    if (issueId && item.issueId && item.issueId === issueId) {
      return true;
    }
    return needle.length > 0 && item.task.toLowerCase().includes(needle);
  });
}
