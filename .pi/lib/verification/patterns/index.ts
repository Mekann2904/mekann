/**
 * @abdd.meta
 * path: .pi/lib/verification/patterns/index.ts
 * role: パターン検出モジュールのエクスポート統合
 * why: パターン検出関連のエクスポートを一元管理するため
 * related: ./output-patterns.ts, ./bug-hunting-aporia.ts, ./utopia-dystopia.ts, ./schizo-analysis.ts
 * public_api: 全パターン検出関数
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: パターン検出モジュールの統合エクスポート
 * what_it_does:
 *   - 出力パターン検出関数をエクスポートする
 *   - バグハンティング・アポリア関数をエクスポートする
 *   - ユートピア/ディストピア分析関数をエクスポートする
 *   - スキゾ分析関数をエクスポートする
 * why_it_exists:
 *   - パターン検出モジュールへのアクセスを簡素化する
 *   - 依存関係を明確にする
 * scope:
 *   in: *.ts
 *   out: ../index.ts
 */

// Output Patterns
export {
  detectClaimResultMismatch,
  detectOverconfidence,
  detectMissingAlternatives,
  detectConfirmationBias,
  isHighStakesTask,
  checkOutputPatterns,
} from "./output-patterns.js";

// Bug Hunting & Aporia
export {
  detectFirstReasonStopping,
  detectProximityBias,
  detectConcretenessBias,
  detectPalliativeFix,
  recognizeBugHuntingAporias,
  evaluateAporiaHandling,
} from "./bug-hunting-aporia.js";

// Utopia/Dystopia
export {
  detectDystopianTendencies,
  detectHealthyImperfectionIndicators,
  assessUtopiaDystopiaBalance,
  findRepeatedPhrases,
} from "./utopia-dystopia.js";

// Schizo Analysis
export {
  detectDesirePatterns,
  detectInnerFascismPatterns,
  performSchizoAnalysis,
} from "./schizo-analysis.js";
