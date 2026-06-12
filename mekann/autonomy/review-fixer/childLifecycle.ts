/**
 * Review fixer child Pi lifecycle.
 *
 * Spawns a child Pi in a Kitty split using the subagent IPC infrastructure,
 * waits for completion synchronously, and collects the structured result.
 */

import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SubagentHub, type ChildToParent } from "../subagent/ipc.js";
import { KittyController } from "../subagent/kittyControl.js";
import type { ReviewFixerResult, ReviewFixerSettings } from "./types.js";
import type { ResolvedIssueContext } from "./issueContext.js";
import { buildChildPrompt } from "./childPrompt.js";

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
 * Spawn a child Pi process in a Kitty split and wait synchronously for completion.
 * Uses the same IPC / Kitty infrastructure as the subagent feature.
 */
export async function runChildReviewFixer(
  issueContext: ResolvedIssueContext,
  settings: ReviewFixerSettings,
  cwd: string,
  ctx: ExtensionContext,
): Promise<{ result: ReviewFixerResult | null; changedFiles: string[]; error?: string }> {
  const agentId = `rf_${Date.now().toString(36)}`;
  const agentPath = `/root/review-fixer-${issueContext.number}`;
  const logDir = path.join(os.tmpdir(), "pi-review-fixer");
  const socketPath = path.join(logDir, `${agentId}.sock`);
  const logPath = path.join(logDir, `${agentId}.log`);
  const nonce = crypto.randomBytes(24).toString("base64url");
  const title = `review-fixer #${issueContext.number}`;

  // Snapshot before
  const filesBefore = snapshotChangedFiles(cwd);

  // Build the child prompt
  const prompt = buildChildPrompt(issueContext, cwd);

  // Resolve model
  const modelId = settings.model
    ? `${settings.model.provider}/${settings.model.modelId}`
    : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);

  const thinkingLevel = settings.reasoningEffort;
  const extensionPath = path.resolve(import.meta.dirname, "../../..");

  // Create IPC hub
  const hub = new SubagentHub(socketPath, agentId, nonce);
  const kitty = new KittyController();

  // Collect result from child
  let childFinalText: string | null = null;
  let childError: string | null = null;
  let childCompleted = false;

  hub.onMessage((msg: ChildToParent) => {
    if (msg.type === "final" && msg.agentId === agentId) {
      childFinalText = msg.message;
      childCompleted = true;
    }
    if (msg.type === "error" && msg.agentId === agentId) {
      childError = childError ? `${childError}; ${msg.message}` : msg.message;
    }
  });

  try {
    // Start IPC server
    await hub.start();

    // Launch child Pi in Kitty split
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

    // Wait for hello
    await hub.waitForHello(agentId, 10_000);

    // Wait synchronously for child completion.
    // The child Pi runs thermo-nuclear review + edits + verification,
    // then sends a "final" IPC message with the structured JSON result.
    // Timeout after 10 minutes.
    const COMPLETION_TIMEOUT_MS = 600_000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!childCompleted) reject(new Error("Review fixer child timed out"));
      }, COMPLETION_TIMEOUT_MS);

      const off = hub.onMessage((msg: ChildToParent) => {
        if (msg.type === "final" && msg.agentId === agentId) {
          clearTimeout(timer);
          off();
          resolve();
        }
        if (msg.type === "status" && msg.agentId === agentId && (msg.status === "errored" || msg.status === "shutdown")) {
          clearTimeout(timer);
          off();
          if (!childCompleted) reject(new Error(`Child exited with status: ${msg.status}`));
        }
      });
    });

    // Extract result from child's final message
    const result = extractResult(childFinalText ?? "");

    // Compute changed files
    const filesAfter = snapshotChangedFiles(cwd);
    const allChangedFiles = [...filesAfter];

    // Close Kitty split
    try { await kitty.close(display); } catch { /* ignore */ }

    return {
      result,
      changedFiles: allChangedFiles,
      error: childError ?? undefined,
    };
  } catch (err: any) {
    const filesAfter = snapshotChangedFiles(cwd);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { result: null, changedFiles: [...filesAfter], error: errorMessage };
  } finally {
    await hub.stop().catch(() => undefined);
  }
}

/**
 * Extract the structured JSON result from child Pi output.
 */
function extractResult(output: string): ReviewFixerResult | null {
  if (!output) return null;

  // Try: entire output is JSON
  try {
    const parsed = JSON.parse(output.trim());
    if (parsed.schema === "review-fixer.result.v1") return parsed as ReviewFixerResult;
  } catch { /* not raw JSON */ }

  // Try: extract from markdown code blocks
  const jsonBlockMatch = output.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      if (parsed.schema === "review-fixer.result.v1") return parsed as ReviewFixerResult;
    } catch { /* not valid JSON */ }
  }

  // Try: find any JSON object with the right schema
  const jsonMatch = output.match(/\{[\s\S]*?"schema"\s*:\s*"review-fixer\.result\.v1"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as ReviewFixerResult;
    } catch { /* not valid JSON */ }
  }

  return null;
}
