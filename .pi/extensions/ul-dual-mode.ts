/**
 * @abdd.meta
 * path: .pi/extensions/ul-dual-mode.ts
 * role: "ul" prefix mode and session-wide persistent UL mode controller
 * why: Enables efficient execution with flexible phase counts and conditional reviewer quality gates
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, docs/extensions.md
 * public_api: Extension init function via `registerExtension`
 * invariants: UL_PREFIX must match start of command for prefix activation; state flags reflect actual execution history
 * side_effects: Updates `ul-mode-state` entry in session history; modifies UI status label
 * failure_modes: Reviewer skip occurs if task length threshold misconfigured; status update may fail if UI context missing
 * @abdd.explain
 * overview: Prefix-triggered mode ("ul") or persistent mode for adaptive orchestration and delegation
 * what_it_does:
 *   - Activates UL mode on "ul" prefix or persistent state
 *   - Delegates tasks to subagents or agent teams (researcher, architect, implementer)
 *   - Skips reviewer phase for trivial tasks based on patterns or length
 *   - Throttles UI status updates to reduce overhead
 * why_it_exists:
 *   - Provide high-quality execution with flexible LLM-driven phase counts
 *   - Reduce overhead on small tasks via conditional reviewer gating
 *   - Maintain session-wide state for complex workflows
 * scope:
 *   in: User text input, execution tool usage (subagent_run, agent_team_run), environment variables
 *   out: Tool invocations, UI status updates, session history entries
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

// 適応的スロットリング用の定数と状態
const MIN_REFRESH_STATUS_THROTTLE_MS = 100;
const MAX_REFRESH_STATUS_THROTTLE_MS = 1000;
const LOW_LOAD_THRESHOLD = 2;
const HIGH_LOAD_THRESHOLD = 8;

let lastRefreshStatusMs = 0;
let adaptiveThrottleMs = MIN_REFRESH_STATUS_THROTTLE_MS;
let cachedRuntimeSnapshot: { totalActiveLlm: number; limits: { maxTotalActiveLlm: number } } | null = null;
let lastSnapshotTime = 0;
const SNAPSHOT_CACHE_TTL_MS = 50;  // 50ms間スナップショットをキャッシュ

/**
 * ランタイムスナップショットを取得（キャッシュ付き）
 * getRuntimeSnapshot() の呼び出しコストを削減するため、短期間はキャッシュを返す
 */
function getCachedRuntimeSnapshot(): { totalActiveLlm: number; limits: { maxTotalActiveLlm: number } } {
  const now = Date.now();
  if (cachedRuntimeSnapshot && (now - lastSnapshotTime) < SNAPSHOT_CACHE_TTL_MS) {
    return cachedRuntimeSnapshot;
  }

  // Dynamic import to avoid circular dependency
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRuntimeSnapshot } = require("./agent-runtime") as typeof import("./agent-runtime");
    const snapshot = getRuntimeSnapshot();
    cachedRuntimeSnapshot = {
      totalActiveLlm: snapshot.totalActiveLlm,
      limits: {
        maxTotalActiveLlm: snapshot.limits.maxTotalActiveLlm,
      },
    };
    lastSnapshotTime = now;
    return cachedRuntimeSnapshot;
  } catch {
    // Fallback if getRuntimeSnapshot is not available
    return {
      totalActiveLlm: 0,
      limits: { maxTotalActiveLlm: 10 },
    };
  }
}

/**
 * 負荷に応じた適応的スロットリング間隔を計算する
 * 低負荷時は最小間隔、高負荷時は最大間隔、中間は線形補間
 */
function getAdaptiveThrottleMs(): number {
  const snapshot = getCachedRuntimeSnapshot();
  const activeLlm = snapshot.totalActiveLlm;
  const maxLlm = snapshot.limits.maxTotalActiveLlm;

  if (maxLlm <= 0) {
    return MIN_REFRESH_STATUS_THROTTLE_MS;
  }

  if (activeLlm < LOW_LOAD_THRESHOLD) {
    return MIN_REFRESH_STATUS_THROTTLE_MS;
  }

  if (activeLlm > HIGH_LOAD_THRESHOLD) {
    return MAX_REFRESH_STATUS_THROTTLE_MS;
  }

  const load = activeLlm / maxLlm;
  return Math.min(
    MAX_REFRESH_STATUS_THROTTLE_MS,
    Math.max(
      MIN_REFRESH_STATUS_THROTTLE_MS,
      Math.trunc(MIN_REFRESH_STATUS_THROTTLE_MS + load * (MAX_REFRESH_STATUS_THROTTLE_MS - MIN_REFRESH_STATUS_THROTTLE_MS))
    )
  );
}

/**
 * 適応的スロットリング付きのrefreshStatus。
 * 負荷に応じてスロットリング間隔を動的に調整し、UI更新のオーバーヘッドを削減する。
 */
function refreshStatusThrottled(ctx: any): void {
  const now = Date.now();
  adaptiveThrottleMs = getAdaptiveThrottleMs();

  if (now - lastRefreshStatusMs < adaptiveThrottleMs) {
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

// ポリシーキャッシュ（4通りの組み合わせのみ、防御的に上限設定）
const MAX_UL_POLICY_CACHE_ENTRIES = 10;
const ulPolicyCache = new Map<string, string>();

/**
 * LRUキャッシュの実装
 * アクセス順序を管理し、上限超過時に最も古いエントリを削除
 */
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; lastAccess: number }>();
  private accessOrder: K[] = [];

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // アクセス順序を更新
    entry.lastAccess = Date.now();
    this.updateAccessOrder(key);

    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.updateAccessOrder(key);
    } else {
      this.accessOrder.push(key);
    }

    this.cache.set(key, { value, lastAccess: Date.now() });

    // 上限超過時は最も古いエントリを削除
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }
}

// ポリシーキャッシュをLRU化（従来のMapから移行）
const ulPolicyLRUCache = new LRUCache<string, string>(MAX_UL_POLICY_CACHE_ENTRIES);

function safeCacheSet(key: string, value: string): void {
  ulPolicyLRUCache.set(key, value);
}

function getUlPolicy(sessionWide: boolean, goalLoopMode: boolean): string {
  const key = `${sessionWide}:${goalLoopMode}`;
  const cached = ulPolicyLRUCache.get(key);
  if (cached) return cached;

  const policy = buildUlPolicyString(sessionWide, goalLoopMode);
  safeCacheSet(key, policy);
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
 * トークン効率的な内部通信フォーマット
 * エージェント間通信では英語・構造化フォーマットを使用し、トークン消費を削減する
 */
export const TOKEN_EFFICIENT_FORMAT = `
OUTPUT MODE: INTERNAL
- Language: English for all inter-agent communication
- Format: [CLAIM] 1-sentence | [EVIDENCE] - item (file:line) | [CONFIDENCE] 0.0-1.0 | [ACTION] next|done
- Max: 300 tokens per response
- Japanese only for final user-facing synthesis
`;

/**
 * タスクにトークン効率化コンテキストを追加する
 * @summary トークン効率化コンテキスト追加
 * @param task - 元のタスク
 * @param isInternal - 内部通信かどうか
 * @returns 拡張されたタスク
 */
export function enhanceTaskWithTokenEfficiency(
  task: string,
  isInternal: boolean = true,
): string {
  if (!isInternal) {
    return task;
  }

  return `${task}

${TOKEN_EFFICIENT_FORMAT}`;
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

  // サブコマンドパターン
  const UL_SUBCOMMANDS = {
    fast: /^\s*ul\s+fast\s+/i,
    workflow: /^\s*ul\s+workflow\s+/i,
    status: /^\s*ul\s+status\s*$/i,
    approve: /^\s*ul\s+approve\s*$/i,
    annotate: /^\s*ul\s+annotate\s*$/i,
    abort: /^\s*ul\s+abort\s*$/i,
    resume: /^\s*ul\s+resume\s+/i,
  };

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

    // サブコマンド判定
    const transformed = extractTextWithoutUlPrefix(rawText);
    if (!transformed.trim()) {
      state.pendingUlMode = false;
      state.pendingGoalLoopMode = false;
      if (ctx?.hasUI && ctx?.ui) {
        ctx.ui.notify("`ul` の後に実行内容を入力してください。\n使い方: ul <task> | ul fast <task> | ul status | ul approve | ul annotate | ul abort", "warning");
      }
      return { action: "handled" as const };
    }

    // ul fast <task> → 既存の委任モード
    if (UL_SUBCOMMANDS.fast.test(rawText)) {
      const task = rawText.replace(UL_SUBCOMMANDS.fast, "").trim();
      state.pendingUlMode = true;
      state.pendingGoalLoopMode = looksLikeClearGoalTask(task);
      state.currentTask = task;
      
      if (ctx?.hasUI && ctx?.ui) {
        ctx.ui.notify("UL Fast モード: 委任優先で実行します。", "info");
      }
      
      return {
        action: "transform" as const,
        text: buildUlTransformedInput(task, state.pendingGoalLoopMode),
      };
    }

    // ul workflow <task> または ul <task> → ワークフローモード
    let taskText = transformed;
    if (UL_SUBCOMMANDS.workflow.test(rawText)) {
      taskText = rawText.replace(UL_SUBCOMMANDS.workflow, "").trim();
    }
    
    // コマンド系（status, approve, annotate, abort）
    if (UL_SUBCOMMANDS.status.test(rawText)) {
      return {
        action: "transform" as const,
        text: `以下のツールを呼び出してワークフローのステータスを表示してください:

\`\`\`json
{ "tool": "ul_workflow_status", "arguments": {} }
\`\`\`

ステータスを確認し、ユーザーに結果を報告してください。`,
      };
    }

    if (UL_SUBCOMMANDS.approve.test(rawText)) {
      // 現在のフェーズに応じた質問を生成
      const questionText = `現在のフェーズを承認して次に進みますか？`;
      
      return {
        action: "transform" as const,
        text: `まず、以下の質問を使ってユーザーに確認してください:

\`\`\`json
{ "tool": "question", "arguments": { "questions": [{ "question": "${questionText}", "header": "承認確認", "options": [{ "label": "Yes", "description": "承認して次のフェーズへ" }, { "label": "No", "description": "キャンセル" }] }] } }
\`\`\`

ユーザーが「Yes」を選択した場合のみ、以下のツールを呼び出してください:

\`\`\`json
{ "tool": "ul_workflow_approve", "arguments": {} }
\`\`\`

承認結果をユーザーに報告してください。`,
      };
    }

    if (UL_SUBCOMMANDS.annotate.test(rawText)) {
      return {
        action: "transform" as const,
        text: `まず、以下の質問を使ってユーザーに確認してください:

\`\`\`json
{ "tool": "question", "arguments": { "questions": [{ "question": "plan.mdの注釈を適用しますか？", "header": "注釈適用", "options": [{ "label": "Yes", "description": "注釈を検出・適用" }, { "label": "No", "description": "キャンセル" }] }] } }
\`\`\`

ユーザーが「Yes」を選択した場合のみ、以下のツールを呼び出してください:

\`\`\`json
{ "tool": "ul_workflow_annotate", "arguments": {} }
\`\`\`

注釈の検出結果をユーザーに報告してください。`,
      };
    }

    if (UL_SUBCOMMANDS.abort.test(rawText)) {
      return {
        action: "transform" as const,
        text: `まず、以下の質問を使ってユーザーに確認してください:

\`\`\`json
{ "tool": "question", "arguments": { "questions": [{ "question": "本当にワークフローを中止しますか？\\n中止すると、現在の進捗が中断されます。", "header": "中止確認", "options": [{ "label": "Yes", "description": "中止する" }, { "label": "No", "description": "キャンセル" }] }] } }
\`\`\`

ユーザーが「Yes」を選択した場合のみ、以下のツールを呼び出してください:

\`\`\`json
{ "tool": "ul_workflow_abort", "arguments": {} }
\`\`\`

中止結果をユーザーに報告してください。`,
      };
    }

    if (UL_SUBCOMMANDS.resume.test(rawText)) {
      const taskId = rawText.replace(UL_SUBCOMMANDS.resume, "").trim();
      return {
        action: "transform" as const,
        text: `以下のツールを呼び出してワークフローを再開してください:

\`\`\`json
{ "tool": "ul_workflow_resume", "arguments": { "task_id": "${taskId}" } }
\`\`\`

再開結果をユーザーに報告してください。`,
      };
    }

    // デフォルト: ul <task> → ワークフローモード
    state.pendingUlMode = false;  // ワークフローモードでは委任モードを使わない
    state.pendingGoalLoopMode = false;
    state.currentTask = taskText;

    if (ctx?.hasUI && ctx?.ui) {
      ctx.ui.notify("UL Workflow モード: Research-Plan-Annotate-Implement ワークフローを開始します。", "info");
    }

    return {
      action: "transform" as const,
      text: `まず、以下の質問を使ってユーザーに確認してください:

\`\`\`json
{ "tool": "question", "arguments": { "questions": [{ "question": "以下のタスクでResearch-Plan-Annotate-Implementワークフローを開始しますか？\\n\\nタスク: ${taskText.replace(/"/g, '\\"')}\\n\\nワークフローのフェーズ:\\n1. RESEARCH: コードベースの調査\\n2. PLAN: 実装計画の作成\\n3. ANNOTATE: ユーザーによる計画レビュー\\n4. IMPLEMENT: コード実装", "header": "ワークフロー開始", "options": [{ "label": "Yes", "description": "ワークフローを開始" }, { "label": "No", "description": "キャンセル" }] }] } }
\`\`\`

ユーザーが「Yes」を選択した場合のみ、以下のツールを呼び出してください:

\`\`\`json
{ "tool": "ul_workflow_start", "arguments": { "task": "${taskText.replace(/"/g, '\\"')}" } }
\`\`\`

ワークフローが開始されたら、次のステップを指示通りに実行してください:
1. ul_workflow_research で調査フェーズを実行
2. ul_workflow_approve で調査を承認（ユーザー確認必須）
3. ul_workflow_plan で計画フェーズを実行
4. ul_workflow_approve で計画を承認（ユーザー確認必須）
5. plan.mdに注釈を追加（ユーザーが行う）
6. ul_workflow_annotate で注釈を適用（ユーザー確認必須）
7. ul_workflow_approve で注釈フェーズを承認（ユーザー確認必須）
8. ul_workflow_implement で実装フェーズを実行
9. ul_workflow_approve で完了

各ステップでユーザーに進捗を報告し、承認を求めてください。`,
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
