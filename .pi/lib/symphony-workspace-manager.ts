/**
 * path: .pi/lib/symphony-workspace-manager.ts
 * role: Symphony 用の workspace root 解決、per-issue workspace 管理、hook 実行を担う
 * why: task ごとの隔離作業ディレクトリと repo-owned hook contract を自動運用するため
 * related: .pi/lib/workflow-workpad.ts, .pi/lib/runtime-sessions.ts, .pi/lib/symphony-scheduler.ts, WORKFLOW.md
 */

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

import { loadWorkflowDocument } from "./workflow-workpad.js";

export type SymphonyWorkspaceHookName =
  | "after_create"
  | "before_run"
  | "after_run"
  | "before_remove";

export interface SymphonyWorkspaceInfo {
  issueId: string;
  workspaceKey: string;
  rootPath: string;
  path: string;
  exists: boolean;
}

export interface EnsureSymphonyWorkspaceInput {
  cwd?: string;
  issueId: string;
}

export interface RunSymphonyWorkspaceHookInput {
  cwd?: string;
  issueId: string;
  hook: SymphonyWorkspaceHookName;
}

const DEFAULT_HOOK_TIMEOUT_MS = 60_000;
const DEFAULT_WORKSPACE_ROOT = join(tmpdir(), "symphony_workspaces");

function expandHomePath(value: string): string {
  if (!value.startsWith("~")) {
    return value;
  }
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    return value;
  }
  return value === "~" ? home : join(home, value.slice(2));
}

function expandPathEnv(value: string): string {
  return value.replace(/\$([A-Z0-9_]+)/gi, (_match, name: string) => process.env[name] ?? "");
}

function resolveWorkspaceRoot(cwd: string): string {
  const workflow = loadWorkflowDocument(cwd);
  const raw = workflow.frontmatter.workspace?.root;
  if (typeof raw !== "string" || !raw.trim()) {
    return DEFAULT_WORKSPACE_ROOT;
  }

  const expanded = expandHomePath(expandPathEnv(raw.trim()));
  if (!expanded.includes("/") && !expanded.includes("\\")) {
    return resolve(cwd, expanded);
  }
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function getHookTimeoutMs(cwd: string): number {
  const workflow = loadWorkflowDocument(cwd);
  const raw = workflow.frontmatter.hooks?.timeout_ms;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_HOOK_TIMEOUT_MS;
}

function getHookScript(cwd: string, hook: SymphonyWorkspaceHookName): string | null {
  const workflow = loadWorkflowDocument(cwd);
  const value = workflow.frontmatter.hooks?.[hook];
  return typeof value === "string" && value.trim() ? value : null;
}

export function sanitizeSymphonyWorkspaceKey(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_") || "issue";
}

function assertWorkspaceWithinRoot(rootPath: string, workspacePath: string): void {
  const normalizedRoot = resolve(rootPath);
  const normalizedWorkspace = resolve(workspacePath);
  const rel = relative(normalizedRoot, normalizedWorkspace);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return;
  }
  throw new Error(`workspace escaped root: ${normalizedWorkspace}`);
}

export function getSymphonyWorkspaceInfo(
  input: EnsureSymphonyWorkspaceInput,
): SymphonyWorkspaceInfo {
  const cwd = input.cwd ?? process.cwd();
  const rootPath = resolveWorkspaceRoot(cwd);
  const workspaceKey = sanitizeSymphonyWorkspaceKey(input.issueId);
  const path = join(rootPath, workspaceKey);
  assertWorkspaceWithinRoot(rootPath, path);
  return {
    issueId: input.issueId,
    workspaceKey,
    rootPath,
    path,
    exists: existsSync(path) && statSync(path).isDirectory(),
  };
}

async function runShellScript(options: {
  script: string;
  cwd: string;
  timeoutMs: number;
}): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("bash", ["-lc", options.script], {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(`hook timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
        return;
      }
      const output = `${stdout}\n${stderr}`.trim().slice(0, 400);
      rejectPromise(new Error(output || `hook exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function ensureSymphonyWorkspace(
  input: EnsureSymphonyWorkspaceInput,
): Promise<SymphonyWorkspaceInfo> {
  const cwd = input.cwd ?? process.cwd();
  const info = getSymphonyWorkspaceInfo({ cwd, issueId: input.issueId });
  mkdirSync(dirname(info.path), { recursive: true });

  let createdNow = false;
  if (!existsSync(info.path)) {
    mkdirSync(info.path, { recursive: true });
    createdNow = true;
  }

  const afterCreateScript = getHookScript(cwd, "after_create");
  if (createdNow && afterCreateScript) {
    await runShellScript({
      script: afterCreateScript,
      cwd: info.path,
      timeoutMs: getHookTimeoutMs(cwd),
    });
  }

  return {
    ...info,
    exists: true,
  };
}

export async function runSymphonyWorkspaceHook(
  input: RunSymphonyWorkspaceHookInput,
): Promise<SymphonyWorkspaceInfo> {
  const cwd = input.cwd ?? process.cwd();
  const info = await ensureSymphonyWorkspace({ cwd, issueId: input.issueId });
  const script = getHookScript(cwd, input.hook);
  if (!script) {
    return info;
  }
  await runShellScript({
    script,
    cwd: info.path,
    timeoutMs: getHookTimeoutMs(cwd),
  });
  return info;
}

export async function removeSymphonyWorkspace(
  input: EnsureSymphonyWorkspaceInput,
): Promise<SymphonyWorkspaceInfo> {
  const cwd = input.cwd ?? process.cwd();
  const info = getSymphonyWorkspaceInfo({ cwd, issueId: input.issueId });
  if (!existsSync(info.path)) {
    return info;
  }

  const script = getHookScript(cwd, "before_remove");
  if (script) {
    try {
      await runShellScript({
        script,
        cwd: info.path,
        timeoutMs: getHookTimeoutMs(cwd),
      });
    } catch {
      // before_remove は best-effort に留める。
    }
  }

  rmSync(info.path, { recursive: true, force: true });
  return {
    ...info,
    exists: false,
  };
}
