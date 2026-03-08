// Path: .pi/extensions/ralph-loop-guard.ts
// What: Ralph Loop の runtime guard を全 turn に適用する拡張機能。
// Why: search-before-change と local verification closeout を自動で守らせるため。
// Related: .pi/extensions/plan.ts, .pi/extensions/workspace-verification.ts, .pi/lib/agent/runtime-notifications.ts
/**
 * @abdd.meta
 * path: .pi/extensions/ralph-loop-guard.ts
 * role: Ralph Loop の実行時ガードと短命通知を提供する
 * why: search-before-change と local verification closeout を prompt 依存でなく runtime で強制するため
 * related: .pi/extensions/plan.ts, .pi/extensions/workspace-verification.ts, .pi/lib/agent/runtime-notifications.ts, .pi/lib/agent/prompt-stack.ts
 * public_api: default function
 * invariants: 各 turn で最初の mutation 前に探索証跡を要求する、mutation 後は成功検証まで pendingVerification を維持する
 * side_effects: before_agent_start で prompt 注入、tool_call で一部ツールを block、turn_end と session_start で通知する
 * failure_modes: 未知の read/search ツールは探索証跡に含まれない、verification 判定は command pattern に依存する
 * @abdd.explain
 * overview: Ralph 系の小反復を runtime guard として実装し、雑な mutation と未検証 closeout を止める
 * what_it_does:
 *   - turn 開始時に Ralph Loop 状態を prompt stack へ注入する
 *   - 探索証跡がない mutation を block する
 *   - mutation 後の verification 未実施を通知する
 *   - task_complete と plan completed closeout を local verification 前に block する
 * why_it_exists:
 *   - prompt だけでは search-before-change が崩れるため
 *   - 反復ごとの closeout discipline を実行時に固定するため
 * scope:
 *   in: before_agent_start, tool_call, tool_result, turn_end, session_start
 *   out: systemPrompt, runtime notifications, block reason
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { applyPromptStack } from "../lib/agent/prompt-stack.js";
import type { PromptStackEntry } from "../lib/agent/prompt-stack.js";
import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../lib/agent/runtime-notifications.js";

interface RalphLoopTurnState {
  id: number;
  searchEvidence: boolean;
  mutationCount: number;
  verificationCount: number;
  lastSearchSignal?: string;
  lastMutationSignal?: string;
  lastVerificationSignal?: string;
}

interface RalphLoopSessionState {
  currentTurn: RalphLoopTurnState;
  nextTurnId: number;
  pendingVerification: boolean;
}

interface ToolResultEnvelope {
  details?: {
    success?: unknown;
  };
  result?: {
    details?: {
      success?: unknown;
    };
    success?: unknown;
  };
  success?: unknown;
}

const MUTATION_TOOLS = new Set(["edit", "write", "patch"]);
const SEARCH_TOOLS = new Set([
  "read",
  "enhanced_read",
  "code_search",
  "sym_find",
  "locagent_query",
  "repograph_query",
]);
const COMPLETION_TOOLS = new Set(["task_complete"]);
const READ_ONLY_BASH_PATTERN = /^(rg|grep|cat|sed|awk|ls|find|fd|head|tail|wc|stat|tree|git)\b/i;
const VERIFICATION_BASH_PATTERN = /\b(test|tests|lint|typecheck|type-check|build|verify|verification|check|smoke)\b|テスト|型検査|ビルド|検証|スモーク/i;

let isInitialized = false;
let state: RalphLoopSessionState = createInitialState();

function createInitialState(): RalphLoopSessionState {
  return {
    currentTurn: {
      id: 1,
      searchEvidence: false,
      mutationCount: 0,
      verificationCount: 0,
    },
    nextTurnId: 2,
    pendingVerification: false,
  };
}

function getBashCommand(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;
  for (const key of ["command", "cmd"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function isReadOnlyBash(command: string): boolean {
  return READ_ONLY_BASH_PATTERN.test(command);
}

function isVerificationBash(command: string): boolean {
  return VERIFICATION_BASH_PATTERN.test(command);
}

function isMutationTool(toolName: string, command: string): boolean {
  if (MUTATION_TOOLS.has(toolName)) {
    return true;
  }

  return toolName === "bash" && Boolean(command) && !isReadOnlyBash(command);
}

function isSearchEvidenceTool(toolName: string, command: string): boolean {
  return SEARCH_TOOLS.has(toolName) || (toolName === "bash" && Boolean(command) && isReadOnlyBash(command));
}

function isVerificationTool(toolName: string, command: string): boolean {
  return toolName === "workspace_verify"
    || (toolName === "bash" && Boolean(command) && isVerificationBash(command));
}

function extractWorkspaceVerifySuccess(event: unknown): boolean | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const payload = event as ToolResultEnvelope;
  const candidates = [
    payload.details?.success,
    payload.result?.details?.success,
    payload.result?.success,
    payload.success,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function didVerificationSucceed(event: { toolName?: unknown; isError?: unknown }, command: string): boolean {
  if (event.isError) {
    return false;
  }

  if (event.toolName === "workspace_verify") {
    return extractWorkspaceVerifySuccess(event) === true;
  }

  return true;
}

function resetTurnState(): void {
  state.currentTurn = {
    id: state.nextTurnId,
    searchEvidence: false,
    mutationCount: 0,
    verificationCount: 0,
  };
  state.nextTurnId += 1;
}

function buildLoopStatusBlock(): string {
  const lines = [
    "# Ralph Loop State",
    "",
    `turn_id: ${state.currentTurn.id}`,
    `search_before_change: ${state.currentTurn.searchEvidence ? "confirmed" : "required"}`,
    `mutations_this_turn: ${state.currentTurn.mutationCount}`,
    `verifications_this_turn: ${state.currentTurn.verificationCount}`,
    `pending_verification: ${state.pendingVerification}`,
    "",
    "Loop contract:",
    "- Search and read before the first mutation in this turn.",
    "- Keep the loop focused on one concrete increment.",
    "- Verify locally before closing out the step or task.",
  ];

  if (state.currentTurn.lastSearchSignal) {
    lines.push(`- latest_search_signal: ${state.currentTurn.lastSearchSignal}`);
  }
  if (state.currentTurn.lastMutationSignal) {
    lines.push(`- latest_mutation_signal: ${state.currentTurn.lastMutationSignal}`);
  }
  if (state.currentTurn.lastVerificationSignal) {
    lines.push(`- latest_verification_signal: ${state.currentTurn.lastVerificationSignal}`);
  }

  return lines.join("\n");
}

function buildLoopNotifications(): string {
  const notifications = [
    createRuntimeNotification(
      "ralph-loop",
      state.pendingVerification
        ? "A previous mutation is still waiting for successful local verification."
        : "Search before the first mutation, then verify locally before closeout.",
      state.pendingVerification ? "warning" : "info",
      1,
    ),
    !state.currentTurn.searchEvidence
      ? createRuntimeNotification(
          "ralph-loop-search",
          "No search/read evidence exists for this turn yet. Use read/code_search/enhanced_read/sym_find or read-only bash before mutating.",
          "warning",
          1,
        )
      : undefined,
  ].filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));

  return formatRuntimeNotificationBlock(notifications);
}

/**
 * Ralph Loop guard を登録する。
 * @summary Guard登録
 * @param pi 拡張API
 * @returns void
 */
export default function registerRalphLoopGuard(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("session_start", async (_event, ctx) => {
    state = createInitialState();
    ctx.ui?.notify?.("Ralph Loop guard loaded. Search-before-change and local verification are enforced.", "info");
  });

  pi.on("before_agent_start", async (event) => {
    resetTurnState();

    const entries: PromptStackEntry[] = [
      {
        source: "ralph-loop-state",
        recordSource: "ralph-loop-state",
        layer: "startup-context",
        markerId: `ralph-loop-state:${state.currentTurn.id}`,
        content: buildLoopStatusBlock(),
      },
    ];

    const notificationBlock = buildLoopNotifications();
    if (notificationBlock) {
      entries.push({
        source: "ralph-loop-notification",
        recordSource: "ralph-loop-notification",
        layer: "runtime-notification",
        markerId: `ralph-loop-notification:${state.currentTurn.id}:${state.pendingVerification ? "pending" : "clear"}`,
        content: notificationBlock,
      });
    }

    const result = applyPromptStack(event.systemPrompt ?? "", entries);
    if (result.appliedEntries.length === 0) {
      return;
    }

    return {
      systemPrompt: result.systemPrompt,
    };
  });

  pi.on("tool_call", async (event) => {
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    const command = toolName === "bash" ? getBashCommand(event.input) : "";

    if (isSearchEvidenceTool(toolName, command)) {
      state.currentTurn.searchEvidence = true;
      state.currentTurn.lastSearchSignal = toolName === "bash" ? command : toolName;
      return;
    }

    if (isMutationTool(toolName, command)) {
      if (!state.currentTurn.searchEvidence) {
        return {
          block: true,
          reason: "Ralph Loop requires search before change. Use read/code_search/enhanced_read/sym_find or a read-only bash search before the first mutation in this turn.",
        };
      }

      state.currentTurn.mutationCount += 1;
      state.currentTurn.lastMutationSignal = toolName === "bash" ? command : toolName;
      state.pendingVerification = true;
      return;
    }

    if (isVerificationTool(toolName, command)) {
      state.currentTurn.lastVerificationSignal = toolName === "bash" ? command : toolName;
      return;
    }

    if (state.pendingVerification) {
      if (COMPLETION_TOOLS.has(toolName)) {
        return {
          block: true,
          reason: "Ralph Loop closeout is blocked. A mutation is still pending successful local verification before task completion.",
        };
      }

      if (toolName === "plan_update_step") {
        const input = typeof event.input === "object" && event.input !== null
          ? event.input as Record<string, unknown>
          : {};
        if (input.status === "completed") {
          return {
            block: true,
            reason: "Ralph Loop closeout is blocked. Verify the touched unit successfully before marking the plan step completed.",
          };
        }
      }
    }

    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    const command = toolName === "bash" ? getBashCommand(event.input) : "";

    if (!isVerificationTool(toolName, command)) {
      return;
    }

    if (!didVerificationSucceed(event, command)) {
      return;
    }

    state.currentTurn.verificationCount += 1;
    state.pendingVerification = false;
    ctx.ui?.notify?.("Ralph Loop verification succeeded. Closeout may proceed.", "success");
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (state.currentTurn.mutationCount > 0 && state.currentTurn.verificationCount === 0) {
      ctx.ui?.notify?.(
        "Ralph Loop warning: this turn mutated the workspace without successful local verification.",
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
    state = createInitialState();
  });
}
