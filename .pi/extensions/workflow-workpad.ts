/**
 * path: .pi/extensions/workflow-workpad.ts
 * role: WORKFLOW.md を使った workpad 開始、更新、参照ツールを公開する
 * why: task ごとの durable progress log を repo 内に残し、Symphony 的な workpad 運用を実現するため
 * related: .pi/lib/workflow-workpad.ts, WORKFLOW.md, tests/unit/extensions/workflow-workpad.test.ts, docs/05-meta/09-agent-first-harness.md
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  createWorkpad,
  listWorkpads,
  loadWorkflowDocument,
  loadWorkpad,
  updateWorkpad,
} from "../lib/workflow-workpad.js";

let isInitialized = false;

function summarizeWorkpad(record: ReturnType<typeof createWorkpad>): string {
  return [
    `id: ${record.metadata.id}`,
    `task: ${record.metadata.task}`,
    `path: ${record.path}`,
    `updated_at: ${record.metadata.updatedAt}`,
  ].join("\n");
}

export default function registerWorkflowWorkpad(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.registerTool({
    name: "workflow_workpad_start",
    label: "Workflow Workpad Start",
    description: "Create a durable workpad for a task using WORKFLOW.md as the repo contract",
    parameters: Type.Object({
      task: Type.String(),
      source: Type.Optional(Type.String()),
      issue_id: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workpad = createWorkpad(ctx.cwd, {
        task: String(params.task),
        source: typeof params.source === "string" ? params.source : undefined,
        issueId: typeof params.issue_id === "string" ? params.issue_id : undefined,
      });

      return {
        content: [{ type: "text", text: summarizeWorkpad(workpad) }],
        details: workpad,
      };
    },
  });

  pi.registerTool({
    name: "workflow_workpad_update",
    label: "Workflow Workpad Update",
    description: "Update a workpad section with progress, verification, review, or next-step notes",
    parameters: Type.Object({
      id: Type.String(),
      section: Type.Union([
        Type.Literal("context"),
        Type.Literal("plan"),
        Type.Literal("progress"),
        Type.Literal("verification"),
        Type.Literal("review"),
        Type.Literal("next"),
      ]),
      content: Type.String(),
      mode: Type.Optional(Type.Union([Type.Literal("replace"), Type.Literal("append")])),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workpad = updateWorkpad(ctx.cwd, {
        id: String(params.id),
        section: params.section as "context" | "plan" | "progress" | "verification" | "review" | "next",
        content: String(params.content),
        mode: params.mode === "replace" ? "replace" : "append",
      });

      return {
        content: [{ type: "text", text: summarizeWorkpad(workpad) }],
        details: workpad,
      };
    },
  });

  pi.registerTool({
    name: "workflow_workpad_show",
    label: "Workflow Workpad Show",
    description: "Show WORKFLOW.md or the latest/current workpad",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("workflow"),
        Type.Literal("latest"),
        Type.Literal("get"),
        Type.Literal("list"),
      ]),
      id: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action);

      if (action === "workflow") {
        const workflow = loadWorkflowDocument(ctx.cwd);
        return {
          content: [{
            type: "text",
            text: workflow.exists ? workflow.body : "WORKFLOW.md is missing",
          }],
          details: workflow,
        };
      }

      if (action === "list") {
        const items = listWorkpads(ctx.cwd);
        return {
          content: [{
            type: "text",
            text: items.length === 0
              ? "No workpads"
              : items.map((item) => summarizeWorkpad(item)).join("\n\n"),
          }],
          details: items,
        };
      }

      const record = action === "get"
        ? loadWorkpad(ctx.cwd, String(params.id ?? ""))
        : listWorkpads(ctx.cwd)[0] ?? null;

      if (!record) {
        return {
          content: [{ type: "text", text: "workpad not found" }],
          details: {
            id: String(params.id ?? ""),
            found: false,
          },
        };
      }

      return {
        content: [{ type: "text", text: summarizeWorkpad(record) }],
        details: record,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
