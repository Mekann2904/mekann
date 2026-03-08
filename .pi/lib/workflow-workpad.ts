/**
 * path: .pi/lib/workflow-workpad.ts
 * role: WORKFLOW.md の解析と task workpad の作成・更新・表示を担う共有ライブラリ
 * why: Symphony 風の workflow spec と durable workpad を repo 内で完結させるため
 * related: .pi/extensions/workflow-workpad.ts, WORKFLOW.md, .pi/lib/frontmatter.ts, tests/unit/lib/workflow-workpad.test.ts
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseFrontmatter } from "./frontmatter.js";

export interface AgentFirstWorkflowFrontmatter extends Record<string, unknown> {
  kind?: string;
  version?: number;
  entrypoints?: string[];
  tracker?: {
    kind?: string;
    endpoint?: string;
    api_key?: string;
    project_slug?: string;
    active_states?: string[] | string;
    terminal_states?: string[] | string;
  };
  polling?: {
    interval_ms?: number | string;
  };
  workspace?: {
    root?: string;
  };
  hooks?: {
    after_create?: string;
    before_run?: string;
    after_run?: string;
    before_remove?: string;
    timeout_ms?: number | string;
  };
  agent?: {
    max_concurrent_agents?: number | string;
    max_retry_backoff_ms?: number | string;
  };
  runtime?: {
    kind?: string;
    command?: string;
    turn_timeout_ms?: number | string;
    read_timeout_ms?: number | string;
    stall_timeout_ms?: number | string;
  };
  codex?: {
    command?: string;
    turn_timeout_ms?: number | string;
    read_timeout_ms?: number | string;
    stall_timeout_ms?: number | string;
  };
  verification?: {
    required_commands?: string[];
  };
  completion_gate?: {
    require_single_in_progress_step?: boolean;
    require_proof_artifacts?: boolean;
    require_workspace_verification?: boolean;
  };
}

export interface WorkflowDocument {
  path: string;
  exists: boolean;
  frontmatter: AgentFirstWorkflowFrontmatter;
  body: string;
}

export interface WorkpadMetadata {
  id: string;
  task: string;
  source?: string;
  issueId?: string;
  createdAt: string;
  updatedAt: string;
  workflowPath: string;
}

export interface WorkpadSections {
  context: string;
  plan: string;
  progress: string;
  verification: string;
  review: string;
  next: string;
}

export interface WorkpadRecord {
  metadata: WorkpadMetadata;
  sections: WorkpadSections;
  path: string;
}

export interface CreateWorkpadInput {
  task: string;
  source?: string;
  issueId?: string;
}

export interface UpdateWorkpadInput {
  id: string;
  section: keyof WorkpadSections;
  content: string;
  mode?: "replace" | "append";
}

const WORKPAD_DIR = ".pi/workpads";
const SECTION_ORDER: Array<keyof WorkpadSections> = [
  "context",
  "plan",
  "progress",
  "verification",
  "review",
  "next",
];

const SECTION_LABELS: Record<keyof WorkpadSections, string> = {
  context: "Context",
  plan: "Plan",
  progress: "Progress",
  verification: "Verification",
  review: "Review",
  next: "Next",
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

function ensureWorkpadDir(cwd: string): string {
  const dir = join(cwd, WORKPAD_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getWorkpadPath(cwd: string, id: string): string {
  return join(ensureWorkpadDir(cwd), `${id}.md`);
}

function getWorkflowPath(cwd: string): string {
  return resolve(cwd, "WORKFLOW.md");
}

function normalizeFrontmatterInput(content: string): string {
  return String(content ?? "").replace(/^(?:<!--.*?-->\s*\n)+/g, "");
}

export function loadWorkflowDocument(cwd: string): WorkflowDocument {
  const path = getWorkflowPath(cwd);
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      frontmatter: {},
      body: "",
    };
  }

  const raw = readFileSync(path, "utf-8");
  const parsed = parseFrontmatter<AgentFirstWorkflowFrontmatter>(normalizeFrontmatterInput(raw));

  return {
    path,
    exists: true,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  };
}

function buildDefaultSections(workflow: WorkflowDocument): WorkpadSections {
  const commands = workflow.frontmatter.verification?.required_commands ?? [];
  return {
    context: workflow.exists
      ? `- workflow: ${workflow.path}\n- entrypoints: ${(workflow.frontmatter.entrypoints ?? []).join(", ") || "-"}` 
      : "- workflow: missing",
    plan: "- pending",
    progress: "- created",
    verification: commands.length > 0
      ? commands.map((command) => `- [ ] ${command}`).join("\n")
      : "- no required commands declared",
    review: "- pending",
    next: "- investigate related files and create a focused plan",
  };
}

function renderWorkpad(record: WorkpadRecord): string {
  const lines: string[] = [
    `<!-- ${record.path} -->`,
    "<!-- このファイルは、agent-first 実行中の 1 タスク分の durable workpad を保持します。 -->",
    "<!-- なぜ存在するか: 計画、進捗、検証、次の一手を 1 か所に残し、再開可能にするためです。 -->",
    `<!-- 関連ファイル: ${record.metadata.workflowPath}, AGENTS.md, .pi/INDEX.md, docs/05-meta/08-autonomous-harness-playbook.md -->`,
    "---",
    `id: ${record.metadata.id}`,
    `task: ${JSON.stringify(record.metadata.task)}`,
    `source: ${JSON.stringify(record.metadata.source ?? "")}`,
    `issue_id: ${JSON.stringify(record.metadata.issueId ?? "")}`,
    `created_at: ${record.metadata.createdAt}`,
    `updated_at: ${record.metadata.updatedAt}`,
    `workflow_path: ${JSON.stringify(record.metadata.workflowPath)}`,
    "---",
    "",
    "# Workpad",
    "",
  ];

  for (const key of SECTION_ORDER) {
    lines.push(`## ${SECTION_LABELS[key]}`);
    lines.push("");
    lines.push(record.sections[key] || "-");
    lines.push("");
  }

  return lines.join("\n");
}

function parseWorkpadSections(body: string): WorkpadSections {
  const sections: WorkpadSections = {
    context: "",
    plan: "",
    progress: "",
    verification: "",
    review: "",
    next: "",
  };

  for (let index = 0; index < SECTION_ORDER.length; index += 1) {
    const key = SECTION_ORDER[index];
    const label = SECTION_LABELS[key];
    const nextLabel = SECTION_ORDER[index + 1] ? SECTION_LABELS[SECTION_ORDER[index + 1]] : undefined;
    const pattern = nextLabel
      ? new RegExp(`## ${label}\\n\\n([\\s\\S]*?)\\n\\n## ${nextLabel}`)
      : new RegExp(`## ${label}\\n\\n([\\s\\S]*)$`);
    const match = body.match(pattern);
    sections[key] = (match?.[1] ?? "").trim();
  }

  return sections;
}

export function createWorkpad(cwd: string, input: CreateWorkpadInput): WorkpadRecord {
  const workflow = loadWorkflowDocument(cwd);
  const id = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${slugify(input.task)}`;
  const createdAt = nowIso();
  const record: WorkpadRecord = {
    metadata: {
      id,
      task: input.task,
      source: input.source,
      issueId: input.issueId,
      createdAt,
      updatedAt: createdAt,
      workflowPath: workflow.path,
    },
    sections: buildDefaultSections(workflow),
    path: getWorkpadPath(cwd, id),
  };

  writeFileSync(record.path, renderWorkpad(record));
  return record;
}

export function loadWorkpad(cwd: string, id: string): WorkpadRecord | null {
  const path = getWorkpadPath(cwd, id);
  if (!existsSync(path)) {
    return null;
  }

  const raw = readFileSync(path, "utf-8");
  const parsed = parseFrontmatter<Record<string, unknown>>(normalizeFrontmatterInput(raw));

  const metadata: WorkpadMetadata = {
    id: String(parsed.frontmatter.id ?? id),
    task: String(parsed.frontmatter.task ?? ""),
    source: String(parsed.frontmatter.source ?? "") || undefined,
    issueId: String(parsed.frontmatter.issue_id ?? "") || undefined,
    createdAt: String(parsed.frontmatter.created_at ?? ""),
    updatedAt: String(parsed.frontmatter.updated_at ?? ""),
    workflowPath: String(parsed.frontmatter.workflow_path ?? getWorkflowPath(cwd)),
  };

  return {
    metadata,
    sections: parseWorkpadSections(parsed.body),
    path,
  };
}

export function updateWorkpad(cwd: string, input: UpdateWorkpadInput): WorkpadRecord {
  const current = loadWorkpad(cwd, input.id);
  if (!current) {
    throw new Error(`workpad not found: ${input.id}`);
  }

  const previous = current.sections[input.section].trim();
  current.sections[input.section] = input.mode === "append" && previous
    ? `${previous}\n${input.content.trim()}`
    : input.content.trim();
  current.metadata.updatedAt = nowIso();

  writeFileSync(current.path, renderWorkpad(current));
  return current;
}

export function listWorkpads(cwd: string): WorkpadRecord[] {
  const dir = ensureWorkpadDir(cwd);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => loadWorkpad(cwd, name.replace(/\.md$/, "")))
    .filter((item): item is WorkpadRecord => Boolean(item))
    .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt));
}
