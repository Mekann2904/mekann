/**
 * @abdd.meta
 * path: .pi/lib/verification/core.ts
 * role: 検証ワークフローの中核機能
 * why: 検証トリガー判定、結果統合、メインワークフローを一元管理するため
 * related: ./types.ts, ./config.ts, ./analysis/, ./generation/, ./extraction/, ./assessment/
 * public_api: shouldTriggerVerification, synthesizeVerificationResult, runVerificationWorkflow
 * invariants: shouldTriggerVerificationは常にbooleanを返す
 * side_effects: なし（純粋関数）
 * failure_modes: 設定が無効な場合、falseを返す
 * @abdd.explain
 * overview: 検証ワークフローのエントリーポイントとコアロジック
 * what_it_does:
 *   - 検証トリガー条件を判定する
 *   - Inspector/Challengerの結果を統合する
 *   - 最終判定を生成する
 *   - 完全な検証ワークフローを実行する
 * why_it_exists:
 *   - 検証ワークフローの一貫した実行を保証するため
 * scope:
 *   in: ./types.ts, ./config.ts, ./analysis/, ./generation/, ./extraction/, ./assessment/
 *   out: ./index.ts
 */

import {
  type VerificationContext,
  type VerificationResult,
  type VerificationWorkflowConfig,
  type InspectorOutput,
  type ChallengerOutput,
  type VerificationVerdict,
  type InspectionPattern
} from './types.js';
import { resolveVerificationConfig } from './config.js';
import { buildInspectorPrompt, buildChallengerPrompt } from './generation/prompts.js';
import { runIntegratedDetection, type IntegratedVerificationResult } from './extraction/integrated-detection.js';
import { runMetacognitiveCheck, type MetacognitiveCheck } from './analysis/metacognitive-check.js';
import { assessDetectionUncertainty, type DetectionUncertaintyAssessment } from './assessment/uncertainty.js';

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 検証をトリガーすべきかを判定
 * @summary トリガー条件判定
 * @param context 検証コンテキスト
 * @param config 検証設定（省略時はデフォルト）
 * @returns トリガーすべき場合はtrue
 */
export function shouldTriggerVerification(
  context: VerificationContext,
  config?: VerificationWorkflowConfig
): boolean {
  const resolvedConfig = config ?? resolveVerificationConfig();
  
  if (!resolvedConfig.enabled) {
    return false;
  }

  // トリガーモードをチェック
  for (const mode of resolvedConfig.triggerModes) {
    switch (mode) {
      case 'post-subagent':
        if (context.agentId) return true;
        break;
      case 'post-team':
        if (context.teamId) return true;
        break;
      case 'low-confidence':
        if (context.confidence !== undefined && context.confidence < resolvedConfig.minConfidenceToSkipVerification) {
          return true;
        }
        break;
      case 'explicit':
        if (context.explicitRequest) return true;
        break;
      case 'high-stakes':
        if (isHighStakesTask(context.task)) return true;
        break;
    }
  }

  return false;
}

/**
 * 検証結果を統合する
 * @summary 検証結果統合
 * @param originalOutput 元の出力
 * @param originalConfidence 元の信頼度
 * @param inspectorOutput 検査官の出力
 * @param challengerOutput 挑戦者の出力
 * @param context 検証コンテキスト
 * @param config 検証設定
 * @returns 統合された検証結果
 */
export function synthesizeVerificationResult(
  originalOutput: string,
  originalConfidence: number,
  inspectorOutput: InspectorOutput | undefined,
  challengerOutput: ChallengerOutput | undefined,
  context: VerificationContext,
  config?: VerificationWorkflowConfig
): VerificationResult {
  const resolvedConfig = config ?? resolveVerificationConfig();
  const warnings: string[] = [];
  let finalVerdict: VerificationVerdict = 'pass';
  let requiresReRun = false;
  let confidence = originalConfidence;

  // Inspectorの発見事項を処理
  if (inspectorOutput) {
    if (inspectorOutput.suspicionLevel === 'high') {
      finalVerdict = 'needs-review';
      warnings.push(`Inspector detected high suspicion: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.5);
    } else if (inspectorOutput.suspicionLevel === 'medium') {
      if (finalVerdict === 'pass') {
        finalVerdict = 'pass-with-warnings';
      }
      warnings.push(`Inspector noted concerns: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.7);
    }

    // 重要なパターンをチェック
    const criticalPatterns = inspectorOutput.detectedPatterns.filter(
      p => p.severity === 'high'
    );
    if (criticalPatterns.length > 0) {
      finalVerdict = resolvedConfig.fallbackBehavior === 'block' ? 'blocked' : 'needs-review';
      requiresReRun = resolvedConfig.fallbackBehavior === 'block';
    }
  }

  // Challengerの発見事項を処理
  if (challengerOutput) {
    if (challengerOutput.overallSeverity === 'critical') {
      finalVerdict = resolvedConfig.fallbackBehavior === 'block' ? 'blocked' : 'fail';
      requiresReRun = resolvedConfig.fallbackBehavior === 'block';
      warnings.push(`Critical challenges identified: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.3);
    } else if (challengerOutput.overallSeverity === 'moderate') {
      if (finalVerdict === 'pass') {
        finalVerdict = 'pass-with-warnings';
      }
      warnings.push(`Moderate challenges: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.6);
    }

    // 深度チェック
    if ((context.previousVerifications || 0) >= resolvedConfig.maxVerificationDepth) {
      warnings.push('Max verification depth reached - manual review recommended');
      if (finalVerdict !== 'fail' && finalVerdict !== 'blocked') {
        finalVerdict = 'needs-review';
      }
    }
  }

  return {
    triggered: true,
    triggerReason: context.triggerMode,
    inspectorOutput,
    challengerOutput,
    finalVerdict,
    confidence,
    requiresReRun,
    warnings
  };
}

/**
 * 完全な検証ワークフローを実行
 * @summary 検証ワークフロー実行
 * @param output 検証対象の出力
 * @param context 検証コンテキスト
 * @param config 検証設定
 * @returns 統合検証結果
 */
export function runVerificationWorkflow(
  output: string,
  context: VerificationContext,
  config?: VerificationWorkflowConfig
): {
  result: VerificationResult;
  metacognitiveCheck: MetacognitiveCheck;
  integratedDetection: IntegratedVerificationResult;
  uncertaintyAssessment: DetectionUncertaintyAssessment;
} {
  const resolvedConfig = config ?? resolveVerificationConfig();
  
  // トリガー条件をチェック
  if (!shouldTriggerVerification(context, resolvedConfig)) {
    return {
      result: {
        triggered: false,
        triggerReason: 'Verification not triggered',
        finalVerdict: 'pass',
        confidence: context.confidence ?? 0.8,
        requiresReRun: false,
        warnings: []
      },
      metacognitiveCheck: runMetacognitiveCheck(output, { task: context.task }),
      integratedDetection: runIntegratedDetection(output),
      uncertaintyAssessment: assessDetectionUncertainty(output)
    };
  }

  // メタ認知チェックを実行
  const metacognitiveCheck = runMetacognitiveCheck(output, { task: context.task });

  // 統合検出を実行
  const integratedDetection = runIntegratedDetection(output);

  // 不確実性評価を実行
  const uncertaintyAssessment = assessDetectionUncertainty(output);

  // Inspector/Challengerプロンプトを生成
  const inspectorPrompt = buildInspectorPrompt(output, context, resolvedConfig.inspectorConfig?.requiredPatterns);
  const challengerPrompt = buildChallengerPrompt(
    output,
    context,
    resolvedConfig.challengerConfig?.enabledCategories,
    resolvedConfig.challengerConfig?.requiredFlaws
  );

  // 検出結果に基づいてInspector出力を構築
  const inspectorOutput: InspectorOutput | undefined = integratedDetection.candidates.length > 0 ? {
    detectedPatterns: integratedDetection.candidates.map(c => ({
      pattern: c.type as InspectionPattern,
      description: c.matchedText.slice(0, 100),
      severity: c.patternConfidence > 0.5 ? 'high' : c.patternConfidence > 0.3 ? 'medium' : 'low',
      location: `pos ${c.location.start}-${c.location.end}`
    })),
    suspicionLevel: integratedDetection.overallConfidence > 0.5 ? 'high' : 
                    integratedDetection.overallConfidence > 0.3 ? 'medium' : 'low',
    summary: integratedDetection.summary,
    recommendation: integratedDetection.finalVerdict === 'confirmed' 
      ? 'Manual review recommended' 
      : 'No immediate action required'
  } : undefined;

  // メタ認知チェックに基づいてChallenger出力を構築
  const challengerOutput: ChallengerOutput | undefined = 
    metacognitiveCheck.logic.fallacies.length > 0 ||
    metacognitiveCheck.deconstruction.binaryOppositions.length > 0 ||
    metacognitiveCheck.schizoAnalysis.innerFascismSigns.length > 0
      ? {
        challengedClaims: [
          ...metacognitiveCheck.logic.fallacies.map(f => ({
            claim: f.type,
            flaw: f.description,
            evidenceGap: '',
            alternative: '',
            boundaryFailure: '',
            severity: 'moderate' as const
          })),
          ...metacognitiveCheck.deconstruction.binaryOppositions.map(b => ({
            claim: b,
            flaw: '二項対立が検出された',
            evidenceGap: '',
            alternative: '中間領域を探求する',
            boundaryFailure: '',
            severity: 'minor' as const
          }))
        ],
        overallSeverity: metacognitiveCheck.logic.fallacies.length > 0 ? 'moderate' : 'minor',
        summary: `${metacognitiveCheck.logic.fallacies.length}件の誤謬、${metacognitiveCheck.deconstruction.binaryOppositions.length}件の二項対立を検出`,
        suggestedRevisions: metacognitiveCheck.logic.fallacies.map(f => f.correction)
      } : undefined;

  // 結果を統合
  const result = synthesizeVerificationResult(
    output,
    context.confidence ?? 0.8,
    inspectorOutput,
    challengerOutput,
    context,
    resolvedConfig
  );

  return {
    result,
    metacognitiveCheck,
    integratedDetection,
    uncertaintyAssessment
  };
}

/**
 * ワークフロールールを取得する
 * @summary ルール取得
 * @returns ワークフローのルール説明
 */
export function getVerificationWorkflowRules(): string {
  return `
【検証ワークフロー】

タスク完了前に以下の検証を実施:

1. 自己検証チェック:
   - CLAIMとRESULTの論理的整合性
   - EVIDENCEがCLAIMを十分にサポートしているか
   - CONFIDENCEがEVIDENCEの強さと比例しているか

2. Inspector起動条件:
   - 低信頼度出力（CONFIDENCE < 0.7）
   - 高リスクタスク（削除、本番変更、セキュリティ関連）
   - CLAIM-RESULT不一致の兆候
   - 過信の兆候（短いEVIDENCEで高いCONFIDENCE）

3. Challenger起動条件:
   - Inspectorがmedium以上のsuspicionを検出
   - 明示的な検証リクエスト時
   - チーム実行後の合意形成前

4. 検証結果への対応:
   - pass: そのまま採用
   - pass-with-warnings: 警告を記録して採用
   - needs-review: 人間のレビューを推奨
   - fail/block: 再実行または追加調査

環境変数:
- PI_VERIFICATION_WORKFLOW_MODE: disabled | minimal | auto | strict
- PI_VERIFICATION_MIN_CONFIDENCE: 検証スキップの信頼度閾値
- PI_VERIFICATION_MAX_DEPTH: 最大検証深度
`.trim();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 高リスクタスクかどうかを判定
 * @summary 高リスク判定
 * @param task タスク説明
 * @returns 高リスクの場合はtrue
 */
function isHighStakesTask(task: string | undefined): boolean {
  if (!task) return false;
  
  const highStakesPatterns = [
    /削除|delete|remove/i,
    /本番|production|live/i,
    /セキュリティ|security|auth/i,
    /デプロイ|deploy|release/i,
    /マイグレーション|migration/i,
    /権限|permission|privilege/i,
    /パスワード|password|secret|key/i,
    /決済|payment|billing/i,
    /個人情報|personal|pii/i
  ];

  return highStakesPatterns.some(pattern => pattern.test(task));
}
