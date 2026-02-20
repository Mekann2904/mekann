/**
 * @abdd.meta
 * path: .pi/extensions/ul-dual-mode.ts
 * role: 高品質実行モードとセッション永続化機能の拡張
 * why: 効率的かつ高品質な実行と、柔軟なフェーズ数制御、必須レビュアによる品質ゲートを可能にするため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, docs/extensions.md
 * public_api: `state` オブジェクト、`persistState`、`resetState`、`refreshStatus`、`extractTextWithoutUlPrefix`、`looksLikeClearGoalTask`、`isTrivialTask`
 * invariants: `UL_PREFIX` は先頭の空白を許容する正規表現である、`state.persistentUlMode` はセッションを通じて維持される
 * side_effects: UIステータスの更新、PIログへの状態追加
 * failure_modes: 環境変数 `PI_UL_SKIP_REVIEWER_FOR_TRIVIAL` の設定ミスによるレビュースキップ、UI更新のスロットリングによる表示遅延
 * @abdd.explain
 * overview: "ul"プレフィックスモードの追加と、セッション全体で継続するULモードを適用的委譲機能付きで提供する拡張機能
 * what_it_does:
 *   - "ul"プレフィックスの検出と除去
 *   - セッション永続化モードとステータス管理
 *   - サブエージェント/チーム実行ツールの使用状況追跡
 *   - 小規模タスク判定とレビュースキップ制御
 *   - UIステータス表示とスロットリング制御
 * why_it_exists:
 *   - LLMの裁量で1〜Nフェーズを実行可能にし、固定フェーズ制限を解除するため
 *   - 高品質な実行結果を保証するためにレビュアプロセスを強制するため
 * scope:
 *   in: ユーザー入力テキスト、環境変数
 *   out: UIステータス、状態ログ、ツール利用フラグ
 */

// File: .pi/extensions/ul-dual-mode.ts
// Description: Adds an "ul" prefix mode and session-wide persistent UL mode with adaptive delegation.
// Why: Enables efficient, high-quality execution with flexible phase count and mandatory reviewer quality gate.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, docs/extensions.md

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const UL_PREFIX = /^\s*ul(?:\s+|$)/i;
const STABLE_UL_PROFILE = true;
const UL_REQUIRE_BOTH_ORCHESTRATIONS = false;  // 固定フェーズ解除: LLMの裁量で1〜Nフェーズ
const UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL = false;  // サブエージェント廃止のため reviewer必須ガードは無効
const UL_SKIP_REVIEWER_FOR_TRIVIAL = process.env.PI_UL_SKIP_REVIEWER_FOR_TRIVIAL !== "0";
const UL_REVIEWER_MIN_TASK_LENGTH = 200;  // この文字数未満は小規模タスク扱い
const UL_TRIVIAL_PATTERNS = [
  /^read\s+/i,           // 読み取り系
  /^show\s+/i,           // 表示系
  /^list\s+/i,           // 一覧系
  /^what\s+is/i,         // 質問系
  /^explain\s+/i,        // 説明系
  /^\?/,                 // 疑問符開始
  /^search\s+/i,         // 検索系
  /^find\s+/i,           // 検索系
];
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
  currentTask: "",  // 現在のタスク（reviewer要否判定用）
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
  state.currentTask = "";
}

function refreshStatus(ctx: any): void {
  if (!ctx?.hasUI || !ctx?.ui) return;

  if (!state.activeUlMode) {
    ctx.ui.setStatus?.("ul-dual-mode", undefined);
    return;
  }

  const team = state.usedAgentTeamRun ? "✓" : "…";
  const loop = state.activeGoalLoopMode ? "✓" : "…";
  ctx.ui.setStatus?.("ul-dual-mode", `UL mode | team:${team} loop:${loop}`);
}

// スロットリング用の状態
let lastRefreshStatusMs = 0;
const REFRESH_STATUS_THROTTLE_MS = 300;  // 300ms間隔でスロットリング

/**
 * スロットリング付きのrefreshStatus。
 * 短時間での連続呼び出しを防ぎ、UI更新のオーバーヘッドを削減する。
 */
function refreshStatusThrottled(ctx: any): void {
  const now = Date.now();
  if (now - lastRefreshStatusMs < REFRESH_STATUS_THROTTLE_MS) {
    return;  // スロットリング
  }
  lastRefreshStatusMs = now;
  refreshStatus(ctx);
}


function extractTextWithoutUlPrefix(text: string): string {
  return text.replace(UL_PREFIX, "").trimStart();
}

function looksLikeClearGoalTask(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  return CLEAR_GOAL_SIGNAL.test(normalized);
}

/**
 * 小規模タスク（trivial task）かどうかを判定する。
 * 小規模タスクではreviewerをスキップ可能にする。
 */
function isTrivialTask(task: string): boolean {
  const normalized = String(task || "").trim();
  if (!normalized) return true;
  
  // 文字数が少ない場合は小規模
  if (normalized.length < UL_REVIEWER_MIN_TASK_LENGTH) {
    return true;
  }
  
  // 特定パターンに一致する場合は小規模
  if (UL_TRIVIAL_PATTERNS.some(p => p.test(normalized))) {
    return true;
  }
  
  return false;
}

/**
 * reviewerが必要かどうかを判定する。
 * 環境変数PI_UL_SKIP_REVIEWER_FOR_TRIVIAL=1の場合、小規模タスクではスキップ。
 */
function shouldRequireReviewer(task: string): boolean {
  if (!UL_REQUIRE_FINAL_REVIEWER_GUARDRAIL) {
    return false;
  }
  if (!UL_SKIP_REVIEWER_FOR_TRIVIAL) {
    return true;  // 常にreviewer必須
  }
  return !isTrivialTask(task);
}

function getMissingRequirements(): string[] {
  const missing: string[] = [];

  // reviewer必須チェック（小規模タスクは条件付きでスキップ可能）
  if (shouldRequireReviewer(state.currentTask) && !state.completedRecommendedReviewerPhase) {
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
  // 簡素化: 詳細なポリシーはgetUlPolicy()で一元管理
  const goalHint = goalLoopMode
    ? "\n[GOAL_LOOP] 明確な達成条件を検知。loop_runを優先。"
    : "";
  return `[UL_MODE] 委任優先で実行。${goalHint}\n\nタスク:\n${task}`;
}

// ポリシーキャッシュ（4通りの組み合わせのみ）
const ulPolicyCache = new Map<string, string>();

function getUlPolicy(sessionWide: boolean, goalLoopMode: boolean): string {
  const key = `${sessionWide}:${goalLoopMode}`;
  const cached = ulPolicyCache.get(key);
  if (cached) return cached;
  
  const policy = buildUlPolicyString(sessionWide, goalLoopMode);
  ulPolicyCache.set(key, policy);
  return policy;
}

function buildUlPolicyString(sessionWide: boolean, goalLoopMode: boolean): string {
  const mode = sessionWide ? "UL SESSION" : "UL";
  const scope = sessionWide ? "session is in" : "turn is in";
  
  const loopSection = goalLoopMode
    ? `
Loop rule (clear completion criteria detected):
- Call loop_run early with goal. Set verifyCommand if tests/build/lint apply.
- Max iterations: 4-8. Rerun once if stagnation.`
    : "- Use loop_run with goal if explicit completion criteria exist.";

  return `
---
## ${mode} (delegation-first)

This ${scope} UL Adaptive Mode.

Execution:
- Use agent_team_run / agent_team_run_parallel as needed.
- Phase count: LLM discretion (1-N, optimize for task scale).

Patterns:
1. Simple: direct execution
2. Multi-perspective: agent_team_run(teamId: core-delivery-team, strategy: parallel)
3. Complex: agent_team_run_parallel(teamIds: [...], strategy: parallel)

Rules:
- ${loopSection}
- Direct edits allowed for trivial changes.
---`;
}

/**
 * 拡張機能を登録
 * @summary ULデュアルモード拡張を登録
 * @param pi - 拡張機能APIインターフェース
 * @returns なし
 */
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
        looksLikeClearGoalTask(rawText);

      if (!shouldAutoEnable) {
        return { action: "continue" as const };
      }

      state.pendingUlMode = true;
      state.pendingGoalLoopMode = true;
      state.currentTask = rawText;  // 自動有効化の場合もタスクを保存

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
    state.currentTask = transformed;  // タスクを保存（reviewer要否判定用）
    
    // 小規模タスクの場合は通知を変更
    const reviewerHint = shouldRequireReviewer(transformed) ? "（完了前にreviewer必須）" : "（小規模タスク）";
    if (ctx?.hasUI && ctx?.ui) {
      const modeHint = state.pendingGoalLoopMode ? " + loop完了条件モード" : "";
      const notifyText = `ULモード: 委任優先で効率的に実行します${reviewerHint}${modeHint}。`;
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
    // 小規模タスクの場合はreviewer不要としてマーク
    state.completedRecommendedReviewerPhase = !shouldRequireReviewer(state.currentTask);
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
      refreshStatusThrottled(ctx);  // 高頻度イベントではスロットリング
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
