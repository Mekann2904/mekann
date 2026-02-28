/**
 * @abdd.meta
 * path: .pi/lib/verification/extraction/index.ts
 * role: 抽出機能モジュールのエクスポート統合
 * why: 抽出機能への統一アクセスポイントを提供するため
 * related: ./candidates.ts, ./integrated-detection.ts
 * public_api: extractCandidates, applyContextFilter, runIntegratedDetection
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 抽出モジュールの公開APIを統合
 * what_it_does:
 *   - 候補抽出機能をエクスポート
 *   - 統合検出機能をエクスポート
 * why_it_exists:
 *   - 利用側のimportを簡素化するため
 * scope:
 *   in: ./candidates.ts, ./integrated-detection.ts
 *   out: ../core.ts, ../assessment/
 */

export {
  extractCandidates,
  applyContextFilter,
  generateFilterStats,
  FALLACY_PATTERNS,
  BINARY_OPPOSITION_PATTERNS,
  FASCISM_PATTERNS,
  CRAVING_PATTERNS,
  ALL_PATTERNS,
  type CandidateDetection
} from './candidates.js';

export {
  runIntegratedDetection,
  runLLMEnhancedDetection,
  generateDetectionSummary,
  type LLMVerificationRequest,
  type LLMVerificationResult,
  type IntegratedVerificationResult
} from './integrated-detection.js';
