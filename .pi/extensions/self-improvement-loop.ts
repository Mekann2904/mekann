/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-loop.ts
 * role: 自己改善ループ処理の制御と実行（ULモード対応）
 * why: 7つの哲学的視点に基づき、LLMの出力を分析・検証・改善することで、継続的な品質向上と思考の解体を行うため。ULモードではResearch→Plan→Implementの構造化されたサイクルを実行し、自動承認による効率的な自己改善を実現する。
 * related: .pi/lib/verification-workflow.ts, .pi/lib/semantic-repetition.ts, .pi/extensions/shared/pi-print-executor.ts, .pi/lib/adaptive-rate-controller.ts, .pi/skills/self-improvement/SKILL.md
 * public_api: selfImprovementLoop (ExtensionAPI経由で公開される想定)
 * invariants: 1サイクルごとに必ずメタ認知チェックまたは統合検証が実行される（高スコア時を除く）, リトライは最大再試行回数以内に収まる, ULモード時はResearch→Plan→Implementの順序でフェーズが進行する
 * side_effects: ファイルシステムへのログ出力, 外部LLM APIの呼び出し, プロセスの生成と実行, Gitコミットの作成
 * failure_modes: LM APIのレート制限(429エラー), タイムアウト, セマンティックな再帰の検出失敗, メタ認知的アポリアの解決不能, ULフェーズ間のコンテキスト喪失
 * @abdd.explain
 * overview: 7つの視点（6つの帽子含む）を用いた思考ループを実行し、LLMのプロセスを動的に修正・改善する拡張機能。ULモードでは構造化されたResearch→Plan→Implementサイクルを実行。
 * what_it_does:
 *   - 7つの哲学的視点による思考プロセスの分割と適用
 *   - メタ認知チェック、誤謬検出、セマンティックな反復の検出
 *   - 検出された問題に基づく改善アクションの生成と適用
 *   - レート制限とエラー発生時の指数バックオフによるリトライ制御
 *   - 思考モードの分類と統合的分析の実行
 *   - ULモード: Research（現状分析）→Plan（改善計画）→Implement（実装）の構造化サイクル
 *   - 自動承認による人間の承認ボトルネックの解消
 * why_it_exists:
 *   - 単一の視点に依存せず、多角的な批判的思考を通じてAIの出力精度を高める
 *   - 反復的なループや論理的誤謬を自律的に検出・修正し、自己修正能力を向上させる
 *   - 外部APIの不安定性に対して堅牢な処理を実現する
 *   - ULモードにより、人間の介入を最小限にしながら効率的な自己改善を実現する
 * scope:
 *   in: ExtensionAPI (context, model, prompt), RateLimitConfig, 検証ワークフロー設定, ULモードパラメータ
 *   out: 改善されたLLMレスポンス, 検証ログ, 分析結果, Gitコミット
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

import { formatDurationMs, formatClockTime } from "../lib/core/format-utils.js";
import { toErrorMessage, isCancelledErrorMessage } from "../lib/core/error-utils.js";
import { ThinkingLevel } from "../lib/agent/agent-types.js";
import { computeModelTimeoutMs } from "../lib/model-timeouts.js";
import { callModelViaPi as sharedCallModelViaPi } from "./shared/pi-print-executor.js";
import {
  detectSemanticRepetition,
  TrajectoryTracker,
  getRecommendedAction,
  type SemanticRepetitionResult,
} from "../lib/semantic-repetition.js";
import {
  runMetacognitiveCheck,
  type MetacognitiveCheck,
  type AporiaDetection,
  type FallacyDetection,
  type ImprovementAction,
  generateImprovementActions,
  formatActionsAsPromptInstructions,
  runIntegratedMetacognitiveAnalysis,
  // 新しいLLMベース判定エンジン
  runIntegratedDetection,
  extractCandidates,
  FALLACY_PATTERNS,
  BINARY_OPPOSITION_PATTERNS,
  FASCISM_PATTERNS,
  type CandidateDetection,
  type IntegratedVerificationResult,
  generateActionsFromDetection,
  generateFilterStats,
  // 思考分類学
  analyzeThinkingMode,
  runIntegratedThinkingAnalysis,
  type ThinkingModeAnalysis,
} from "../lib/verification-workflow.js";
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
// 定数
// ============================================================================

/** 思考帽子の名称マッピング */
const HAT_NAMES: Record<string, string> = {
  white: '事実・情報',
  red: '感情・直感',
  black: '批判・リスク',
  yellow: '利点・肯定的',
  green: '創造・アイデア',
  blue: 'メタ認知・プロセス'
};

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
  /** サイクル開始時に既に変更されていたファイル一覧 */
  filesChangedBeforeCycle: Set<string>;
  /** 自動追加する.gitignoreパターン */
  gitignorePatternsToAdd: Set<string>;
  /** 前回のメタ認知チェック結果（推論深度向上のためのフィードバックループ） */
  lastMetacognitiveCheck?: MetacognitiveCheck;
  /** 前回の推論深度スコア */
  lastInferenceDepthScore?: number;
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
  /** メタ認知チェック結果（推論深度の客観的指標） */
  metacognitiveCheck?: MetacognitiveCheck;
  /** 推論深度スコア（客観的指標の集約） */
  inferenceDepthScore?: number;
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
  /** ULモードを有効にする（Research→Plan→Implement フロー）。デフォルト: true */
  ul_mode?: boolean;
  /** Plan フェーズでの人間の承認をスキップする。デフォルト: true */
  auto_approve?: boolean;
}

interface SelfImprovementModel {
  provider: string;
  id: string;
  thinkingLevel: ThinkingLevel;
}

/** ULフェーズ種別 */
type ULPhase = 'research' | 'plan' | 'implement' | 'completed';

/** ULフェーズコンテキスト */
interface ULPhaseContext {
  researchOutput?: string;
  planOutput?: string;
  improvementActions?: ImprovementAction[];
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
  /** 前回のメタ認知チェック結果（推論深度向上のためのフィードバックループ） */
  lastMetacognitiveCheck?: MetacognitiveCheck;
  /** 前回の推論深度スコア */
  lastInferenceDepthScore?: number;
  /** 前回の改善アクション（次サイクルでの実践用） */
  lastImprovementActions?: ImprovementAction[];
  /** 前回の統合検出結果（信頼度付き） */
  lastIntegratedDetection?: IntegratedVerificationResult;
  /** 成功したサイクルのパターン（高スコアの例） */
  successfulPatterns: SuccessfulPattern[];
  /** サイクル開始時に既に変更されていたファイル一覧 */
  filesChangedBeforeCycle: Set<string>;
  /** 自動追加すべき.gitignoreパターン（検出された除外対象） */
  gitignorePatternsToAdd: Set<string>;
  /** ULモード有効フラグ */
  ulMode: boolean;
  /** 自動承認フラグ（Plan フェーズで人間の承認をスキップ） */
  autoApprove: boolean;
  /** 現在のULフェーズ（ulMode時のみ使用） */
  currentPhase: ULPhase;
  /** ULフェーズ間のコンテキスト受け渡し */
  phaseContext: ULPhaseContext;
  /** 現在のフェーズの再試行回数（NEW-001: 無限再試行防止） */
  phaseRetryCount: number;
}

/** 成功パターンの記録 */
interface SuccessfulPattern {
  /** サイクル番号 */
  cycle: number;
  /** 平均視座スコア */
  averageScore: number;
  /** 実行したアクションの要約 */
  actionSummary: string;
  /** 適用した視座 */
  appliedPerspectives: string[];
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

/** ULフェーズマーカープレフィックス */
const UL_PHASE_MARKER_PREFIX = "[[UL_PHASE";

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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
/**
 * フォールバック用コミットメッセージを生成
 * LLM生成が失敗した場合に使用する
 */
function createFallbackCommitMessage(
  cycleNumber: number,
  runId: string,
  perspectiveResults: Array<{ perspective: string; score: number; improvements: string[] }>
): string {
  const avgScore = perspectiveResults.length > 0
    ? (perspectiveResults.reduce((sum, r) => sum + r.score, 0) / perspectiveResults.length * 100).toFixed(0)
    : "不明";

  return `chore(self-improvement-loop): サイクル${cycleNumber}の自己改善を実施する

## 変更内容
自己改善ループのサイクル${cycleNumber}で実施した変更を反映する。

## コンテキスト
- 実行ID: ${runId}
- 視座スコア平均: ${avgScore}%

runId: ${runId}`;
}

/**
 * git-workflowスキル準拠のコミットメッセージを生成
 * 
 * @summary コミットメッセージを生成
 * @param cycleNumber サイクル番号
 * @param runId 実行ID
 * @param taskSummary タスクサマリー
 * @param diffSummary 変更差分サマリー
 * @param perspectiveResults 視座別結果
 * @param model モデル情報
 * @returns 生成されたコミットメッセージ
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
    
    // [Thinking]プレフィックスを除去（Claudeのextended thinking出力対策）
    let cleanedMessage = generatedMessage.trim();
    
    // 複数行の場合、各行を処理
    const lines = cleanedMessage.split('\n');
    const cleanedLines: string[] = [];
    let foundValidStart = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // [Thinking]で始まる行をスキップ
      if (trimmedLine.startsWith('[Thinking]') || trimmedLine.startsWith('[ thinking]')) {
        continue;
      }
      // 有効なコミットメッセージの開始を見つけた（Type: で始まる行）
      if (!foundValidStart && (
        /^(feat|fix|docs|refactor|test|chore|perf|ci)(\([^)]+\))?:/.test(trimmedLine)
      )) {
        foundValidStart = true;
      }
      // 有効な開始以降、または空行は保持
      if (foundValidStart || trimmedLine === '') {
        cleanedLines.push(line);
      }
    }
    
    cleanedMessage = cleanedLines.join('\n').trim();
    
    // まだ有効なフォーマットでない場合はフォールバックを使用
    if (!foundValidStart) {
      console.warn(`[self-improvement-loop] Generated message does not match commit format, using fallback`);
      return createFallbackCommitMessage(cycleNumber, runId, perspectiveResults);
    }
    
    return cleanedMessage;
  } catch (error: unknown) {
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
    filesChangedBeforeCycle: new Set<string>(),
    gitignorePatternsToAdd: new Set<string>(),
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

/** 成功パターンセクションを生成 */
function generateSuccessPatternsSection(run: ActiveAutonomousRun): string {
  if (run.successfulPatterns.length === 0) {
    return '';
  }
  
  // 高スコアのパターンを最大3つ表示
  const topPatterns = run.successfulPatterns
    .filter(p => p.averageScore >= 75)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 3);
  
  if (topPatterns.length === 0) {
    return '';
  }
  
  return `
## 過去の成功パターン（参考）

以下のアプローチが効果的でした：

${topPatterns.map((p, i) => 
  `${i + 1}. [Cycle ${p.cycle}] スコア: ${p.averageScore}%
   - アクション: ${p.actionSummary}
   - 焦点とした視座: ${p.appliedPerspectives.join(', ')}`
).join('\n\n')}

※ 過去の成功を再現するのではなく、現在の状況に適応させることが重要です。
`;
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

  // 前回のメタ認グチェックに基づく推論深度フィードバック
  // 新アプローチ: 「判定結果」→「品質基準（事前ガイダンス）」
  let qualityGuidance = '';
  if (run.lastMetacognitiveCheck) {
    const mc = run.lastMetacognitiveCheck;
    const depthScore = (run.lastInferenceDepthScore ?? 0.5) * 100;
    
    // 前回の結果から「次に達成すべき品質基準」を生成
    const qualityTargets: string[] = [];
    
    if (mc.deconstruction.binaryOppositions.length > 0) {
      qualityTargets.push(`二項対立の脱構築: 前回${mc.deconstruction.binaryOppositions.length}件検出。「AかBか」以外の第三の選択肢を探求する`);
    }
    if (mc.deconstruction.aporias.length > 0) {
      qualityTargets.push(`アポリアの認識: 前回${mc.deconstruction.aporias.length}件検出。解決困難な対立を「解決」せず、両極を維持しながら判断する`);
    }
    if (mc.schizoAnalysis.innerFascismSigns.length > 0) {
      qualityTargets.push(`内なるファシズムの緩和: 前回${mc.schizoAnalysis.innerFascismSigns.length}件検出。「必ず」「常に」の使用を意識的に減らす`);
    }
    if (mc.eudaimonia.pleasureTrap) {
      qualityTargets.push(`快楽主義の回避: ユーザーを喜ばせるために真実を曲げない`);
    }
    if (mc.philosophyOfThought.metacognitionLevel < 0.5) {
      qualityTargets.push(`メタ認知の強化: 前回${(mc.philosophyOfThought.metacognitionLevel * 100).toFixed(0)}%。前提を明示し、推論過程を記述する`);
    }
    if (mc.logic.fallacies.length > 0) {
      qualityTargets.push(`論理的厳密性: 前回${mc.logic.fallacies.length}件の誤謬検出。論理的飛躍を回避し、各ステップを検証する`);
    }
    
    if (qualityTargets.length > 0) {
      qualityGuidance = `\n## 今回の品質目標（前回推論深度: ${depthScore.toFixed(0)}%）

以下の品質目標を達成するよう、出力を生成してください：

${qualityTargets.map((t, i) => `${i + 1}. ${t}`).join('\n')}

※ これらは「判定結果」ではなく、「今回達成すべき品質基準」です。出力時点で基準を満たすことを目指してください。
`;
    }
  }

  // 改善アクションを含める（優先度順に最大5件）
  let improvementActionsSection = '';
  if (run.lastImprovementActions && run.lastImprovementActions.length > 0) {
    const topActions = run.lastImprovementActions.slice(0, 5);
    improvementActionsSection = `\n## 次の改善アクション（優先度順）

以下のアクションを今回の分析で実践してください：

${topActions.map((action, i) => 
  `${i + 1}. **【${action.relatedPerspective}】** ${action.action}\n   - 問題: ${action.issue}\n   - 期待効果: ${action.expectedOutcome}`
).join('\n\n')}\n\n`;
  }

  // シンプル化のため、視座の詳細説明は省略

  return `${marker}

あなたは通常のコーディングエージェントとして動作してください。
以下のタスクを継続実行してください:
${run.task}
${previousSummary}${strategySection}${qualityGuidance}${generateSuccessPatternsSection(run)}
## 思考の枠組み（問いを立てよ）

**重要**: 以下の「問い」に答えるのではなく、あなた自身の問いを立ててください。

### 探求のための種となる問い
- この問題の「本質」は何か？（症状ではなく）
- なぜ従来のアプローチで解決できなかったのか？
- 何を「不可能」と思い込んでいるか？
- 逆に考えるとどうなるか？（逆向きの思考）

### 思考を深めるためのガイド
1. **理解**: 問題を自分の言葉で再記述せよ
2. **探索**: 複数のアプローチを検討せよ
3. **検証**: 自分の選択に対する反例を探せ
4. **統合**: 検討結果を踏まえて判断せよ

## 出力フォーマット

\`\`\`
## 問い
[このサイクルで探求する問い]

## 探求
[複数のアプローチまたは視点]

## 実行
[選択したアプローチとその理由]

## 反省
[何を学んだか、何を見逃していたか]
\`\`\`

## 実行ルール
- ツールを自由に使う
- ファイルに反映し、テストを実行する
- 自分の仮説を否定する証拠を探す

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

// ============================================================================
// UL Mode Phase Prompt Builders
// ============================================================================

/**
 * ULフェーズ用のマーカーを生成する
 * 
 * @summary ULフェーズマーカーを生成
 * @param runId 実行ID
 * @param phase フェーズ名
 * @param cycle サイクル番号
 * @returns ULフェーズマーカー文字列
 */
function buildULPhaseMarker(runId: string, phase: ULPhase, cycle: number): string {
  return `${UL_PHASE_MARKER_PREFIX}:${runId}:${phase}:CYCLE:${cycle}]]`;
}

/**
 * タスクに基づいて研究の焦点を選択する
 * 論文「Evaluating AGENTS.md」の知見に基づき、最小限の要件のみ記述すべき
 * 
 * @summary タスクに適した研究焦点を選択
 * @param task タスク記述
 * @returns 焦点（視座名と問い）
 */
function selectResearchFocus(task: string): { perspective: string; question: string } {
  const taskLower = task.toLowerCase();
  
  // タスクタイプに基づいて焦点を選択
  if (taskLower.includes('バグ') || taskLower.includes('bug') || taskLower.includes('fix') || taskLower.includes('修正')) {
    return {
      perspective: '論理検証',
      question: 'どこで論理が壊れているか？'
    };
  }
  
  if (taskLower.includes('リファクタ') || taskLower.includes('refactor') || taskLower.includes('整理')) {
    return {
      perspective: 'コード批判的分析',
      question: '何を前提としているか？'
    };
  }
  
  if (taskLower.includes('機能') || taskLower.includes('feature') || taskLower.includes('追加') || taskLower.includes('add')) {
    return {
      perspective: '機能分析',
      question: 'この機能は何を生産し、何を排除するか？'
    };
  }
  
  if (taskLower.includes('パフォーマンス') || taskLower.includes('performance') || taskLower.includes('高速') || taskLower.includes('最適化')) {
    return {
      perspective: '評価基準',
      question: '「良い状態」とは何か？'
    };
  }
  
  if (taskLower.includes('アーキテクチャ') || taskLower.includes('architecture') || taskLower.includes('設計') || taskLower.includes('構造')) {
    return {
      perspective: '将来予測',
      question: 'この変更は将来どう影響するか？'
    };
  }
  
  if (taskLower.includes('テスト') || taskLower.includes('test') || taskLower.includes('検証')) {
    return {
      perspective: 'ロジック検証',
      question: 'どのような入力で壊れるか？'
    };
  }
  
  // デフォルト: 汎用的な問い
  return {
    perspective: '現状認識',
    question: '何が問題で、何を変えるべきか？'
  };
}

/**
 * Research フェーズ用のプロンプトを生成する
 * 論文「Evaluating AGENTS.md」の知見に基づき、最小限の要件のみ記述
 * 
 * @summary Researchフェーズプロンプトを生成（最小化版）
 * @param run 現在のラン状態
 * @returns Researchフェーズ用プロンプト
 */
function buildResearchPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'research', run.cycle);
  
  // タスクに基づいて焦点を選択
  const focus = selectResearchFocus(run.task);
  
  const previousContext = run.cycleSummaries.length > 0 
    ? `\n### 前回の進捗\n${run.cycleSummaries.slice(-1).join('\n')}\n` 
    : '';

  return `${marker}

## Research

### タスク
${run.task}${previousContext}

### 焦点
**${focus.perspective}**: ${focus.question}

### 出力
現状: [タスクに関連する現状を1-2段落で記述]
次アクション: [Plan フェーズで何をすべきか]

RESEARCH_COMPLETE: true
`;
}

/**
 * Plan フェーズ用のプロンプトを生成する
 * 論文「Evaluating AGENTS.md」の知見に基づき、最小限の要件のみ記述
 * 
 * @summary Planフェーズプロンプトを生成（最小化版）
 * @param run 現在のラン状態
 * @returns Planフェーズ用プロンプト
 */
function buildPlanPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'plan', run.cycle);
  
  const researchContext = run.phaseContext.researchOutput 
    ? `\n### Researchの成果\n${run.phaseContext.researchOutput}\n`
    : '';

  return `${marker}

## Plan

### タスク
${run.task}${researchContext}

### 出力
目標: [このサイクルで達成すべきこと]
手順: [実行するステップ（番号付きリスト）]
成功基準: [どうやって成功を判定するか]

PLAN_COMPLETE: true
`;
}

/**
 * Implement フェーズ用のプロンプトを生成する
 * 論文「Evaluating AGENTS.md」の知見に基づき、最小限の要件のみ記述
 * 
 * @summary Implementフェーズプロンプトを生成（最小化版）
 * @param run 現在のラン状態
 * @returns Implementフェーズ用プロンプト
 */
function buildImplementPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'implement', run.cycle);
  
  const planContext = run.phaseContext.planOutput
    ? `\n### Planの内容\n${run.phaseContext.planOutput}\n`
    : '';

  return `${marker}

## Implement

### タスク
${run.task}${planContext}

### 出力
実行内容: [何を変更したか]
テスト結果: [テスト実行結果]
振り返り: [何を学んだか]

CYCLE: ${run.cycle}
LOOP_STATUS: continue

PERSPECTIVE_SCORES:
  総合: [0-100]
`;
}

/**
 * ULフェーズマーカーをパースする
 * 
 * @summary ULフェーズマーカーをパース
 * @param text テキスト
 * @returns パース結果またはnull
 */
function parseULPhaseMarker(text: string): { runId: string; phase: string; cycle: number } | null {
  const match = text.match(/\[\[UL_PHASE:([a-zA-Z0-9_-]+):([a-z_]+):CYCLE:(\d+)\]\]/);
  if (!match) return null;
  const cycle = Number.parseInt(match[3], 10);
  if (!Number.isFinite(cycle) || cycle < 1) return null;
  return {
    runId: match[1],
    phase: match[2],
    cycle,
  };
}

/**
 * ループの停止条件を評価する
 * 
 * @summary 停止条件を評価
 * @param run 現在のラン状態
 * @returns 停止すべき場合はtrue
 */
function shouldStopLoop(run: ActiveAutonomousRun): boolean {
  // 1. ユーザー要求
  if (checkStopSignal(DEFAULT_CONFIG) || run.stopRequested) {
    run.stopReason = "user_request";
    return true;
  }
  
  // 2. 最大サイクル到達
  if (run.cycle >= run.maxCycles) {
    run.stopReason = "completed";
    return true;
  }
  
  // 3. 停滞検出
  const trajectorySummary = run.trajectoryTracker.getSummary();
  if (trajectorySummary.isStuck) {
    run.stopReason = "stagnation";
    return true;
  }
  
  // 4. 高スコア完了（95%以上）
  const latestScores = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
  if (latestScores && latestScores.average >= 95) {
    run.stopReason = "completed";
    return true;
  }
  
  return false;
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
- UL Mode: ${run.ulMode ? "true" : "false"}
- Auto Approve: ${run.autoApprove ? "true" : "false"}
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
 * 除外パターンに対応する.gitignoreエントリを生成
 * 
 * @summary .gitignoreパターンを生成
 * @param filePath 除外対象のファイルパス
 * @returns .gitignoreに追加すべきパターン
 */
function generateGitignorePattern(filePath: string): string | null {
  // 環境変数ファイル
  if (/\.env$/.test(filePath) || /\.env\./.test(filePath)) {
    return ".env*";
  }
  // 認証情報ファイル
  if (/credentials/i.test(filePath) || /secrets?\.json$/i.test(filePath)) {
    return "*.credentials.json\n*secrets.json";
  }
  // ログファイル
  if (/\.log$/.test(filePath)) {
    return "*.log";
  }
  // キャッシュディレクトリ
  if (/\.cache\//.test(filePath)) {
    return ".cache/";
  }
  // それ以外はファイル自体を追加
  return null;
}

/**
 * .gitignoreにパターンを自動追加する
 * 人間の手を使わずに除外パターンを.gitignoreに反映
 * 
 * @summary .gitignoreにパターンを追加
 * @param patterns 追加するパターンのSet
 * @param cwd 作業ディレクトリ
 * @returns 追加したかどうか
 */
async function addToGitignore(patterns: Set<string>, cwd: string): Promise<boolean> {
  if (patterns.size === 0) return false;
  
  const gitignorePath = join(cwd, ".gitignore");
  let existingContent = "";
  
  // 既存の.gitignoreを読み込む
  if (existsSync(gitignorePath)) {
    try {
      existingContent = readFileSync(gitignorePath, "utf-8");
    } catch (error: unknown) {
      console.warn(`[self-improvement-loop] Failed to read .gitignore: ${toErrorMessage(error)}`);
      return false;
    }
  }
  
  const existingLines = new Set(
    existingContent.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"))
  );
  
  // 新しいパターンのみを抽出
  const newPatterns = Array.from(patterns).filter(p => !existingLines.has(p));
  
  if (newPatterns.length === 0) {
    console.log("[self-improvement-loop] All patterns already in .gitignore");
    return false;
  }
  
  // .gitignoreに追加
  const headerComment = "\n# Auto-added by self-improvement-loop\n";
  const newContent = existingContent + 
    (existingContent.endsWith("\n") ? "" : "\n") +
    headerComment +
    newPatterns.join("\n") + "\n";
  
  try {
    writeFileSync(gitignorePath, newContent, "utf-8");
    console.log(`[self-improvement-loop] Added ${newPatterns.length} patterns to .gitignore: ${newPatterns.slice(0, 3).join(", ")}${newPatterns.length > 3 ? "..." : ""}`);
    return true;
  } catch (error: unknown) {
    console.error(`[self-improvement-loop] Failed to update .gitignore: ${toErrorMessage(error)}`);
    return false;
  }
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
  } catch (error: unknown) {
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
  /** サイクル開始時に既に変更されていたファイル一覧 */
  filesChangedBeforeCycle: Set<string>;
  /** 自動追加する.gitignoreパターン（参照渡しで更新） */
  gitignorePatternsToAdd: Set<string>;
}

async function createGitCommitWithLLM(
  cwd: string,
  context: CommitContext,
  model: SelfImprovementModel
): Promise<{ hash: string | null; message: string; excludedFiles: string[] }> {
  const excludedFiles: string[] = [];
  
  try {
    // 現在の変更ファイル一覧を取得
    const currentChangedFiles = await getChangedFiles(cwd);
    
    // 「このサイクルで新たに変更されたファイル」のみを抽出
    const newChangedFiles = currentChangedFiles.filter(
      file => !context.filesChangedBeforeCycle.has(file)
    );
    
    if (newChangedFiles.length === 0) {
      console.log("[self-improvement-loop] No new changes in this cycle to commit");
      return { hash: null, message: "", excludedFiles };
    }
    
    console.log(`[self-improvement-loop] New files changed in cycle: ${newChangedFiles.length} (total changed: ${currentChangedFiles.length})`);
    
    // 除外パターンを適用してステージング対象を絞り込み
    const filesToStage: string[] = [];
    for (const file of newChangedFiles) {
      if (shouldStageFile(file)) {
        filesToStage.push(file);
      } else {
        excludedFiles.push(file);
        // .gitignoreに追加すべきパターンを生成
        const gitignorePattern = generateGitignorePattern(file);
        if (gitignorePattern) {
          context.gitignorePatternsToAdd.add(gitignorePattern);
        }
      }
    }
    
    if (filesToStage.length === 0) {
      console.log("[self-improvement-loop] All new changed files are excluded from staging");
      return { hash: null, message: "", excludedFiles };
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
      return { hash: null, message: "", excludedFiles };
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
      return { hash, message: commitMessage, excludedFiles };
    }

    // 変更なしエラー
    if (result.stderr.includes("nothing to commit")) {
      return { hash: null, message: "", excludedFiles };
    }

    console.warn(`[self-improvement-loop] Git commit warning: ${result.stderr}`);
    return { hash: null, message: commitMessage, excludedFiles };
  } catch (error: unknown) {
    console.error(`[self-improvement-loop] Git operation failed: ${toErrorMessage(error)}`);
    return { hash: null, message: "", excludedFiles };
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

  // メタ認知チェック結果を追加（推論深度の可視化）
  if (result.metacognitiveCheck) {
    const mc = result.metacognitiveCheck;
    content += `#### メタ認知チェック結果

**推論深度スコア**: ${((result.inferenceDepthScore ?? 0.5) * 100).toFixed(0)}%

| 視座 | 検出結果 |
|------|----------|
| 脱構築 | 二項対立: ${mc.deconstruction.binaryOppositions.length}件, アポリア: ${mc.deconstruction.aporias.length}件 |
| スキゾ分析 | 欲望生産: ${mc.schizoAnalysis.desireProduction.length}件, 内なるファシズム: ${mc.schizoAnalysis.innerFascismSigns.length}件 |
| 幸福論 | 快楽主義の罠: ${mc.eudaimonia.pleasureTrap ? "検出" : "なし"} |
| ユートピア/ディストピア | 全体主義リスク: ${mc.utopiaDystopia.totalitarianRisk.length}件 |
| 思考哲学 | メタ認知レベル: ${(mc.philosophyOfThought.metacognitionLevel * 100).toFixed(0)}% |
| 思考分類学 | 現在モード: ${mc.taxonomyOfThought.currentMode}, 推奨: ${mc.taxonomyOfThought.recommendedMode} |
| 論理学 | 誤謬: ${mc.logic.fallacies.length}件 |

`;
    
    // 論理的誤謬の詳細を表示
    if (mc.logic.fallacies.length > 0) {
      content += `**検出された誤謬**:
${mc.logic.fallacies.map(f => `- ${f.type}: ${f.description}`).join("\n")}

`;
    }
    
    // アポリアの詳細を表示
    if (mc.deconstruction.aporias.length > 0) {
      content += `**検出されたアポリア**:
${mc.deconstruction.aporias.map(a => `- ${a.description}（緊張レベル: ${(a.tensionLevel * 100).toFixed(0)}%）`).join("\n")}

`;
    }
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

function buildPerspectivePrompt(
  perspective: PerspectiveState, 
  task: string, 
  previousResults: PerspectiveResult[],
  previousMetacognitiveCheck?: MetacognitiveCheck
): string {
  const perspectiveInfo = PERSPECTIVES.find((p) => p.name === perspective.name);
  const previousContext = previousResults.length > 0
    ? `\n\n## 前回の視座からの継続事項\n${previousResults.map((r) => `- ${PERSPECTIVES.find((p) => p.name === r.perspective)?.displayName}: ${r.findings.slice(0, 2).join(", ")}`).join("\n")}`
    : "";

  // 前回のメタ認知チェックに基づく動的プロンプト強化
  let depthRequirements = "";
  if (previousMetacognitiveCheck) {
    const mc = previousMetacognitiveCheck;
    
    // 誤謬が検出された場合の強化要求
    if (mc.logic.fallacies.length > 0) {
      depthRequirements += `\n\n## 前回検出された論理的誤謬への対応
前回の分析で以下の論理的誤謬が検出されました。これらを回避してください：
${mc.logic.fallacies.map(f => `- ${f.type}: ${f.description}`).join("\n")}
**対策**: 推論の各ステップで、前提と結論の論理的関係を明示してください。`;
    }
    
    // アポリアが検出された場合の強化要求
    if (mc.deconstruction.aporias.length > 0) {
      depthRequirements += `\n\n## 検出されたアポリア（解決不能な緊張関係）への対処
以下のアポリアが検出されています。統合（解決）を急がず、両極の緊張関係を維持してください：
${mc.deconstruction.aporias.map(a => `- ${a.description}`).join("\n")}
**原則**: アポリアを「解決すべき問題」としてではなく、「認識すべき状態」として受け入れてください。`;
    }
    
    // 内なるファシズム兆候が検出された場合
    if (mc.schizoAnalysis.innerFascismSigns.length > 0) {
      depthRequirements += `\n\n## 内なるファシズム兆候の検出
以下の兆候が検出されました。権力や規範への無批判な服従を避けてください：
${mc.schizoAnalysis.innerFascismSigns.join(", ")}`;
    }
    
    // メタ認知レベルが低い場合の強化
    if (mc.philosophyOfThought.metacognitionLevel < 0.5) {
      depthRequirements += `\n\n## メタ認知の強化要求
前回の分析ではメタ認知レベルが低かったです。以下を実践してください：
- 自分の前提を明示的に記述する
- なぜその結論に至ったかの推論過程を明示する
- 代替可能性を積極的に検討する`;
    }
  }

  return `# ${perspectiveInfo?.displayName ?? perspective.name} - 自己分析プロンプト

## 現在のタスク
${task}

## この視座の役割
${perspectiveInfo?.description ?? perspective.description}${previousContext}${depthRequirements}

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

## 推論の深さを保証するための必須チェック

以下のチェックを最低1つ以上実施し、結果をFINDINGSまたはQUESTIONSに含めてください：

1. **反例探索**: 自分の主張を否定する可能性のある事例や証拠を探してください
2. **境界条件**: 主張が成立しない条件や極端なケースを検討してください
3. **前提の明示**: 暗黙の前提を明示的に記述してください
4. **代替解釈**: 同じ証拠から導ける別の解釈を検討してください

## 注意事項
- 曖昧な表現（「適切に処理する」「必要に応じて」など）を避けてください
- 具体的で実行可能な改善を提案してください
- 自分の仮説を否定する証拠を最低1つ探してください
- 推論の各ステップで論理的飛躍がないか確認してください
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
  } catch (error: unknown) {
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
          if (isCancelledErrorMessage(error)) return false;
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
  } catch (error: unknown) {
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
      
      // サイクル開始時の変更ファイル一覧を記録
      try {
        const currentChangedFiles = await getChangedFiles(process.cwd());
        state.filesChangedBeforeCycle = new Set(currentChangedFiles);
        console.log(`[self-improvement-loop] Cycle ${state.currentCycle} starting with ${currentChangedFiles.length} pre-existing changes`);
      } catch (error: unknown) {
        console.warn(`[self-improvement-loop] Failed to get pre-cycle changes: ${toErrorMessage(error)}`);
        state.filesChangedBeforeCycle = new Set();
      }
      
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
        const { hash, message, excludedFiles } = await createGitCommitWithLLM(
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
            filesChangedBeforeCycle: state.filesChangedBeforeCycle,
            gitignorePatternsToAdd: state.gitignorePatternsToAdd,
          },
          model
        );
        
        // 除外されたファイルがあれば.gitignoreに自動追加
        if (excludedFiles.length > 0 && state.gitignorePatternsToAdd.size > 0) {
          const addedToGitignore = await addToGitignore(state.gitignorePatternsToAdd, process.cwd());
          if (addedToGitignore) {
            // .gitignore自体もステージングしてコミット
            await runGitCommand(["add", ".gitignore"], process.cwd());
            await runGitCommand(
              ["commit", "-m", `chore(self-improvement-loop): .gitignoreに除外パターンを追加

サイクル${state.currentCycle}で検出された除外対象ファイルを.gitignoreに追加。

runId: ${state.runId}`],
              process.cwd()
            );
            state.gitignorePatternsToAdd.clear();
          }
        }
        
        if (hash) {
          state.lastCommitHash = hash;
          cycleResult.commitHash = hash;
        }
      }

      // 状態を更新
      state.lastUpdatedAt = new Date().toISOString();
      state.totalImprovements += cycleResult.improvements.length;
      state.summary = cycleResult.summary;
      
      // メタ認知チェック結果を保存（次サイクルの推論深度向上のため）
      if (cycleResult.metacognitiveCheck) {
        state.lastMetacognitiveCheck = cycleResult.metacognitiveCheck;
        state.lastInferenceDepthScore = cycleResult.inferenceDepthScore;
        console.log(`[self-improvement-loop] Inference depth score: ${((cycleResult.inferenceDepthScore ?? 0.5) * 100).toFixed(0)}%`);
      }

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
  } catch (error: unknown) {
    if (isCancelledErrorMessage(error) || toErrorMessage(error).includes("Aborted")) {
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
    const prompt = buildPerspectivePrompt(perspective, state.task, perspectiveResults, state.lastMetacognitiveCheck);

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
    } catch (error: unknown) {
      // 429エラーかどうかをチェック
      const statusCode = extractRetryStatusCode(error);
      const is429 = statusCode === 429 || isAdaptiveRateLimitError(error) || 
                    (toErrorMessage(error).toLowerCase().includes("rate limit"));
      
      console.error(`[self-improvement-loop] Perspective ${perspective.displayName} failed: ${toErrorMessage(error)}`);
      
      // 429エラー時は少し長く待機してから次へ
      if (is429) {
        console.warn(`[self-improvement-loop] Rate limit detected, waiting 3 seconds before continuing...`);
        // BUG-EX-001修正: AbortErrorのみ無視、他のエラーはログに記録
        await sleepWithAbort(3000, signal).catch((e) => {
          if (e?.name !== 'AbortError') {
            console.warn(`[self-improvement-loop] Sleep interrupted: ${e}`);
          }
        });
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

  // メタ認知チェックを実行（推論深度の客観的評価）
  const fullOutput = perspectiveResults.map(r => r.output).join("\n\n");
  const metacognitiveCheck = runMetacognitiveCheck(fullOutput, {
    task: state.task,
    currentMode: "self-improvement"
  });
  
  // 推論深度スコアを計算（客観的指標の集約）
  const inferenceDepthScore = calculateInferenceDepthScore(metacognitiveCheck, perspectiveResults);

  return {
    cycleNumber: state.currentCycle,
    perspectiveResults,
    improvements: allImprovements,
    commitHash: null,
    summary,
    shouldContinue: avgScore < 0.95, // 95%以上で完了とみなす
    stopReason: avgScore >= 0.95 ? "completed" : null,
    metacognitiveCheck,
    inferenceDepthScore,
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

/**
 * 推論深度スコアを計算する
 * メタ認知チェック結果と視座結果から、推論の深さを客観的に評価する
 * 
 * @summary 推論深度を計算
 * @param check メタ認知チェック結果
 * @param results 視座ごとの実行結果
 * @returns 0-1の範囲の推論深度スコア
 */
function calculateInferenceDepthScore(
  check: MetacognitiveCheck,
  results: PerspectiveResult[]
): number {
  let score = 0.5; // ベーススコア
  
  // I. 脱構築: 二項対立検出、アポリア対処
  const deconstructionBonus = 
    Math.min(check.deconstruction.binaryOppositions.length * 0.05, 0.15) +
    Math.min(check.deconstruction.aporias.length * 0.08, 0.2);
  score += deconstructionBonus;
  
  // II. スキゾ分析: 欲望の生産性認識、内なるファシズム検出
  if (check.schizoAnalysis.desireProduction.length > 0) {
    score += Math.min(check.schizoAnalysis.desireProduction.length * 0.03, 0.09);
  }
  if (check.schizoAnalysis.innerFascismSigns.length > 0) {
    // ファシズム兆候を検出したことは評価するが、多すぎる場合は逆に減点
    const fascismPenalty = Math.max(0, check.schizoAnalysis.innerFascismSigns.length - 2) * 0.05;
    score += 0.05 - fascismPenalty;
  }
  
  // III. 幸福論: 快楽主義の罠回避
  if (!check.eudaimonia.pleasureTrap) {
    score += 0.05;
  }
  
  // IV. ユートピア/ディストピア: 全体主義リスクの認識
  if (check.utopiaDystopia.totalitarianRisk.length > 0) {
    score += Math.min(check.utopiaDystopia.totalitarianRisk.length * 0.03, 0.09);
  }
  
  // V. 思考哲学: メタ認知レベル
  score += check.philosophyOfThought.metacognitionLevel * 0.1;
  if (!check.philosophyOfThought.isThinking) {
    score -= 0.1; // 思考していない場合は減点
  }
  
  // VI. 思考分類学: 適切なモード選択
  if (check.taxonomyOfThought.currentMode === check.taxonomyOfThought.recommendedMode) {
    score += 0.05;
  }
  
  // VII. 論理学: 誤謬の有無
  const fallacyCount = check.logic.fallacies.length;
  if (fallacyCount === 0) {
    score += 0.05;
  } else {
    score -= Math.min(fallacyCount * 0.08, 0.2);
  }
  
  // 推論チェーンの評価（新機能）
  if (check.logic.inferenceChain) {
    const chain = check.logic.inferenceChain;
    
    // 前提が明示されている場合
    if (chain.premises.length >= 2) {
      score += 0.05;
    }
    
    // 結論が明示されている場合
    if (chain.conclusion && chain.conclusion.length > 10) {
      score += 0.03;
    }
    
    // 推論ステップが存在する場合
    if (chain.steps.length >= 2) {
      score += 0.05;
    }
    
    // 妥当性判定
    if (chain.validity === 'valid') {
      score += 0.08;
    } else if (chain.validity === 'invalid') {
      score -= 0.1;
    }
    
    // 論理的飛躍が検出された場合
    if (chain.gaps.length > 0) {
      score -= Math.min(chain.gaps.length * 0.05, 0.15);
    }
  }
  
  // 有効な推論パターンの検出
  if (check.logic.validInferences.length > 0) {
    score += Math.min(check.logic.validInferences.length * 0.03, 0.09);
  }
  
  // 無効な推論パターンの検出
  if (check.logic.invalidInferences.length > 0) {
    score -= Math.min(check.logic.invalidInferences.length * 0.04, 0.12);
  }
  
  // 視座結果からの追加評価
  const avgFindingsPerPerspective = results.reduce((sum, r) => sum + r.findings.length, 0) / Math.max(results.length, 1);
  const avgQuestionsPerPerspective = results.reduce((sum, r) => sum + r.questions.length, 0) / Math.max(results.length, 1);
  const avgImprovementsPerPerspective = results.reduce((sum, r) => sum + r.improvements.length, 0) / Math.max(results.length, 1);
  
  // 発見事項が多いほど深い分析
  if (avgFindingsPerPerspective >= 2) {
    score += 0.05;
  }
  if (avgFindingsPerPerspective >= 4) {
    score += 0.05;
  }
  
  // 問いが多いほど批判的思考
  if (avgQuestionsPerPerspective >= 2) {
    score += 0.05;
  }
  
  // 改善提案が具体的であるほど実践的
  if (avgImprovementsPerPerspective >= 1) {
    score += 0.05;
  }
  
  // 0-1の範囲に正規化
  return Math.max(0, Math.min(1, score));
}

/**
 * 自律ループ用の簡易推論深度スコア計算
 * 視座結果がない場合でも、メタ認知チェックのみから推論深度を評価
 * 
 * @summary 簡易推論深度を計算
 * @param check メタ認知チェック結果
 * @returns 0-1の範囲の推論深度スコア
 */
function calculateMetacognitiveDepthScore(check: MetacognitiveCheck): number {
  let score = 0.5; // ベーススコア
  
  // I. 脱構築: 二項対立検出、アポリア対処
  score += Math.min(check.deconstruction.binaryOppositions.length * 0.05, 0.15);
  score += Math.min(check.deconstruction.aporias.length * 0.08, 0.2);
  
  // II. スキゾ分析: 欲望の生産性認識
  score += Math.min(check.schizoAnalysis.desireProduction.length * 0.03, 0.09);
  
  // III. 幸福論: 快楽主義の罠回避
  if (!check.eudaimonia.pleasureTrap) {
    score += 0.05;
  }
  
  // IV. ユートピア/ディストピア: 全体主義リスクの認識
  score += Math.min(check.utopiaDystopia.totalitarianRisk.length * 0.03, 0.09);
  
  // V. 思考哲学: メタ認知レベル（最重要）
  score += check.philosophyOfThought.metacognitionLevel * 0.15;
  if (!check.philosophyOfThought.isThinking) {
    score -= 0.15;
  }
  if (check.philosophyOfThought.autopilotSigns.length > 2) {
    score -= 0.1;
  }
  
  // VI. 思考分類学: 適切なモード選択
  if (check.taxonomyOfThought.currentMode === check.taxonomyOfThought.recommendedMode) {
    score += 0.05;
  }
  
  // VII. 論理学: 誤謬の有無（重要な減点要因）
  const fallacyCount = check.logic.fallacies.length;
  if (fallacyCount === 0) {
    score += 0.05;
  } else {
    score -= Math.min(fallacyCount * 0.1, 0.25);
  }
  
  // 有効な推論があれば加点
  if (check.logic.validInferences.length > 0) {
    score += Math.min(check.logic.validInferences.length * 0.03, 0.09);
  }
  
  // 推論チェーンの評価
  if (check.logic.inferenceChain) {
    const chain = check.logic.inferenceChain;
    
    // 明示的な前提
    if (chain.premises.length >= 2) {
      score += 0.05;
    }
    
    // 明示的な結論
    if (chain.conclusion && chain.conclusion.length > 10) {
      score += 0.03;
    }
    
    // 推論ステップの存在
    if (chain.steps.length >= 2) {
      score += 0.05;
    }
    
    // 妥当性
    if (chain.validity === 'valid') {
      score += 0.08;
    } else if (chain.validity === 'invalid') {
      score -= 0.1;
    }
    
    // 論理的飛躍
    if (chain.gaps.length > 0) {
      score -= Math.min(chain.gaps.length * 0.05, 0.15);
    }
  }
  
  return Math.max(0, Math.min(1, score));
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

  async function dispatchNextCycle(run: ActiveAutonomousRun, deliverAs?: "followUp"): Promise<void> {
    const nextCycle = run.cycle + 1;
    run.cycle = nextCycle;
    
    // inFlightCycleを事前に設定（api.on("input")でイベントがスキップされた場合のフォールバック）
    run.inFlightCycle = nextCycle;

    // サイクル開始時の変更ファイル一覧を記録
    // （このサイクルで新たに変更されたファイルのみをコミットするため）
    try {
      const currentChangedFiles = await getChangedFiles(process.cwd());
      run.filesChangedBeforeCycle = new Set(currentChangedFiles);
      console.log(`[self-improvement-loop] Cycle ${nextCycle} starting with ${currentChangedFiles.length} pre-existing changes`);
    } catch (error: unknown) {
      console.warn(`[self-improvement-loop] Failed to get pre-cycle changes: ${toErrorMessage(error)}`);
      run.filesChangedBeforeCycle = new Set();
    }

    const prompt = buildAutonomousCyclePrompt(run, nextCycle);
    if (deliverAs) {
      api.sendUserMessage(prompt, { deliverAs });
    } else {
      api.sendUserMessage(prompt);
    }

    appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} dispatched cycle=${nextCycle}`);
    console.log(`[self-improvement-loop] Dispatched cycle ${nextCycle}, inFlightCycle=${run.inFlightCycle}`);
  }

  /**
   * ULモードのフェーズをディスパッチする
   * Research → Plan → Implement のフェーズを実行
   * 
   * @summary ULフェーズをディスパッチ
   * @param run 現在のラン状態
   * @param phase フェーズ種別
   * @param deliverAs 配信モード
   */
  async function dispatchULPhase(
    run: ActiveAutonomousRun,
    phase: 'research' | 'plan' | 'implement',
    deliverAs?: "followUp"
  ): Promise<void> {
    run.currentPhase = phase;
    
    // Research フェーズ開始時にサイクルをインクリメント
    if (phase === 'research') {
      const nextCycle = run.cycle + 1;
      run.cycle = nextCycle;
      
      // サイクル開始時の変更ファイル一覧を記録
      try {
        const currentChangedFiles = await getChangedFiles(process.cwd());
        run.filesChangedBeforeCycle = new Set(currentChangedFiles);
        console.log(`[self-improvement-loop] UL Cycle ${nextCycle} starting with ${currentChangedFiles.length} pre-existing changes`);
      } catch (error: unknown) {
        console.warn(`[self-improvement-loop] Failed to get pre-cycle changes: ${toErrorMessage(error)}`);
        run.filesChangedBeforeCycle = new Set();
      }
    }
    
    const phasePrompts: Record<string, () => string> = {
      research: () => buildResearchPrompt(run),
      plan: () => buildPlanPrompt(run),
      implement: () => buildImplementPrompt(run),
    };
    
    const prompt = phasePrompts[phase]();
    
    if (deliverAs) {
      api.sendUserMessage(prompt, { deliverAs });
    } else {
      api.sendUserMessage(prompt);
    }
    
    appendAutonomousLoopLog(
      run.logPath, 
      `- ${new Date().toISOString()} dispatched UL phase=${phase} cycle=${run.cycle}`
    );
  }

  /**
   * ULフェーズ完了時の処理
   * フェーズ遷移とサイクル管理を行う
   * 
   * @summary ULフェーズ完了を処理
   * @param run 現在のラン状態
   * @param outputText 出力テキスト
   * @param marker パースされたフェーズマーカー
   * @param ctx コンテキスト
   */
  async function handleULPhaseCompletion(
    run: ActiveAutonomousRun,
    outputText: string,
    marker: { runId: string; phase: string; cycle: number },
    ctx: { isIdle: () => boolean }
  ): Promise<void> {
    const deliverAs = ctx.isIdle() ? undefined : "followUp" as const;
    
    switch (marker.phase) {
      case 'research':
        run.phaseContext.researchOutput = outputText;
        appendAutonomousLoopLog(run.logPath, `  research phase completed`);
        
        // Plan フェーズへ自動遷移
        await dispatchULPhase(run, 'plan', deliverAs);
        break;
        
      case 'plan':
        run.phaseContext.planOutput = outputText;
        appendAutonomousLoopLog(run.logPath, `  plan phase completed`);
        
        // Implement フェーズへ自動遷移
        await dispatchULPhase(run, 'implement', deliverAs);
        break;
        
      case 'implement':
        // 視座スコアをパースして記録
        const scores = parsePerspectiveScores(outputText);
        if (scores) {
          run.perspectiveScoreHistory.push(scores);
          appendAutonomousLoopLog(run.logPath, `  perspective_scores: avg=${scores.average}`);
        }
        
        // メタ認知チェックを実行
        const metacognitiveCheck = runMetacognitiveCheck(outputText, {
          task: run.task,
          currentMode: "self-improvement"
        });
        run.lastMetacognitiveCheck = metacognitiveCheck;
        
        // Git コミット（有効な場合）
        if (run.autoCommit) {
          const latestScores = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
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

          const { hash } = await createGitCommitWithLLM(
            process.cwd(),
            {
              cycleNumber: run.cycle,
              runId: run.runId,
              taskSummary: run.task,
              perspectiveResults,
              filesChangedBeforeCycle: run.filesChangedBeforeCycle,
              gitignorePatternsToAdd: run.gitignorePatternsToAdd,
            },
            run.model
          );
          
          if (hash) {
            run.lastCommitHash = hash;
            appendAutonomousLoopLog(run.logPath, `  commit: ${hash}`);
          }
        }
        
        // サイクルサマリーを記録
        run.cycleSummaries.push(`Cycle ${run.cycle}: 完了 (ULモード)`);
        
        // 軌跡トラッカーに記録
        // BUG-EX-002修正: エラーをログに記録（元はcatch {}で無視していた）
        run.trajectoryTracker.recordStep(`Cycle ${run.cycle} completed`).catch((e) => {
          console.warn(`[self-improvement-loop] Failed to record trajectory step: ${e}`);
        });
        
        // 停止条件をチェック
        if (shouldStopLoop(run)) {
          finishRun(run.stopReason ?? "completed");
          return;
        }
        
        // 次サイクル開始（フェーズコンテキストをリセット）
        run.phaseContext = {};
        await dispatchULPhase(run, 'research', deliverAs);
        break;
    }
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
    /** ULモード有効フラグ */
    ulMode?: boolean;
    /** 自動承認フラグ */
    autoApprove?: boolean;
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
    const ulMode = input.ulMode ?? true; // デフォルトでULモード有効
    const autoApprove = input.autoApprove ?? true; // デフォルトで自動承認
    
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
      successfulPatterns: [],
      filesChangedBeforeCycle: new Set<string>(), // 初期化時は空
      gitignorePatternsToAdd: new Set<string>(),
      // ULモード用フィールド
      ulMode,
      autoApprove,
      currentPhase: 'research',
      phaseContext: {},
      phaseRetryCount: 0, // NEW-001: 再試行回数初期化
    };

    initializeAutonomousLoopLog(logPath, run);
    appendAutonomousLoopLog(logPath, `- ${new Date().toISOString()} started (ulMode=${ulMode}, autoApprove=${autoApprove})`);

    activeRun = run;
    
    // ULモードと非ULモードで開始方法を分岐
    if (ulMode) {
      // ULモード: Research フェーズから開始
      dispatchULPhase(run, 'research', input.deliverAs).catch(error => {
        console.error(`[self-improvement-loop] Failed to dispatch UL research phase: ${toErrorMessage(error)}`);
      });
    } else {
      // 非ULモード: 従来のサイクルを開始
      dispatchNextCycle(run, input.deliverAs).catch(error => {
        console.error(`[self-improvement-loop] Failed to dispatch first cycle: ${toErrorMessage(error)}`);
      });
    }
    return { ok: true, run };
  }

  api.on("input", async (event, _ctx) => {
    const run = activeRun;
    if (!run) return;
    // 注意: sourceチェックを削除
    // api.sendUserMessage()で送信されたメッセージも処理する必要がある
    const inputText = extractInputText(event);
    const marker = parseLoopCycleMarker(inputText);
    if (!marker) return;
    if (marker.runId !== run.runId) return;
    if (marker.cycle > run.cycle) return;
    run.inFlightCycle = marker.cycle;
    console.log(`[self-improvement-loop] input event: cycle=${marker.cycle}, source=${event.source}`);
  });

  api.on("agent_end", async (event, ctx) => {
    const run = activeRun;
    if (!run) return;

    // イベントから出力を取得
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

    // ULモード: フェーズマーカーを検出して処理
    if (run.ulMode) {
      const ulPhaseMarker = parseULPhaseMarker(outputText);
      if (ulPhaseMarker && ulPhaseMarker.runId === run.runId) {
        // マーカーが検出されたので再試行カウントをリセット
        run.phaseRetryCount = 0;
        appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} completed UL phase=${ulPhaseMarker.phase} cycle=${ulPhaseMarker.cycle}`);
        
        const ctxTyped = ctx as { isIdle?: () => boolean };
        await handleULPhaseCompletion(run, outputText, ulPhaseMarker, {
          isIdle: ctxTyped?.isIdle ?? (() => true)
        });
        return;
      }
      
      // ULモードでマーカーが検出されない場合、現在のフェーズを継続
      // これはエージェントが途中で停止した場合などの回復処理
      console.log(`[self-improvement-loop] UL phase marker not found in output, current phase=${run.currentPhase}`);
      appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} UL phase marker not found, phase=${run.currentPhase}, retryCount=${run.phaseRetryCount}`);
      
      // NEW-001: 再試行制限チェック（環境変数で設定可能、デフォルト3回）
      const maxPhaseRetries = parseInt(process.env.PI_UL_MAX_PHASE_RETRIES ?? "3", 10) || 3;
      if (run.phaseRetryCount >= maxPhaseRetries) {
        console.error(`[self-improvement-loop] Max phase retries (${maxPhaseRetries}) exceeded for phase=${run.currentPhase}`);
        appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} ERROR: max retries exceeded (${maxPhaseRetries})`);
        finishRun("error", `Max phase retries exceeded for phase: ${run.currentPhase}`);
        return;
      }
      
      // 現在のフェーズを再ディスパッチ
      const ctxTyped = ctx as { isIdle?: () => boolean };
      const deliverAs = ctxTyped?.isIdle?.() ? undefined : "followUp" as const;
      
      // フェーズコンテキストに応じて次のフェーズを決定
      // 出力がある程度の長さがあれば、フェーズ完了とみなして次へ進む
      // NEW-001: 閾値は環境変数で設定可能（デフォルト200文字）
      const phaseCompleteThreshold = parseInt(process.env.PI_UL_PHASE_THRESHOLD ?? "200", 10) || 200;
      if (outputText.length > phaseCompleteThreshold) {
        // 出力がある程度あるので、フェーズ完了とみなす
        run.phaseRetryCount = 0; // 成功時はリセット
        switch (run.currentPhase) {
          case 'research':
            run.phaseContext.researchOutput = outputText;
            await dispatchULPhase(run, 'plan', deliverAs);
            return;
          case 'plan':
            run.phaseContext.planOutput = outputText;
            await dispatchULPhase(run, 'implement', deliverAs);
            return;
          case 'implement':
            // implementフェーズ完了時は次サイクルへ
            run.phaseContext = {};
            await dispatchULPhase(run, 'research', deliverAs);
            return;
        }
      } else {
        // 出力が短い場合は同じフェーズを再試行
        run.phaseRetryCount++;
        console.log(`[self-improvement-loop] Retrying current phase: ${run.currentPhase}, retryCount=${run.phaseRetryCount}/${maxPhaseRetries}`);
        appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} retrying phase=${run.currentPhase}, retryCount=${run.phaseRetryCount}/${maxPhaseRetries}`);
        await dispatchULPhase(run, run.currentPhase as 'research' | 'plan' | 'implement', deliverAs);
        return;
      }
    }

    // 非ULモード: 従来のサイクル処理
    // inFlightCycleがnullでも、出力にマーカーがあれば処理を継続
    if (run.inFlightCycle === null) {
      // 出力からマーカーを直接検出して処理
      const outputMarker = parseLoopCycleMarker(outputText);
      if (outputMarker && outputMarker.runId === run.runId) {
        console.log(`[self-improvement-loop] Found marker in output directly: cycle=${outputMarker.cycle}`);
        run.inFlightCycle = outputMarker.cycle;
      } else {
        // マーカーも検出されない場合、現在のサイクルを再ディスパッチ
        console.log(`[self-improvement-loop] No inFlightCycle and no marker found, redispatching cycle ${run.cycle + 1}`);
        appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} no marker found, redispatching`);
        
        const ctxTyped = ctx as { isIdle?: () => boolean };
        const deliverAs = ctxTyped?.isIdle?.() ? undefined : "followUp" as const;
        
        // 少し待機してから再ディスパッチ（レート制限対策）
        await sleepWithAbort(1000, undefined);
        dispatchNextCycle(run, deliverAs).catch(error => {
          console.error(`[self-improvement-loop] Failed to redispatch cycle: ${toErrorMessage(error)}`);
          finishRun("error", toErrorMessage(error));
        });
        return;
      }
    }

    const completedCycle = run.inFlightCycle;
    run.inFlightCycle = null;
    appendAutonomousLoopLog(run.logPath, `- ${new Date().toISOString()} completed cycle=${completedCycle}`);

    // 視座スコアをパースして記録
    if (outputText) {
      const scores = parsePerspectiveScores(outputText);
      if (scores) {
        run.perspectiveScoreHistory.push(scores);
        appendAutonomousLoopLog(run.logPath, `  perspective_scores: avg=${scores.average}, deconstruction=${scores.deconstruction}, logic=${scores.logic}`);
        
        // 高スコアの場合、成功パターンとして記録
        if (scores.average >= 75) {
          const nextFocus = parseNextFocus(outputText) || '';
          const lowScores = [
            scores.deconstruction < 70 ? '脱構築' : null,
            scores.logic < 70 ? '論理学' : null,
          ].filter(Boolean) as string[];
          
          run.successfulPatterns.push({
            cycle: completedCycle,
            averageScore: scores.average,
            actionSummary: nextFocus.slice(0, 100),
            appliedPerspectives: lowScores.length > 0 ? lowScores : ['バランス型']
          });
          
          appendAutonomousLoopLog(run.logPath, `  success_pattern_recorded: avg=${scores.average}`);
        }
      }

      // NEXT_FOCUSを抽出してサマリーに追加
      const nextFocus = parseNextFocus(outputText);
      if (nextFocus) {
        appendAutonomousLoopLog(run.logPath, `  next_focus: ${nextFocus.slice(0, 100)}...`);
      }

      // 【思考哲学的アプローチ】
      // 「測定」は「思考」を促さない。高スコア時は判定全体をスキップし、
      // プロンプトの「問い」で思考を促すアプローチに移行。
      const currentScores = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
      const shouldSkipAllChecks = currentScores && currentScores.average >= 75;
      
      if (shouldSkipAllChecks) {
        // 高スコア時は判定を完全にスキップ
        appendAutonomousLoopLog(run.logPath, `  check_mode: 問い中心（スコア良好のため判定スキップ）`);
        run.lastMetacognitiveCheck = undefined;
        run.lastInferenceDepthScore = undefined;
        run.lastImprovementActions = [];
        run.lastIntegratedDetection = undefined;
      } else {
        // 低スコア時のみ詳細な判定を実行
        try {
          const metacognitiveCheck = runMetacognitiveCheck(outputText, {
            task: run.task,
            currentMode: "self-improvement"
          });
          run.lastMetacognitiveCheck = metacognitiveCheck;
          
          const depthScore = calculateMetacognitiveDepthScore(metacognitiveCheck);
          run.lastInferenceDepthScore = depthScore;
          
          appendAutonomousLoopLog(run.logPath, `  inference_depth: ${(depthScore * 100).toFixed(0)}%, fallacies=${metacognitiveCheck.logic.fallacies.length}, aporias=${metacognitiveCheck.deconstruction.aporias.length}`);
          
          // 改善アクションを生成
          const improvementActions = generateImprovementActions(metacognitiveCheck);
          run.lastImprovementActions = improvementActions;
          
          if (improvementActions.length > 0) {
            appendAutonomousLoopLog(run.logPath, `  improvement_actions: ${improvementActions.length}件`);
          }
          
          // 統合検出（高信頼度のみ）
          const integratedDetection = runIntegratedDetection(outputText, {
            detectFallacies: true,
            detectBinaryOppositions: true,
            detectFascism: true,
            minPatternConfidence: 0.5, // 高信頼度のみ
            applyFilter: true
          });
          
          run.lastIntegratedDetection = integratedDetection;
          
          const highConfidenceCandidates = integratedDetection.candidates.filter(c => c.patternConfidence >= 0.5);
          
          if (highConfidenceCandidates.length > 0) {
            appendAutonomousLoopLog(run.logPath, `  high_confidence_detections: ${highConfidenceCandidates.length}件`);
          }
        } catch (error: unknown) {
          console.warn(`[self-improvement-loop] Metacognitive check failed: ${toErrorMessage(error)}`);
        }
      }
      
      // 【思考哲学的アプローチ】
      // 思考分類学の分析も高スコア時はスキップ
      if (!shouldSkipAllChecks) {
        try {
          const thinkingAnalysis = runIntegratedThinkingAnalysis(outputText, {
            task: run.task
          });
          
          const { modeAnalysis, issues, overallScore } = thinkingAnalysis;
          
          appendAutonomousLoopLog(run.logPath, `  thinking_mode:`);
          appendAutonomousLoopLog(run.logPath, `    primary_hat: ${modeAnalysis.primaryHat} (${HAT_NAMES[modeAnalysis.primaryHat]})`);
          appendAutonomousLoopLog(run.logPath, `    thinking_system: ${modeAnalysis.thinkingSystem}`);
          appendAutonomousLoopLog(run.logPath, `    bloom_level: ${modeAnalysis.bloomLevel}`);
          appendAutonomousLoopLog(run.logPath, `    scores: depth=${(modeAnalysis.depthScore * 100).toFixed(0)}%, diversity=${(modeAnalysis.diversityScore * 100).toFixed(0)}%, coherence=${(modeAnalysis.coherenceScore * 100).toFixed(0)}%`);
          
          if (issues.length > 0) {
            appendAutonomousLoopLog(run.logPath, `    thinking_issues: ${issues.length}件`);
          }
        } catch (error: unknown) {
          console.warn(`[self-improvement-loop] Thinking mode analysis failed: ${toErrorMessage(error)}`);
        }
      }
    }

    // サイクルサマリーを記録（次回のプロンプトで使用）
    run.cycleSummaries.push(`Cycle ${completedCycle}: 完了`);

    // 軌跡トラッカーに記録
    // BUG-EX-002修正: エラーをログに記録（元はcatch {}で無視していた）
    run.trajectoryTracker.recordStep(`Cycle ${completedCycle} completed`).catch((e) => {
      console.warn(`[self-improvement-loop] Trajectory tracking failed: ${e}`);
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
      // このサイクルで新たに変更されたファイルのみをコミット
      const { hash, message, excludedFiles } = await createGitCommitWithLLM(
        process.cwd(),
        {
          cycleNumber: completedCycle,
          runId: run.runId,
          taskSummary: run.task,
          perspectiveResults,
          filesChangedBeforeCycle: run.filesChangedBeforeCycle,
          gitignorePatternsToAdd: run.gitignorePatternsToAdd,
        },
        run.model
      );

      // 除外されたファイルがあれば.gitignoreに自動追加
      if (excludedFiles.length > 0 && run.gitignorePatternsToAdd.size > 0) {
        appendAutonomousLoopLog(run.logPath, `  excluded_files: ${excludedFiles.length}件`);
        
        const addedToGitignore = await addToGitignore(run.gitignorePatternsToAdd, process.cwd());
        if (addedToGitignore) {
          appendAutonomousLoopLog(run.logPath, `  gitignore_updated: ${run.gitignorePatternsToAdd.size}パターン追加`);
          // .gitignore自体もステージングしてコミット
          await runGitCommand(["add", ".gitignore"], process.cwd());
          const gitignoreCommitResult = await runGitCommand(
            ["commit", "-m", `chore(self-improvement-loop): .gitignoreに除外パターンを追加

サイクル${completedCycle}で検出された除外対象ファイルを.gitignoreに追加。

runId: ${run.runId}`],
            process.cwd()
          );
          if (gitignoreCommitResult.code === 0) {
            console.log(`[self-improvement-loop] .gitignore updated and committed`);
          }
          // パターンをクリア
          run.gitignorePatternsToAdd.clear();
        }
      }

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
      dispatchNextCycle(run, ctx.isIdle() ? undefined : "followUp").catch(error => {
        console.error(`[self-improvement-loop] Failed to dispatch next cycle: ${toErrorMessage(error)}`);
        finishRun("error", toErrorMessage(error));
      });
    } catch (error: unknown) {
      finishRun("error", toErrorMessage(error));
    }
  });

  // self_improvement_loop ツールを登録
  api.registerTool({
    name: "self_improvement_loop",
    label: "self_improvement_loop",
    description: "自己改善ループを開始する。ULモードでResearch→Plan→Implementの構造化されたサイクルを実行。",
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
      ul_mode: Type.Optional(Type.Boolean({
        description: "ULモードを有効にする（Research→Plan→Implement フロー）。デフォルト: true",
      })),
      auto_approve: Type.Optional(Type.Boolean({
        description: "Plan フェーズでの人間の承認をスキップする。デフォルト: true",
      })),
    }),
    execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
      const ctxTyped = ctx as { model?: unknown; isIdle?: () => boolean; cwd?: string };
      if (signal?.aborted) {
        return {
          content: [{ type: "text" as const, text: "開始前に中断されました。" }],
          details: { error: "aborted_before_start" },
        };
      }

      if (!ctxTyped?.model) {
        return {
          content: [{ type: "text" as const, text: "self_improvement_loop error: no active model." }],
          details: { error: "missing_model" },
        };
      }

      const model = resolveActiveModel(ctxTyped);
      const ulMode = params.ul_mode ?? true;
      const autoApprove = params.auto_approve ?? true;
      
      const started = startAutonomousLoop({
        task: params.task,
        maxCycles: params.max_cycles ?? 1_000_000,
        autoCommit: params.auto_commit ?? DEFAULT_CONFIG.autoCommit,
        ulMode,
        autoApprove,
        model,
        deliverAs: ctxTyped?.isIdle?.() ? undefined : "followUp",
      });

      if (started.ok) {
        return {
          content: [{
            type: "text" as const,
            text: `自己改善ループを開始しました。
runId: ${started.run.runId}
maxCycles: ${started.run.maxCycles === Infinity ? "Infinity" : started.run.maxCycles}
ulMode: ${started.run.ulMode}
autoApprove: ${started.run.autoApprove}
モデル: ${started.run.model.provider}/${started.run.model.id}
ログ: ${started.run.logPath}`,
          }],
          details: {
            runId: started.run.runId,
            startedAt: started.run.startedAt,
            maxCycles: started.run.maxCycles,
            ulMode: started.run.ulMode,
            autoApprove: started.run.autoApprove,
            logFile: started.run.logPath,
            error: undefined,
          },
        };
      }

      // Type guard: started.ok is false
      const failedStart = started as { ok: false; error: string };
      const errorMsg = failedStart.error;
      return {
        content: [{ type: "text" as const, text: `開始失敗: ${errorMsg}` }],
        details: { error: errorMsg, runId: undefined, startedAt: undefined, maxCycles: undefined, logFile: undefined },
      };
    },
  });

  // self_improvement_stop ツールを登録
  api.registerTool({
    name: "self_improvement_stop",
    label: "self_improvement_stop",
    description: "実行中の自己改善ループを停止する。現在のサイクルを完了してから安全に停止する。",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, _signal?, _onUpdate?, _ctx?) => {
      try {
        const stopPath = requestStop();

        return {
          content: [{ type: "text" as const, text: "停止信号を送信しました。現在のサイクルを完了してから安全に停止します。" }],
          details: { stopSignalPath: stopPath, error: undefined },
        };
      } catch (error: unknown) {
        return {
          content: [{ type: "text" as const, text: `エラー: ${toErrorMessage(error)}` }],
          details: { error: toErrorMessage(error), stopSignalPath: undefined },
        };
      }
    },
  });

  // self_improvement_status ツールを登録
  api.registerTool({
    name: "self_improvement_status",
    label: "self_improvement_status",
    description: "自己改善ループの状態を確認する。",
    parameters: Type.Object({}),
    execute: async (_toolCallId: string, _params: Record<string, never>, _signal?: AbortSignal, _onUpdate?: unknown, _ctx?: unknown) => {
      const config = DEFAULT_CONFIG;
      const stopPath = resolve(process.cwd(), config.stopSignalPath);
      const isStopRequested = checkStopSignal(config);

      // レート制限状態を取得
      let rateLimitStatus = "";
      const rateLimitDetails: Record<string, unknown> = {};
      
      try {
        if (activeRun) {
          const rateSummary = getCombinedRateControlSummary(activeRun.model.provider, activeRun.model.id);
          rateLimitStatus = `

## レート制限状態
- 適応制限: ${rateSummary.adaptiveLimit}
- 元の制限: ${rateSummary.originalLimit}
- 予測制限: ${rateSummary.predictiveLimit}
- 429確率: ${(rateSummary.predicted429Probability * 100).toFixed(1)}%
- スロットル推奨: ${rateSummary.shouldThrottle ? "あり" : "なし"}
- 429回数: ${rateSummary.recent429Count}`;
          
          rateLimitDetails.rateControl = rateSummary;
        }
      } catch (e) {
        rateLimitStatus = `

## レート制限状態
- 取得失敗: ${toErrorMessage(e)}`;
      }

      // 設定値を表示
      const configStatus = `

## 現在の設定
- 最大リトライ: ${RATE_LIMIT_CONFIG.maxRetries}
- 初期待機: ${RATE_LIMIT_CONFIG.initialDelayMs}ms
- 最大待機: ${RATE_LIMIT_CONFIG.maxDelayMs}ms
- サイクル間隔: ${RATE_LIMIT_CONFIG.minCycleIntervalMs}-${RATE_LIMIT_CONFIG.maxCycleIntervalMs}ms
- 視座間待機: ${RATE_LIMIT_CONFIG.perspectiveDelayMs}ms
- 429閾値: ${(RATE_LIMIT_CONFIG.high429Threshold * 100).toFixed(0)}%`;

      let statusText = `自己改善ループ状態

停止信号: ${isStopRequested ? "あり" : "なし"}
信号ファイル: ${stopPath}
実行状態: ${activeRun ? `running (runId=${activeRun.runId}, cycle=${activeRun.cycle})` : "idle"}${rateLimitStatus}${configStatus}`;

      let details: Record<string, unknown> = {
        stopRequested: isStopRequested,
        stopSignalPath: stopPath,
        logDir: resolve(process.cwd(), config.logDir),
        running: Boolean(activeRun),
        runId: activeRun?.runId,
        cycle: activeRun?.cycle,
        config: RATE_LIMIT_CONFIG,
        ...rateLimitDetails,
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
          model: activeRun.model,
        };
      }

      statusText += `

停止するには: self_improvement_stop ツールを実行`;

      return {
        content: [{ type: "text" as const, text: statusText }],
        details,
      };
    },
  });

  // ============================================================================
  // スラッシュコマンド
  // ============================================================================

  // /self-improvement-loop コマンド
  api.registerCommand("self-improvement-loop", {
    description: "7つの哲学的視座に基づく自己改善ループを開始（ULモード対応）",
    handler: async (args: string, ctx) => {
      const parts = args.trim().split(/\s+/);
      let task = "";
      let maxCycles: number | undefined;
      let ulMode = true;        // デフォルトでULモード有効
      let autoApprove = true;   // デフォルトで自動承認

      for (const part of parts) {
        if (part.startsWith("--max-cycles=")) {
          const val = parseInt(part.split("=")[1], 10);
          if (!isNaN(val) && val >= 1 && val <= 1000000) {
            maxCycles = val;
          }
        } else if (part === "--no-ul-mode") {
          ulMode = false;
        } else if (part === "--require-approval") {
          autoApprove = false;
        } else if (part !== "") {
          task += (task ? " " : "") + part;
        }
      }

      if (!task) {
        ctx.ui.notify("使用法: /self-improvement-loop <タスク> [--max-cycles=N] [--no-ul-mode] [--require-approval]", "warning");
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

      const modeDesc = ulMode ? `ULモード (${autoApprove ? '自動承認' : '承認要求'})` : '従来モード';
      ctx.ui.notify(`自己改善ループを開始します (${modeDesc}): "${task.slice(0, 50)}${task.length > 50 ? "..." : ""}"`, "info");
      const model = resolveActiveModel(ctx);

      const started = startAutonomousLoop({
        task,
        maxCycles: maxCycles ?? 1_000_000,
        autoCommit: DEFAULT_CONFIG.autoCommit,
        ulMode,
        autoApprove,
        model,
        deliverAs: ctx.isIdle() ? undefined : "followUp",
      });

      if (!started.ok) {
        const failedStart = started as { ok: false; error: string };
        ctx.ui.notify(`自己改善ループ開始エラー: ${failedStart.error}`, "error");
        return;
      }

      ctx.ui.notify(`自己改善ループ開始: runId=${started.run.runId}, ulMode=${ulMode}`, "info");
    },
  });

  // /self-improvement-stop コマンド
  api.registerCommand("self-improvement-stop", {
    description: "実行中の自己改善ループを停止",
    handler: async (_args: string, ctx) => {
      try {
        requestStop();

        ctx.ui.notify("停止信号を送信しました。現在のサイクルを完了してから安全に停止します。", "info");
      } catch (error: unknown) {
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
