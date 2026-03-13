/**
 * path: .pi/extensions/pi-improvement.ts
 * role: 実運転から得た改善ブリーフを注入し、診断レポートを返す pi 拡張
 * why: pi を実際に回した結果を次ターンの精度改善へつなげ、デバッグの往復を短くするため
 * related: .pi/lib/pi-improvement.ts, .pi/lib/agent/prompt-stack.ts, .pi/extensions/workspace-verification.ts, tests/unit/extensions/pi-improvement.test.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { applyPromptStack, type PromptStackEntry } from "../lib/agent/prompt-stack.js";
import {
  collectPiImprovementReport,
  renderPiImprovementBrief,
  renderPiImprovementReport,
  writePiImprovementReport,
} from "../lib/pi-improvement.js";

let isInitialized = false;

export default function registerPiImprovement(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("before_agent_start", async (event, ctx) => {
    const report = collectPiImprovementReport(ctx.cwd);
    const brief = renderPiImprovementBrief(report);
    if (!brief) {
      return undefined;
    }

    const entries: PromptStackEntry[] = [{
      source: "pi-improvement",
      recordSource: "pi-improvement",
      layer: "system-policy",
      markerId: "pi-improvement-brief",
      content: brief,
    }];
    const result = applyPromptStack(event.systemPrompt ?? "", entries);
    if (result.appliedEntries.length === 0) {
      return undefined;
    }

    return {
      systemPrompt: result.systemPrompt,
    };
  });

  pi.registerCommand("pi-improvement", {
    description: "Show the current pi improvement report",
    handler: async (_args, ctx) => {
      const report = renderPiImprovementReport(collectPiImprovementReport(ctx.cwd));
      ctx.ui?.notify?.(report, "info");
    },
  });

  pi.registerTool({
    name: "pi_improvement_report",
    label: "Pi Improvement Report",
    description: "Summarize recent pi execution failures and write a repo-local improvement report.",
    parameters: Type.Object({
      action: Type.Optional(Type.Union([
        Type.Literal("summary"),
        Type.Literal("report"),
        Type.Literal("write_report"),
      ])),
      output_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action ?? "summary");
      const report = collectPiImprovementReport(ctx.cwd);

      if (action === "write_report") {
        const path = writePiImprovementReport(ctx.cwd, typeof params.output_path === "string" ? params.output_path : undefined);
        return {
          content: [{ type: "text", text: `Pi improvement report written to ${path}` }],
          details: {
            path,
            health: report.health,
            focusCount: report.focuses.length,
          },
        };
      }

      const text = action === "report"
        ? renderPiImprovementReport(report)
        : renderPiImprovementBrief(report) || report.summary;

      return {
        content: [{ type: "text", text }],
        details: report,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
