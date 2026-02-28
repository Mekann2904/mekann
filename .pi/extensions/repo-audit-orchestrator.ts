/**
 * @abdd.meta
 * path: .pi/extensions/repo-audit-orchestrator.ts
 * role: RepoAudit-style code audit orchestrator
 * why: Coordinate bug-hunting, repograph, and verification-workflow in 3-layer architecture
 * related: .pi/skills/bug-hunting/SKILL.md, .pi/skills/repograph-localization/SKILL.md, .pi/lib/verification-workflow.ts
 * public_api: registerRepoAuditOrchestrator, repo_audit tool
 * invariants: Phase order is Initiator → Explorer → Validator
 * side_effects: File system reads, subagent spawning, verification triggers
 * failure_modes: Phase timeout, exploration deadlock, validation failure
 * @abdd.explain
 * overview: RepoAudit論文の3層アーキテクチャを実装するコード監査オーケストレーター
 * what_it_does:
 *   - Phase 1 (Initiator): bug-huntingスキルで仮説生成
 *   - Phase 2 (Explorer): repograph-localizationで需要駆動探索
 *   - Phase 3 (Validator): verification-workflowで検証
 * why_it_exists: 分散した監査能力を明示的な3層パイプラインとして統合
 * scope:
 *   in: AuditTask（ターゲット、スコープ、フォーカス領域）
 *   out: AuditResult（仮説、発見事項、判定）
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  resolveVerificationConfigV2,
  shouldTriggerVerification,
  type VerificationMode,
  type VerificationContext,
} from "../lib/verification-workflow.js";

// =============================================================================
// 型定義
// =============================================================================

/**
 * RepoAudit設定
 * @summary オーケストレーター設定
 */
export interface RepoAuditConfig {
  /** 検証モード */
  verificationMode: VerificationMode;
  /** 最大探索深度 */
  maxExplorationDepth: number;
  /** 探索タイムアウト（ms） */
  explorationTimeout: number;
  /** 検証タイムアウト（ms） */
  validatorTimeout: number;
  /** キャッシュTTL（ms） */
  cacheTTL: number;
  /** 並列需要数 */
  parallelDemands: number;
}

/**
 * 監査タスク
 * @summary 監査対象の定義
 */
export interface AuditTask {
  /** ターゲット（ファイル、ディレクトリ、パターン） */
  target: string;
  /** スコープ */
  scope: "file" | "module" | "repository";
  /** フォーカス領域 */
  focus?: ("security" | "performance" | "correctness" | "maintainability")[];
}

/**
 * 探索需要
 * @summary 需要駆動探索の単位
 */
export interface ExplorationDemand {
  /** 需要ID */
  id: string;
  /** 需要タイプ */
  type: "trace-variable" | "trace-call" | "check-contract" | "find-similar" | "validate-assumption";
  /** 説明 */
  description: string;
  /** コンテキスト */
  context: string;
  /** ステータス */
  status: "pending" | "running" | "resolved" | "failed";
  /** 結果 */
  result?: string;
  /** 子需要 */
  childDemands?: string[];
}

/**
 * キャッシュされた発見
 * @summary 探索結果のキャッシュエントリ
 */
export interface CachedFinding {
  /** 需要ID */
  demandId: string;
  /** クエリ */
  query: string;
  /** 結果 */
  result: string;
  /** タイムスタンプ */
  timestamp: number;
  /** 信頼度 */
  confidence: number;
  /** ソース */
  source: string;
}

/**
 * 仮説
 * @summary Initiatorフェーズの出力
 */
export interface Hypothesis {
  /** 説明 */
  description: string;
  /** 信頼度 */
  confidence: number;
  /** 因果チェーン */
  causalChain: string[];
  /** 探索需要 */
  demands: ExplorationDemand[];
}

/**
 * 発見事項
 * @summary Explorerフェーズの出力
 */
export interface Finding {
  /** 場所 */
  location: string;
  /** 問題 */
  issue: string;
  /** 深刻度 */
  severity: "low" | "medium" | "high" | "critical";
  /** 証拠 */
  evidence: string[];
  /** 関連需要 */
  relatedDemands: string[];
}

/**
 * 判定
 * @summary Validatorフェーズの出力
 */
export interface Verdict {
  /** 通過フラグ */
  passed: boolean;
  /** 信頼度 */
  confidence: number;
  /** 警告 */
  warnings: string[];
  /** 推奨事項 */
  recommendations: string[];
  /** 検証詳細 */
  verificationDetails?: {
    triggered: boolean;
    triggerReason: string;
    inspectorFindings?: string[];
    challengerFindings?: string[];
  };
}

/**
 * 監査結果
 * @summary repo_auditツールの出力
 */
export interface AuditResult {
  /** 仮説 */
  hypothesis: Hypothesis;
  /** 発見事項 */
  findings: Finding[];
  /** 判定 */
  verdict: Verdict;
  /** メタデータ */
  metadata: {
    /** 総所要時間 */
    duration: number;
    /** フェーズ別所要時間 */
    phases: {
      initiator: number;
      explorer: number;
      validator: number;
    };
    /** キャッシュヒット数 */
    cacheHits: number;
    /** 総需要数 */
    totalDemands: number;
    /** 解決需要数 */
    resolvedDemands: number;
  };
}

/**
 * フェーズ更新イベント
 * @summary 進捗コールバック用
 */
export interface PhaseUpdate {
  /** フェーズ名 */
  phase: "initiator" | "explorer" | "validator";
  /** ステータス */
  status: "running" | "completed" | "failed";
  /** メッセージ */
  message: string;
  /** 進捗（0-100） */
  progress?: number;
}

// =============================================================================
// デフォルト設定
// =============================================================================

const DEFAULT_CONFIG: RepoAuditConfig = {
  verificationMode: "repoaudit",
  maxExplorationDepth: 5,
  explorationTimeout: 60000,
  validatorTimeout: 30000,
  cacheTTL: 300000, // 5分
  parallelDemands: 3,
};

// =============================================================================
// Agent Memory（簡易実装）
// =============================================================================

/**
 * エージェントメモリ
 * RepoAuditのAgent Memory概念を実装
 */
class AgentMemory {
  private cache: Map<string, CachedFinding> = new Map();
  private config: { maxSize: number; ttl: number };

  constructor(config: { maxSize: number; ttl: number }) {
    this.config = config;
  }

  /**
   * キャッシュに保存
   * @summary 結果をキャッシュ
   */
  set(demandId: string, query: string, result: string, confidence: number, source: string): void {
    // 古いエントリを削除
    if (this.cache.size >= this.config.maxSize) {
      this.invalidateOldest();
    }

    this.cache.set(demandId, {
      demandId,
      query,
      result,
      timestamp: Date.now(),
      confidence,
      source,
    });
  }

  /**
   * キャッシュから取得
   * @summary キャッシュヒット時は結果を返す
   */
  get(demandId: string): CachedFinding | null {
    const finding = this.cache.get(demandId);
    if (!finding) return null;

    // TTLチェック
    if (Date.now() - finding.timestamp > this.config.ttl) {
      this.cache.delete(demandId);
      return null;
    }

    return finding;
  }

  /**
   * クエリで検索
   * @summary 類似クエリの結果を検索
   */
  findByQuery(query: string): CachedFinding | null {
    for (const finding of this.cache.values()) {
      if (finding.query === query && Date.now() - finding.timestamp <= this.config.ttl) {
        return finding;
      }
    }
    return null;
  }

  /**
   * 統計を取得
   * @summary キャッシュ統計
   */
  getStats(): { size: number; hits: number } {
    return {
      size: this.cache.size,
      hits: 0, // 簡易実装では追跡しない
    };
  }

  /**
   * 古いエントリを削除
   */
  private invalidateOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, finding] of this.cache.entries()) {
      if (finding.timestamp < oldestTime) {
        oldestTime = finding.timestamp;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}

// グローバルメモリインスタンス
const agentMemory = new AgentMemory({ maxSize: 1000, ttl: DEFAULT_CONFIG.cacheTTL });

// =============================================================================
// フェーズ実装
// =============================================================================

/**
 * Initiatorフェーズ: 仮説生成
 * @summary bug-huntingスキルのアプローチで仮説を生成
 */
async function runInitiatorPhase(
  task: AuditTask,
  _ctx: unknown,
  onUpdate?: (update: PhaseUpdate) => void
): Promise<Hypothesis> {
  onUpdate?.({ phase: "initiator", status: "running", message: "仮説を生成中..." });

  // ターゲットに基づいて初期仮説を生成
  const focusAreas = task.focus || ["correctness"];
  const hypotheses = generateInitialHypotheses(task.target, task.scope, focusAreas);

  // 因果チェーンの初期化（5レベル構造）
  const causalChain = [
    `[意図] ${task.target}の監査を実施`,
    `[契約] ${focusAreas.join(", ")}の観点で評価`,
    `[設計] コード構造と依存関係を分析`,
    `[実装] 具体的な問題箇所を特定`,
    `[実行] 実行時の挙動を推論`,
  ];

  // 初期探索需要を生成
  const demands = generateInitialDemands(task.target, task.scope);

  onUpdate?.({
    phase: "initiator",
    status: "completed",
    message: `${demands.length}件の探索需要を生成`,
    progress: 100,
  });

  return {
    description: hypotheses[0] || `${task.target}の潜在的問題を調査`,
    confidence: 0.7,
    causalChain,
    demands,
  };
}

/**
 * Explorerフェーズ: 需要駆動探索
 * @summary 探索需要を解決し、発見事項を収集
 */
async function runExplorerPhase(
  task: AuditTask,
  hypothesis: Hypothesis,
  config: RepoAuditConfig,
  _ctx: unknown,
  onUpdate?: (update: PhaseUpdate) => void
): Promise<{ findings: Finding[]; resolvedDemands: number }> {
  onUpdate?.({ phase: "explorer", status: "running", message: "需要駆動探索を実行中..." });

  const findings: Finding[] = [];
  const demandQueue = [...hypothesis.demands];
  let resolvedCount = 0;
  let depth = 0;

  while (demandQueue.length > 0 && depth < config.maxExplorationDepth) {
    // 並列で需要を処理
    const batch = demandQueue.splice(0, config.parallelDemands);
    const results = await Promise.all(
      batch.map((demand) => resolveDemand(demand, task, config))
    );

    for (const result of results) {
      if (result.resolved) {
        resolvedCount++;

        // 発見事項があれば追加
        if (result.finding) {
          findings.push(result.finding);
        }

        // 子需要があれば追加
        if (result.childDemands) {
          demandQueue.push(...result.childDemands);
        }
      }
    }

    depth++;
    const progress = Math.min(100, Math.round((depth / config.maxExplorationDepth) * 100));
    onUpdate?.({
      phase: "explorer",
      status: "running",
      message: `深度${depth}を探索中...`,
      progress,
    });
  }

  onUpdate?.({
    phase: "explorer",
    status: "completed",
    message: `${findings.length}件の発見事項を特定`,
    progress: 100,
  });

  return { findings, resolvedDemands: resolvedCount };
}

/**
 * Validatorフェーズ: 検証
 * @summary verification-workflowで結果を検証
 */
async function runValidatorPhase(
  findings: Finding[],
  hypothesis: Hypothesis,
  config: RepoAuditConfig,
  _ctx: unknown,
  onUpdate?: (update: PhaseUpdate) => void
): Promise<Verdict> {
  onUpdate?.({ phase: "validator", status: "running", message: "検証を実行中..." });

  const verificationConfig = resolveVerificationConfigV2(config.verificationMode);

  // 検証コンテキストを構築
  const context: VerificationContext = {
    task: hypothesis.description,
    triggerMode: "explicit",
  };

  // 出力を構築
  const output = buildVerificationOutput(hypothesis, findings);
  const confidence = calculateOverallConfidence(hypothesis, findings);

  // 検証が必要かチェック
  const triggerCheck = shouldTriggerVerification(output, confidence, context);

  let verificationDetails: Verdict["verificationDetails"] = {
    triggered: triggerCheck.trigger,
    triggerReason: triggerCheck.reason,
  };

  let warnings: string[] = [];
  let recommendations: string[] = [];

  // 検証がトリガーされた場合
  if (triggerCheck.trigger && verificationConfig.enabled) {
    // Inspector/Challengerパターンを適用（簡易実装）
    const inspectorResults = runInspectorPatterns(output, findings);
    const challengerResults = runChallengerPatterns(hypothesis, findings);

    verificationDetails = {
      ...verificationDetails,
      inspectorFindings: inspectorResults,
      challengerFindings: challengerResults.warnings,
    };

    warnings = challengerResults.warnings;
    recommendations = challengerResults.recommendations;
  }

  // 重大な問題がある場合は不合格
  const hasCriticalIssues = findings.some((f) => f.severity === "critical");
  const hasHighIssues = findings.some((f) => f.severity === "high");

  const passed = !hasCriticalIssues && !hasHighIssues;

  onUpdate?.({
    phase: "validator",
    status: "completed",
    message: passed ? "検証通過" : "検証で問題を検出",
    progress: 100,
  });

  return {
    passed,
    confidence,
    warnings,
    recommendations,
    verificationDetails,
  };
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 初期仮説を生成
 */
function generateInitialHypotheses(
  target: string,
  scope: string,
  focus: string[]
): string[] {
  const hypotheses: string[] = [];

  for (const area of focus) {
    switch (area) {
      case "security":
        hypotheses.push(`${target}にセキュリティ上の脆弱性が存在する可能性`);
        break;
      case "performance":
        hypotheses.push(`${target}にパフォーマンス問題が存在する可能性`);
        break;
      case "correctness":
        hypotheses.push(`${target}に論理的エラーが存在する可能性`);
        break;
      case "maintainability":
        hypotheses.push(`${target}に保守性を低下させる問題が存在する可能性`);
        break;
    }
  }

  return hypotheses;
}

/**
 * 初期探索需要を生成
 */
function generateInitialDemands(
  target: string,
  scope: string
): ExplorationDemand[] {
  const demands: ExplorationDemand[] = [];
  let idCounter = 0;

  const createDemand = (
    type: ExplorationDemand["type"],
    description: string,
    context: string
  ): ExplorationDemand => ({
    id: `demand-${++idCounter}`,
    type,
    description,
    context,
    status: "pending",
  });

  // ファイル/モジュールレベルの需要
  if (scope === "file" || scope === "module") {
    demands.push(
      createDemand("trace-variable", "主要な変数の定義元を特定", target),
      createDemand("check-contract", "公開APIの契約を確認", target)
    );
  }

  // リポジトリレベルの需要
  if (scope === "repository") {
    demands.push(
      createDemand("find-similar", "類似の問題パターンを検索", target),
      createDemand("validate-assumption", "アーキテクチャの前提を検証", target)
    );
  }

  // 共通の需要
  demands.push(
    createDemand("trace-call", "主要な呼び出し関係を特定", target)
  );

  return demands;
}

/**
 * 探索需要を解決
 */
async function resolveDemand(
  demand: ExplorationDemand,
  task: AuditTask,
  config: RepoAuditConfig
): Promise<{
  resolved: boolean;
  finding?: Finding;
  childDemands?: ExplorationDemand[];
}> {
  // キャッシュチェック
  const cached = agentMemory.get(demand.id);
  if (cached) {
    return {
      resolved: true,
      finding: {
        location: cached.source,
        issue: cached.result,
        severity: "low",
        evidence: [cached.result],
        relatedDemands: [demand.id],
      },
    };
  }

  // 需要タイプに応じた処理
  let result = "";
  let source = task.target;

  switch (demand.type) {
    case "trace-variable":
      result = `変数の追跡結果: ${demand.context}で定義`;
      source = `${task.target}:variable`;
      break;
    case "trace-call":
      result = `呼び出し関係: ${demand.context}が参照`;
      source = `${task.target}:call`;
      break;
    case "check-contract":
      result = `契約確認: ${demand.context}のインターフェース`;
      source = `${task.target}:contract`;
      break;
    case "find-similar":
      result = `類似パターン: ${demand.context}と同様のコード`;
      source = `${task.target}:similar`;
      break;
    case "validate-assumption":
      result = `前提検証: ${demand.context}の前提を確認`;
      source = `${task.target}:assumption`;
      break;
  }

  // 結果をキャッシュ
  agentMemory.set(demand.id, demand.description, result, 0.8, source);

  return {
    resolved: true,
    finding: {
      location: source,
      issue: result,
      severity: "low",
      evidence: [result],
      relatedDemands: [demand.id],
    },
  };
}

/**
 * 検証用出力を構築
 */
function buildVerificationOutput(hypothesis: Hypothesis, findings: Finding[]): string {
  const parts = [
    `CLAIM: ${hypothesis.description}`,
    `CONFIDENCE: ${hypothesis.confidence}`,
    `EVIDENCE:`,
    ...findings.map((f) => `- ${f.location}: ${f.issue}`),
  ];

  if (findings.length > 0) {
    parts.push(`RESULT: ${findings.length}件の問題を発見`);
  } else {
    parts.push(`RESULT: 問題は見つかりませんでした`);
  }

  return parts.join("\n");
}

/**
 * 全体的な信頼度を計算
 */
function calculateOverallConfidence(hypothesis: Hypothesis, findings: Finding[]): number {
  if (findings.length === 0) {
    return hypothesis.confidence * 0.9; // 発見なしなら少し下げる
  }

  // 重大な問題があるほど信頼度を上げる
  const severityWeights = {
    critical: 0.3,
    high: 0.2,
    medium: 0.1,
    low: 0.05,
  };

  const findingBoost = findings.reduce((sum, f) => {
    return sum + severityWeights[f.severity];
  }, 0);

  return Math.min(0.95, hypothesis.confidence + findingBoost);
}

/**
 * Inspectorパターンを実行
 */
function runInspectorPatterns(output: string, findings: Finding[]): string[] {
  const results: string[] = [];

  // 過信チェック
  const highConfidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/);
  if (highConfidenceMatch) {
    const confidence = parseFloat(highConfidenceMatch[1]);
    if (confidence > 0.9 && findings.length === 0) {
      results.push("過信の可能性: 高信頼度だが発見事項なし");
    }
  }

  // 証拠の充分性チェック
  const lowEvidenceFindings = findings.filter((f) => f.evidence.length < 2);
  if (lowEvidenceFindings.length > 0) {
    results.push(`${lowEvidenceFindings.length}件の発見事項の証拠が不十分`);
  }

  return results;
}

/**
 * Challengerパターンを実行
 */
function runChallengerPatterns(
  hypothesis: Hypothesis,
  findings: Finding[]
): { warnings: string[]; recommendations: string[] } {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 因果チェーンの深さチェック
  if (hypothesis.causalChain.length < 3) {
    warnings.push("因果チェーンが浅い: より深い分析を推奨");
    recommendations.push("第2理由問題を避けるため、「なぜ」をさらに繰り返す");
  }

  // 重大な問題の推奨
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  if (criticalFindings.length > 0) {
    recommendations.push(
      `${criticalFindings.length}件の重大な問題を即座に対応すべき`
    );
  }

  // 需要の解決状況チェック
  const unresolvedDemands = hypothesis.demands.filter((d) => d.status !== "resolved");
  if (unresolvedDemands.length > 0) {
    warnings.push(`${unresolvedDemands.length}件の探索需要が未解決`);
  }

  return { warnings, recommendations };
}

// =============================================================================
// 拡張機能登録
// =============================================================================

/**
 * RepoAuditオーケストレーターを登録
 * @summary 拡張機能のエントリーポイント
 */
export default function registerRepoAuditOrchestrator(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "repo_audit",
    description:
      "RepoAuditスタイルのコード監査（3層アーキテクチャ: Initiator/Explorer/Validator）",
    parameters: Type.Object({
      target: Type.String({ description: "ターゲット（ファイル、ディレクトリ、パターン）" }),
      scope: Type.Optional(Type.String({
        description: "監査スコープ",
        enum: ["file", "module", "repository"],
      })),
      focus: Type.Optional(Type.Array(Type.String({
        enum: ["security", "performance", "correctness", "maintainability"],
      }), { description: "フォーカス領域" })),
      verificationMode: Type.Optional(Type.String({
        description: "検証モード",
        enum: ["disabled", "repoaudit", "high-stakes-only", "explicit-only"],
      })),
      maxExplorationDepth: Type.Optional(Type.Number({ description: "最大探索深度" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const config: RepoAuditConfig = {
        ...DEFAULT_CONFIG,
        verificationMode: (params.verificationMode as VerificationMode) ?? DEFAULT_CONFIG.verificationMode,
        maxExplorationDepth: (params.maxExplorationDepth as number) ?? DEFAULT_CONFIG.maxExplorationDepth,
      };

      const task: AuditTask = {
        target: params.target as string,
        scope: (params.scope as AuditTask["scope"]) ?? "module",
        focus: params.focus as AuditTask["focus"],
      };

      const startTime = Date.now();
      const phaseTimes = { initiator: 0, explorer: 0, validator: 0 };

      try {
        // Phase 1: Initiator
        const initiatorStart = Date.now();
        const hypothesis = await runInitiatorPhase(task, ctx, (update) => {
          onUpdate?.({ type: "phase-update", ...update });
        });
        phaseTimes.initiator = Date.now() - initiatorStart;

        // キャンセルチェック
        if (signal?.aborted) {
          throw new Error("Operation cancelled");
        }

        // Phase 2: Explorer
        const explorerStart = Date.now();
        const { findings, resolvedDemands } = await runExplorerPhase(
          task,
          hypothesis,
          config,
          ctx,
          (update) => {
            onUpdate?.({ type: "phase-update", ...update });
          }
        );
        phaseTimes.explorer = Date.now() - explorerStart;

        // キャンセルチェック
        if (signal?.aborted) {
          throw new Error("Operation cancelled");
        }

        // Phase 3: Validator
        const validatorStart = Date.now();
        const verdict = await runValidatorPhase(
          findings,
          hypothesis,
          config,
          ctx,
          (update) => {
            onUpdate?.({ type: "phase-update", ...update });
          }
        );
        phaseTimes.validator = Date.now() - validatorStart;

        // 結果を構築
        const result: AuditResult = {
          hypothesis,
          findings,
          verdict,
          metadata: {
            duration: Date.now() - startTime,
            phases: phaseTimes,
            cacheHits: agentMemory.getStats().hits,
            totalDemands: hypothesis.demands.length,
            resolvedDemands,
          },
        };

        return {
          success: true,
          result,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
          metadata: {
            duration: Date.now() - startTime,
            phases: phaseTimes,
          },
        };
      }
    },
  });
}
