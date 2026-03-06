// Path: .pi/lib/autonomy-policy.ts
// What: このリポジトリ専用の高度自律実行 policy を定義する共通ライブラリ
// Why: permission bundle と mode と gatekeeper を一箇所で管理し、拡張全体で同じ判断を使うため
// Related: .pi/extensions/autonomy-policy.ts, .pi/tests/lib/autonomy-policy.test.ts, README.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, resolve } from "node:path";

export type PermissionDecision = "allow" | "ask" | "deny";
export type AutonomyMode = "build" | "plan";
export type AutonomyProfile = "manual" | "balanced" | "high" | "yolo";
export type SafetyGatekeeperMode = "off" | "deterministic";

export type PermissionKey =
  | "read"
  | "write"
  | "command"
  | "browser"
  | "mcp"
  | "mode_switch"
  | "subtasks"
  | "follow_up"
  | "todo";

export interface PermissionBundle {
  read: PermissionDecision;
  write: PermissionDecision;
  command: PermissionDecision;
  browser: PermissionDecision;
  mcp: PermissionDecision;
  mode_switch: PermissionDecision;
  subtasks: PermissionDecision;
  follow_up: PermissionDecision;
  todo: PermissionDecision;
}

export interface AutonomyPolicyConfig {
  enabled: boolean;
  profile: AutonomyProfile;
  mode: AutonomyMode;
  gatekeeper: SafetyGatekeeperMode;
  permissions: PermissionBundle;
  updatedAt: string;
}

export interface ToolCallLike {
  toolName?: unknown;
  input?: unknown;
}

export interface AutonomyDecision {
  permissionKey: PermissionKey;
  permissionDecision: PermissionDecision;
  finalDecision: PermissionDecision;
  reason: string;
  matchedPath?: string;
  gatekeeperReason?: string;
}

export const PERMISSION_KEYS: PermissionKey[] = [
  "read",
  "write",
  "command",
  "browser",
  "mcp",
  "mode_switch",
  "subtasks",
  "follow_up",
  "todo",
];

export const DEFAULT_PERMISSION_BUNDLES: Record<AutonomyProfile, PermissionBundle> = {
  manual: {
    read: "allow",
    write: "ask",
    command: "ask",
    browser: "ask",
    mcp: "ask",
    mode_switch: "ask",
    subtasks: "ask",
    follow_up: "ask",
    todo: "ask",
  },
  balanced: {
    read: "allow",
    write: "allow",
    command: "ask",
    browser: "allow",
    mcp: "allow",
    mode_switch: "allow",
    subtasks: "allow",
    follow_up: "allow",
    todo: "allow",
  },
  high: {
    read: "allow",
    write: "allow",
    command: "allow",
    browser: "allow",
    mcp: "allow",
    mode_switch: "allow",
    subtasks: "allow",
    follow_up: "allow",
    todo: "allow",
  },
  yolo: {
    read: "allow",
    write: "allow",
    command: "allow",
    browser: "allow",
    mcp: "allow",
    mode_switch: "allow",
    subtasks: "allow",
    follow_up: "allow",
    todo: "allow",
  },
};

const READ_TOOLS = new Set([
  "read",
  "ls",
  "glob",
  "grep",
  "file_candidates",
  "code_search",
  "sym_find",
  "sym_index",
  "enhanced_read",
]);

const WRITE_TOOLS = new Set([
  "write",
  "edit",
  "patch",
]);

const COMMAND_TOOLS = new Set([
  "bash",
  "loop_run",
]);

const BROWSER_TOOLS = new Set([
  "browser",
  "playwright",
  "playwright-cli",
  "web_search",
]);

const MODE_TOOLS = new Set([
  "planmode",
  "autonomy_policy",
]);

const SUBTASK_TOOLS = new Set([
  "subagent_run",
  "subagent_run_parallel",
  "subagent_run_dag",
]);

const TODO_TOOLS = new Set([
  "task_run_next",
  "task_create",
  "task_update",
  "task_delete",
  "task_complete",
  "plan_create",
  "plan_update",
  "plan_add_step",
  "plan_update_step",
]);

const PATH_KEYS = new Set([
  "path",
  "file",
  "files",
  "target",
  "targets",
  "cwd",
  "directory",
  "directories",
  "root",
  "roots",
]);

const DESTRUCTIVE_COMMAND_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b.*\|\s*(?:sh|bash|zsh)\b/i,
];

const COMMAND_SUBSTITUTION_PATTERNS: RegExp[] = [
  /\$\(/,
  /`[^`]+`/,
];

const DOOM_LOOP_PATTERNS: RegExp[] = [
  /\bwhile\s+true\b/i,
  /\bfor\s*\(\s*;\s*;\s*\)/i,
  /\btail\s+-f\b/i,
  /\bwatch\b/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPermissionDecision(value: unknown): value is PermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

function isProfile(value: unknown): value is AutonomyProfile {
  return value === "manual" || value === "balanced" || value === "high" || value === "yolo";
}

function isMode(value: unknown): value is AutonomyMode {
  return value === "build" || value === "plan";
}

function isGatekeeperMode(value: unknown): value is SafetyGatekeeperMode {
  return value === "off" || value === "deterministic";
}

function cloneBundle(bundle: PermissionBundle): PermissionBundle {
  return { ...bundle };
}

export function createAutonomyPolicyConfig(
  profile: AutonomyProfile = "yolo"
): AutonomyPolicyConfig {
  return {
    enabled: true,
    profile,
    mode: "build",
    gatekeeper: profile === "yolo" ? "off" : "deterministic",
    permissions: cloneBundle(DEFAULT_PERMISSION_BUNDLES[profile]),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAutonomyPolicyConfig(input: unknown): AutonomyPolicyConfig {
  const fallback = createAutonomyPolicyConfig();
  if (!isRecord(input)) {
    return fallback;
  }

  const profile = isProfile(input.profile) ? input.profile : fallback.profile;
  const base = createAutonomyPolicyConfig(profile);

  if (isRecord(input.permissions)) {
    for (const key of PERMISSION_KEYS) {
      const value = input.permissions[key];
      if (isPermissionDecision(value)) {
        base.permissions[key] = value;
      }
    }
  }

  return {
    enabled: input.enabled !== false,
    profile,
    mode: isMode(input.mode) ? input.mode : fallback.mode,
    gatekeeper: isGatekeeperMode(input.gatekeeper) ? input.gatekeeper : fallback.gatekeeper,
    permissions: base.permissions,
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim().length > 0
        ? input.updatedAt
        : fallback.updatedAt,
  };
}

export function getAutonomyPolicyConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, ".pi", "autonomy-policy", "policy.json");
}

export function loadAutonomyPolicyConfig(cwd: string = process.cwd()): AutonomyPolicyConfig {
  const path = getAutonomyPolicyConfigPath(cwd);
  if (!existsSync(path)) {
    return createAutonomyPolicyConfig();
  }

  try {
    return normalizeAutonomyPolicyConfig(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return createAutonomyPolicyConfig();
  }
}

export function saveAutonomyPolicyConfig(
  config: AutonomyPolicyConfig,
  cwd: string = process.cwd()
): AutonomyPolicyConfig {
  const normalized = normalizeAutonomyPolicyConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  });
  const path = getAutonomyPolicyConfigPath(cwd);
  const dir = join(cwd, ".pi", "autonomy-policy");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

function collectPaths(value: unknown, results: string[]): void {
  if (typeof value === "string") {
    results.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPaths(item, results);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (PATH_KEYS.has(key) || typeof nested === "string" || Array.isArray(nested)) {
      collectPaths(nested, results);
    }
  }
}

function getCandidatePaths(input: unknown): string[] {
  const results: string[] = [];
  collectPaths(input, results);
  return Array.from(new Set(results));
}

function isEnvFile(pathCandidate: string): boolean {
  const name = basename(pathCandidate).toLowerCase();
  return name === ".env" || name.startsWith(".env.");
}

function isExternalPath(pathCandidate: string, cwd: string): boolean {
  if (!pathCandidate || pathCandidate.startsWith("http://") || pathCandidate.startsWith("https://")) {
    return false;
  }

  if (!pathCandidate.startsWith("../") && !isAbsolute(pathCandidate)) {
    return false;
  }

  const workspaceRoot = resolve(cwd);
  const target = isAbsolute(pathCandidate) ? resolve(pathCandidate) : resolve(cwd, pathCandidate);
  const normalizedRoot = normalize(workspaceRoot);
  const normalizedTarget = normalize(target);

  return normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function detectGatekeeperRisk(input: unknown, cwd: string): {
  decision?: PermissionDecision;
  reason?: string;
  matchedPath?: string;
} {
  const paths = getCandidatePaths(input);
  const envPath = paths.find((value) => isEnvFile(value));
  if (envPath) {
    return {
      decision: "deny",
      reason: `.env access is blocked by gatekeeper`,
      matchedPath: envPath,
    };
  }

  const externalPath = paths.find((value) => isExternalPath(value, cwd));
  if (externalPath) {
    return {
      decision: "ask",
      reason: `external path requires approval`,
      matchedPath: externalPath,
    };
  }

  if (!isRecord(input)) {
    return {};
  }

  const command = typeof input.command === "string" ? input.command : "";
  if (DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return {
      decision: "deny",
      reason: `destructive command pattern blocked`,
    };
  }

  if (COMMAND_SUBSTITUTION_PATTERNS.some((pattern) => pattern.test(command))) {
    return {
      decision: "ask",
      reason: `command substitution requires approval`,
    };
  }

  if (DOOM_LOOP_PATTERNS.some((pattern) => pattern.test(command))) {
    return {
      decision: "ask",
      reason: `potential endless loop requires approval`,
    };
  }

  const iterations = typeof input.iterations === "number" ? input.iterations : 0;
  if (iterations >= 25) {
    return {
      decision: "ask",
      reason: `high iteration count requires approval`,
    };
  }

  return {};
}

export function resolvePermissionKey(toolName: string): PermissionKey {
  const normalizedToolName = toolName.toLowerCase();

  if (SUBTASK_TOOLS.has(normalizedToolName) || normalizedToolName.startsWith("subagent_")) {
    return "subtasks";
  }

  if (TODO_TOOLS.has(normalizedToolName) || normalizedToolName.startsWith("plan_")) {
    return "todo";
  }

  if (normalizedToolName === "bash" || COMMAND_TOOLS.has(normalizedToolName)) {
    return "command";
  }

  if (WRITE_TOOLS.has(normalizedToolName)) {
    return "write";
  }

  if (READ_TOOLS.has(normalizedToolName)) {
    return "read";
  }

  if (BROWSER_TOOLS.has(normalizedToolName)) {
    return "browser";
  }

  if (MODE_TOOLS.has(normalizedToolName)) {
    return "mode_switch";
  }

  if (normalizedToolName.startsWith("mcp")) {
    return "mcp";
  }

  return "follow_up";
}

function mergeDecisions(base: PermissionDecision, gatekeeper?: PermissionDecision): PermissionDecision {
  if (!gatekeeper) {
    return base;
  }

  if (gatekeeper === "deny" || base === "deny") {
    return "deny";
  }

  if (gatekeeper === "ask" || base === "ask") {
    return "ask";
  }

  return "allow";
}

export function resolveAutonomyDecision(
  config: AutonomyPolicyConfig,
  event: ToolCallLike,
  cwd: string = process.cwd()
): AutonomyDecision {
  const toolName = typeof event.toolName === "string" ? event.toolName : "unknown";
  const permissionKey = resolvePermissionKey(toolName);

  let permissionDecision = config.permissions[permissionKey];
  if (!config.enabled) {
    permissionDecision = "allow";
  }

  if (config.mode === "plan" && (permissionKey === "write" || permissionKey === "command")) {
    permissionDecision = "deny";
  }

  const gatekeeper = config.gatekeeper === "deterministic"
    ? detectGatekeeperRisk(event.input, cwd)
    : {};

  const finalDecision = mergeDecisions(permissionDecision, gatekeeper.decision);
  const reasonParts = [
    `policy=${permissionDecision}`,
    `capability=${permissionKey}`,
  ];
  if (gatekeeper.reason) {
    reasonParts.push(`gatekeeper=${gatekeeper.reason}`);
  }

  return {
    permissionKey,
    permissionDecision,
    finalDecision,
    reason: reasonParts.join(", "),
    matchedPath: gatekeeper.matchedPath,
    gatekeeperReason: gatekeeper.reason,
  };
}

export function applyModeToTools(
  toolNames: string[],
  mode: AutonomyMode
): string[] {
  if (mode === "build") {
    return [...toolNames];
  }

  // plan mode は変更系ツールを inactive にする。
  return toolNames.filter((toolName) => {
    const permissionKey = resolvePermissionKey(toolName);
    return permissionKey !== "write" && permissionKey !== "command";
  });
}

export function summarizePolicy(config: AutonomyPolicyConfig): string {
  const permissions = PERMISSION_KEYS.map((key) => `${key}=${config.permissions[key]}`).join(", ");
  return [
    `profile=${config.profile}`,
    `mode=${config.mode}`,
    `gatekeeper=${config.gatekeeper}`,
    permissions,
  ].join("\n");
}
