/**
 * path: .pi/extensions/harness-engineering.ts
 * role: harness engineering の診断と report 出力を pi ツールとして公開する
 * why: エージェントが repo の自走基盤を自分で確認し、運用 drift を早く検知できるようにするため
 * related: .pi/lib/harness-engineering.ts, scripts/harness-engineering.ts, WORKFLOW.md, tests/unit/extensions/harness-engineering.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  assessHarnessEngineering,
  createAgentFirstWorkflowTemplate,
  renderHarnessAssessmentMarkdown,
} from "../lib/harness-engineering.js";

let isInitialized = false;

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export default function registerHarnessEngineering(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.registerCommand("harness-engineering", {
    description: "Assess the repo's agent-first harness and optionally write a report",
    handler: async (args, ctx) => {
      const command = (args ?? "").trim().toLowerCase();
      if (command === "workflow") {
        ctx.ui?.notify?.("Use harness_engineering_assess with action=workflow_template to inspect the workflow template.", "info");
        return;
      }

      const assessment = assessHarnessEngineering(ctx.cwd);
      const text = renderHarnessAssessmentMarkdown(assessment);
      ctx.ui?.notify?.(`Harness score ${assessment.overallScore} (${assessment.readiness})`, "info");
      ctx.ui?.notify?.(text, "info");
    },
  });

  pi.registerTool({
    name: "harness_engineering_assess",
    label: "Harness Engineering Assess",
    description: "Inspect the repo's agent-first harness, write a report, or return the workflow template",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("report"),
        Type.Literal("write_report"),
        Type.Literal("workflow_template"),
      ]),
      output_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action);

      if (action === "workflow_template") {
        return {
          content: [{ type: "text", text: createAgentFirstWorkflowTemplate() }],
          details: {
            action: "workflow_template",
          },
        };
      }

      const assessment = assessHarnessEngineering(ctx.cwd);
      const report = renderHarnessAssessmentMarkdown(assessment);

      if (action === "write_report") {
        const targetPath = resolve(ctx.cwd, String(params.output_path ?? ".pi/reports/harness-engineering-report.md"));
        ensureParentDir(targetPath);
        writeFileSync(targetPath, report);

        return {
          content: [{ type: "text", text: `Harness report written to ${targetPath}` }],
          details: {
            path: targetPath,
            overallScore: assessment.overallScore,
            readiness: assessment.readiness,
          },
        };
      }

      return {
        content: [{ type: "text", text: report }],
        details: assessment,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
