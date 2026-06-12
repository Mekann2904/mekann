/**
 * Review fixer child Pi lifecycle.
 *
 * Two execution modes:
 * 1. External (Kitty split) — spawns a child Pi in a Kitty split for visibility
 * 2. In-process — creates a private AgentSession in the same process
 *
 * Falls back to in-process when Kitty is unavailable.
 */

import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SubagentHub, type ChildToParent } from "../subagent/ipc.js";
import { KittyController } from "../subagent/kittyControl.js";
import { extractJSONWithSchema } from "../subagent/resultSchemaShared.js";
import { extractLastAssistantText } from "../subagent/contextFork.js";
import type { ReviewFixerResult, ReviewFixerSettings } from "./types.js";
import type { ResolvedIssueContext } from "./issueContext.js";
import { buildChildPrompt } from "./childPrompt.js";

/** Edit-capable tool set for in-process review sessions. */
const REVIEW_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

/**
 * Get git status snapshot for comparing before/after.
 */
function snapshotChangedFiles(cwd: string): Set<string> {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf-8" });
    return new Set(output.split("\n").filter(Boolean).map((line) => line.slice(3)));
  } catch {
    return new Set();
  }
}

/**
 * Main entry point: run review fixer with Kitty split or in-process fallback.
 */
export async function runChildReviewFixer(
  issueContext: ResolvedIssueContext,
  settings: ReviewFixerSettings,
  cwd: string,
  ctx: ExtensionContext,
): Promise<{ result: ReviewFixerResult | null; changedFiles: string[]; error?: string }> {
  const filesBefore = snapshotChangedFiles(cwd);

  // Try Kitty split first when running inside Kitty
  if (process.env.KITTY_WINDOW_ID) {
    try {
      const outcome = await runExternalChild(issueContext, settings, cwd, ctx);
      const filesAfter = snapshotChangedFiles(cwd);
      return {
        ...outcome,
        changedFiles: [...filesAfter].filter((f) => !filesBefore.has(f)),
      };
    } catch {
      // Kitty launch failed — fall through to in-process
    }
  }

  // In-process fallback
  const outcome = await runInProcessChild(issueContext, settings, cwd, ctx);
  const filesAfter = snapshotChangedFiles(cwd);
  return {
    ...outcome,
    changedFiles: [...filesAfter].filter((f) => !filesBefore.has(f)),
  };
}

// ─── External mode (Kitty split) ────────────────────────────────

async function runExternalChild(
  issueContext: ResolvedIssueContext,
  settings: ReviewFixerSettings,
  cwd: string,
  ctx: ExtensionContext,
): Promise<{ result: ReviewFixerResult | null; error?: string }> {
  const agentId = `rf_${Date.now().toString(36)}`;
  const agentPath = `/root/review-fixer-${issueContext.number}`;
  const logDir = path.join(os.tmpdir(), "pi-review-fixer");
  const socketPath = path.join(logDir, `${agentId}.sock`);
  const logPath = path.join(logDir, `${agentId}.log`);
  const nonce = crypto.randomBytes(24).toString("base64url");
  const title = `review-fixer #${issueContext.number}`;

  const prompt = buildChildPrompt(issueContext, cwd);

  const modelId = settings.model
    ? `${settings.model.provider}/${settings.model.modelId}`
    : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);

  const thinkingLevel = settings.reasoningEffort;
  const extensionPath = path.resolve(import.meta.dirname, "../../..");

  const hub = new SubagentHub(socketPath, agentId, nonce);
  const kitty = new KittyController();

  let childError: string | null = null;
  const hubOff0 = hub.onMessage((msg: ChildToParent) => {
    if (msg.type === "error" && msg.agentId === agentId) {
      childError = childError ? `${childError}; ${msg.message}` : msg.message;
    }
  });

  try {
    await hub.start();

    const display = await kitty.launchPiSplit({
      agentId,
      agentPath,
      cwd,
      socketPath,
      initialMessage: prompt,
      logPath,
      title,
      piCommand: "pi",
      extensionPath,
      modelId,
      thinkingLevel,
      nonce,
    });

    await hub.waitForHello(agentId, 10_000);

    const childFinalText = await new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Review fixer child timed out")), 600_000);
      const off = hub.onMessage((msg: ChildToParent) => {
        if (msg.type === "final" && msg.agentId === agentId) {
          clearTimeout(timer);
          off();
          resolve(msg.message);
        }
        if (msg.type === "status" && msg.agentId === agentId && (msg.status === "errored" || msg.status === "shutdown")) {
          clearTimeout(timer);
          off();
          reject(new Error(`Child exited with status: ${msg.status}`));
        }
      });
    });

    const result = extractResult(childFinalText ?? "");

    try { await kitty.close(display); } catch { /* ignore */ }

    return { result, error: childError ?? undefined };
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { result: null, error: errorMessage };
  } finally {
    hubOff0();
    await hub.stop().catch(() => undefined);
  }
}

// ─── In-process mode ────────────────────────────────────────────

async function runInProcessChild(
  issueContext: ResolvedIssueContext,
  settings: ReviewFixerSettings,
  cwd: string,
  ctx: ExtensionContext,
): Promise<{ result: ReviewFixerResult | null; error?: string }> {
  const prompt = buildChildPrompt(issueContext, cwd);

  // Resolve model — use settings override or fall back to current model
  const model = ctx.model;
  if (!model) {
    return { result: null, error: "No model available for in-process review" };
  }

  const thinkingLevel = settings.reasoningEffort === "off" ? undefined : settings.reasoningEffort;

  const { createAgentSession, SessionManager } = await import("@earendil-works/pi-coding-agent");

  const { session } = await createAgentSession({
    cwd,
    model,
    modelRegistry: ctx.modelRegistry,
    tools: [...REVIEW_TOOLS],
    ...(thinkingLevel ? { thinkingLevel } : {}),
    sessionManager: SessionManager.inMemory(),
    appendSystemPrompt: [prompt],
  } as any);

  return new Promise<{ result: ReviewFixerResult | null; error?: string }>((resolve) => {
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      try { fn(); } finally { try { session.dispose(); } catch { /* ignore */ } }
    };

    session.subscribe((event: any) => {
      if (event.type === "agent_end") {
        settle(() => {
          const msgs = event.messages as any[] | undefined;
          const text = extractLastAssistantText(msgs) ?? "";
          resolve({ result: extractResult(text), error: undefined });
        });
      }
    });

    session.prompt("Begin the review now. Follow the instructions in your system prompt.").catch((err: any) => {
      settle(() => {
        resolve({ result: null, error: err instanceof Error ? err.message : String(err) });
      });
    });
  });
}

// ─── Result extraction ──────────────────────────────────────────

/**
 * Extract the structured JSON result from child Pi output.
 * Uses the shared balanced-brace JSON extractor from subagent infrastructure.
 */
function extractResult(output: string): ReviewFixerResult | null {
  if (!output) return null;
  const json = extractJSONWithSchema(output, "review-fixer.result.v1");
  if (!json) return null;
  try {
    return JSON.parse(json) as ReviewFixerResult;
  } catch {
    return null;
  }
}
