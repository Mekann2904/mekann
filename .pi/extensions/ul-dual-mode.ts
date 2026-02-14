// File: .pi/extensions/ul-dual-mode.ts
// Description: Adds an "ul" prefix mode and session-wide persistent UL mode with adaptive delegation.
// Why: Enables efficient, high-quality execution with flexible phase count and mandatory reviewer quality gate.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, docs/extensions.md

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const UL_PREFIX = /^\s*ul(?:\s+|$)/i;
const STABLE_UL_PROFILE = true;
const UL_REQUIRE_BOTH_ORCHESTRATIONS = false;  // 固定フェーズ解除: LLMの裁量で1〜Nフェーズ
const UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL = true;  // reviewer必須
const UL_AUTO_ENABLE_FOR_CLEAR_GOAL = process.env.PI_UL_AUTO_CLEAR_GOAL !== "0";
const RECOMMENDED_SUBAGENT_IDS = ["researcher", "architect", "implementer"] as const;
const RECOMMENDED_CORE_TEAM_ID = "core-delivery-team";
const RECOMMENDED_REVIEWER_ID = "reviewer";
const CLEAR_GOAL_SIGNAL =
  /(達成条件|完了条件|成功条件|受け入れ条件|until|done when|all tests pass|tests pass|lint pass|build succeeds?|exit code 0|エラー0|テスト.*通る|lint.*通る|build.*成功)/i;

const SUBAGENT_EXECUTION_TOOLS = new Set([
  "subagent_run",
  "subagent_run_parallel",
]);

const AGENT_TEAM_EXECUTION_TOOLS = new Set([
  "agent_team_run",
  "agent_team_run_parallel",
]);

const state = {
  persistentUlMode: false,  // Session-wide persistent UL mode
  pendingUlMode: false,
  activeUlMode: false,
  pendingGoalLoopMode: false,
  activeGoalLoopMode: false,
  usedSubagentRun: false,
  usedAgentTeamRun: false,
  completedRecommendedSubagentPhase: false,
  completedRecommendedTeamPhase: false,
  completedRecommendedReviewerPhase: false,
};

function persistState(pi: ExtensionAPI): void {
  pi.appendEntry("ul-mode-state", { enabled: state.persistentUlMode });
}

function resetState(): void {
  state.pendingUlMode = false;
  state.activeUlMode = false;
  state.pendingGoalLoopMode = false;
  state.activeGoalLoopMode = false;
  state.usedSubagentRun = false;
  state.usedAgentTeamRun = false;
  state.completedRecommendedSubagentPhase = false;
  state.completedRecommendedTeamPhase = false;
  state.completedRecommendedReviewerPhase = false;
}

function refreshStatus(ctx: any): void {
  if (!ctx?.hasUI || !ctx?.ui) return;

  if (!state.activeUlMode) {
    ctx.ui.setStatus?.("ul-dual-mode", undefined);
    return;
  }

  const subagent = state.usedSubagentRun ? "✓" : "…";
  const team = state.usedAgentTeamRun ? "✓" : "…";
  const reviewer = state.completedRecommendedReviewerPhase ? "✓" : "…";
  const loop = state.activeGoalLoopMode ? "✓" : "…";
  ctx.ui.setStatus?.("ul-dual-mode", `UL mode | subagent:${subagent} team:${team} reviewer:${reviewer} loop:${loop}`);
}


function extractTextWithoutUlPrefix(text: string): string {
  return text.replace(UL_PREFIX, "").trimStart();
}

function looksLikeClearGoalTask(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  return CLEAR_GOAL_SIGNAL.test(normalized);
}

function getMissingRequirements(): string[] {
  const missing: string[] = [];

  // reviewer必須のみチェック（フェーズ数はLLM裁量）
  if (UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL && !state.completedRecommendedReviewerPhase) {
    missing.push(`subagent_run (subagentId: ${RECOMMENDED_REVIEWER_ID}) - 完了前の品質レビュー`);
  }

  return missing;
}

function toObjectLike(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeId(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function parseToolInput(event: any): Record<string, unknown> | undefined {
  const direct = toObjectLike(event?.input);
  if (direct) return direct;

  if (typeof event?.input === "string") {
    try {
      const parsed = JSON.parse(event.input);
      return toObjectLike(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeId(entry))
    .filter(Boolean);
}

function isRecommendedSubagentParallelCall(event: any): boolean {
  const toolName = normalizeId(event?.toolName);
  if (toolName !== "subagent_run_parallel") {
    return false;
  }

  const input = parseToolInput(event);
  const idSet = new Set(extractIdList(input?.subagentIds));
  if (idSet.size < 2) {
    return false;
  }

  return RECOMMENDED_SUBAGENT_IDS.every((id) => idSet.has(id));
}

function isRecommendedCoreTeamCall(event: any): boolean {
  const toolName = normalizeId(event?.toolName);
  const input = parseToolInput(event);

  if (toolName === "agent_team_run") {
    const teamId = normalizeId(input?.teamId);
    if (teamId !== RECOMMENDED_CORE_TEAM_ID) return false;
    const strategyRaw = normalizeId(input?.strategy);
    return strategyRaw.length === 0 || strategyRaw === "parallel";
  }

  if (toolName === "agent_team_run_parallel") {
    const teamIds = new Set(extractIdList(input?.teamIds));
    return teamIds.has(RECOMMENDED_CORE_TEAM_ID);
  }

  return false;
}

function isRecommendedReviewerCall(event: any): boolean {
  const toolName = normalizeId(event?.toolName);
  if (toolName !== "subagent_run") {
    return false;
  }

  const input = parseToolInput(event);
  const subagentId = normalizeId(input?.subagentId);
  return subagentId === RECOMMENDED_REVIEWER_ID;
}

function buildUlTransformedInput(task: string, goalLoopMode: boolean): string {
  const loopHints = goalLoopMode
    ? [
        "- 明確な達成条件を検知したため、このターンで loop_run を優先する。",
        "- loop_run に `goal` を渡し、可能なら `verifyCommand` と `verificationTimeoutMs` を設定する。",
        "- 完了判定は loop_run の `completed=yes` を基準にする。",
      ]
    : [
        "- 完了条件が明確な場合は loop_run を使い、`goal` を明示する。",
      ];

  return [
    "[UL_MODE_ADAPTIVE]",
    "委任優先で効率的に実行すること。",
    "",
    "実行ルール:",
    "- subagent_run_parallel / agent_team_run / agent_team_run_parallel 等を必要に応じて使用する。",
    "- フェーズ数はLLMの裁量（最小1、上限なし）。タスク規模に合わせて最適化する。",
    "- 完了と判断する前に必ず subagent_run(subagentId: reviewer) を実行し、品質を確認すること。",
    "- 1人で十分な小規模タスクは subagent_run で済ませる。",
    "- 複数視点が必要な場合は subagent_run_parallel(subagentIds: researcher, architect, implementer) を使用。",
    "- 多角的な実装が必要な場合は agent_team_run(teamId: core-delivery-team) を使用。",
    "",
    ...loopHints,
    "",
    "タスク:",
    task,
  ].join("\n");
}

function getUlPolicy(sessionWide: boolean, goalLoopMode: boolean): string {
  const mode = sessionWide
    ? "UL Adaptive Mode (SESSION-WIDE - Active for all prompts)"
    : "UL Adaptive Mode (Single turn - triggered by 'ul' prefix)";

  const subagentParallelRule =
    "- For subagent usage, prefer `subagent_run_parallel` with explicit `subagentIds` (minimum 2 for complex tasks). Use `subagent_run` for simple single-specialist tasks.";
  const loopRule = goalLoopMode
    ? "- Clear completion criteria detected: call `loop_run` early and set `goal` (plus verification settings when available)."
    : "- If explicit completion criteria exist, use `loop_run` with `goal` (and `verifyCommand` when available).";
  const teamParallelRule = goalLoopMode
    ? "- For decomposable work, prefer `agent_team_run_parallel` with explicit `teamIds`, `communicationRounds: 1`, and `failedMemberRetryRounds: 1`."
    : "- For agent-team usage, use parallel variants when explicitly necessary.";
  const completionLoopRule = goalLoopMode
    ? `
Completion-loop rule (clear deterministic completion criteria detected):
- Call \`loop_run\` early in this turn.
- Set \`goal\` to the user-defined completion criteria.
- When objective checks exist (tests/build/lint), set \`verifyCommand\` and \`verificationTimeoutMs\`.
- Keep \`maxIterations\` bounded (typically 4-8) and avoid unbounded fan-out.
- Consider the task complete only after loop_run reports completed=yes.
- If loop_run stops by max_iterations/stagnation, do one focused orchestration pass and rerun loop_run once.
`
    : "";

  return `
---
## ${mode}

This ${sessionWide ? "session is in" : "turn is in"} UL Adaptive Mode.

Execution policy (delegation-first, efficient, high quality):
- Use subagent_run_parallel, agent_team_run, etc. as needed.
- Phase count is at LLM's discretion (minimum 1, no maximum).
- YOU MUST call \`subagent_run(subagentId: "${RECOMMENDED_REVIEWER_ID}")\` before marking the task complete.

Recommended patterns:
1. Simple tasks: single \`subagent_run\` or direct execution
2. Multi-perspective tasks: \`subagent_run_parallel(subagentIds: researcher, architect, implementer)\`
3. Complex implementation: \`agent_team_run(teamId: ${RECOMMENDED_CORE_TEAM_ID}, strategy: parallel)\`

Quality gate (REQUIRED):
- Before finishing, always run: \`subagent_run(subagentId: "${RECOMMENDED_REVIEWER_ID}")\`
- The reviewer will validate quality, completeness, and potential issues.

Execution rules:
- ${subagentParallelRule}
- ${loopRule}
- ${teamParallelRule}
- Direct edits are allowed for trivial changes.
- Do not finish until reviewer has been called.
${completionLoopRule}
---`;
}

export default function registerUlDualModeExtension(pi: ExtensionAPI) {
  // CLIフラグ: セッション全体でULモードを有効化
  pi.registerFlag("ul", {
    description: "Enable UL Dual-Orchestration Mode for entire session",
    type: "boolean",
    default: false,
  });

  // スラッシュコマンド: セッション中にULモードを切り替え
  pi.registerCommand("ulmode", {
    description: "Toggle UL Dual-Orchestration Mode for entire session",
    handler: async (_args, ctx) => {
      state.persistentUlMode = !state.persistentUlMode;
      if (state.persistentUlMode) {
        state.activeUlMode = true;
        state.activeGoalLoopMode = false;
        state.usedSubagentRun = false;
        state.usedAgentTeamRun = false;
        state.completedRecommendedSubagentPhase = false;
        state.completedRecommendedTeamPhase = false;
        state.completedRecommendedReviewerPhase = false;
        ctx.ui.notify("ULモード: セッション全体で有効です。", "info");
      } else {
        state.activeUlMode = false;
        state.activeGoalLoopMode = false;
        state.usedSubagentRun = false;
        state.usedAgentTeamRun = false;
        state.completedRecommendedSubagentPhase = false;
        state.completedRecommendedTeamPhase = false;
        state.completedRecommendedReviewerPhase = false;
        ctx.ui.notify("ULモード: 無効になりました。", "info");
      }
      refreshStatus(ctx);
      persistState(pi);
    },
  });

  // 入力先頭が "ul" のときだけ、次の1プロンプトをULモードにする。
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    const rawText = String(event.text || "");
    if (!UL_PREFIX.test(rawText)) {
      state.pendingUlMode = false;
      state.pendingGoalLoopMode = false;

      const shouldAutoEnable =
        UL_AUTO_ENABLE_FOR_CLEAR_GOAL &&
        looksLikeClearGoalTask(rawText);

      if (!shouldAutoEnable) {
        return { action: "continue" as const };
      }

      state.pendingUlMode = true;
      state.pendingGoalLoopMode = true;

      if (ctx?.hasUI && ctx?.ui) {
        ctx.ui.notify("UL自動モード: 明確な達成条件を検知したため、UL+loop方針を適用します。", "info");
      }
      return { action: "continue" as const };
    }

    const transformed = extractTextWithoutUlPrefix(rawText);
    if (!transformed.trim()) {
      state.pendingUlMode = false;
      state.pendingGoalLoopMode = false;
      if (ctx?.hasUI && ctx?.ui) {
        ctx.ui.notify("`ul` の後に実行内容を入力してください。", "warning");
      }
      return { action: "handled" as const };
    }

    state.pendingUlMode = true;
    state.pendingGoalLoopMode = looksLikeClearGoalTask(transformed);
    if (ctx?.hasUI && ctx?.ui) {
      const modeHint = state.pendingGoalLoopMode ? " + loop完了条件モード" : "";
      const notifyText = `ULモード: 委任優先で効率的に実行します（完了前にreviewer必須）${modeHint}。`;
      ctx.ui.notify(notifyText, "info");
    }

    return {
      action: "transform" as const,
      text: buildUlTransformedInput(transformed, state.pendingGoalLoopMode),
    };
  });

  // エージェント開始前に、ULモードの強制ポリシーを注入する（1ターン限定またはセッション全体）
  pi.on("before_agent_start", async (event, ctx) => {
    state.activeUlMode = state.pendingUlMode || state.persistentUlMode;
    state.activeGoalLoopMode = state.activeUlMode && state.pendingGoalLoopMode;
    state.pendingUlMode = false;
    state.pendingGoalLoopMode = false;
    state.usedSubagentRun = false;
    state.usedAgentTeamRun = false;
    state.completedRecommendedSubagentPhase = false;
    state.completedRecommendedTeamPhase = false;
    state.completedRecommendedReviewerPhase = false;
    refreshStatus(ctx);

    if (!state.activeUlMode) {
      state.activeGoalLoopMode = false;
      return;
    }

    const sessionWide = state.persistentUlMode;
    const ulPolicy = getUlPolicy(sessionWide, state.activeGoalLoopMode);

    return {
      systemPrompt: `${event.systemPrompt}${ulPolicy}`,
    };
  });

  // NOTE: UL mode blocking is intentionally disabled.
  // ただし達成判定のため、ツール実行の追跡だけは有効にする。
  pi.on("tool_call", async (event, ctx) => {
    if (!state.activeUlMode) {
      return;
    }

    const toolName = String(event?.toolName || "").toLowerCase();
    let changed = false;

    if (SUBAGENT_EXECUTION_TOOLS.has(toolName) && !state.usedSubagentRun) {
      state.usedSubagentRun = true;
      changed = true;
    }

    if (AGENT_TEAM_EXECUTION_TOOLS.has(toolName) && !state.usedAgentTeamRun) {
      state.usedAgentTeamRun = true;
      changed = true;
    }

    // reviewer検出（フェーズ数に関わらず常にチェック）
    if (
      UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL &&
      !state.completedRecommendedReviewerPhase &&
      isRecommendedReviewerCall(event)
    ) {
      state.completedRecommendedReviewerPhase = true;
      changed = true;
    }

    if (changed) {
      refreshStatus(ctx);
    }
  });

  // 1リクエスト終了時の処理（セッション永続モードなら状態を維持）
  pi.on("agent_end", async (event, ctx) => {
    if (!state.activeUlMode) {
      resetState();
      refreshStatus(ctx);
      return;
    }

    const missing = getMissingRequirements();
    if (missing.length === 0) {
      // reviewerが実行された（または必須でない）
      if (state.persistentUlMode) {
        state.activeUlMode = true;
        state.activeGoalLoopMode = false;
        state.usedSubagentRun = false;
        state.usedAgentTeamRun = false;
        state.completedRecommendedSubagentPhase = false;
        state.completedRecommendedTeamPhase = false;
        state.completedRecommendedReviewerPhase = false;
        refreshStatus(ctx);
      } else {
        resetState();
        refreshStatus(ctx);
      }
      return;
    }

    // reviewer未実行の警告
    if (ctx?.hasUI && ctx?.ui) {
      ctx.ui.notify(`ULモード未達: ${missing.join(" と ")} が未実行です。`, "warning");
    }

    // セッション永続モードなら次のターンも有効
    if (state.persistentUlMode) {
      state.activeUlMode = true;
      state.activeGoalLoopMode = false;
      state.usedSubagentRun = false;
      state.usedAgentTeamRun = false;
      state.completedRecommendedSubagentPhase = false;
      state.completedRecommendedTeamPhase = false;
      state.completedRecommendedReviewerPhase = false;
      refreshStatus(ctx);
    } else {
      resetState();
      refreshStatus(ctx);
    }
  });

  // セッション開始時: フラグと保存状態から復元
  pi.on("session_start", async (_event, ctx) => {
    resetState();

    // CLIフラグから復元
    if (pi.getFlag("ul") === true) {
      state.persistentUlMode = true;
      state.activeUlMode = true;
    }

    // セッションエントリから復元
    const entries = ctx.sessionManager.getEntries();
    const ulEntry = [...entries].reverse().find((e: { type: string; customType?: string }) =>
      e.type === "custom" && e.customType === "ul-mode-state"
    ) as { data?: { enabled: boolean } } | undefined;

    if (ulEntry?.data?.enabled) {
      state.persistentUlMode = true;
      state.activeUlMode = true;
    }

    refreshStatus(ctx);
  });
}
