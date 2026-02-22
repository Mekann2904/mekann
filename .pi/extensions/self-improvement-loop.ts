/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-loop.ts
 * role: 7つの哲学的視座に基づく自己改善ループモードを提供する拡張機能
 * why: エージェントが継続的に自己改善を行い、認知バイアスを検出し、批判的思考を実践するため
 * related: .pi/skills/self-improvement/SKILL.md, .pi/extensions/loop.ts, .pi/skills/git-workflow/SKILL.md
 * public_api: self_improvement_loop ツール、停止信号管理、ログ生成
 * invariants: ユーザー停止信号は即座に尊重、各サイクル完了時にGit管理を実施、未完了タスクは安全に終了
 * side_effects: ファイルシステムへのログ書き込み、Git操作、ファイル編集
 * failure_modes: 停止信号の検出遅延、Gitコンフリクト、リソース枯渇
 * @abdd.explain
 * overview: 7つの哲学的視座（脱構築、スキゾ分析、幸福論、ユートピア/ディストピア論、思考哲学、思考分類学、論理学）を循環的に適用し、終わりなき自己改善を実践する
 * what_it_does:
 *   - 各サイクルで7つの視座を順次適用し、自己分析と改善を実施
 *   - ユーザーからの停止要求を検出し、現在のタスクを完了してから安全に停止
 *   - 各サイクル完了時にGitコミットを作成
 *   - 作業ログをMarkdown形式で自動生成
 * why_it_exists:
 *   - エージェントが単なるタスク実行者を超え、自己批判的で成長し続ける存在になるため
 *   - 認知バイアスの検出と是正を自動化するため
 *   - 哲学的深度を持った思考プロセスを維持するため
 * scope:
 *   in: ユーザーの初期タスク、停止信号、自己改善スキル定義
 *   out: 改善されたコード/ドキュメント、Git履歴、作業ログ、分析レポート
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
import { callModelViaPi as sharedCallModelViaPi } from "./shared/pi-print-executor.js";

// ============================================================================
// 型定義
// ============================================================================

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

// ============================================================================
// ユーティリティ関数
// ============================================================================

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

async function createGitCommit(message: string, cwd: string): Promise<string | null> {
  try {
    // Stage all changes
    await runGitCommand(["add", "-A"], cwd);

    // Create commit
    const result = await runGitCommand(["commit", "-m", message], cwd);

    if (result.code === 0) {
      // Get commit hash
      const hashResult = await runGitCommand(["rev-parse", "HEAD"], cwd);
      return hashResult.stdout.trim().slice(0, 7);
    }

    // No changes to commit
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

async function callModel(prompt: string, systemPrompt: string, timeoutMs: number = 120000): Promise<string> {
  try {
    const result = await sharedCallModelViaPi({
      model: {
        provider: "anthropic",
        id: "claude-sonnet-4-20250514",
        thinkingLevel: "medium" as ThinkingLevel,
      },
      prompt: `${systemPrompt}\n\n---\n\n${prompt}`,
      timeoutMs,
      entityLabel: "self-improvement-loop",
    });
    return result;
  } catch (error) {
    console.error(`[self-improvement-loop] Model call failed: ${toErrorMessage(error)}`);
    throw error;
  }
}

// ============================================================================
// メインループ関数
// ============================================================================

async function runSelfImprovementLoop(
  task: string,
  config: Required<SelfImprovementLoopConfig>
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
      // 停止信号をチェック
      if (checkStopSignal(config)) {
        state.stopRequested = true;
        state.stopReason = "user_request";
        console.log(`[self-improvement-loop] Stop signal detected: runId=${state.runId}`);
        break;
      }

      state.currentCycle++;
      const cycleResult = await runCycle(state, config);

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

      // Git管理
      if (config.autoCommit && cycleResult.improvements.length > 0) {
        const commitMessage = `feat(self-improvement): cycle ${state.currentCycle} - ${cycleResult.improvements.length} improvements

${cycleResult.summary}

Perspectives applied:
${cycleResult.perspectiveResults.map((r) => `- ${PERSPECTIVES.find((p) => p.name === r.perspective)?.displayName}: ${(r.score * 100).toFixed(0)}%`).join("\n")}

Run ID: ${state.runId}`;
        const commitHash = await createGitCommit(commitMessage, process.cwd());
        if (commitHash) {
          state.lastCommitHash = commitHash;
          cycleResult.commitHash = commitHash;
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
    }
  } catch (error) {
    state.stopReason = "error";
    console.error(`[self-improvement-loop] Error: ${toErrorMessage(error)}`);
  }

  // 最終ログを記録
  writeLogFooter(logPath, state);
  clearStopSignal(config);

  console.log(`[self-improvement-loop] Finished: runId=${state.runId}, cycles=${state.currentCycle}, improvements=${state.totalImprovements}, stopReason=${state.stopReason}`);

  return state;
}

async function runCycle(
  state: SelfImprovementLoopState,
  config: Required<SelfImprovementLoopConfig>
): Promise<CycleResult> {
  const perspectiveResults: PerspectiveResult[] = [];
  const allImprovements: string[] = [];

  // 7つの視座を順次適用
  for (let i = 0; i < PERSPECTIVES.length; i++) {
    const perspective = state.perspectiveStates[i];
    const prompt = buildPerspectivePrompt(perspective, state.task, perspectiveResults);

    // LLMに分析を依頼
    const systemPrompt = `あなたは自己改善エージェントです。${perspective.displayName}の観点から自己分析を行ってください。

重要なルール:
- 日本語で回答してください
- 具体的で実行可能な改善を提案してください
- 曖昧な表現を避けてください
- 自分の仮説を否定する証拠を探してください`;

    const output = await callModel(prompt, systemPrompt);

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
  }

  // サイクルのサマリーを生成
  const avgScore = perspectiveResults.reduce((sum, r) => sum + r.score, 0) / 7;
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

  // self_improvement_loop ツールを登録
  api.registerTool({
    name: "self_improvement_loop",
    label: "self_improvement_loop",
    description: "7つの哲学的視座に基づく自己改善ループを実行。ユーザーが停止するまで継続的に自己改善を行う。",
    parameters: Type.Object({
      task: Type.String({
        description: "自己改善の対象となるタスクまたは目標",
      }),
      max_cycles: Type.Optional(Type.Number({
        description: "最大サイクル数（省略時は無制限）",
        minimum: 1,
        maximum: 100,
      })),
      auto_commit: Type.Optional(Type.Boolean({
        description: "各サイクル完了時に自動的にGitコミットを作成するか（デフォルト: true）",
      })),
    }),
    execute: async (_toolCallId: string, params: SelfImprovementLoopParams) => {
      const config: Required<SelfImprovementLoopConfig> = {
        ...DEFAULT_CONFIG,
        maxCycles: params.max_cycles ?? DEFAULT_CONFIG.maxCycles,
        autoCommit: params.auto_commit ?? DEFAULT_CONFIG.autoCommit,
      };

      try {
        const state = await runSelfImprovementLoop(params.task, config);
        const logPath = createLogFilePath(config, state.runId);

        const text = `自己改善ループ完了

実行ID: ${state.runId}
総サイクル数: ${state.currentCycle}
総改善数: ${state.totalImprovements}
停止理由: ${state.stopReason ?? "完了"}
最終コミット: ${state.lastCommitHash ?? "なし"}

ログファイル: ${logPath}

## 最終サマリー
${state.summary}

## 視座別スコア
${state.perspectiveStates.map((ps) => `- ${ps.displayName}: ${(ps.score * 100).toFixed(0)}%`).join("\n")}`;

        return {
          content: [{ type: "text" as const, text }],
          details: {
            runId: state.runId,
            cycles: state.currentCycle,
            improvements: state.totalImprovements,
            stopReason: state.stopReason,
            logFile: logPath,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `エラー: ${toErrorMessage(error)}` }],
          details: { error: toErrorMessage(error) },
        };
      }
    },
  } as any);

  // self_improvement_stop ツールを登録
  api.registerTool({
    name: "self_improvement_stop",
    label: "self_improvement_stop",
    description: "実行中の自己改善ループを停止する。現在のサイクルを完了してから安全に停止する。",
    parameters: Type.Object({}),
    execute: async () => {
      const config = DEFAULT_CONFIG;
      const stopPath = resolve(process.cwd(), config.stopSignalPath);

      try {
        // 停止信号ファイルを作成
        mkdirSync(resolve(process.cwd(), config.logDir), { recursive: true });
        writeFileSync(stopPath, "STOP", "utf-8");

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

      const text = `自己改善ループ状態

停止信号: ${isStopRequested ? "あり" : "なし"}
信号ファイル: ${stopPath}

停止するには: self_improvement_stop ツールを実行`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          stopRequested: isStopRequested,
          stopSignalPath: stopPath,
          logDir: resolve(process.cwd(), config.logDir),
        },
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
          if (!isNaN(val) && val >= 1 && val <= 100) {
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

      if (!ctx.model) {
        ctx.ui.notify("自己改善ループの開始に失敗: アクティブなモデルがありません", "error");
        return;
      }

      ctx.ui.notify(`自己改善ループを開始します: "${task.slice(0, 50)}${task.length > 50 ? "..." : ""}"`, "info");

      // ツールを実行
      const config: Required<SelfImprovementLoopConfig> = {
        ...DEFAULT_CONFIG,
        maxCycles: maxCycles ?? DEFAULT_CONFIG.maxCycles,
        autoCommit: DEFAULT_CONFIG.autoCommit,
      };

      try {
        const state = await runSelfImprovementLoop(task, config);
        const logPath = createLogFilePath(config, state.runId);

        api.sendMessage({
          customType: "self-improvement-loop-result",
          content: `## 自己改善ループ完了

実行ID: \`${state.runId}\`
総サイクル数: ${state.currentCycle}
総改善数: ${state.totalImprovements}
停止理由: ${state.stopReason ?? "完了"}
最終コミット: ${state.lastCommitHash ?? "なし"}
ログファイル: \`${logPath}\`

### 最終サマリー
${state.summary}

### 視座別スコア
${state.perspectiveStates.map((ps) => `- **${ps.displayName}**: ${(ps.score * 100).toFixed(0)}%`).join("\n")}`,
          display: true,
          details: {
            runId: state.runId,
            cycles: state.currentCycle,
            improvements: state.totalImprovements,
            stopReason: state.stopReason,
            logFile: logPath,
          },
        });
      } catch (error) {
        ctx.ui.notify(`自己改善ループでエラーが発生しました: ${toErrorMessage(error)}`, "error");
      }
    },
  });

  // /self-improvement-stop コマンド
  api.registerCommand("self-improvement-stop", {
    description: "実行中の自己改善ループを停止",
    handler: async (_args: string, ctx) => {
      const config = DEFAULT_CONFIG;
      const stopPath = resolve(process.cwd(), config.stopSignalPath);

      try {
        mkdirSync(resolve(process.cwd(), config.logDir), { recursive: true });
        writeFileSync(stopPath, "STOP", "utf-8");

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

停止するには: \`/self-improvement-stop\` コマンドを実行`,
        display: true,
        details: {
          stopRequested: isStopRequested,
          stopSignalPath: stopPath,
          logDir,
        },
      });
    },
  });

  console.log("[self-improvement-loop] Extension loaded successfully");
};
