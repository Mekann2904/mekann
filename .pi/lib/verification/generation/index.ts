/**
 * @abdd.meta
 * path: .pi/lib/verification/generation/index.ts
 * role: 生成機能モジュールのエクスポート統合
 * why: 生成機能への統一アクセスポイントを提供するため
 * related: ./prompts.ts, ./improvement-actions.ts
 * public_api: buildInspectorPrompt, buildChallengerPrompt, generateImprovementActions
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 生成モジュールの公開APIを統合
 * what_it_does:
 *   - プロンプト生成機能をエクスポート
 *   - 改善アクション生成機能をエクスポート
 * why_it_exists:
 *   - 利用側のimportを簡素化するため
 * scope:
 *   in: ./prompts.ts, ./improvement-actions.ts
 *   out: ../core.ts
 */

export {
  buildInspectorPrompt,
  buildChallengerPrompt,
  generateLLMVerificationPrompt,
  parseLLMVerificationResponse,
  mapTypeToVerificationType
} from './prompts.js';

export {
  generateImprovementActions,
  formatActionsAsPromptInstructions,
  runIntegratedMetacognitiveAnalysis,
  generateActionsFromDetection,
  type ImprovementAction
} from './improvement-actions.js';
