/**
 * @abdd.meta
 * path: .pi/extensions/shared/verification-hooks.ts
 * role: 検証フックのエントリーポイントおよび設定解決モジュール
 * why: 論文「Large Language Model Reasoning Failures」の推奨事項に基づき、サブエージェント実行後の出力を自動検証するため
 * related: .pi/lib/verification-workflow.js, .pi/lib/comprehensive-logger.js
 * public_api: VerificationHookConfig, VerificationHookResult, resolveVerificationHookConfig, postSubagentVerificationHook
 * invariants: resolveVerificationHookConfigの返すenabledはmodeに依存する、logResultsは環境変数PI_VERIFICATION_LOGに依存する
 * side_effects: 環境変数を読み込む、ロガーを通じて操作ログを出力する
 * failure_modes: 環境変数の未定義によるデフォルト設定の適用、runVerificationAgent関数の実行失敗
 * @abdd.explain
 * overview: サブエージェント出力に対する検証プロセスのトリガーと制御を行う
 * what_it_does:
 *   - 環境変数に基づき検証フックの有効/無効やモードを解決する
 *   - サブエージェント実行後の出力と信頼度を受け取り、検証の要否を判定する
 *   - インスペクタおよびチャレンジャーの実行制御を行う
 *   - 検証結果をログに記録する
 * why_it_exists:
 *   - LLMの推論失敗を検知し、出力の信頼性を高めるため
 *   - 高リスクタスクにおける出力安全性を確保するため
 *   - 検証プロセスを環境設定により柔軟に制御可能にするため
 * scope:
 *   in: 環境変数(PI_VERIFICATION_WORKFLOW_MODE, PI_VERIFICATION_LOG)、サブエージェントの出力文字列、信頼度数値、コンテキスト
 *   out: 解決された設定オブジェクト、検証実行の有無、検証結果オブジェクト
 */

/**
 * 検証フックモジュール
 * 論文「Large Language Model Reasoning Failures」のP0推奨事項
 * サブエージェント/チーム実行後の自動検証フック
 */

import {
  shouldTriggerVerification,
  buildInspectorPrompt,
  buildChallengerPrompt,
  synthesizeVerificationResult,
  resolveVerificationConfig,
  isHighStakesTask,
  type VerificationContext,
  type VerificationResult,
  type InspectorOutput,
  type ChallengerOutput,
} from "../../lib/verification-workflow.js";
import { getLogger } from "../../lib/comprehensive-logger.js";
import type { OperationType } from "../../lib/comprehensive-logger-types.js";

const logger = getLogger();

/**
 * 検証フックの設定
 * @summary 検証設定
 * @param enabled - 有効かどうか
 * @param mode - 動作モード
 * @param runInspector - 検査官を実行するか
 * @param runChallenger - チャレンジャーを実行するか
 * @param logResults - 結果をログに出力するか
 */
export interface VerificationHookConfig {
  enabled: boolean;
  mode: "disabled" | "minimal" | "auto" | "strict";
  runInspector: boolean;
  runChallenger: boolean;
  logResults: boolean;
}

/**
 * 検証フックの結果
 * @summary 検証結果
 * @param triggered - トリガーされたか
 * @param result - 検証結果
 * @param inspectorRun - 検査官が実行されたか
 * @param challengerRun - チャレンジャーが実行されたか
 * @param error - エラーメッセージ
 */
export interface VerificationHookResult {
  triggered: boolean;
  result?: VerificationResult;
  inspectorRun?: boolean;
  challengerRun?: boolean;
  error?: string;
}

/**
 * 検証フック設定を解決
 * @summary 設定解決
 * @returns 検証フックの設定
 */
export function resolveVerificationHookConfig(): VerificationHookConfig {
  const envMode = process.env.PI_VERIFICATION_WORKFLOW_MODE || "auto";
  
  const config: VerificationHookConfig = {
    enabled: envMode !== "disabled" && envMode !== "0",
    mode: envMode as VerificationHookConfig["mode"],
    runInspector: true,
    runChallenger: true,
    logResults: process.env.PI_VERIFICATION_LOG === "1",
  };

  if (envMode === "minimal") {
    config.runChallenger = false;
  }

  if (envMode === "strict") {
    config.runInspector = true;
    config.runChallenger = true;
  }

  return config;
}

 /**
  * サブエージェント実行後の検証フック
  * @param output サブエージェントの出力
  * @param confidence 出力の信頼度
  * @param context エージェントIDとタスクを含むコンテキスト
  * @param runVerificationAgent 検証エージェントを実行する関数
  * @returns 検証結果
  */
export async function postSubagentVerificationHook(
  output: string,
  confidence: number,
  context: {
    agentId: string;
    task: string;
  },
  runVerificationAgent: (agentId: string, prompt: string) => Promise<string>
): Promise<VerificationHookResult> {
  const config = resolveVerificationHookConfig();
  
  if (!config.enabled) {
    return { triggered: false };
  }

  const _operationId = logger.startOperation("post_subagent_verification" as OperationType, context.agentId, {
    task: context.task,
    params: { agentId: context.agentId, confidence },
  });

  const verificationContext: VerificationContext = {
    task: context.task,
    triggerMode: "post-subagent",
    agentId: context.agentId,
  };

  const { trigger, reason } = shouldTriggerVerification(output, confidence, verificationContext);
  
  if (!trigger) {
    logger.endOperation({
      status: "success",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
    });
    return { triggered: false };
  }

  if (config.logResults) {
    console.log(`[Verification] Triggered for agent ${context.agentId}: ${reason}`);
  }

  let inspectorOutput: InspectorOutput | undefined;
  let challengerOutput: ChallengerOutput | undefined;
  let inspectorRun = false;
  let challengerRun = false;

  try {
    // Phase 1: Inspector
    if (config.runInspector) {
      const inspectorPrompt = buildInspectorPrompt(output, verificationContext);
      const inspectorResult = await runVerificationAgent("inspector", inspectorPrompt);
      inspectorOutput = parseInspectorOutput(inspectorResult);
      inspectorRun = true;

      if (config.logResults) {
        console.log(`[Verification] Inspector result: ${inspectorOutput.suspicionLevel} suspicion`);
      }
    }

    // Phase 2: Challenger (if suspicion is medium or high)
    if (config.runChallenger && (!inspectorOutput || inspectorOutput.suspicionLevel !== "low")) {
      const challengerPrompt = buildChallengerPrompt(output, verificationContext);
      const challengerResult = await runVerificationAgent("challenger", challengerPrompt);
      challengerOutput = parseChallengerOutput(challengerResult);
      challengerRun = true;

      if (config.logResults) {
        console.log(`[Verification] Challenger result: ${challengerOutput.overallSeverity} severity`);
      }
    }

    const result = synthesizeVerificationResult(
      output,
      confidence,
      inspectorOutput,
      challengerOutput,
      verificationContext
    );

    logger.endOperation({
      status: result.finalVerdict === "pass" ? "success" : result.finalVerdict === "fail" ? "failure" : "partial",
      tokensUsed: 0,
      outputLength: output.length,
      childOperations: (inspectorRun ? 1 : 0) + (challengerRun ? 1 : 0),
      toolCalls: 0,
    });

    return {
      triggered: true,
      result,
      inspectorRun,
      challengerRun,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: "verification_error",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });
    return {
      triggered: true,
      error: `Verification failed: ${errorMessage}`,
      inspectorRun,
      challengerRun,
    };
  }
}

 /**
  * チーム実行後の検証フック
  * @param aggregatedOutput - 集計された出力
  * @param confidence - 信頼度
  * @param context - チームID、タスク、メンバー出力を含むコンテキスト
  * @param runVerificationAgent - 検証エージェントを実行する関数
  * @returns 検証フックの結果
  */
export async function postTeamVerificationHook(
  aggregatedOutput: string,
  confidence: number,
  context: {
    teamId: string;
    task: string;
    memberOutputs: Array<{ agentId: string; output: string }>;
  },
  runVerificationAgent: (agentId: string, prompt: string) => Promise<string>
): Promise<VerificationHookResult> {
  const config = resolveVerificationHookConfig();
  
  if (!config.enabled) {
    return { triggered: false };
  }

  const _operationId = logger.startOperation("post_team_verification" as OperationType, context.teamId, {
    task: context.task,
    params: { teamId: context.teamId, confidence, memberCount: context.memberOutputs.length },
  });

  const verificationContext: VerificationContext = {
    task: context.task,
    triggerMode: "post-team",
    teamId: context.teamId,
  };

  // チーム実行後は常に検証を検討（合意形成前）
  const shouldVerify = 
    shouldTriggerVerification(aggregatedOutput, confidence, verificationContext).trigger ||
    isHighStakesTask(context.task) ||
    config.mode === "strict";

  if (!shouldVerify) {
    logger.endOperation({
      status: "success",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
    });
    return { triggered: false };
  }

  if (config.logResults) {
    console.log(`[Verification] Triggered for team ${context.teamId}`);
  }

  let inspectorOutput: InspectorOutput | undefined;
  let challengerOutput: ChallengerOutput | undefined;
  let inspectorRun = false;
  let challengerRun = false;

  try {
    // メンバー出力を含めた完全なコンテキストを構築
    const fullOutput = buildTeamVerificationContext(aggregatedOutput, context.memberOutputs);

    // Phase 1: Inspector
    if (config.runInspector) {
      const inspectorPrompt = buildInspectorPrompt(fullOutput, verificationContext);
      const inspectorResult = await runVerificationAgent("inspector", inspectorPrompt);
      inspectorOutput = parseInspectorOutput(inspectorResult);
      inspectorRun = true;
    }

    // Phase 2: Challenger
    if (config.runChallenger) {
      // strict モードまたは medium+ suspicion の場合
      const shouldRunChallenger = 
        config.mode === "strict" ||
        !inspectorOutput ||
        inspectorOutput.suspicionLevel !== "low";

      if (shouldRunChallenger) {
        const challengerPrompt = buildChallengerPrompt(fullOutput, verificationContext);
        const challengerResult = await runVerificationAgent("challenger", challengerPrompt);
        challengerOutput = parseChallengerOutput(challengerResult);
        challengerRun = true;
      }
    }

    const result = synthesizeVerificationResult(
      aggregatedOutput,
      confidence,
      inspectorOutput,
      challengerOutput,
      verificationContext
    );

    logger.endOperation({
      status: result.finalVerdict === "pass" ? "success" : result.finalVerdict === "fail" ? "failure" : "partial",
      tokensUsed: 0,
      outputLength: aggregatedOutput.length,
      childOperations: (inspectorRun ? 1 : 0) + (challengerRun ? 1 : 0),
      toolCalls: 0,
    });

    return {
      triggered: true,
      result,
      inspectorRun,
      challengerRun,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: "verification_error",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });
    return {
      triggered: true,
      error: `Verification failed: ${errorMessage}`,
      inspectorRun,
      challengerRun,
    };
  }
}

/**
 * チーム検証コンテキストを構築
 */
function buildTeamVerificationContext(
  aggregatedOutput: string,
  memberOutputs: Array<{ agentId: string; output: string }>
): string {
  const memberSummaries = memberOutputs
    .map(m => `[${m.agentId}]: ${truncateOutput(m.output, 500)}`)
    .join("\n\n");

  return `
TEAM AGGREGATED OUTPUT:
${aggregatedOutput}

INDIVIDUAL MEMBER OUTPUTS:
${memberSummaries}
`.trim();
}

/**
 * 出力を切り詰め
 */
function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }
  return output.substring(0, maxLength) + "... [truncated]";
}

/**
 * Inspector出力をパース
 */
function parseInspectorOutput(rawOutput: string): InspectorOutput {
  const suspicionMatch = rawOutput.match(/SUSPICION_LEVEL:\s*(low|medium|high)/i);
  const suspicionLevel = (suspicionMatch?.[1] as InspectorOutput["suspicionLevel"]) || "low";

  const summaryMatch = rawOutput.match(/SUMMARY:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  const summary = summaryMatch?.[1]?.trim() || "No summary provided";

  const recommendationMatch = rawOutput.match(/RECOMMENDATION:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  const recommendation = recommendationMatch?.[1]?.trim() || "No recommendation provided";

  // 検出パターンを抽出
  const detectedPatterns: InspectorOutput["detectedPatterns"] = [];
  const patternRegex = /-\s*\[([^\]]+)\]:\s*(.+?)(?:\n-|\n\n|\n[A-Z]+:|$)/gis;
  let match;
  while ((match = patternRegex.exec(rawOutput)) !== null) {
    const pattern = match[1].toLowerCase().replace(/\s+/g, "-") as InspectorOutput["detectedPatterns"][0]["pattern"];
    const description = match[2].trim();
    
    const severity: "low" | "medium" | "high" =
      description.toLowerCase().includes("critical") || description.toLowerCase().includes("重大")
        ? "high"
        : "medium";

    detectedPatterns.push({
      pattern,
      location: "output",
      severity,
      description,
    });
  }

  return {
    suspicionLevel,
    detectedPatterns,
    summary,
    recommendation,
  };
}

/**
 * Challenger出力をパース
 */
function parseChallengerOutput(rawOutput: string): ChallengerOutput {
  const severityMatch = rawOutput.match(/OVERALL_SEVERITY:\s*(minor|moderate|critical)/i);
  const overallSeverity = (severityMatch?.[1] as ChallengerOutput["overallSeverity"]) || "minor";

  const summaryMatch = rawOutput.match(/SUMMARY:\s*(.+?)(?:\n\n|\nSUGGESTED_REVISIONS:|\n[A-Z]+:|$)/is);
  const summary = summaryMatch?.[1]?.trim() || "No summary provided";

  // チャレンジされたクレームを抽出
  const challengedClaims = [];
  const claimRegex = /CHALLENGED_CLAIM:\s*(.+?)(?:\nFLAW:)/gis;
  const flawRegex = /FLAW:\s*(.+?)(?:\nEVIDENCE_GAP:)/gis;
  const gapRegex = /EVIDENCE_GAP:\s*(.+?)(?:\nALTERNATIVE:)/gis;
  const altRegex = /ALTERNATIVE:\s*(.+?)(?:\nBOUNDARY_FAILURE:|SEVERITY:)/gis;
  const boundaryRegex = /BOUNDARY_FAILURE:\s*(.+?)(?:\nSEVERITY:)/gis;
  const sevRegex = /SEVERITY:\s*(minor|moderate|critical)/gi;

  // 簡易パース（正規表現の限界）
  const claims = rawOutput.match(/CHALLENGED_CLAIM:.*?(?=CHALLENGED_CLAIM:|OVERALL_SEVERITY:|$)/gis) || [];
  
  for (const claimBlock of claims.slice(0, 5)) { // 最大5件
    const claimMatch = claimBlock.match(/CHALLENGED_CLAIM:\s*(.+?)(?:\n)/is);
    const flawMatch = claimBlock.match(/FLAW:\s*(.+?)(?:\n)/is);
    const gapMatch = claimBlock.match(/EVIDENCE_GAP:\s*(.+?)(?:\n)/is);
    const altMatch = claimBlock.match(/ALTERNATIVE:\s*(.+?)(?:\n)/is);
    const boundaryMatch = claimBlock.match(/BOUNDARY_FAILURE:\s*(.+?)(?:\n)/is);
    const severityMatch = claimBlock.match(/SEVERITY:\s*(minor|moderate|critical)/i);

    if (claimMatch) {
      challengedClaims.push({
        claim: claimMatch[1].trim(),
        flaw: flawMatch?.[1]?.trim() || "Not specified",
        evidenceGap: gapMatch?.[1]?.trim() || "Not specified",
        alternative: altMatch?.[1]?.trim() || "Not specified",
        boundaryFailure: boundaryMatch?.[1]?.trim(),
        severity: (severityMatch?.[1] as ChallengerOutput["challengedClaims"][0]["severity"]) || "minor",
      });
    }
  }

  // 修正案を抽出
  const suggestedRevisions: string[] = [];
  const revisionMatch = rawOutput.match(/SUGGESTED_REVISIONS:\s*([\s\S]+?)(?:\n\n|$)/i);
  if (revisionMatch) {
    const revisionLines = revisionMatch[1].split("\n").filter(l => l.trim().startsWith("-"));
    suggestedRevisions.push(...revisionLines.map(l => l.replace(/^-\s*/, "").trim()));
  }

  return {
    challengedClaims,
    overallSeverity,
    summary,
    suggestedRevisions,
  };
}

/**
 * 検証結果のフォーマット
 * @summary 検証結果フォーマット
 * @param result 検証フック結果
 * @returns フォーマット済み文字列
 */
export function formatVerificationResult(result: VerificationHookResult): string {
  if (!result.triggered) {
    return "[Verification] Not triggered";
  }

  if (result.error) {
    return `[Verification] Error: ${result.error}`;
  }

  const lines: string[] = [];
  lines.push("[Verification] Triggered");
  lines.push(`  Inspector: ${result.inspectorRun ? "ran" : "skipped"}`);
  lines.push(`  Challenger: ${result.challengerRun ? "ran" : "skipped"}`);

  if (result.result) {
    lines.push(`  Verdict: ${result.result.finalVerdict}`);
    lines.push(`  Confidence: ${result.result.confidence.toFixed(2)}`);
    if (result.result.warnings.length > 0) {
      lines.push(`  Warnings:`);
      result.result.warnings.forEach(w => lines.push(`    - ${w}`));
    }
  }

  return lines.join("\n");
}
