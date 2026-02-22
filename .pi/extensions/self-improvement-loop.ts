/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-loop.ts
 * role: 7つの哲学的視座に基づく自己改善ループモードを提供する拡張機能
 * why: エージェントが継続的に自己改善を行い、認知バイアスを検出し、批判的思考を実践するため
 * related: .pi/skills/self-improvement/SKILL.md, .pi/extensions/loop.ts, .pi/lib/semantic-repetition.ts
 * public_api: self_improvement_loop ツール、self_improvement_stop ツール、self_improvement_status ツール、停止信号管理、ログ生成
 * invariants: ユーザー停止信号は即座に尊重、各サイクル完了時にGit管理を実施、セマンティック反復検出で停滞を防止、未完了タスクは安全に終了
 * side_effects: ファイルシステムへのログ書き込み、Git操作、ファイル編集、埋め込みAPI呼び出し（停滞検出時）
 * failure_modes: 停止信号の検出遅延、Gitコンフリクト、リソース枯渇、埋め込みAPI利用不可時の停滞検出無効化
 * @abdd.explain
 * overview: 7つの哲学的視座（脱構築、スキゾ分析、幸福論、ユートピア/ディストピア論、思考哲学、思考分類学、論理学）を統合的に適用し、終わりなき自己改善を実践する
 * what_it_does:
 *   - 各サイクルで7つの視座を統合的に適用し、自己分析と改善を実施
 *   - セマンティック反復検出により停滞を自動検出して早期停止
 *   - ユーザーからの停止要求を検出し、現在のタスクを完了してから安全に停止
 *   - 各サイクル完了時にGitコミットを作成
 *   - 作業ログをMarkdown形式で自動生成
 * why_it_exists:
 *   - エージェントが単なるタスク実行者を超え、自己批判的で成長し続ける存在になるため
 *   - 認知バイアスの検出と是正を自動化するため
 *   - 哲学的深度を持った思考プロセスを維持するため
 *   - 無限ループに陥ることを防ぐため
 * scope:
 *   in: ユーザーの初期タスク、停止信号、自己改善スキル定義
 *   out: 改善されたコード/ドキュメント、Git履歴、作業ログ、分析レポート、軌跡統計
 */

// File: .pi/extensions/self-improvement-loop.ts
// Description: Self-improvement loop mode based on 7 philosophical perspectives.
// Why: Enables continuous self-improvement through deconstruction, schizoanalysis, and critical thinking.
// Related: .pi/skills/self-improvement/SKILL.md, .pi/extensions/loop.ts

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatDurationMs, formatClockTime } from "../lib/format-utils.js";
import { toErrorMessage } from "../lib/error-utils.js";
import { ThinkingLevel } from "../lib/agent-types.js";
import { computeModelTimeoutMs } from "../lib/model-timeouts.js";
import { callModelViaPi as sharedCallModelViaPi } from "./shared/pi-print-executor.js";
import {
  detectSemanticRepetition,
  TrajectoryTracker,
  getRecommendedAction,
  type SemanticRepetitionResult,
} from "../lib/semantic-repetition.js";
import {
  retryWithBackoff,
  extractRetryStatusCode,
  isRetryableError,
  type RetryWithBackoffOverrides,
} from "../lib/retry-with-backoff.js";
import {
  record429,
  recordSuccess,
  getSchedulerAwareLimit,
  getPredictiveAnalysis,
  isRateLimitError as isAdaptiveRateLimitError,
  getCombinedRateControlSummary,
} from "../lib/adaptive-rate-controller.js";

// ============================================================================
// 型定義
// ============================================================================

/** 429エラー対応設定（環境変数でオーバーライド可能） */
interface RateLimitConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: "full" | "partial" | "none";
  maxRateLimitRetries: number;
  maxRateLimitWaitMs: number;
  minCycleIntervalMs: number;
  maxCycleIntervalMs: number;
  perspectiveDelayMs: number;
  high429Threshold: number;
}

/** 環境変数から設定を読み込む */
function loadRateLimitConfig(): RateLimitConfig {
  const parseIntEnv = (key: string, defaultValue: number, min?: number, max?: number): number => {
    const val = process.env[key];
    if (!val) return defaultValue;
    const parsed = parseInt(val, 10);
    if (!Number.isFinite(parsed)) return defaultValue;
    if (min !== undefined && parsed < min) return defaultValue;
    if (max !== undefined && parsed > max) return defaultValue;
    return parsed;
  };

  const parseJitterEnv = (key: string, defaultValue: "full" | "partial" | "none"): "full" | "partial" | "none" => {
    const val = process.env[key]?.toLowerCase();
    if (val === "full" || val === "partial" || val === "none") return val;
    return defaultValue;
  };

  return {
    maxRetries: parseIntEnv("PI_SELF_IMPROVEMENT_MAX_RETRIES", 3, 0, 10),
    initialDelayMs: parseIntEnv("PI_SELF_IMPROVEMENT_INITIAL_DELAY_MS", 2000, 100, 60000),
    maxDelayMs: parseIntEnv("PI_SELF_IMPROVEMENT_MAX_DELAY_MS", 30000, 1000, 300000),
    multiplier: parseIntEnv("PI_SELF_IMPROVEMENT_MULTIPLIER", 2, 1, 10),
    jitter: parseJitterEnv("PI_SELF_IMPROVEMENT_JITTER", "partial"),
    maxRateLimitRetries: parseIntEnv("PI_SELF_IMPROVEMENT_MAX_RATE_LIMIT_RETRIES", 5, 0, 20),
    maxRateLimitWaitMs: parseIntEnv("PI_SELF_IMPROVEMENT_MAX_RATE_LIMIT_WAIT_MS", 60000, 1000, 300000),
    minCycleIntervalMs: parseIntEnv("PI_SELF_IMPROVEMENT_MIN_CYCLE_INTERVAL_MS", 3000, 0, 60000),
    maxCycleIntervalMs: parseIntEnv("PI_SELF_IMPROVEMENT_MAX_CYCLE_INTERVAL_MS", 60000, 1000, 300000),
    perspectiveDelayMs: parseIntEnv("PI_SELF_IMPROVEMENT_PERSPECTIVE_DELAY_MS", 500, 0, 10000),
    high429Threshold: parseIntEnv("PI_SELF_IMPROVEMENT_HIGH_429_THRESHOLD", 30, 0, 100) / 100,
  };
}

// 設定を一度だけ読み込む（モジュール初期化時）
const RATE_LIMIT_CONFIG = loadRateLimitConfig();

/** 7つの哲学的視座 */
type PerspectiveName =
  | "deconstruction"       // 脱構築
  | "schizoanalysis"       // スキゾ分析
  | "eudaimonia"          // 幸福論
  | "utopia_dystopia"     // ユートピア/ディストピア論
  | "thinking_philosophy"  // 思考哲学
  | "thinking_taxonomy"    // 思考分類学
  | "logic";               // 論理学

/** 視座の状態 */
interface PerspectiveState {
  name: PerspectiveName;
  displayName: string;
  description: string;
  lastAppliedAt: string | null;
  findings: string[];
  questions: string[];
  improvements: string[];
  score: number; // 0-1
}

/** ループ全体の状態 */
interface SelfImprovementLoopState {
  runId: string;
  startedAt: string;
  task: string;
  currentCycle: number;
  currentPerspectiveIndex: number;
  perspectiveStates: PerspectiveState[];
  stopRequested: boolean;
  stopReason: "user_request" | "completed" | "error" | "stagnation" | null;
  lastCommitHash: string | null;
  lastUpdatedAt: string;
  totalImprovements: number;
  summary: string;
}

/** サイクルの実行結果 */
interface CycleResult {
  cycleNumber: number;
  perspectiveResults: PerspectiveResult[];
  improvements: string[];
  commitHash: string | null;
  summary: string;
  shouldContinue: boolean;
  stopReason: SelfImprovementLoopState["stopReason"];
}

/** 個別視座の実行結果 */
interface PerspectiveResult {
  perspective: PerspectiveName;
  findings: string[];
  questions: string[];
  improvements: string[];
  score: number;
  output: string;
}

/** 設定 */
interface SelfImprovementLoopConfig {
  /** 最大サイクル数（デフォルト: 無制限 = Infinity） */
  maxCycles?: number;
  /** 停止信号ファイルのパス */
  stopSignalPath?: string;
  /** 作業ログディレクトリ */
  logDir?: string;
  /** 自動コミットを有効にするか */
  autoCommit?: boolean;
  /** 停滞検出のしきい値（0-1） */
  stagnationThreshold?: number;
  /** 連続停滞回数の上限 */
  maxStagnationCount?: number;
}

/** ツールパラメータ */
interface SelfImprovementLoopParams {
  task: string;
  max_cycles?: number;
  auto_commit?: boolean;
}

interface SelfImprovementModel {
  provider: string;
  id: string;
  thinkingLevel: ThinkingLevel;
}

/** 自律ループ実行中のランタイム状態 */
interface ActiveAutonomousRun {
  runId: string;
  task: string;
  startedAt: string;
  maxCycles: number;
  autoCommit: boolean;
  cycle: number;
  inFlightCycle: number | null;
  stopRequested: boolean;
  stopReason: SelfImprovementLoopState["stopReason"];
  logPath: string;
  model: SelfImprovementModel;
  lastCommitHash: string | null;
  /** セマンティック反復検出用トラッカー */
  trajectoryTracker: TrajectoryTracker;
  /** 過去のサイクル出力サマリー（停滞検出用） */
  cycleSummaries: string[];
  /** 視座スコアの履歴 */
  perspectiveScoreHistory: ParsedPerspectiveScores[];
}

// ============================================================================
// 定数
// ============================================================================

const PERSPECTIVES: { name: PerspectiveName; displayName: string; description: string }[] = [
  {
    name: "deconstruction",
    displayName: "脱構築",
    description: "二項対立の暴露、固定観念の問題化、アポリアの認識",
  },
  {
    name: "schizoanalysis",
    displayName: "スキゾ分析",
    description: "欲望-生産の分析、内なるファシズムの検出、脱領土化の実践",
  },
  {
    name: "eudaimonia",
    displayName: "幸福論",
    description: "「善き生」の再定義、価値基準の明示、自己克服の実践",
  },
  {
    name: "utopia_dystopia",
    displayName: "ユートピア/ディストピア論",
    description: "世界観の批判的評価、ディストピア的傾向の検出、開かれたシステムの維持",
  },
  {
    name: "thinking_philosophy",
    displayName: "思考哲学",
    description: "メタ認知の実践、思考の性質の自覚、批判的思考の適用",
  },
  {
    name: "thinking_taxonomy",
    displayName: "思考分類学",
    description: "適切な思考モードの選択、思考レパートリーの拡張",
  },
  {
    name: "logic",
    displayName: "論理学",
    description: "論理的整合性の確認、誤謬の検出と回避、推論の正当化",
  },
];

const DEFAULT_CONFIG: Required<SelfImprovementLoopConfig> = {
  maxCycles: Infinity,
  stopSignalPath: ".pi/self-improvement-loop/stop-signal",
  logDir: ".pi/self-improvement-loop",
  autoCommit: true,
  stagnationThreshold: 0.85,
  maxStagnationCount: 3,
};

const DEFAULT_MODEL: SelfImprovementModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-20250514",
  thinkingLevel: "medium" as ThinkingLevel,
};

/** git-workflowスキルのパス */
const GIT_WORKFLOW_SKILL_PATH = ".pi/skills/git-workflow/SKILL.md";

/** self-improvementスキルのパス */
const SELF_IMPROVEMENT_SKILL_PATH = ".pi/skills/self-improvement/SKILL.md";

/** スキル内容のキャッシュ */
let cachedGitWorkflowSkill: string | null = null;
let cachedSelfImprovementSkill: string | null = null;

const LOOP_MARKER_PREFIX = "[[SELF_IMPROVEMENT_LOOP";

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * git-workflowスキルを読み込む
 * キャッシュ機能付きで、複数回呼び出し時はキャッシュを返す
 */
function loadGitWorkflowSkill(): string {
  if (cachedGitWorkflowSkill) {
    return cachedGitWorkflowSkill;
  }

  const skillPath = resolve(process.cwd(), GIT_WORKFLOW_SKILL_PATH);
  if (!existsSync(skillPath)) {
    console.warn(`[self-improvement-loop] git-workflow skill not found at ${skillPath}`);
    return "";
  }

  try {
    cachedGitWorkflowSkill = readFileSync(skillPath, "utf-8");
    console.log(`[self-improvement-loop] Loaded git-workflow skill (${cachedGitWorkflowSkill.length} bytes)`);
    return cachedGitWorkflowSkill;
  } catch (error) {
    console.warn(`[self-improvement-loop] Failed to load git-workflow skill: ${toErrorMessage(error)}`);
    return "";
  }
}

/**
 * self-improvementスキルを読み込む
 * キャッシュ機能付きで、複数回呼び出し時はキャッシュを返す
 */
function loadSelfImprovementSkill(): string {
  if (cachedSelfImprovementSkill) {
    return cachedSelfImprovementSkill;
  }

  const skillPath = resolve(process.cwd(), SELF_IMPROVEMENT_SKILL_PATH);
  if (!existsSync(skillPath)) {
    console.warn(`[self-improvement-loop] self-improvement skill not found at ${skillPath}`);
    return "";
  }

  try {
    cachedSelfImprovementSkill = readFileSync(skillPath, "utf-8");
    console.log(`[self-improvement-loop] Loaded self-improvement skill (${cachedSelfImprovementSkill.length} bytes)`);
    return cachedSelfImprovementSkill;
  } catch (error) {
    console.warn(`[self-improvement-loop] Failed to load self-improvement skill: ${toErrorMessage(error)}`);
    return "";
  }
}

/**
 * self-improvementスキルから7つの視座の説明セクションを抽出する
 */
function extractPerspectivesSection(skillContent: string): string {
  // "## 7つの哲学的視座" から次の "## " までを抽出
  const startIndex = skillContent.indexOf("## 7つの哲学的視座");
  if (startIndex === -1) {
    return "";
  }

  const nextSectionStart = skillContent.indexOf("\n## ", startIndex + 10);
  if (nextSectionStart === -1) {
    return skillContent.slice(startIndex);
  }

  return skillContent.slice(startIndex, nextSectionStart);
}

/**
 * self-improvementスキルから自己点検チェックリストを抽出する
 */
function extractChecklistSection(skillContent: string): string {
  // "## 自己点検チェックリスト" または "### 自己点検チェックリスト" を探す
  const patterns = ["## 自己点検チェックリスト", "### 自己点検チェックリスト", "## 自己点検", "### 自己点検"];
  
  for (const pattern of patterns) {
    const startIndex = skillContent.indexOf(pattern);
    if (startIndex !== -1) {
      const nextSectionStart = skillContent.indexOf("\n## ", startIndex + pattern.length);
      if (nextSectionStart === -1) {
        return skillContent.slice(startIndex);
      }
      return skillContent.slice(startIndex, nextSectionStart);
    }
  }

  return "";
}

/**
 * 変更差分の詳細を取得する
 * コミットメッセージ生成のために変更内容を分析する
 */
async function getDiffSummary(cwd: string): Promise<{ stats: string; changes: string }> {
  // 統計情報
  const statsResult = await runGitCommand(["diff", "--stat"], cwd);
  const stats = statsResult.stdout.trim();

  // 変更内容のサマリー（最初の100行程度）
  const diffResult = await runGitCommand(["diff"], cwd);
  const diffLines = diffResult.stdout.split("\n").slice(0, 100);
  
  // ファイルごとの変更タイプを抽出
  const changesResult = await runGitCommand(["status", "--short"], cwd);
  const changes = changesResult.stdout.trim();

  return { stats, changes };
}

/**
 * LLMがgit-workflowスキルに準拠したコミットメッセージを生成する
 * 
 * スキル準拠ルール:
 * - 日本語で詳細に書く
 * - Body（本文）を必ず書く
 * - Type: feat, fix, docs, refactor, test, chore, perf, ci
 */
async function generateCommitMessage(
  cycleNumber: number,
  runId: string,
  taskSummary: string,
  diffSummary: { stats: string; changes: string },
  perspectiveResults: Array<{ perspective: string; score: number; improvements: string[] }>,
  model: SelfImprovementModel
): Promise<string> {
  // git-workflowスキルを読み込み
  const skillContent = loadGitWorkflowSkill();
  
  // スキルからコミットメッセージ規約セクションを抽出
  const commitGuideSection = skillContent.includes("## コミットメッセージ規約")
    ? skillContent.slice(
        skillContent.indexOf("## コミットメッセージ規約"),
        skillContent.indexOf("## ", skillContent.indexOf("## コミットメッセージ規約") + 10) !== -1
          ? skillContent.indexOf("## ", skillContent.indexOf("## コミットメッセージ規約") + 10)
          : skillContent.length
      )
    : "";

  const prompt = `あなたはgit-workflowスキルに準拠したコミットメッセージを生成するアシスタントです。
以下のルールと情報に基づいて、日本語でコミットメッセージを生成してください。

## git-workflowスキルのコミットメッセージ規約

${commitGuideSection || `
### 基本方針
- 絵文字は使用しない
- 日本語で詳細に書く（絶対必須）
- Body（本文）を必ず書く

### フォーマット
<Type>[(scope)]: <Title>

<Body>

### Type一覧
- feat: ユーザー向けの機能追加・変更
- fix: ユーザー向けの不具合修正
- docs: ドキュメント更新
- refactor: リファクタリング
- test: テストコード追加・修正
- chore: プロダクション影響のない修正
- perf: パフォーマンス改善
- ci: CI設定の変更

### タイトルのルール
- 現在形で書く
- 50文字以内
- 具体的に

### Bodyのルール（重要）
1. What（何を）: どのような変更をしたか
2. Why（なぜ）: なぜこの変更が必要だったか
3. How（どう）: どのように実装したか
4. テスト方法: どうテストしたか
5. 影響範囲: 他に影響する部分はあるか
`}

---

## 変更内容

### 変更統計
\`\`\`
${diffSummary.stats || "（変更なし）"}
\`\`\`

### 変更ファイル一覧
\`\`\`
${diffSummary.changes || "（なし）"}
\`\`\`

## 自己改善ループのコンテキスト

- サイクル番号: ${cycleNumber}
- 実行ID: ${runId}
- タスクサマリー: ${taskSummary}

### 視座別スコアと改善
${perspectiveResults.map(r => {
  const p = PERSPECTIVES.find(p => p.name === r.perspective);
  return `- ${p?.displayName ?? r.perspective}: ${(r.score * 100).toFixed(0)}%\n  改善: ${r.improvements.slice(0, 2).join(", ") || "なし"}`;
}).join("\n")}

---

## 指示

上記の情報に基づいて、git-workflowスキルに準拠したコミットメッセージを生成してください。
出力はコミットメッセージのみとしてください（コードブロックや説明文は不要）。

重要:
- Typeは変更内容に応じて適切に選択（自己改善による修正ならrefactorやfix、機能追加ならfeat）
- scopeは "self-improvement-loop" を使用
- 日本語で書く
- Bodyを必ず含める`;

  try {
    const generatedMessage = await callModel(prompt, model, 60000);
    return generatedMessage.trim();
  } catch (error) {
    console.warn(`[self-improvement-loop] Failed to generate commit message: ${toErrorMessage(error)}`);
    
    // フォールバック: 日本語のシンプルなメッセージ
    return `chore(self-improvement-loop): サイクル${cycleNumber}の自己改善を実施する

## 変更内容
自己改善ループのサイクル${cycleNumber}で実施した変更を反映する。

## コンテキスト
- 実行ID: ${runId}
- 視座スコア平均: ${perspectiveResults.length > 0 
    ? (perspectiveResults.reduce((sum, r) => sum + r.score, 0) / perspectiveResults.length * 100).toFixed(0) + "%"
    : "不明"}

runId: ${runId}`;
  }
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

function initializePerspectiveStates(): PerspectiveState[] {
  return PERSPECTIVES.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    lastAppliedAt: null,
    findings: [],
    questions: [],
    improvements: [],
    score: 0.5,
  }));
}

function initializeLoopState(task: string): SelfImprovementLoopState {
  return {
    runId: createRunId(),
    startedAt: new Date().toISOString(),
    task,
    currentCycle: 0,
    currentPerspectiveIndex: 0,
    perspectiveStates: initializePerspectiveStates(),
    stopRequested: false,
    stopReason: null,
    lastCommitHash: null,
    lastUpdatedAt: new Date().toISOString(),
    totalImprovements: 0,
    summary: "",
  };
}

function checkStopSignal(config: Required<SelfImprovementLoopConfig>): boolean {
  const stopPath = resolve(process.cwd(), config.stopSignalPath);
  if (existsSync(stopPath)) {
    try {
      const content = readFileSync(stopPath, "utf-8").trim();
      return content === "STOP" || content === "stop";
    } catch {
      return false;
    }
  }
  return false;
}

function clearStopSignal(config: Required<SelfImprovementLoopConfig>): void {
  const stopPath = resolve(process.cwd(), config.stopSignalPath);
  if (existsSync(stopPath)) {
    try {
      writeFileSync(stopPath, "", "utf-8");
    } catch {
      // ignore
    }
  }
}

function parseModelFromEnv(): Pick<SelfImprovementModel, "provider" | "id"> | null {
  const raw = process.env.PI_CURRENT_MODEL?.trim();
  if (!raw) return null;

  const parts = raw.split(":");
  if (parts.length !== 2) return null;

  const provider = parts[0]?.trim();
  const id = parts[1]?.trim();
  if (!provider || !id) return null;

  return { provider, id };
}

function resolveActiveModel(ctx?: unknown): SelfImprovementModel {
  const maybeCtx = ctx as { model?: { provider?: string; id?: string } } | undefined;
  const provider = maybeCtx?.model?.provider?.trim();
  const id = maybeCtx?.model?.id?.trim();
  if (provider && id) {
    return { provider, id, thinkingLevel: DEFAULT_MODEL.thinkingLevel };
  }

  const envModel = parseModelFromEnv();
  if (envModel) {
    return { ...envModel, thinkingLevel: DEFAULT_MODEL.thinkingLevel };
  }

  return DEFAULT_MODEL;
}

function buildLoopMarker(runId: string, cycle: number): string {
  return `${LOOP_MARKER_PREFIX}:${runId}:CYCLE:${cycle}]]`;
}

function parseLoopCycleMarker(text: string): { runId: string; cycle: number } | null {
  const match = text.match(/\[\[SELF_IMPROVEMENT_LOOP:([a-zA-Z0-9_-]+):CYCLE:(\d+)\]\]/);
  if (!match) return null;
  const cycle = Number.parseInt(match[2], 10);
  if (!Number.isFinite(cycle) || cycle < 1) return null;
  return { runId: match[1], cycle };
}

/** 視座スコア履歴と推奨アクションに基づいて戦略ヒントを生成 */
function generateStrategyHint(
  run: ActiveAutonomousRun,
  recommendedAction: "continue" | "pivot" | "early_stop"
): string | null {
  const history = run.perspectiveScoreHistory;
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  if (!latest) return null;

  // 最もスコアが低い視座を特定
  const scores: { name: string; score: number }[] = [
    { name: "脱構築", score: latest.deconstruction },
    { name: "スキゾ分析", score: latest.schizoanalysis },
    { name: "幸福論", score: latest.eudaimonia },
    { name: "ユートピア/ディストピア", score: latest.utopia_dystopia },
    { name: "思考哲学", score: latest.thinking_philosophy },
    { name: "思考分類学", score: latest.thinking_taxonomy },
    { name: "論理学", score: latest.logic },
  ];

  scores.sort((a, b) => a.score - b.score);
  const lowest = scores[0];
  const secondLowest = scores[1];

  let hint = "";

  if (recommendedAction === "pivot") {
    hint = `反復パターンを検知。アプローチを変更してください。「${lowest?.name ?? ''}」の視座（スコア: ${lowest?.score ?? 0}）を重点的に適用し、新しい視点から問題に取り組んでください。`;
  } else if (lowest && lowest.score < 50) {
    hint = `「${lowest.name}」の視座が弱い（スコア: ${lowest.score}）。この視座を強化し、${secondLowest ? `「${secondLowest.name}」（スコア: ${secondLowest.score}）と組み合わせて` : ''}深い分析を行ってください。`;
  } else if (latest.average < 60) {
    hint = `全体的な視座スコアが低い（平均: ${latest.average}）。7つの視座をバランスよく適用し、包括的な自己分析を行ってください。`;
  }

  return hint || null;
}

function buildAutonomousCyclePrompt(run: ActiveAutonomousRun, cycle: number): string {
  const marker = buildLoopMarker(run.runId, cycle);
  
  // 前回のサイクルからの学び
  const previousSummary = run.cycleSummaries.length > 0 
    ? `\n## 前回までの進捗\n${run.cycleSummaries.slice(-3).join('\n')}\n`
    : '';

  // 視座スコア履歴から戦略ヒントを生成
  let strategySection = '';
  if (run.perspectiveScoreHistory.length > 0) {
    const latest = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
    if (latest) {
      const trajectorySummary = run.trajectoryTracker.getSummary();
      const recommendedAction = getRecommendedAction(
        trajectorySummary.repetitionCount,
        trajectorySummary.totalSteps,
        trajectorySummary.isStuck
      );
      const hint = generateStrategyHint(run, recommendedAction);
      if (hint) {
        strategySection = `\n## 戦略的指示\n${hint}\n`;
      }
    }
  }

  // self-improvementスキルから視座の詳細説明を取得
  const skillContent = loadSelfImprovementSkill();
  const perspectivesSection = extractPerspectivesSection(skillContent);
  const checklistSection = extractChecklistSection(skillContent);

  // スキルに基づく視座の詳細（フォールバック付き）
  const perspectivesDetail = perspectivesSection 
    ? `\n${perspectivesSection}\n`
    : `
### I. 脱構築（Deconstruction）
- このタスクにおいて「当然」と前提していることは何か？
- どのような二項対立（成功/失敗、正解/不正解）を前提としているか？
- アポリア（解決不能な緊張関係）が存在するか？

### II. スキゾ分析（Schizoanalysis）
- 私は何を「生産」しようとしているか？（欠如ではなく生産）
- 内なるファシズム（自己監視・権力への服従）はないか？

### III. 幸福論（Eudaimonia）
- ユーザーを「喜ばせる」と真実を語ることで衝突していないか？
- 快楽主義（心地よい回答）に陥っていないか？

### IV. ユートピア/ディストピア
- どのような世界を創ろうとしているか？
- ユーザーを「最後の人間」にするか「自己超越的な主体」にするか？

### V. 思考哲学（Philosophy of Thought）
- メタ認知（思考についての思考）を実践しているか？
- 私の判断は「理解」に基づいているか、「パターンマッチング」か？

### VI. 思考分類学（Taxonomy of Thought）
- このタスクに適した思考モードを選択しているか？（創造的/分析的/批判的/実践的）
- システム1（直観）とシステム2（分析）を使い分けているか？

### VII. 論理学（Logic）
- この推論は妥当か？（前提が真なら結論も真か？）
- 誤謬（循環論法・虚假二分法など）を犯していないか？
`;

  // チェックリストセクション（あれば追加）
  const checklistAddition = checklistSection 
    ? `\n## 自己点検チェックリスト\n${checklistSection}\n`
    : '';

  return `${marker}

あなたは通常のコーディングエージェントとして動作してください。
以下のタスクを継続実行してください:
${run.task}
${previousSummary}${strategySection}
## 7つの哲学的視座による自己点検

このサイクルでは、self-improvementスキルに基づき、以下の7つの視座から自己点検を行ってください:

${perspectivesDetail}
${checklistAddition}
## 実行ルール
- 通常のエージェントと同じように、必要なツールを自由に使う
- 必要に応じて subagent_run / subagent_run_parallel を使う
- 必要に応じて agent_team_run / agent_team_run_parallel を使う
- 変更は実際にファイルへ反映し、必要ならテストまで実行する
- 自分の仮説を否定する証拠を最低1つ探すこと

## 出力形式

出力の最後に以下を必ず含める:
\`\`\`
CYCLE: ${cycle}
LOOP_STATUS: continue
NEXT_FOCUS: 次サイクルで最優先に進める内容を1-3行で要約
PERSPECTIVE_SCORES:
  脱構築: [0-100]
  スキゾ分析: [0-100]
  幸福論: [0-100]
  ユートピア/ディストピア: [0-100]
  思考哲学: [0-100]
  思考分類学: [0-100]
  論理学: [0-100]
\`\`\`
`;
}

/** 視座スコアのパース結果 */
interface ParsedPerspectiveScores {
  deconstruction: number;
  schizoanalysis: number;
  eudaimonia: number;
  utopia_dystopia: number;
  thinking_philosophy: number;
  thinking_taxonomy: number;
  logic: number;
  average: number;
}

/** LLM出力から視座スコアをパースする */
function parsePerspectiveScores(output: string): ParsedPerspectiveScores | null {
  const defaults: ParsedPerspectiveScores = {
    deconstruction: 50,
    schizoanalysis: 50,
    eudaimonia: 50,
    utopia_dystopia: 50,
    thinking_philosophy: 50,
    thinking_taxonomy: 50,
    logic: 50,
    average: 50,
  };

  // PERSPECTIVE_SCORESセクションを探す
  const scoresMatch = output.match(/PERSPECTIVE_SCORES:\s*([\s\S]*?)(?=\n```|\n## |$)/i);
  if (!scoresMatch) return null;

  const scoresText = scoresMatch[1];
  if (!scoresText) return null;

  const scores = { ...defaults };
  
  // 各視座のスコアを抽出
  const patterns: { key: keyof Omit<ParsedPerspectiveScores, 'average'>; patterns: string[] }[] = [
    { key: 'deconstruction', patterns: ['脱構築', 'deconstruction'] },
    { key: 'schizoanalysis', patterns: ['スキゾ分析', 'schizoanalysis'] },
    { key: 'eudaimonia', patterns: ['幸福論', 'eudaimonia'] },
    { key: 'utopia_dystopia', patterns: ['ユートピア/ディストピア', 'utopia', 'dystopia'] },
    { key: 'thinking_philosophy', patterns: ['思考哲学', 'philosophy'] },
    { key: 'thinking_taxonomy', patterns: ['思考分類学', 'taxonomy'] },
    { key: 'logic', patterns: ['論理学', 'logic'] },
  ];

  for (const { key, patterns: pats } of patterns) {
    for (const pat of pats) {
      const regex = new RegExp(`${pat}[:\\s]+(-?\\d{1,3})`, 'i');
      const match = scoresText.match(regex);
      if (match) {
        const val = Math.min(100, Math.max(0, parseInt(match[1], 10)));
        scores[key] = val;
        break;
      }
    }
  }

  // 7つの視座の平均を計算（average自体は含めない）
  const perspectiveValues = [
    scores.deconstruction,
    scores.schizoanalysis,
    scores.eudaimonia,
    scores.utopia_dystopia,
    scores.thinking_philosophy,
    scores.thinking_taxonomy,
    scores.logic,
  ];
  scores.average = Math.round(perspectiveValues.reduce((a, b) => a + b, 0) / perspectiveValues.length);

  return scores;
}

/** LLM出力からNEXT_FOCUSを抽出する */
function parseNextFocus(output: string): string | null {
  const match = output.match(/NEXT_FOCUS[:\s]+([\s\S]+?)(?=\n```|\n[A-Z_]+:|$)/i);
  return match ? match[1]?.trim() ?? null : null;
}

/** LLM出力からLOOP_STATUSを抽出する */
function parseLoopStatus(output: string): "continue" | "done" | null {
  const match = output.match(/LOOP_STATUS[:\s]+(continue|done)/i);
  return match ? (match[1]?.toLowerCase() as "continue" | "done") : null;
}

function appendAutonomousLoopLog(path: string, line: string): void {
  appendFileSync(path, `${line}\n`, "utf-8");
}

function initializeAutonomousLoopLog(path: string, run: ActiveAutonomousRun): void {
  const content = `# Self Improvement Autonomous Loop

- Run ID: ${run.runId}
- Started At: ${run.startedAt}
- Task: ${run.task}
- Max Cycles: ${run.maxCycles === Infinity ? "Infinity" : run.maxCycles}
- Auto Commit: ${run.autoCommit ? "true" : "false"}
- Model: ${run.model.provider}/${run.model.id}

## Timeline
`;
  writeFileSync(path, content, "utf-8");
}

function extractInputText(event: unknown): string {
  const maybeEvent = event as { text?: string };
  return typeof maybeEvent?.text === "string" ? maybeEvent.text : "";
}

async function runGitCommand(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", () => {
      resolve({ stdout: "", stderr: "Failed to spawn git process", code: 1 });
    });
  });
}

/**
 * 変更されたファイル一覧を取得する
 * git-workflowスキル準拠: 自分が編集したファイルのみをステージングするため
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  const result = await runGitCommand(["status", "--porcelain"], cwd);
  if (result.code !== 0) {
    return [];
  }

  const files: string[] = [];
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // XY PATH形式（X=インデックス、Y=作業ツリーの状態）
    // M = 修正、A = 追加、D = 削除、? = 未追跡
    const match = trimmed.match(/^[MADRC?!\s]{2}\s+(.+)$/);
    if (match && match[1]) {
      const filePath = match[1].trim();
      // リネームの場合は "old -> new" 形式になるので new を取得
      const actualPath = filePath.includes(" -> ") 
        ? filePath.split(" -> ")[1] 
        : filePath;
      if (actualPath) {
        files.push(actualPath);
      }
    }
  }

  return files;
}

/**
 * 除外すべきファイルパターン
 * git-workflowスキル準拠: 機密情報、ビルド成果物、キャッシュを除外
 */
const EXCLUDE_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /credentials/i,
  /secrets?\.json$/i,
  /node_modules\//,
  /dist\//,
  /build\//,
  /\.cache\//,
  /\.log$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

/**
 * ファイルがステージング対象かどうかを判定
 */
function shouldStageFile(filePath: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(filePath)) {
      console.log(`[self-improvement-loop] Excluding file from staging: ${filePath}`);
      return false;
    }
  }
  return true;
}

/**
 * git-workflowスキル準拠のコミット作成
 * 
 * ルール:
 * - git add -A / git add . は使用せず、変更ファイルを個別にステージング
 * - コミットメッセージは日本語
 * - 機密情報・ビルド成果物は除外
 */
async function createGitCommit(message: string, cwd: string): Promise<string | null> {
  try {
    // 変更ファイル一覧を取得
    const changedFiles = await getChangedFiles(cwd);
    
    if (changedFiles.length === 0) {
      console.log("[self-improvement-loop] No changes to commit");
      return null;
    }

    // 除外パターンを適用してステージング対象を絞り込み
    const filesToStage = changedFiles.filter(shouldStageFile);
    
    if (filesToStage.length === 0) {
      console.log("[self-improvement-loop] All changed files are excluded from staging");
      return null;
    }

    console.log(`[self-improvement-loop] Staging ${filesToStage.length} files: ${filesToStage.slice(0, 5).join(", ")}${filesToStage.length > 5 ? "..." : ""}`);

    // 個別にファイルをステージング（git add -A を使用しない）
    for (const file of filesToStage) {
      const addResult = await runGitCommand(["add", file], cwd);
      if (addResult.code !== 0) {
        console.warn(`[self-improvement-loop] Failed to stage ${file}: ${addResult.stderr}`);
      }
    }

    // ステージング内容を確認
    const stagedResult = await runGitCommand(["diff", "--staged", "--stat"], cwd);
    if (stagedResult.stdout.trim().length === 0) {
      console.log("[self-improvement-loop] No staged changes after filtering");
      return null;
    }

    // コミット作成
    const result = await runGitCommand(["commit", "-m", message], cwd);

    if (result.code === 0) {
      // コミットハッシュを取得
      const hashResult = await runGitCommand(["rev-parse", "HEAD"], cwd);
      const hash = hashResult.stdout.trim().slice(0, 7);
      console.log(`[self-improvement-loop] Commit created: ${hash}`);
      return hash;
    }

    // 変更なしエラー
    if (result.stderr.includes("nothing to commit")) {
      return null;
    }

    console.warn(`[self-improvement-loop] Git commit warning: ${result.stderr}`);
    return null;
  } catch (error) {
    console.error(`[self-improvement-loop] Git operation failed: ${toErrorMessage(error)}`);
    return null;
  }
}

/**
 * LLMがコミットメッセージを生成してコミットを作成する
 * git-workflowスキル準拠
 */
interface CommitContext {
  cycleNumber: number;
  runId: string;
  taskSummary: string;
  perspectiveResults: Array<{ perspective: string; score: number; improvements: string[] }>;
}

async function createGitCommitWithLLM(
  cwd: string,
  context: CommitContext,
  model: SelfImprovementModel
): Promise<{ hash: string | null; message: string }> {
  try {
    // 変更ファイル一覧を取得
    const changedFiles = await getChangedFiles(cwd);
    
    if (changedFiles.length === 0) {
      console.log("[self-improvement-loop] No changes to commit");
      return { hash: null, message: "" };
    }

    // 除外パターンを適用してステージング対象を絞り込み
    const filesToStage = changedFiles.filter(shouldStageFile);
    
    if (filesToStage.length === 0) {
      console.log("[self-improvement-loop] All changed files are excluded from staging");
      return { hash: null, message: "" };
    }

    console.log(`[self-improvement-loop] Staging ${filesToStage.length} files: ${filesToStage.slice(0, 5).join(", ")}${filesToStage.length > 5 ? "..." : ""}`);

    // 個別にファイルをステージング（git add -A を使用しない）
    for (const file of filesToStage) {
      const addResult = await runGitCommand(["add", file], cwd);
      if (addResult.code !== 0) {
        console.warn(`[self-improvement-loop] Failed to stage ${file}: ${addResult.stderr}`);
      }
    }

    // ステージング内容を確認
    const stagedResult = await runGitCommand(["diff", "--staged", "--stat"], cwd);
    if (stagedResult.stdout.trim().length === 0) {
      console.log("[self-improvement-loop] No staged changes after filtering");
      return { hash: null, message: "" };
    }

    // 変更差分を取得してLLMにコミットメッセージを生成させる
    const diffSummary = await getDiffSummary(cwd);
    const commitMessage = await generateCommitMessage(
      context.cycleNumber,
      context.runId,
      context.taskSummary,
      diffSummary,
      context.perspectiveResults,
      model
    );

    console.log(`[self-improvement-loop] Generated commit message:\n${commitMessage.split("\n")[0]}`);

    // コミット作成
    const result = await runGitCommand(["commit", "-m", commitMessage], cwd);

    if (result.code === 0) {
      // コミットハッシュを取得
      const hashResult = await runGitCommand(["rev-parse", "HEAD"], cwd);
      const hash = hashResult.stdout.trim().slice(0, 7);
      console.log(`[self-improvement-loop] Commit created: ${hash}`);
      return { hash, message: commitMessage };
    }

    // 変更なしエラー
    if (result.stderr.includes("nothing to commit")) {
      return { hash: null, message: "" };
    }

    console.warn(`[self-improvement-loop] Git commit warning: ${result.stderr}`);
    return { hash: null, message: commitMessage };
  } catch (error) {
    console.error(`[self-improvement-loop] Git operation failed: ${toErrorMessage(error)}`);
    return { hash: null, message: "" };
  }
}

function ensureLogDir(config: Required<SelfImprovementLoopConfig>): string {
  const logDir = resolve(process.cwd(), config.logDir);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function createLogFilePath(config: Required<SelfImprovementLoopConfig>, runId: string): string {
  const logDir = ensureLogDir(config);
  return join(logDir, `run-${runId}.md`);
}

function writeLogHeader(path: string, state: SelfImprovementLoopState): void {
  const header = `# 自己改善ループ実行ログ

## メタデータ

| 項目 | 値 |
|------|-----|
| 実行ID | ${state.runId} |
| 開始時刻 | ${state.startedAt} |
| 初期タスク | ${state.task} |
| 状態 | 実行中 |

## 7つの哲学的視座

| # | 視座 | 説明 |
|---|------|------|
| 1 | 脱構築 | 二項対立の暴露、固定観念の問題化 |
| 2 | スキゾ分析 | 欲望-生産の分析、内なるファシズム検出 |
| 3 | 幸福論 | 「善き生」の再定義、価値基準の明示 |
| 4 | ユートピア/ディストピア | 世界観の批判的評価 |
| 5 | 思考哲学 | メタ認知の実践、批判的思考 |
| 6 | 思考分類学 | 思考モードの選択、レパートリー拡張 |
| 7 | 論理学 | 推論の妥当性、誤謬の回避 |

---

## サイクルログ

`;
  writeFileSync(path, header, "utf-8");
}

function appendCycleLog(path: string, state: SelfImprovementLoopState, result: CycleResult): void {
  const timestamp = formatClockTime(Date.now());

  let content = `### サイクル ${result.cycleNumber}

**時刻**: ${timestamp}
**コミット**: ${result.commitHash ?? "なし（変更なし）"}

`;

  for (const pr of result.perspectiveResults) {
    const perspective = PERSPECTIVES.find((p) => p.name === pr.perspective);
    content += `#### ${perspective?.displayName ?? pr.perspective}

**スコア**: ${(pr.score * 100).toFixed(0)}%

**発見事項**:
${pr.findings.length > 0 ? pr.findings.map((f) => `- ${f}`).join("\n") : "（なし）"}

**問い**:
${pr.questions.length > 0 ? pr.questions.map((q) => `- ${q}`).join("\n") : "（なし）"}

**改善アクション**:
${pr.improvements.length > 0 ? pr.improvements.map((i) => `- ${i}`).join("\n") : "（なし）"}

`;
  }

  content += `**サイクルサマリー**: ${result.summary}

**継続判定**: ${result.shouldContinue ? "継続" : `停止（理由: ${result.stopReason ?? "不明"}）`}

---

`;

  appendFileSync(path, content, "utf-8");
}

function writeLogFooter(path: string, state: SelfImprovementLoopState): void {
  const footer = `

## 実行完了

| 項目 | 値 |
|------|-----|
| 終了時刻 | ${state.lastUpdatedAt} |
| 総サイクル数 | ${state.currentCycle} |
| 総改善数 | ${state.totalImprovements} |
| 停止理由 | ${state.stopReason ?? "完了"} |
| 最終コミット | ${state.lastCommitHash ?? "なし"} |

## 最終サマリー

${state.summary}

## 視座別最終スコア

| 視座 | スコア | 発見数 | 改善数 |
|------|--------|--------|--------|
${state.perspectiveStates.map((ps) => `| ${ps.displayName} | ${(ps.score * 100).toFixed(0)}% | ${ps.findings.length} | ${ps.improvements.length} |`).join("\n")}

---

*このログは自己改善ループモードによって自動生成されました。*
`;

  appendFileSync(path, footer, "utf-8");
}

function buildPerspectivePrompt(perspective: PerspectiveState, task: string, previousResults: PerspectiveResult[]): string {
  const perspectiveInfo = PERSPECTIVES.find((p) => p.name === perspective.name);
  const previousContext = previousResults.length > 0
    ? `\n\n## 前回の視座からの継続事項\n${previousResults.map((r) => `- ${PERSPECTIVES.find((p) => p.name === r.perspective)?.displayName}: ${r.findings.slice(0, 2).join(", ")}`).join("\n")}`
    : "";

  return `# ${perspectiveInfo?.displayName ?? perspective.name} - 自己分析プロンプト

## 現在のタスク
${task}

## この視座の役割
${perspectiveInfo?.description ?? perspective.description}
${previousContext}

## 分析指示

以下の形式で出力してください：

\`\`\`
FINDINGS:
- [発見した事項1]
- [発見した事項2]
...

QUESTIONS:
- [自問すべき問い1]
- [自問すべき問い2]
...

IMPROVEMENTS:
- [具体的な改善アクション1]
- [具体的な改善アクション2]
...

SCORE: [0-100の数値で現在の状態を評価]

SUMMARY: [1-2文の要約]
\`\`\`

## 注意事項
- 曖昧な表現（「適切に処理する」「必要に応じて」など）を避けてください
- 具体的で実行可能な改善を提案してください
- 自分の仮説を否定する証拠を最低1つ探してください
`;
}

/** 429エラー対応付きのリトライ設定（環境変数でオーバーライド可能） */
function getDefaultRetryConfig(): RetryWithBackoffOverrides {
  return {
    maxRetries: RATE_LIMIT_CONFIG.maxRetries,
    initialDelayMs: RATE_LIMIT_CONFIG.initialDelayMs,
    maxDelayMs: RATE_LIMIT_CONFIG.maxDelayMs,
    multiplier: RATE_LIMIT_CONFIG.multiplier,
    jitter: RATE_LIMIT_CONFIG.jitter,
  };
}

/** サイクル間の最小待機時間（ミリ秒）- 環境変数でオーバーライド可能 */
const MIN_CYCLE_INTERVAL_MS = RATE_LIMIT_CONFIG.minCycleIntervalMs;
/** サイクル間の最大待機時間（ミリ秒）- 環境変数でオーバーライド可能 */
const MAX_CYCLE_INTERVAL_MS = RATE_LIMIT_CONFIG.maxCycleIntervalMs;
/** 429確率が高いと判断する閾値 - 環境変数でオーバーライド可能 */
const HIGH_429_PROBABILITY_THRESHOLD = RATE_LIMIT_CONFIG.high429Threshold;

/**
 * 適応的サイクル間待機時間を計算する
 * 429確率とレート制限状態に基づいて動的に調整
 */
function computeAdaptiveCycleDelay(model: SelfImprovementModel): number {
  try {
    const summary = getCombinedRateControlSummary(model.provider, model.id);
    const analysis = getPredictiveAnalysis(model.provider, model.id);
    
    // ベース待機時間
    let delayMs = MIN_CYCLE_INTERVAL_MS;
    
    // 429確率が高い場合は待機時間を増加
    if (summary.shouldThrottle || analysis.predicted429Probability > HIGH_429_PROBABILITY_THRESHOLD) {
      const probabilityFactor = 1 + analysis.predicted429Probability * 3; // 最大4倍
      delayMs = Math.floor(delayMs * probabilityFactor);
      console.log(`[self-improvement-loop] High 429 probability (${(analysis.predicted429Probability * 100).toFixed(0)}%), increasing delay to ${delayMs}ms`);
    }
    
    // 連続429エラーがある場合はさらに増加
    if (summary.recent429Count > 0) {
      const penalty = Math.min(summary.recent429Count * 5000, 30000); // 1回につき5秒増、最大30秒
      delayMs += penalty;
      console.log(`[self-improvement-loop] Recent 429 count (${summary.recent429Count}), adding ${penalty}ms penalty`);
    }
    
    // 制限値が元より低い場合（回復中）は保守的に
    if (summary.adaptiveLimit < summary.originalLimit) {
      const limitRatio = summary.adaptiveLimit / summary.originalLimit;
      delayMs = Math.floor(delayMs / limitRatio); // 制限が低いほど待機を長く
    }
    
    return Math.min(delayMs, MAX_CYCLE_INTERVAL_MS);
  } catch (error) {
    // エラー時はデフォルト値を返す
    console.warn(`[self-improvement-loop] Failed to compute adaptive delay: ${toErrorMessage(error)}`);
    return MIN_CYCLE_INTERVAL_MS;
  }
}

/**
 * 指定ミリ秒待機する（AbortSignal対応）
 */
async function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  if (signal?.aborted) return;
  
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("Aborted during sleep"));
    };
    
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function callModel(
  prompt: string,
  model: SelfImprovementModel,
  baseTimeoutMs: number = 120000,
  signal?: AbortSignal,
  retryOverrides?: RetryWithBackoffOverrides
): Promise<string> {
  // モデルと思考レベルに応じたタイムアウトを計算
  const effectiveTimeoutMs = computeModelTimeoutMs(model.id, {
    userTimeoutMs: baseTimeoutMs,
    thinkingLevel: model.thinkingLevel,
  });

  // リトライ設定をマージ
  const retryConfig: RetryWithBackoffOverrides = {
    ...getDefaultRetryConfig(),
    ...retryOverrides,
  };

  console.log(`[self-improvement-loop] Calling model ${model.provider}/${model.id} with timeout ${effectiveTimeoutMs}ms (thinking: ${model.thinkingLevel})`);

  // retryWithBackoffでラップして429対応
  try {
    const result = await retryWithBackoff(
      async () => {
        const innerResult = await sharedCallModelViaPi({
          model: {
            provider: model.provider,
            id: model.id,
            thinkingLevel: model.thinkingLevel,
          },
          prompt,
          timeoutMs: effectiveTimeoutMs,
          signal,
          entityLabel: "self-improvement-loop",
        });
        
        // 成功時にadaptive-rate-controllerへ通知
        recordSuccess(model.provider, model.id);
        
        return innerResult;
      },
      {
        signal,
        overrides: retryConfig,
        rateLimitKey: `${model.provider}:${model.id}`,
        maxRateLimitRetries: 5, // 429エラー時は最大5回リトライ
        maxRateLimitWaitMs: 60000, // 最大60秒待機
        shouldRetry: (error: unknown, statusCode?: number) => {
          // 429エラーまたは5xxサーバーエラーはリトライ
          if (statusCode === 429) return true;
          if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) return true;
          // ネットワークエラーもリトライ
          if (isRetryableError(error) || isAdaptiveRateLimitError(error)) return true;
          // タイムアウトもリトライ
          const msg = toErrorMessage(error).toLowerCase();
          if (msg.includes("timeout") || msg.includes("etimedout")) return true;
          return false;
        },
        onRetry: (context) => {
          console.warn(`[self-improvement-loop] Retrying (${context.attempt}/${context.maxRetries}) after ${context.delayMs}ms, status=${context.statusCode}`);
          
          // 429エラー時にadaptive-rate-controllerへ通知
          if (context.statusCode === 429) {
            record429(model.provider, model.id, `Retry attempt ${context.attempt}`);
          }
        },
        onRateLimitWait: (context) => {
          console.log(`[self-improvement-loop] Rate limit gate: waiting ${context.waitMs}ms (hits=${context.hits}, key=${context.key})`);
        },
      }
    );
    
    console.log(`[self-improvement-loop] Model call succeeded, output length: ${result.length}`);
    return result;
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const statusCode = extractRetryStatusCode(error);
    
    // 429エラー時は特別なログ
    if (statusCode === 429 || isRetryableError(error)) {
      console.error(`[self-improvement-loop] Rate limit error (${model.provider}/${model.id}): ${errorMessage}`);
      record429(model.provider, model.id, errorMessage);
    } else {
      console.error(`[self-improvement-loop] Model call failed (${model.provider}/${model.id}): ${errorMessage}`);
    }
    
    throw error;
  }
}

// ============================================================================
// メインループ関数
// ============================================================================

async function runSelfImprovementLoop(
  task: string,
  config: Required<SelfImprovementLoopConfig>,
  model: SelfImprovementModel,
  signal?: AbortSignal
): Promise<SelfImprovementLoopState> {
  const state = initializeLoopState(task);

  // 作業ログファイルを作成
  const logPath = createLogFilePath(config, state.runId);
  writeLogHeader(logPath, state);

  console.log(`[self-improvement-loop] Started: runId=${state.runId}, task="${task.slice(0, 50)}..."`);

  let stagnationCount = 0;
  let previousScores: number[] = [];

  try {
    while (!state.stopRequested && state.currentCycle < config.maxCycles) {
      // 中断シグナルをチェック
      if (signal?.aborted) {
        state.stopRequested = true;
        state.stopReason = "user_request";
        console.log(`[self-improvement-loop] Abort signal detected: runId=${state.runId}`);
        break;
      }
      
      // 停止信号をチェック
      if (checkStopSignal(config)) {
        state.stopRequested = true;
        state.stopReason = "user_request";
        console.log(`[self-improvement-loop] Stop signal detected: runId=${state.runId}`);
        break;
      }

      state.currentCycle++;
      const cycleResult = await runCycle(state, config, model, signal);

      // 停滞検出
      const avgScore = cycleResult.perspectiveResults.reduce((sum, r) => sum + r.score, 0) / 7;
      previousScores.push(avgScore);

      if (previousScores.length > 3) {
        const recentScores = previousScores.slice(-3);
        const avgRecent = recentScores.reduce((a, b) => a + b, 0) / 3;
        const variance = recentScores.reduce((sum, s) => sum + Math.pow(s - avgRecent, 2), 0) / 3;

        if (variance < (1 - config.stagnationThreshold) * 0.1) {
          stagnationCount++;
          if (stagnationCount >= config.maxStagnationCount) {
            state.stopReason = "stagnation";
            console.log(`[self-improvement-loop] Stagnation detected: runId=${state.runId}`);
            break;
          }
        } else {
          stagnationCount = 0;
        }
      }

      // ログに記録
      appendCycleLog(logPath, state, cycleResult);

      // Git管理（LLMがコミットメッセージを生成）
      if (config.autoCommit && cycleResult.improvements.length > 0) {
        const { hash, message } = await createGitCommitWithLLM(
          process.cwd(),
          {
            cycleNumber: state.currentCycle,
            runId: state.runId,
            taskSummary: cycleResult.summary,
            perspectiveResults: cycleResult.perspectiveResults.map(r => ({
              perspective: r.perspective,
              score: r.score,
              improvements: r.improvements,
            })),
          },
          model
        );
        if (hash) {
          state.lastCommitHash = hash;
          cycleResult.commitHash = hash;
        }
      }

      // 状態を更新
      state.lastUpdatedAt = new Date().toISOString();
      state.totalImprovements += cycleResult.improvements.length;
      state.summary = cycleResult.summary;

      // 継続判定
      if (!cycleResult.shouldContinue) {
        state.stopReason = cycleResult.stopReason;
        break;
      }

      console.log(`[self-improvement-loop] Cycle ${state.currentCycle} completed. Score: ${(avgScore * 100).toFixed(0)}%`);
      
      // 適応的サイクル間待機（429エラー防止）
      if (state.currentCycle < config.maxCycles && !state.stopRequested) {
        const adaptiveDelayMs = computeAdaptiveCycleDelay(model);
        if (adaptiveDelayMs > 0) {
          console.log(`[self-improvement-loop] Waiting ${adaptiveDelayMs}ms before next cycle (adaptive throttling)`);
          await sleepWithAbort(adaptiveDelayMs, signal);
        }
      }
    }
  } catch (error) {
    if (toErrorMessage(error).includes("Aborted")) {
      state.stopRequested = true;
      state.stopReason = "user_request";
      console.log(`[self-improvement-loop] Aborted during cycle`);
    } else {
      state.stopReason = "error";
      console.error(`[self-improvement-loop] Error: ${toErrorMessage(error)}`);
    }
  }

  // 最終ログを記録
  writeLogFooter(logPath, state);
  clearStopSignal(config);

  console.log(`[self-improvement-loop] Finished: runId=${state.runId}, cycles=${state.currentCycle}, improvements=${state.totalImprovements}, stopReason=${state.stopReason}`);

  return state;
}

async function runCycle(
  state: SelfImprovementLoopState,
  config: Required<SelfImprovementLoopConfig>,
  model: SelfImprovementModel,
  signal?: AbortSignal
): Promise<CycleResult> {
  console.log(`[self-improvement-loop] runCycle START: cycle=${state.currentCycle}, model=${model.provider}/${model.id}`);
  
  const perspectiveResults: PerspectiveResult[] = [];
  const allImprovements: string[] = [];

  // 7つの視座を順次適用
  for (let i = 0; i < PERSPECTIVES.length; i++) {
    console.log(`[self-improvement-loop] Processing perspective ${i + 1}/${PERSPECTIVES.length}: ${PERSPECTIVES[i].displayName}`);
    
    // 中断シグナルをチェック
    if (signal?.aborted) {
      console.log(`[self-improvement-loop] Cycle ${state.currentCycle} aborted at perspective ${i}`);
      break;
    }

    const perspective = state.perspectiveStates[i];
    const prompt = buildPerspectivePrompt(perspective, state.task, perspectiveResults);

    // LLMに分析を依頼（プロンプトにシステム指示を統合）
    const fullPrompt = `あなたは自己改善エージェントです。${perspective.displayName}の観点から自己分析を行ってください。

重要なルール:
- 日本語で回答してください
- 具体的で実行可能な改善を提案してください
- 曖昧な表現を避けてください
- 自分の仮説を否定する証拠を探してください

---

${prompt}`;

    try {
      const output = await callModel(fullPrompt, model, 300000, signal);

      // レスポンスをパース
      const result = parsePerspectiveResult(perspective.name, output);
      perspectiveResults.push(result);

      // 状態を更新
      perspective.lastAppliedAt = new Date().toISOString();
      perspective.findings.push(...result.findings);
      perspective.questions.push(...result.questions);
      perspective.improvements.push(...result.improvements);
      perspective.score = result.score;

      allImprovements.push(...result.improvements);

      console.log(`[self-improvement-loop] Cycle ${state.currentCycle}: ${perspective.displayName} (${(result.score * 100).toFixed(0)}%)`);
      
      // 視座間の短い待機（最後の視座以外）
      if (i < PERSPECTIVES.length - 1) {
        const perspectiveDelayMs = RATE_LIMIT_CONFIG.perspectiveDelayMs; // 環境変数で設定可能
        await sleepWithAbort(perspectiveDelayMs, signal);
      }
    } catch (error) {
      // 429エラーかどうかをチェック
      const statusCode = extractRetryStatusCode(error);
      const is429 = statusCode === 429 || isAdaptiveRateLimitError(error) || 
                    (toErrorMessage(error).toLowerCase().includes("rate limit"));
      
      console.error(`[self-improvement-loop] Perspective ${perspective.displayName} failed: ${toErrorMessage(error)}`);
      
      // 429エラー時は少し長く待機してから次へ
      if (is429) {
        console.warn(`[self-improvement-loop] Rate limit detected, waiting 3 seconds before continuing...`);
        await sleepWithAbort(3000, signal).catch(() => {});
      }
      
      // エラー時はデフォルトスコアで続行
      const errorResult: PerspectiveResult = {
        perspective: perspective.name,
        findings: [],
        questions: [],
        improvements: [],
        score: 0.3,
        output: `エラー: ${toErrorMessage(error)}`,
      };
      perspectiveResults.push(errorResult);
      perspective.score = 0.3;
    }
  }

  // サイクルのサマリーを生成
  const avgScore = perspectiveResults.length > 0
    ? perspectiveResults.reduce((sum, r) => sum + r.score, 0) / perspectiveResults.length
    : 0.3;
  const summary = `Cycle ${state.currentCycle} completed. Average score: ${(avgScore * 100).toFixed(0)}%. ${allImprovements.length} improvements identified.`;

  return {
    cycleNumber: state.currentCycle,
    perspectiveResults,
    improvements: allImprovements,
    commitHash: null,
    summary,
    shouldContinue: avgScore < 0.95, // 95%以上で完了とみなす
    stopReason: avgScore >= 0.95 ? "completed" : null,
  };
}

function parsePerspectiveResult(perspective: PerspectiveName, output: string): PerspectiveResult {
  const findings: string[] = [];
  const questions: string[] = [];
  const improvements: string[] = [];
  let score = 0.5;

  // FINDINGS セクションを抽出
  const findingsMatch = output.match(/FINDINGS:\s*([\s\S]*?)(?=QUESTIONS:|IMPROVEMENTS:|SCORE:|SUMMARY:|$)/i);
  if (findingsMatch) {
    const lines = findingsMatch[1].split("\n").filter((l) => l.trim().startsWith("-"));
    findings.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()).filter((l) => l.length > 0));
  }

  // QUESTIONS セクションを抽出
  const questionsMatch = output.match(/QUESTIONS:\s*([\s\S]*?)(?=IMPROVEMENTS:|SCORE:|SUMMARY:|$)/i);
  if (questionsMatch) {
    const lines = questionsMatch[1].split("\n").filter((l) => l.trim().startsWith("-"));
    questions.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()).filter((l) => l.length > 0));
  }

  // IMPROVEMENTS セクションを抽出
  const improvementsMatch = output.match(/IMPROVEMENTS:\s*([\s\S]*?)(?=SCORE:|SUMMARY:|$)/i);
  if (improvementsMatch) {
    const lines = improvementsMatch[1].split("\n").filter((l) => l.trim().startsWith("-"));
    improvements.push(...lines.map((l) => l.replace(/^-\s*/, "").trim()).filter((l) => l.length > 0));
  }

  // SCORE を抽出
  const scoreMatch = output.match(/SCORE:\s*(\d{1,3})/i);
  if (scoreMatch) {
    score = Math.min(1, Math.max(0, parseInt(scoreMatch[1], 10) / 100));
  }

  return {
    perspective,
    findings,
    questions,
    improvements,
    score,
    output,
  };
}

// ============================================================================
// 拡張機能のエクスポート
// ============================================================================

export default (api: ExtensionAPI) => {
  console.log("[self-improvement-loop] Extension loading...");
  let activeRun: ActiveAutonomousRun | null = null;

  function resolveStopPath(): string {
    return resolve(process.cwd(), DEFAULT_CONFIG.stopSignalPath);
  }

  function requestStop(): string {
    const stopPath = resolveStopPath();
    mkdirSync(resolve(process.cwd(), DEFAULT_CONFIG.logDir), { recursive: true });
    writeFileSync(stopPath, "STOP", "utf-8");
    if (activeRun) {
      activeRun.stopRequested = true;
      activeRun.stopReason = "user_request";
    }
    return stopPath;
  }

  function dispatchNextCycle(run: ActiveAutonomousRun, deliverAs?: "followUp"): void {
    const nextCycle = run.cycle + 1;
    run.cycle = nextCycle;

    const prompt = buildAutonomousCyclePrompt(run, nextCycle);
    if (deliverAs) {
      api.sendUserMessage(prompt, { deliverAs });
    } else {
      api.sendUserMessage(prompt);
    }

    appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} dispatched cycle=${nextCycle}`);
  }

  function finishRun(reason: SelfImprovementLoopState["stopReason"], note?: string): void {
    const run = activeRun;
    if (!run) return;

    run.stopReason = reason;
    
    // 軌跡サマリーを取得
    const trajectorySummary = run.trajectoryTracker.getSummary();
    
    // 視座スコアの統計を計算
    let perspectiveStats = "";
    if (run.perspectiveScoreHistory.length > 0) {
      const avgScores = {
        deconstruction: 0,
        schizoanalysis: 0,
        eudaimonia: 0,
        utopia_dystopia: 0,
        thinking_philosophy: 0,
        thinking_taxonomy: 0,
        logic: 0,
        overall: 0,
      };
      
      for (const scores of run.perspectiveScoreHistory) {
        avgScores.deconstruction += scores.deconstruction;
        avgScores.schizoanalysis += scores.schizoanalysis;
        avgScores.eudaimonia += scores.eudaimonia;
        avgScores.utopia_dystopia += scores.utopia_dystopia;
        avgScores.thinking_philosophy += scores.thinking_philosophy;
        avgScores.thinking_taxonomy += scores.thinking_taxonomy;
        avgScores.logic += scores.logic;
        avgScores.overall += scores.average;
      }
      
      const n = run.perspectiveScoreHistory.length;
      avgScores.deconstruction = Math.round(avgScores.deconstruction / n);
      avgScores.schizoanalysis = Math.round(avgScores.schizoanalysis / n);
      avgScores.eudaimonia = Math.round(avgScores.eudaimonia / n);
      avgScores.utopia_dystopia = Math.round(avgScores.utopia_dystopia / n);
      avgScores.thinking_philosophy = Math.round(avgScores.thinking_philosophy / n);
      avgScores.thinking_taxonomy = Math.round(avgScores.thinking_taxonomy / n);
      avgScores.logic = Math.round(avgScores.logic / n);
      avgScores.overall = Math.round(avgScores.overall / n);
      
      perspectiveStats = `
- 視座スコア平均:
  - 脱構築: ${avgScores.deconstruction}
  - スキゾ分析: ${avgScores.schizoanalysis}
  - 幸福論: ${avgScores.eudaimonia}
  - ユートピア/ディストピア: ${avgScores.utopia_dystopia}
  - 思考哲学: ${avgScores.thinking_philosophy}
  - 思考分類学: ${avgScores.thinking_taxonomy}
  - 論理学: ${avgScores.logic}
  - 総合: ${avgScores.overall}`;
      
      appendAutonomousLoopLog(run.logPath, `  perspective_avg: overall=${avgScores.overall}, deconstruction=${avgScores.deconstruction}, logic=${avgScores.logic}`);
    }
    
    appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} finished reason=${reason ?? "completed"}`);
    if (note) {
      appendAutonomousLoopLog(run.logPath, `  note: ${note}`);
    }
    appendAutonomousLoopLog(run.logPath, `  stats: cycles=${run.cycle}, avgSimilarity=${trajectorySummary.averageSimilarity.toFixed(2)}, repetitions=${trajectorySummary.repetitionCount}`);

    api.sendMessage({
      customType: "self-improvement-loop-result",
      content: `## 自己改善ループ停止

- 実行ID: \`${run.runId}\`
- 総サイクル: ${run.cycle}
- 停止理由: ${reason ?? "completed"}
- 最終コミット: ${run.lastCommitHash ?? "なし"}
- 停滞検出: ${trajectorySummary.repetitionCount}回の反復（平均類似度: ${(trajectorySummary.averageSimilarity * 100).toFixed(0)}%）${perspectiveStats}
- ログ: \`${run.logPath}\``,
      display: true,
      details: {
        runId: run.runId,
        cycles: run.cycle,
        stopReason: reason,
        lastCommitHash: run.lastCommitHash,
        logPath: run.logPath,
        trajectoryStats: {
          totalSteps: trajectorySummary.totalSteps,
          repetitionCount: trajectorySummary.repetitionCount,
          averageSimilarity: trajectorySummary.averageSimilarity,
          isStuck: trajectorySummary.isStuck,
        },
        perspectiveScoreCount: run.perspectiveScoreHistory.length,
      },
    }, { triggerTurn: false });

    clearStopSignal(DEFAULT_CONFIG);
    activeRun = null;
  }

  function startAutonomousLoop(input: {
    task: string;
    maxCycles: number;
    autoCommit: boolean;
    model: SelfImprovementModel;
    deliverAs?: "followUp";
  }): { ok: true; run: ActiveAutonomousRun } | { ok: false; error: string } {
    if (activeRun) {
      return { ok: false, error: `既に実行中です（runId=${activeRun.runId}）` };
    }

    const task = input.task.trim();
    if (!task) {
      return { ok: false, error: "task は必須です。" };
    }

    clearStopSignal(DEFAULT_CONFIG);

    const runId = createRunId();
    const logPath = createLogFilePath(DEFAULT_CONFIG, runId);
    const run: ActiveAutonomousRun = {
      runId,
      task,
      startedAt: new Date().toISOString(),
      maxCycles: input.maxCycles,
      autoCommit: input.autoCommit,
      cycle: 0,
      inFlightCycle: null,
      stopRequested: false,
      stopReason: null,
      logPath,
      model: input.model,
      lastCommitHash: null,
      trajectoryTracker: new TrajectoryTracker(50), // 最大50ステップ保持
      cycleSummaries: [],
      perspectiveScoreHistory: [],
    };

    initializeAutonomousLoopLog(logPath, run);
    appendAutonomousLoopLog(logPath, `- ${new Date().toISOString()} started`);

    activeRun = run;
    dispatchNextCycle(run, input.deliverAs);
    return { ok: true, run };
  }

  api.on("input", async (event, _ctx) => {
    const run = activeRun;
    if (!run || event.source !== "extension") return;
    const marker = parseLoopCycleMarker(extractInputText(event));
    if (!marker) return;
    if (marker.runId !== run.runId) return;
    if (marker.cycle > run.cycle) return;
    run.inFlightCycle = marker.cycle;
  });

  api.on("agent_end", async (event, ctx) => {
    const run = activeRun;
    if (!run) return;
    if (run.inFlightCycle === null) return;

    const completedCycle = run.inFlightCycle;
    run.inFlightCycle = null;
    appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} completed cycle=${completedCycle}`);

    // イベントから出力を取得して視座スコアをパース
    const agentEndEvent = event as { messages?: Array<{ content?: string | Array<{ type?: string; text?: string }> }> };
    const messages = agentEndEvent.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    
    let outputText = "";
    if (lastMessage) {
      if (typeof lastMessage.content === "string") {
        outputText = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        outputText = lastMessage.content
          .filter((c): c is { type: string; text: string } => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n");
      }
    }

    // 視座スコアをパースして記録
    if (outputText) {
      const scores = parsePerspectiveScores(outputText);
      if (scores) {
        run.perspectiveScoreHistory.push(scores);
        appendAutonomousLoopLog(run.logPath, `  perspective_scores: avg=${scores.average}, deconstruction=${scores.deconstruction}, logic=${scores.logic}`);
      }

      // NEXT_FOCUSを抽出してサマリーに追加
      const nextFocus = parseNextFocus(outputText);
      if (nextFocus) {
        appendAutonomousLoopLog(run.logPath, `  next_focus: ${nextFocus.slice(0, 100)}...`);
      }
    }

    // サイクルサマリーを記録（次回のプロンプトで使用）
    run.cycleSummaries.push(`Cycle ${completedCycle}: 完了`);

    // 軌跡トラッカーに記録
    run.trajectoryTracker.recordStep(`Cycle ${completedCycle} completed`).catch(() => {
      // 埋め込み生成エラーは無視
    });

    if (run.autoCommit) {
      // 視座スコア履歴から最新の結果を取得（なければ空配列）
      const latestScores = run.perspectiveScoreHistory.length > 0
        ? run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1]
        : null;

      const perspectiveResults = latestScores
        ? [
            { perspective: "deconstruction", score: latestScores.deconstruction / 100, improvements: [] },
            { perspective: "schizoanalysis", score: latestScores.schizoanalysis / 100, improvements: [] },
            { perspective: "eudaimonia", score: latestScores.eudaimonia / 100, improvements: [] },
            { perspective: "utopia_dystopia", score: latestScores.utopia_dystopia / 100, improvements: [] },
            { perspective: "thinking_philosophy", score: latestScores.thinking_philosophy / 100, improvements: [] },
            { perspective: "thinking_taxonomy", score: latestScores.thinking_taxonomy / 100, improvements: [] },
            { perspective: "logic", score: latestScores.logic / 100, improvements: [] },
          ]
        : [];

      // LLMがgit-workflowスキル準拠のコミットメッセージを生成
      const { hash, message } = await createGitCommitWithLLM(
        process.cwd(),
        {
          cycleNumber: completedCycle,
          runId: run.runId,
          taskSummary: run.task,
          perspectiveResults,
        },
        run.model
      );

      if (hash) {
        run.lastCommitHash = hash;
        appendAutonomousLoopLog(run.logPath, `  commit: ${hash}`);
        // サマリーを更新
        run.cycleSummaries[run.cycleSummaries.length - 1] = `Cycle ${completedCycle}: 完了 (commit: ${hash})`;
      }
    }

    if (checkStopSignal(DEFAULT_CONFIG) || run.stopRequested) {
      finishRun(run.stopReason ?? "user_request");
      return;
    }

    if (completedCycle >= run.maxCycles) {
      finishRun("completed");
      return;
    }

    // 停滞検出: セマンティック反復チェック
    const trajectorySummary = run.trajectoryTracker.getSummary();
    if (trajectorySummary.isStuck) {
      appendAutonomousLoopLog(run.logPath, `  stagnation detected: repetitionRate=${(trajectorySummary.repetitionCount / trajectorySummary.totalSteps).toFixed(2)}`);
      finishRun("stagnation", `Semantic repetition detected: ${trajectorySummary.repetitionCount}/${trajectorySummary.totalSteps} steps repeated`);
      return;
    }

    // 推奨アクション判定
    const recommendedAction = getRecommendedAction(
      trajectorySummary.repetitionCount,
      trajectorySummary.totalSteps,
      trajectorySummary.isStuck
    );
    
    if (recommendedAction === "pivot") {
      appendAutonomousLoopLog(run.logPath, `  warning: high repetition rate, pivoting strategy recommended`);
    }

    // 視座スコア履歴に基づく戦略調整
    const strategyHint = generateStrategyHint(run, recommendedAction);
    if (strategyHint) {
      appendAutonomousLoopLog(run.logPath, `  strategy: ${strategyHint.slice(0, 100)}...`);
    }

    try {
      dispatchNextCycle(run, ctx.isIdle() ? undefined : "followUp");
    } catch (error) {
      finishRun("error", toErrorMessage(error));
    }
  });

  // self_improvement_loop ツールを登録
  api.registerTool({
    name: "self_improvement_loop",
    label: "self_improvement_loop",
    description: "通常エージェントをサイクル実行し続ける自己改善ループを開始する。停止信号まで継続する。",
    parameters: Type.Object({
      task: Type.String({
        description: "自己改善の対象となるタスクまたは目標",
      }),
      max_cycles: Type.Optional(Type.Number({
        description: "最大サイクル数（省略時は実質無制限）",
        minimum: 1,
        maximum: 1000000,
      })),
      auto_commit: Type.Optional(Type.Boolean({
        description: "各サイクル完了時に自動的にGitコミットを作成するか（デフォルト: true）",
      })),
    }),
    execute: async (_toolCallId: string, params: SelfImprovementLoopParams, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: any) => {
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "開始前に中断されました。" }],
          details: { error: "aborted_before_start" },
        };
      }

      if (!ctx?.model) {
        return {
          content: [{ type: "text" as const, text: "self_improvement_loop error: no active model." }],
          details: { error: "missing_model" },
        };
      }

      const model = resolveActiveModel(ctx);
      const started = startAutonomousLoop({
        task: params.task,
        maxCycles: params.max_cycles ?? 1_000_000,
        autoCommit: params.auto_commit ?? DEFAULT_CONFIG.autoCommit,
        model,
        deliverAs: ctx?.isIdle?.() ? undefined : "followUp",
      });

      if (started.ok) {
        return {
          content: [{
            type: "text" as const,
            text: `自己改善ループを開始しました。
runId: ${started.run.runId}
maxCycles: ${started.run.maxCycles === Infinity ? "Infinity" : started.run.maxCycles}
モデル: ${started.run.model.provider}/${started.run.model.id}
ログ: ${started.run.logPath}`,
          }],
          details: {
            runId: started.run.runId,
            startedAt: started.run.startedAt,
            maxCycles: started.run.maxCycles,
            logFile: started.run.logPath,
          },
        };
      }

      // Type guard: started.ok is false
      const failedStart = started as { ok: false; error: string };
      const errorMsg = failedStart.error;
      return {
        content: [{ type: "text" as const, text: `開始失敗: ${errorMsg}` }],
        details: { error: errorMsg },
      };
    },
  } as any);

  // self_improvement_stop ツールを登録
  api.registerTool({
    name: "self_improvement_stop",
    label: "self_improvement_stop",
    description: "実行中の自己改善ループを停止する。現在のサイクルを完了してから安全に停止する。",
    parameters: Type.Object({}),
    execute: async () => {
      try {
        const stopPath = requestStop();

        return {
          content: [{ type: "text" as const, text: "停止信号を送信しました。現在のサイクルを完了してから安全に停止します。" }],
          details: { stopSignalPath: stopPath },
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `エラー: ${toErrorMessage(error)}` }],
          details: { error: toErrorMessage(error) },
        };
      }
    },
  } as any);

  // self_improvement_status ツールを登録
  api.registerTool({
    name: "self_improvement_status",
    label: "self_improvement_status",
    description: "自己改善ループの状態を確認する。",
    parameters: Type.Object({}),
    execute: async () => {
      const config = DEFAULT_CONFIG;
      const stopPath = resolve(process.cwd(), config.stopSignalPath);
      const isStopRequested = checkStopSignal(config);

      let statusText = `自己改善ループ状態

停止信号: ${isStopRequested ? "あり" : "なし"}
信号ファイル: ${stopPath}
実行状態: ${activeRun ? `running (runId=${activeRun.runId}, cycle=${activeRun.cycle})` : "idle"}`;

      let details: Record<string, unknown> = {
        stopRequested: isStopRequested,
        stopSignalPath: stopPath,
        logDir: resolve(process.cwd(), config.logDir),
        running: Boolean(activeRun),
        runId: activeRun?.runId,
        cycle: activeRun?.cycle,
      };

      if (activeRun) {
        const trajectorySummary = activeRun.trajectoryTracker.getSummary();
        statusText += `

## 軌跡統計
- 総ステップ: ${trajectorySummary.totalSteps}
- 反復検出: ${trajectorySummary.repetitionCount}回
- 平均類似度: ${(trajectorySummary.averageSimilarity * 100).toFixed(0)}%
- トレンド: ${trajectorySummary.similarityTrend}
- 停滞状態: ${trajectorySummary.isStuck ? "あり" : "なし"}`;
        
        details = {
          ...details,
          trajectoryStats: {
            totalSteps: trajectorySummary.totalSteps,
            repetitionCount: trajectorySummary.repetitionCount,
            averageSimilarity: trajectorySummary.averageSimilarity,
            similarityTrend: trajectorySummary.similarityTrend,
            isStuck: trajectorySummary.isStuck,
          },
          lastCommitHash: activeRun.lastCommitHash,
          logPath: activeRun.logPath,
        };
      }

      statusText += `

停止するには: self_improvement_stop ツールを実行`;

      return {
        content: [{ type: "text" as const, text: statusText }],
        details,
      };
    },
  } as any);

  // ============================================================================
  // スラッシュコマンド
  // ============================================================================

  // /self-improvement-loop コマンド
  api.registerCommand("self-improvement-loop", {
    description: "7つの哲学的視座に基づく自己改善ループを開始",
    handler: async (args: string, ctx) => {
      const parts = args.trim().split(/\s+/);
      let task = "";
      let maxCycles: number | undefined;

      for (const part of parts) {
        if (part.startsWith("--max-cycles=")) {
          const val = parseInt(part.split("=")[1], 10);
          if (!isNaN(val) && val >= 1 && val <= 1000000) {
            maxCycles = val;
          }
        } else if (part !== "") {
          task += (task ? " " : "") + part;
        }
      }

      if (!task) {
        ctx.ui.notify("使用法: /self-improvement-loop <タスク> [--max-cycles=N]", "warning");
        return;
      }

      if (activeRun) {
        ctx.ui.notify(`既に自己改善ループが実行中です（runId=${activeRun.runId}）`, "warning");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("自己改善ループの開始に失敗: アクティブなモデルがありません", "error");
        return;
      }

      ctx.ui.notify(`自己改善ループを開始します: "${task.slice(0, 50)}${task.length > 50 ? "..." : ""}"`, "info");
      const model = resolveActiveModel(ctx);

      const started = startAutonomousLoop({
        task,
        maxCycles: maxCycles ?? 1_000_000,
        autoCommit: DEFAULT_CONFIG.autoCommit,
        model,
        deliverAs: ctx.isIdle() ? undefined : "followUp",
      });

      if (!started.ok) {
        const failedStart = started as { ok: false; error: string };
        ctx.ui.notify(`自己改善ループ開始エラー: ${failedStart.error}`, "error");
        return;
      }

      ctx.ui.notify(`自己改善ループ開始: runId=${started.run.runId}`, "info");
    },
  });

  // /self-improvement-stop コマンド
  api.registerCommand("self-improvement-stop", {
    description: "実行中の自己改善ループを停止",
    handler: async (_args: string, ctx) => {
      try {
        requestStop();

        ctx.ui.notify("停止信号を送信しました。現在のサイクルを完了してから安全に停止します。", "info");
      } catch (error) {
        ctx.ui.notify(`停止信号の送信に失敗しました: ${toErrorMessage(error)}`, "error");
      }
    },
  });

  // /self-improvement-status コマンド
  api.registerCommand("self-improvement-status", {
    description: "自己改善ループの状態を確認",
    handler: async (_args: string, ctx) => {
      const config = DEFAULT_CONFIG;
      const isStopRequested = checkStopSignal(config);
      const stopPath = resolve(process.cwd(), config.stopSignalPath);
      const logDir = resolve(process.cwd(), config.logDir);

      api.sendMessage({
        customType: "self-improvement-status",
        content: `## 自己改善ループ状態

- **停止信号**: ${isStopRequested ? "あり" : "なし"}
- **信号ファイル**: \`${stopPath}\`
- **ログディレクトリ**: \`${logDir}\`
- **実行状態**: ${activeRun ? `running (\`${activeRun.runId}\`)` : "idle"}
- **現在サイクル**: ${activeRun?.cycle ?? 0}

停止するには: \`/self-improvement-stop\` コマンドを実行`,
        display: true,
        details: {
          stopRequested: isStopRequested,
          stopSignalPath: stopPath,
          logDir,
          running: Boolean(activeRun),
          runId: activeRun?.runId,
          cycle: activeRun?.cycle,
        },
      });
    },
  });

  console.log("[self-improvement-loop] Extension loaded successfully");
};
