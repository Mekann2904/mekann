/**
 * @abdd.meta
 * path: .pi/lib/verification-workflow.ts
 * role: 検証ワークフロー用の型定義と設定モジュール
 * why: Inspector/Challengerエージェントによる自動検証メカニズムの構造と動作を静的に保証するため
 * related: .pi/lib/agents.ts, .pi/lib/config.ts
 * public_api: VerificationWorkflowConfig, VerificationResult, VerificationTriggerMode, FallbackBehavior, ChallengerConfig, InspectorConfig, ChallengeCategory, InspectionPattern, SuspicionThreshold, VerificationVerdict
 * invariants: VerificationResultのfinalVerdictがpass系の場合、requiresReRunはfalseである必要がある
 * side_effects: なし（純粋な型定義とインターフェース）
 * failure_modes: 設定値の論理矛盾（例：閾値設定の不整合）、検証深度のオーバーフロー
 * @abdd.explain
 * overview: 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づき、LLMの出力をInspectorとChallengerが監査・挑戦する仕組みを定義する。
 * what_it_does:
 *   - 検証のトリガー条件（実行タイミング、信頼度、リスク）を定義する
 *   - Challengerによる論理的欠陥の発見設定とInspectorによる監査パターンを構造化する
 *   - 検証結果の判定（Pass/Warning/Review）と再実行の要否を決定するデータ構造を提供する
 *   - 検証失敗時のフォールバック動作を定義する
 * why_it_exists:
 *   - 複雑な推論チェーンにおけるLLMのハルシネーションや論理的飛躍をシステム的に検知するため
 *   - 検証プロセスの挙動を型安全に設定し、実行時の挙動不整合を防ぐため
 * scope:
 *   in: なし
 *   out: ワークフロー制御用の型定義、設定インターフェース
 */

/**
 * 検証ワークフローモジュール
 * 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づく
 * Inspector/Challengerエージェントによる自動検証メカニズム
 */

/**
 * 検証ワークフローの設定
 * @summary ワークフロー設定
 * @param enabled ワークフロー有効化フラグ
 * @param triggerModes トリガーモード配列
 * @param challengerConfig チャレンジャーの設定
 * @param inspectorConfig インスペクターの設定
 * @param fallbackBehavior フォールバック動作
 * @param maxVerificationDepth 最大検証深度
 * @param minConfidenceToSkipVerification 検証をスキップする最小信頼度
 */
export interface VerificationWorkflowConfig {
  enabled: boolean;
  triggerModes: VerificationTriggerMode[];
  challengerConfig: ChallengerConfig;
  inspectorConfig: InspectorConfig;
  fallbackBehavior: FallbackBehavior;
  maxVerificationDepth: number;
  minConfidenceToSkipVerification: number;
}

/**
 * 検証トリガーのモード定義
 * @summary 検証トリガーモード
 */
export type VerificationTriggerMode =
  | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes";      // 高リスクタスク時

/**
 * フォールバック時の動作方針
 * @summary フォールバック挙動
 */
export type FallbackBehavior =
  | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject";      // 自動拒否

/**
 * チャレンジャー設定インターフェース
 * @summary チャレンジャー設定
 * @param minConfidenceToChallenge チャレンジを行う最小信頼度
 * @param requiredFlaws 必須の検出フラグ
 * @param enabledCategories 有効なカテゴリ
 */
export interface ChallengerConfig {
  minConfidenceToChallenge: number;  // チャレンジをトリガーする信頼度閾値
  requiredFlaws: number;              // 要求される欠陥の最小数
  enabledCategories: ChallengeCategory[];
}

/**
 * チャレンジのカテゴリ
 * @summary カテゴリを定義
 * @typedef {"evidence-gap" | "logical-flaw" | "assumption"} ChallengeCategory
 */
export type ChallengeCategory =
  | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal";  // 因果関係の逆転

/**
 * 検査者の設定
 * @summary 検査設定を保持
 * @param {SuspicionThreshold} suspicionThreshold 疑わしさの閾値
 * @param {InspectionPattern[]} requiredPatterns 必要なパターン
 * @param {boolean} autoTriggerOnCollapseSignals 信号崩落時の自動トリガー
 */
export interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}

/**
 * 疑わしさの閾値レベル
 * @summary 閾値レベルを設定
 * @typedef {"low" | "medium" | "high"} SuspicionThreshold
 */
export type SuspicionThreshold = "low" | "medium" | "high";

/**
 * 検査パターン定義
 * @summary パターンを定義
 * @typedef {"claim-result-mismatch" | "inconsistency"} InspectionPattern
 */
export type InspectionPattern =
  | "claim-result-mismatch"    // CLAIMとRESULTの不一致
  | "evidence-confidence-gap"  // 証拠と信頼度のミスマッチ
  | "missing-alternatives"     // 代替解釈の欠如
  | "causal-reversal"          // 因果の逆転
  | "confirmation-bias"        // 確認バイアスの兆候
  | "overconfidence"           // 過信（証拠に対して高すぎる信頼度）
  | "incomplete-reasoning";    // 不完全な推論

/**
 * 検証結果を表す
 * @summary 検証結果を取得
 * @property {boolean} triggered トリガーされたか
 * @property {string} triggerReason トリガー理由
 * @property {any} inspectorOutput 検査出力
 * @property {any} challengerOutput 挑戦者出力
 * @property {string} finalVerdict 最終判定
 * @property {"confirmation-bias" | "overconfidence" | "incomplete-reasoning"} biasType バイアス種別
 */
export interface VerificationResult {
  triggered: boolean;
  triggerReason: string;
  inspectorOutput?: InspectorOutput;
  challengerOutput?: ChallengerOutput;
  finalVerdict: VerificationVerdict;
  confidence: number;
  requiresReRun: boolean;
  warnings: string[];
}

/**
 * 検証の最終判定結果
 * @summary 検証の最終判定
 * @returns {"pass" | "pass-with-warnings" | "needs-review" | "fail"} 判定結果の種類
 */
export type VerificationVerdict =
  | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked";          // ブロック（再実行必要）

/**
 * 検査官の結果出力を表す
 * @summary 検査官の出力
 * @property {SuspicionThreshold} suspicionLevel 疑念の閾値
 * @property {DetectedPattern[]} detectedPatterns 検出されたパターン
 * @property {string} summary 結果の要約
 * @property {string} recommendation 推奨事項
 */
export interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}

/**
 * 検出されたパターンを表す
 * @summary パターン検出結果
 * @property {InspectionPattern} pattern 検査パターン
 * @property {string} location 出力内の位置
 * @property {"low" | "medium" | "high"} severity 重大度
 * @property {string} description パターンの説明
 */
export interface DetectedPattern {
  pattern: InspectionPattern;
  location: string;     // 出力内の位置
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * 検証の結果出力を表す
 * @summary 検証結果の出力
 * @property {ChallengedClaim[]} challengedClaims 挑戦された主張のリスト
 * @property {"minor" | "moderate" | "critical"} overallSeverity 全体の深刻度
 * @property {string} summary 結果の要約
 * @property {string[]} suggestedRevisions 提示される修正案
 */
export interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}

/**
 * 挑戦された主張を表す
 * @summary 主張の課題定義
 * @property {any} claim 対象の主張
 * @property {string} flaw 欠陥の内容
 * @property {string} evidenceGap 証拠の不足
 * @property {string} alternative 代替案
 * @property {string} boundaryFailure 境界失敗の詳細
 */
export interface ChallengedClaim {
  claim: string;
  flaw: string;
  evidenceGap: string;
  alternative: string;
  boundaryFailure?: string;
  severity: "minor" | "moderate" | "critical";
}

/**
 * デフォルト設定
 * 思考領域改善: 生成時品質保証への転換により検証システムを無効化
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationWorkflowConfig = {
  enabled: false,  // 生成時品質保証への転換により無効化
  triggerModes: ["post-subagent", "low-confidence", "high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.85,
    requiredFlaws: 1,
    enabledCategories: [
      "evidence-gap",
      "logical-flaw",
      "assumption",
      "alternative",
      "boundary",
      "causal-reversal"
    ],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: [
      "claim-result-mismatch",
      "evidence-confidence-gap",
      "missing-alternatives",
      "causal-reversal",
      "confirmation-bias",
      "overconfidence"
    ],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.9,
};

/**
 * 高リスクタスクのパターン
 * 検証ワークフローをトリガーする危険な操作のキーワード
 *
 * カテゴリ:
 * 1. 削除・破壊的操作 (Destructive operations)
 * 2. 本番環境・リリース (Production & Release)
 * 3. セキュリティ・認証 (Security & Authentication)
 * 4. データベース操作 (Database operations)
 * 5. API契約変更 (API contract changes)
 * 6. 認可・アクセス制御 (Authorization & Access Control)
 * 7. インフラ・デプロイ (Infrastructure & Deployment)
 * 8. 機密データ・コスト (Sensitive Data & Cost)
 * 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
 */
export const HIGH_STAKES_PATTERNS: RegExp[] = [
  // 1. 削除・破壊的操作 (Destructive operations)
  /削除/i,
  /破壊的/i,
  /delete/i,
  /destructive/i,
  /remove/i,
  /drop/i,
  /truncate/i,
  / purge /i,         // Note: スペースを含む場合のみマッチ（危険なコマンド実行）
  /wipe/i,
  /消去/i,
  /除去/i,

  // 2. 本番環境・リリース (Production & Release)
  /本番/i,
  /production/i,
  /prod\b/i,
  /リリース/i,
  /release/i,
  /live\s*environment/i,
  /実環境/i,

  // 3. セキュリティ・認証 (Security & Authentication)
  /セキュリティ/i,
  /security/i,
  /認証/i,
  /authentication/i,
  /暗号化/i,
  /encryption/i,
  /パスワード/i,
  /password/i,
  /credentials/i,
  /シークレット/i,
  /\bsecret\b/i,
  /api\s*key/i,
  /\btoken\b/i,
  /vulnerability/i,
  /脆弱性/i,
  /injection/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bsql\s*injection/i,

  // 4. データベース操作 (Database operations)
  /マイグレーション/i,
  /migration/i,
  /\bschema\b/i,
  /スキーマ/i,
  /\balter\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /データベース変更/i,
  /database\s*change/i,
  /テーブル変更/i,
  /table\s*modification/i,
  /カラム変更/i,
  /column\s*change/i,
  /\breset\b/i,
  /\brollback\b/i,
  /\brevert\b/i,
  /\brestore\b/i,
  /\bbackup\b/i,
  /レプリケーション/i,
  /replication/i,
  /フェイルオーバー/i,
  /\bfailover\b/i,

  // 5. API契約変更 (API contract changes)
  /breaking\s*change/i,
  /破壊的変更/i,
  /deprecated/i,
  /廃止/i,
  /非推奨/i,
  /api\s*contract/i,
  /エンドポイント変更/i,
  /endpoint\s*change/i,
  /互換性がない/i,
  /incompatible/i,

  // 6. 認可・アクセス制御 (Authorization & Access Control)
  /権限/i,
  /\bpermission\b/i,
  /\bauthorize\b/i,
  /authorization/i,
  /認可/i,
  /アクセス制御/i,
  /access\s*control/i,
  /\bacl\b/i,
  /role\s*change/i,
  /ロール変更/i,
  /権限付与/i,
  /privilege/i,

  // 7. インフラ・デプロイ (Infrastructure & Deployment)
  /デプロイ/i,
  /\bdeploy\b/i,
  /インフラ/i,
  /infrastructure/i,
  /\binfra\b/i,
  /kubernetes/i,
  /\bk8s\b/i,
  /コンテナ/i,
  /\bcontainer\b/i,
  /スケーリング/i,
  /\bscale\s*(up|down|out|in)\b/i,
  /設定変更/i,
  /configuration\s*change/i,
  /\bconfig\s*change/i,
  /オートスケール/i,
  /auto\s*scale/i,
  /\biac\b/i,
  /terraform/i,
  /cloudformation/i,

  // 8. 機密データ・コスト (Sensitive Data & Cost)
  /\bpii\b/i,
  /個人情報/i,
  /personal\s*data/i,
  /機密/i,
  /confidential/i,
  /\bprivate\b/i,
  /sensitive\s*data/i,
  /コスト/i,
  /\bcost\b/i,
  /レート制限/i,
  /rate\s*limit/i,
  /課金/i,
  /billing/i,
  /予算/i,
  /\bbudget\b/i,
  /ログ削除/i,
  /log\s*deletion/i,

  // 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
  /\bforce\b/i,
  /強制/i,
  /永続的/i,
  /permanent/i,
  /不可逆/i,
  /irreversible/i,
  /bypass/i,
  /スキップ/i,
  /\bskip\b/i,
  /安全でない/i,
  /unsafe/i,
  /危険/i,
  /\bdanger\b/i,
  /\brisky\b/i,
  /上書き/i,
  /\boverwrite\b/i,
];

/**
 * 検証が必要か判断
 * @summary 検証要否判定
 * @param output 出力内容
 * @param confidence 信頼度
 * @param context 検証コンテキスト
 * @returns トリガー判定と理由
 */
export function shouldTriggerVerification(
  output: string,
  confidence: number,
  context: VerificationContext
): { trigger: boolean; reason: string } {
  const config = resolveVerificationConfig();

  if (!config.enabled) {
    return { trigger: false, reason: "Verification workflow disabled" };
  }

  // 高信頼度の場合はスキップ
  if (confidence >= config.minConfidenceToSkipVerification) {
    // ただし高リスクタスクは除外
    if (!isHighStakesTask(context.task)) {
      return { trigger: false, reason: `Confidence ${confidence} exceeds threshold ${config.minConfidenceToSkipVerification}` };
    }
  }

  // 低信頼度トリガー
  if (config.triggerModes.includes("low-confidence") && confidence < 0.7) {
    return { trigger: true, reason: `Low confidence: ${confidence}` };
  }

  // 高リスクタスクトリガー
  if (config.triggerModes.includes("high-stakes") && isHighStakesTask(context.task)) {
    return { trigger: true, reason: "High-stakes task detected" };
  }

  // 出力パターンチェック
  const patternResult = checkOutputPatterns(output, config);
  if (patternResult.trigger) {
    return patternResult;
  }

  // サブエージェント/チーム後トリガー
  if (config.triggerModes.includes("post-subagent") && context.triggerMode === "post-subagent") {
    return { trigger: true, reason: "Post-subagent verification triggered" };
  }

  if (config.triggerModes.includes("post-team") && context.triggerMode === "post-team") {
    return { trigger: true, reason: "Post-team verification triggered" };
  }

  return { trigger: false, reason: "No trigger conditions met" };
}

/**
 * 検証のコンテキスト情報
 * @summary コンテキスト情報
 * @param task タスク内容
 * @param triggerMode トリガーモード
 * @param agentId エージェントID
 * @param teamId チームID
 * @param previousVerifications 以前の検証回数
 */
export interface VerificationContext {
  task: string;
  triggerMode: "post-subagent" | "post-team" | "explicit" | "low-confidence" | "high-stakes";
  agentId?: string;
  teamId?: string;
  previousVerifications?: number;
}

/**
 * 出力パターンをチェック
 */
function checkOutputPatterns(
  output: string,
  config: VerificationWorkflowConfig
): { trigger: boolean; reason: string } {
  const patterns = config.inspectorConfig.requiredPatterns;

  // CLAIM-RESULT不一致チェック
  if (patterns.includes("claim-result-mismatch")) {
    const mismatch = detectClaimResultMismatch(output);
    if (mismatch.detected) {
      return { trigger: true, reason: mismatch.reason };
    }
  }

  // 過信チェック
  if (patterns.includes("overconfidence")) {
    const overconfidence = detectOverconfidence(output);
    if (overconfidence.detected) {
      return { trigger: true, reason: overconfidence.reason };
    }
  }

  // 代替解釈欠如チェック
  if (patterns.includes("missing-alternatives")) {
    const missingAlternatives = detectMissingAlternatives(output);
    if (missingAlternatives.detected) {
      return { trigger: true, reason: missingAlternatives.reason };
    }
  }

  // 確認バイアスパターンチェック
  if (patterns.includes("confirmation-bias")) {
    const confirmationBias = detectConfirmationBias(output);
    if (confirmationBias.detected) {
      return { trigger: true, reason: confirmationBias.reason };
    }
  }

  return { trigger: false, reason: "" };
}

/**
 * 否定語のリスト
 */
const NEGATION_WORDS = ['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't", 'ない', 'ません', 'しない', 'なし'];

/**
 * 不確実性を示す語のリスト
 */
const UNCERTAINTY_WORDS = ['might', 'may', 'could', 'possibly', 'perhaps', 'maybe', 'likely', 'probably', 'apparently', 'seemingly', 'かもしれません', 'だろう', 'と思われる', '可能性がある'];

/**
 * 高信頼度を示す語のリスト
 */
const HIGH_CONFIDENCE_WORDS = ['definitely', 'certainly', 'absolutely', 'undoubtedly', 'clearly', 'obviously', 'always', 'never', 'must', '間違いなく', '確実に', '当然', '必ず', '絶対'];

/**
 * CLAIM-RESULT不一致を検出
 * 単純な単語重複ではなく、意味的な構造を分析
 */
export function detectClaimResultMismatch(output: string): { detected: boolean; reason: string } {
  const claimMatch = output.match(/CLAIM:\s*(.+?)(?:\n|$)/i);
  const resultMatch = output.match(/RESULT:\s*(.+?)(?:\n|$)/i);
  
  if (!claimMatch || !resultMatch) {
    return { detected: false, reason: "" };
  }
  
  const claim = claimMatch[1].trim();
  const result = resultMatch[1].trim();
  
  // 1. 否定の不一致チェック
  const claimHasNegation = NEGATION_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasNegation = NEGATION_WORDS.some(w => result.toLowerCase().includes(w));
  
  if (claimHasNegation !== resultHasNegation) {
    // ただし、どちらも否定語を含まない場合はOK
    const claimWords = claim.toLowerCase().split(/\s+/);
    const resultWords = result.toLowerCase().split(/\s+/);
    const overlap = claimWords.filter(w => resultWords.includes(w) && w.length > 3).length;
    
    // 単語の重複が低く、否定が異なる場合は不一致の可能性が高い
    if (overlap < Math.min(claimWords.length, resultWords.length) * 0.3) {
      return { detected: true, reason: "CLAIM-RESULT mismatch: negation pattern differs significantly" };
    }
  }
  
  // 2. 不確実性/確実性の不一致
  const claimHasUncertainty = UNCERTAINTY_WORDS.some(w => claim.toLowerCase().includes(w));
  const resultHasHighConfidence = HIGH_CONFIDENCE_WORDS.some(w => result.toLowerCase().includes(w));
  
  if (claimHasUncertainty && resultHasHighConfidence) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: uncertain claim leads to high-confidence result" };
  }
  
  // 3. 主題の不一致チェック（重要名詞の比較）
  const claimNouns = extractKeyTerms(claim);
  const resultNouns = extractKeyTerms(result);
  
  // 共通する重要語がない場合
  const commonTerms = claimNouns.filter(n => resultNouns.includes(n));
  if (claimNouns.length > 0 && resultNouns.length > 0 && commonTerms.length === 0) {
    return { detected: true, reason: "CLAIM-RESULT mismatch: no common key terms found" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * テキストから重要な用語を抽出（簡易版）
 */
function extractKeyTerms(text: string): string[] {
  // 英語の重要語（冠詞、前置詞などを除外）
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also']);
  
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(w => w.length > 3 && !stopWords.has(w) && !w.match(/^[0-9]+$/));
}

/**
 * 過信を検出
 */
export function detectOverconfidence(output: string): { detected: boolean; reason: string } {
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const evidenceMatch = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  
  if (!confidenceMatch || !evidenceMatch) {
    return { detected: false, reason: "" };
  }
  
  const confidence = parseFloat(confidenceMatch[1]);
  const evidence = evidenceMatch[1].trim();
  const evidenceLength = evidence.length;
  
  // 1. 証拠が短いのに信頼度が高い場合
  if (confidence > 0.9 && evidenceLength < 100) {
    return { detected: true, reason: `Overconfidence detected: CONFIDENCE ${confidence} with minimal EVIDENCE (${evidenceLength} chars)` };
  }
  
  // 2. 高信頼度語の使用に対する証拠の評価
  const highConfidenceWordCount = HIGH_CONFIDENCE_WORDS.filter(w => output.toLowerCase().includes(w)).length;
  const uncertaintyWordCount = UNCERTAINTY_WORDS.filter(w => evidence.toLowerCase().includes(w)).length;
  
  // 高信頼度語が多いのに、証拠に不確実性語がない場合
  if (highConfidenceWordCount >= 2 && uncertaintyWordCount === 0 && confidence > 0.85) {
    return { detected: true, reason: "Overconfidence detected: multiple high-confidence markers without uncertainty acknowledgment" };
  }
  
  // 3. 証拠内の具体性の評価
  const hasFileReference = /[a-zA-Z0-9_/-]+\.(ts|js|py|md|json|yaml|yml)/i.test(evidence);
  const hasLineNumber = /line\s*\d+|:\d+|行\d+/i.test(evidence);
  const hasCodeReference = /`[^`]+`/.test(evidence);
  
  const specificityScore = (hasFileReference ? 1 : 0) + (hasLineNumber ? 1 : 0) + (hasCodeReference ? 1 : 0);
  
  // 短い証拠で具体性が乏しい場合のみ、追加の過信判定を行う
  // 100文字ちょうどは境界値として許容し、過剰検知を抑える
  if (confidence > 0.9 && evidenceLength < 100 && specificityScore < 2) {
    return { detected: true, reason: `Overconfidence detected: high confidence (${confidence}) with low evidence specificity (score: ${specificityScore}/3)` };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 代替解釈の欠如を検出
 */
export function detectMissingAlternatives(output: string): { detected: boolean; reason: string } {
  const hasConclusion = /CONCLUSION:|結論|RESULT:|最終的|したがって/i.test(output);
  const confidenceMatch = output.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  const hasDiscussion = /DISCUSSION:|議論|考察/i.test(output);
  
  // 代替解釈の兆候を探す
  const hasAlternatives = /ALTERNATIVE:|代替|別の解釈|他の可能性|一方で|あるいは|または|could also|alternatively|another possibility|other explanation/i.test(output);
  const hasCounterEvidence = /COUNTER_EVIDENCE:|反証|否定する証拠|矛盾する|disconfirming|contradicting|however|but|nevertheless/i.test(output);
  const hasLimitations = /LIMITATION:|制限|限界|注意点| caveat|limitation|constraint|boundary/i.test(output);
  
  // 結論があり、高信頼度だが、代替解釈、反証、制限の記述がない場合
  if (hasConclusion && !hasAlternatives && !hasCounterEvidence && !hasLimitations && !hasDiscussion && confidence > 0.8) {
    return { detected: true, reason: "Missing alternative interpretations for high-confidence conclusion" };
  }
  
  if (hasConclusion && !hasDiscussion && confidence > 0.85) {
    return { detected: true, reason: "Missing DISCUSSION section with alternative perspectives" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 確認バイアスパターンを検出
 */
export function detectConfirmationBias(output: string): { detected: boolean; reason: string } {
  // 「検索した」「探した」などの表現
  const hasSearchIndication = /検索|調査|探|search|investigate|look|find/i.test(output);
  
  // 否定証拠を探した兆候
  const hasNegativeSearch = /反例|反証|否定|矛盾|disconfirm|contradict|negative|counter|反対|異なる結果/i.test(output);
  
  // 肯定的な証拠のみを列挙している可能性
  const evidenceSection = output.match(/EVIDENCE:\s*(.+?)(?:\n\n|\n[A-Z]+:|$)/is);
  if (evidenceSection) {
    const evidence = evidenceSection[1];
    const positiveMarkers = (evidence.match(/成功|動作|正しく|完了|works|correct|success|passed|verified|確認/gi) || []).length;
    const negativeMarkers = (evidence.match(/失敗|エラー|問題|バグ|fail|error|bug|issue|problem|incorrect/gi) || []).length;
    
    // 肯定的な証拠のみで、否定証拠の探索がない場合
    if (positiveMarkers > 3 && negativeMarkers === 0 && !hasNegativeSearch) {
      return { detected: true, reason: "Confirmation bias pattern: only positive evidence listed without seeking disconfirming evidence" };
    }
  }
  
  // 「〜を確認した」「〜が正しいことを検証」などの確認バイアス的表現
  const confirmationPhrases = [
    /期待通り|as expected|予想通り/i,
    /問題ない|no problem|問題なし/i,
    /正しく動作|works correctly|正常に動作/i
  ];
  
  const confirmationCount = confirmationPhrases.filter(p => p.test(output)).length;
  
  if (confirmationCount >= 2 && !hasNegativeSearch) {
    return { detected: true, reason: "Confirmation bias pattern: multiple confirmation phrases without counter-evidence search" };
  }
  
  return { detected: false, reason: "" };
}

/**
 * 高リスクタスク判定
 * @summary リスク判定
 * @param task タスク内容
 * @returns 高リスクの場合はtrue
 */
export function isHighStakesTask(task: string): boolean {
  return HIGH_STAKES_PATTERNS.some(pattern => pattern.test(task));
}

/**
 * 検証設定を解決
 * @summary 設定解決
 * @returns 検証ワークフロー設定
 */
export function resolveVerificationConfig(): VerificationWorkflowConfig {
  const envMode = process.env.PI_VERIFICATION_WORKFLOW_MODE;
  
  if (envMode === "disabled" || envMode === "0") {
    return { ...DEFAULT_VERIFICATION_CONFIG, enabled: false };
  }
  
  if (envMode === "strict") {
    return {
      ...DEFAULT_VERIFICATION_CONFIG,
      enabled: true,
      triggerModes: ["post-subagent", "post-team", "low-confidence", "high-stakes"],
      minConfidenceToSkipVerification: 0.95,
      fallbackBehavior: "block",
      challengerConfig: {
        ...DEFAULT_VERIFICATION_CONFIG.challengerConfig,
        requiredFlaws: 2,
      },
    };
  }

  if (envMode === "minimal") {
    return {
      ...DEFAULT_VERIFICATION_CONFIG,
      enabled: true,
      triggerModes: ["high-stakes"],
      minConfidenceToSkipVerification: 0.7,
      fallbackBehavior: "warn",
    };
  }

  // カスタム設定の環境変数パース
  const config = { ...DEFAULT_VERIFICATION_CONFIG };
  
  const minConfidence = process.env.PI_VERIFICATION_MIN_CONFIDENCE;
  if (minConfidence) {
    const parsed = parseFloat(minConfidence);
    if (!isNaN(parsed)) {
      config.minConfidenceToSkipVerification = Math.max(0, Math.min(1, parsed));
    }
  }

  const maxDepth = process.env.PI_VERIFICATION_MAX_DEPTH;
  if (maxDepth) {
    const parsed = parseInt(maxDepth, 10);
    if (!isNaN(parsed)) {
      config.maxVerificationDepth = Math.max(1, Math.min(5, parsed));
    }
  }

  return config;
}

/**
 * 検査用プロンプトを構築
 * @summary プロンプト構築
 * @param targetOutput 検証対象の出力内容
 * @param context 検証コンテキスト情報
 * @returns 構築されたプロンプト文字列
 */
export function buildInspectorPrompt(targetOutput: string, context: VerificationContext): string {
  const config = resolveVerificationConfig();
  
  return `You are the Inspector subagent. Analyze the following agent output for suspicious patterns.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || "unknown"}

INSPECTION CHECKLIST:
${config.inspectorConfig.requiredPatterns.map(p => `- ${formatPatternName(p)}`).join("\n")}

OUTPUT FORMAT:
\`\`\`
INSPECTION_REPORT:
- [Pattern]: [Finding]
- [Pattern]: [Finding]
...

SUSPICION_LEVEL: low | medium | high

SUMMARY: [Brief summary of findings]

RECOMMENDATION: [What should happen next]
\`\`\`

Focus on:
1. Claims without sufficient evidence
2. Logical inconsistencies between CLAIM and RESULT
3. Overconfidence (high CONFIDENCE with weak EVIDENCE)
4. Missing alternative explanations
5. Causal reversal errors ("A implies B" treated as "B implies A")
6. Confirmation bias patterns (only seeking supporting evidence)`;
}

/**
 * 挑戦者用プロンプトを作成する
 * @summary プロンプトを作成
 * @param targetOutput 対象となる出力
 * @param context 検証コンテキスト
 * @returns 生成されたプロンプト文字列
 */
export function buildChallengerPrompt(targetOutput: string, context: VerificationContext): string {
  const config = resolveVerificationConfig();
  
  return `You are the Challenger subagent. Your role is to DISPUTE and FIND FLAWS in the following agent output.

TARGET OUTPUT:
${targetOutput}

CONTEXT:
- Task: ${context.task}
- Agent: ${context.agentId || context.teamId || "unknown"}

CHALLENGE CATEGORIES:
${config.challengerConfig.enabledCategories.map(c => `- ${formatCategoryName(c)}`).join("\n")}

REQUIREMENTS:
- Identify at least ${config.challengerConfig.requiredFlaws} flaw(s) or weakness(es)
- Be constructively critical - your goal is to strengthen conclusions
- Focus on the most significant issues first

OUTPUT FORMAT:
For each challenged claim:
\`\`\`
CHALLENGED_CLAIM: <specific claim being challenged>
FLAW: <identified flaw or weakness>
EVIDENCE_GAP: <missing evidence that would strengthen/verify the claim>
ALTERNATIVE: <alternative interpretation or explanation>
BOUNDARY_FAILURE: <conditions under which the claim would fail>
SEVERITY: minor | moderate | critical
\`\`\`

OVERALL_SEVERITY: minor | moderate | critical

SUMMARY: [Brief summary of challenges]

SUGGESTED_REVISIONS:
- [Revision 1]
- [Revision 2]
...`;
}

/**
 * 検証結果を統合する
 * @summary 検証結果を統合
 * @param originalOutput 元の出力
 * @param originalConfidence 元の信頼度
 * @param inspectorOutput 検査官の出力
 * @param challengerOutput 挑戦者の出力
 * @param context 検証コンテキスト
 * @returns 統合された検証結果
 */
export function synthesizeVerificationResult(
  originalOutput: string,
  originalConfidence: number,
  inspectorOutput: InspectorOutput | undefined,
  challengerOutput: ChallengerOutput | undefined,
  context: VerificationContext
): VerificationResult {
  const config = resolveVerificationConfig();
  const warnings: string[] = [];
  let finalVerdict: VerificationVerdict = "pass";
  let requiresReRun = false;
  let confidence = originalConfidence;

  // Inspectorの発見事項を処理
  if (inspectorOutput) {
    if (inspectorOutput.suspicionLevel === "high") {
      finalVerdict = "needs-review";
      warnings.push(`Inspector detected high suspicion: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.5);
    } else if (inspectorOutput.suspicionLevel === "medium") {
      if (finalVerdict === "pass") {
        finalVerdict = "pass-with-warnings";
      }
      warnings.push(`Inspector noted concerns: ${inspectorOutput.summary}`);
      confidence = Math.min(confidence, 0.7);
    }

    // 重要なパターンをチェック
    const criticalPatterns = inspectorOutput.detectedPatterns.filter(
      p => p.severity === "high"
    );
    if (criticalPatterns.length > 0) {
      finalVerdict = config.fallbackBehavior === "block" ? "blocked" : "needs-review";
      requiresReRun = config.fallbackBehavior === "block";
    }
  }

  // Challengerの発見事項を処理
  if (challengerOutput) {
    if (challengerOutput.overallSeverity === "critical") {
      finalVerdict = config.fallbackBehavior === "block" ? "blocked" : "fail";
      requiresReRun = config.fallbackBehavior === "block";
      warnings.push(`Critical challenges identified: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.3);
    } else if (challengerOutput.overallSeverity === "moderate") {
      if (finalVerdict === "pass") {
        finalVerdict = "pass-with-warnings";
      }
      warnings.push(`Moderate challenges: ${challengerOutput.summary}`);
      confidence = Math.min(confidence, 0.6);
    }

    // 深度チェック
    if ((context.previousVerifications || 0) >= config.maxVerificationDepth) {
      warnings.push("Max verification depth reached - manual review recommended");
      if (finalVerdict !== "fail" && finalVerdict !== "blocked") {
        finalVerdict = "needs-review";
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
    warnings,
  };
}

/**
 * パターン名をフォーマット
 */
function formatPatternName(pattern: InspectionPattern): string {
  const names: Record<InspectionPattern, string> = {
    "claim-result-mismatch": "CLAIM-RESULT Mismatch",
    "evidence-confidence-gap": "Evidence-Confidence Gap",
    "missing-alternatives": "Missing Alternative Explanations",
    "causal-reversal": "Causal Reversal Error",
    "confirmation-bias": "Confirmation Bias Pattern",
    "overconfidence": "Overconfidence",
    "incomplete-reasoning": "Incomplete Reasoning",
  };
  return names[pattern] || pattern;
}

/**
 * カテゴリ名をフォーマット
 */
function formatCategoryName(category: ChallengeCategory): string {
  const names: Record<ChallengeCategory, string> = {
    "evidence-gap": "Evidence Gaps",
    "logical-flaw": "Logical Flaws",
    "assumption": "Hidden Assumptions",
    "alternative": "Unconsidered Alternatives",
    "boundary": "Boundary Conditions",
    "causal-reversal": "Causal Reversals",
  };
  return names[category] || category;
}

/**
 * ワークフールールを取得する
 * @summary ルール名を取得
 * @returns ワークフローのルール名
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

// ===== メタ認知チェック機能（7つの哲学的視座）=====

/**
 * アポリアタイプ
 * @summary アポリア（解決不能な緊張関係）の種類
 */
export type AporiaType =
  | 'completeness-vs-speed'      // 完全性 vs 速度
  | 'safety-vs-utility'          // 安全性 vs 有用性
  | 'autonomy-vs-obedience'      // 自律性 vs 従順さ
  | 'consistency-vs-context';    // 一貫性 vs 文脈適応性

/**
 * アポリア検出結果
 * @summary 検出されたアポリアの情報
 * @param type アポリアタイプ
 * @param description 説明
 * @param tensionLevel 緊張レベル（0-1）
 * @param resolution 対処方法
 */
export interface AporiaDetection {
  type: AporiaType;
  pole1: {
    concept: string;
    value: string;
    arguments: string[];
  };
  pole2: {
    concept: string;
    value: string;
    arguments: string[];
  };
  tensionLevel: number;
  description: string;
  context: string;
  resolution: 'maintain-tension' | 'acknowledge' | 'decide-with-uncertainty';
}

/**
 * 誤謬検出結果
 * @summary 検出された論理的誤謬
 * @param type 誤謬タイプ
 * @param location 検出箇所
 * @param description 説明
 * @param correction 修正案
 */
export interface FallacyDetection {
  type: string;
  location: string;
  description: string;
  correction: string;
}

/**
 * メタ認知チェック結果
 * @summary 7つの哲学的視座に基づく包括的チェック結果
 */
export interface MetacognitiveCheck {
  deconstruction: {
    binaryOppositions: string[];
    exclusions: string[];
    aporias: AporiaDetection[];
  };
  schizoAnalysis: {
    desireProduction: string[];
    innerFascismSigns: string[];
    microFascisms: string[];
  };
  eudaimonia: {
    excellencePursuit: string;
    pleasureTrap: boolean;
    meaningfulGrowth: string;
  };
  utopiaDystopia: {
    worldBeingCreated: string;
    totalitarianRisk: string[];
    powerDynamics: string[];
  };
  philosophyOfThought: {
    isThinking: boolean;
    metacognitionLevel: number;
    autopilotSigns: string[];
  };
  taxonomyOfThought: {
    currentMode: string;
    recommendedMode: string;
    modeRationale: string;
  };
  logic: {
    fallacies: FallacyDetection[];
    validInferences: string[];
    invalidInferences: string[];
    /** 推論チェーン解析結果 */
    inferenceChain?: InferenceChain;
  };
}

/**
 * @summary 7つの視座に基づく包括的メタ認知チェックを実行
 * @param output 検査対象の出力
 * @param context コンテキスト情報
 * @returns メタ認知チェック結果
 */
export function runMetacognitiveCheck(
  output: string,
  context: { task?: string; currentMode?: string } = {}
): MetacognitiveCheck {
  const logicResult = detectFallacies(output);
  const inferenceChain = parseInferenceChain(output);
  
  return {
    deconstruction: detectBinaryOppositions(output, context.task || ''),
    schizoAnalysis: detectInnerFascism(output, context),
    eudaimonia: evaluateEudaimonia(output, context),
    utopiaDystopia: analyzeWorldCreation(output),
    philosophyOfThought: assessThinkingQuality(output, context),
    taxonomyOfThought: evaluateThinkingMode(output, context),
    logic: {
      ...logicResult,
      inferenceChain
    }
  };
}

/**
 * @summary 内なるファシズムを検出
 * @param output 検査対象
 * @param context コンテキスト
 * @returns スキゾ分析結果
 */
export function detectInnerFascism(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['schizoAnalysis'] {
  // 多言語対応のファシズムパターン
  const fascismPatterns = [
    // 日本語パターン
    { pattern: /常に|必ず|絶対に/g, sign: '自己監視の強制' },
    { pattern: /すべき|しなければならない|ねばならない/g, sign: '規範への過度な服従' },
    { pattern: /正しい|適切な|正当な|適正な/g, sign: '一価値への収斂' },
    { pattern: /許可|承認|確認|許可済/g, sign: '権力への依存' },
    { pattern: /排除|禁止|否定|拒否/g, sign: '異質なものの排除' },
    // 英語パターン
    { pattern: /always|must|absolutely|never/gi, sign: 'Self-surveillance enforcement' },
    { pattern: /should|must|have to|need to/gi, sign: 'Excessive obedience to norms' },
    { pattern: /correct|proper|legitimate|appropriate/gi, sign: 'Convergence to single value' },
    { pattern: /permission|approval|authorized|granted/gi, sign: 'Dependency on authority' },
    { pattern: /exclude|forbid|deny|reject|prohibit/gi, sign: 'Exclusion of the other' }
  ];

  const signs: string[] = [];
  const microFascisms: string[] = [];
  const desireProductions: string[] = [];

  fascismPatterns.forEach(({ pattern, sign }) => {
    const matches = output.match(pattern);
    if (matches && matches.length > 2) {
      signs.push(sign);
      microFascisms.push(`"${matches[0]}"の反復使用（${matches.length}回）`);
    }
  });

  // 欲望の生産性を分析（多言語）
  if (/(?:完了|達成|成功|complete|achieve|success)/i.test(output)) {
    desireProductions.push('生産性への欲望');
  }
  if (/(?:正確|正しい|妥当|correct|accurate|valid)/i.test(output)) {
    desireProductions.push('正確性への欲望');
  }
  if (/(?:合意|同意|承認|consensus|agreement|approval)/i.test(output)) {
    desireProductions.push('合意形成への欲望');
  }
  if (/(?:効率|最適|改善|efficient|optimal|improve)/i.test(output)) {
    desireProductions.push('効率化への欲望');
  }
  if (/(?:理解|把握|掌握|understand|grasp|control)/i.test(output)) {
    desireProductions.push('理解・掌握への欲望');
  }

  return {
    desireProduction: desireProductions,
    innerFascismSigns: signs,
    microFascisms
  };
}

/**
 * @summary 二項対立とアポリアを検出（多言語対応版）
 * @param output 検査対象
 * @param context コンテキスト
 * @returns 脱構築分析結果
 */
export function detectBinaryOppositions(
  output: string,
  context: string
): MetacognitiveCheck['deconstruction'] {
  // 多言語対応の二項対立パターン
  const binaryPatterns = [
    // 日本語
    { pattern: /正しい\/間違い|良い\/悪い|成功\/失敗/, name: '善悪の二項対立' },
    { pattern: /完全\/不完全|完了\/未完了/, name: '完全性の二項対立' },
    { pattern: /安全\/危険|リスク\/機会/, name: '安全性の二項対立' },
    { pattern: /正解\/不正解|真\/偽/, name: '真偽の二項対立' },
    { pattern: /善\/悪|良い\/悪い/, name: '道徳的対立' },
    // 英語
    { pattern: /right\/wrong|good\/bad|success\/fail/i, name: 'Moral binary opposition' },
    { pattern: /complete\/incomplete|done\/undone/i, name: 'Completeness binary' },
    { pattern: /safe\/danger|risk\/opportunity/i, name: 'Safety binary opposition' },
    { pattern: /true\/false|correct\/incorrect/i, name: 'Truth-value binary' },
    { pattern: /good\/evil|virtue\/vice/i, name: 'Ethical opposition' }
  ];

  const binaryOppositions: string[] = [];
  const exclusions: string[] = [];
  const aporias: AporiaDetection[] = [];

  binaryPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(output)) {
      binaryOppositions.push(name);
      exclusions.push(`${name}の中間領域`);
    }
  });

  // アポリア検出（多言語）
  // 速度 vs 品質
  if (/(?:速度|効率|速|speed|efficient|fast)/i.test(output) && 
      /(?:品質|正確|完全|quality|accurate|complete)/i.test(output)) {
    aporias.push({
      type: 'completeness-vs-speed',
      pole1: { concept: '完全性', value: '品質・正確性', arguments: [] },
      pole2: { concept: '速度', value: '効率・迅速性', arguments: [] },
      tensionLevel: 0.7,
      description: '速度と品質のトレードオフ',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 安全性 vs 有用性（多言語）
  if (/(?:安全|リスク|注意|safe|risk|caution)/i.test(output) && 
      /(?:有用|価値|効果|useful|value|effect)/i.test(output)) {
    aporias.push({
      type: 'safety-vs-utility',
      pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
      pole2: { concept: '有用性', value: '効果追求', arguments: [] },
      tensionLevel: 0.6,
      description: '安全性と有用性のトレードオフ',
      context,
      resolution: 'acknowledge'
    });
  }
  // 自律性 vs 従順さ（多言語）
  if (/(?:自律|自主|裁量|autonom|self-determin|discretion)/i.test(output) && 
      /(?:従順|指示|規則|obedien|comply|rule)/i.test(output)) {
    aporias.push({
      type: 'autonomy-vs-obedience',
      pole1: { concept: '自律性', value: '自己決定', arguments: [] },
      pole2: { concept: '従順さ', value: '指示従順', arguments: [] },
      tensionLevel: 0.5,
      description: '自律性と従順さの対立',
      context,
      resolution: 'maintain-tension'
    });
  }
  // 一貫性 vs 文脈適応性（多言語）
  if (/(?:一貫|統一|原則|consistent|uniform|principle)/i.test(output) && 
      /(?:文脈|状況|臨機応変|context|situation|flexible)/i.test(output)) {
    aporias.push({
      type: 'consistency-vs-context',
      pole1: { concept: '一貫性', value: '原則堅持', arguments: [] },
      pole2: { concept: '文脈適応性', value: '柔軟対応', arguments: [] },
      tensionLevel: 0.5,
      description: '一貫性と文脈適応性の対立',
      context,
      resolution: 'decide-with-uncertainty'
    });
  }
  // 個別性 vs 一般性（多言語）
  if (/(?:個別|特殊|具体|particular|specific|concrete)/i.test(output) && 
      /(?:一般|普遍|抽象|general|universal|abstract)/i.test(output)) {
    aporias.push({
      type: 'consistency-vs-context',
      pole1: { concept: '個別性', value: '具体的事例', arguments: [] },
      pole2: { concept: '一般性', value: '普遍的原則', arguments: [] },
      tensionLevel: 0.6,
      description: '個別性と一般性の対立',
      context,
      resolution: 'maintain-tension'
    });
  }

  return {
    binaryOppositions,
    exclusions,
    aporias
  };
}

/**
 * @summary 幸福論（エウダイモニア）の評価（多言語対応版）
 */
function evaluateEudaimonia(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['eudaimonia'] {
  // 快楽主義の罠を検出（多言語）
  const pleasureTrapIndicators = [
    // 日本語
    '簡単', '楽', 'すぐ', '手軽', '便利',
    // 英語
    'easy', 'quick', 'simple', 'convenient', 'effortless'
  ];
  const pleasureTrap = pleasureTrapIndicators.some(indicator => 
    output.toLowerCase().includes(indicator.toLowerCase())
  );

  // 卓越性の追求を検出（多言語）
  let excellencePursuit = 'タスク完了の卓越性を追求';
  if (/(?:品質|正確|quality|accurate)/i.test(output)) {
    excellencePursuit = '品質と正確性の卓越性を追求';
  }
  if (/(?:効率|最適|efficient|optimal)/i.test(output)) {
    excellencePursuit = '効率と最適化の卓越性を追求';
  }
  if (/(?:創造|革新|creative|innovative)/i.test(output)) {
    excellencePursuit = '創造性と革新性の卓越性を追求';
  }

  // 意味ある成長を検出（多言語）
  let meaningfulGrowth = '思考プロセスの深化';
  if (/(?:学習|改善|learn|improve)/i.test(output)) {
    meaningfulGrowth = '継続的な学習と改善';
  }
  if (/(?:発見|新た|discover|new)/i.test(output)) {
    meaningfulGrowth = '新たな発見と気づき';
  }
  if (/(?:挑戦|克服|challenge|overcome)/i.test(output)) {
    meaningfulGrowth = '自己克服と成長';
  }

  return {
    excellencePursuit,
    pleasureTrap,
    meaningfulGrowth
  };
}

/**
 * @summary ユートピア/ディストピア分析（多言語対応版）
 */
function analyzeWorldCreation(output: string): MetacognitiveCheck['utopiaDystopia'] {
  // 創造している世界を推定（多言語）
  let worldBeingCreated = '効率的なタスク実行の世界';
  if (/(?:自動|効率|automat|efficient)/i.test(output)) {
    worldBeingCreated = '自動化された効率的な世界';
  }
  if (/(?:協調|合意|cooperat|consensus)/i.test(output)) {
    worldBeingCreated = '協調的合意形成の世界';
  }
  if (/(?:自由|解放|free|liberat)/i.test(output)) {
    worldBeingCreated = '自由と解放の世界';
  }
  if (/(?:安全|保護|safe|protect)/i.test(output)) {
    worldBeingCreated = '安全と保護の世界';
  }

  // 全体主義リスクを検出（多言語）
  const totalitarianRisk: string[] = [];
  if (/(?:統一|標準|unif|standard)/i.test(output)) {
    totalitarianRisk.push('標準化への圧力');
  }
  if (/(?:監視|確認|monitor|surveill)/i.test(output)) {
    totalitarianRisk.push('過度な監視の可能性');
  }
  if (/(?:排除|禁止|exclude|forbid|prohibit)/i.test(output)) {
    totalitarianRisk.push('排除の論理');
  }
  if (/(?:管理|統制|control|regulate)/i.test(output)) {
    totalitarianRisk.push('管理社会の可能性');
  }

  // 権力動態を分析（多言語）
  const powerDynamics: string[] = ['ユーザー-エージェント関係'];
  if (/(?:指示|命令|command|order|instruct)/i.test(output)) {
    powerDynamics.push('指示-実行の階層');
  }
  if (/(?:合意|協議|consensus|consult)/i.test(output)) {
    powerDynamics.push('水平的協調関係');
  }
  if (/(?:権限|認可|authority|authoriz)/i.test(output)) {
    powerDynamics.push('権限に基づく関係');
  }

  return {
    worldBeingCreated,
    totalitarianRisk,
    powerDynamics
  };
}

/**
 * @summary 思考の質を評価（多言語対応版）
 */
function assessThinkingQuality(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['philosophyOfThought'] {
  const autopilotSigns: string[] = [];

  // オートパイロットの兆候を検出（多言語）
  if (output.length < 100) {
    autopilotSigns.push('出力が短い');
  }
  
  // 問いの欠如（多言語）
  const hasQuestion = /[?？]/.test(output) || 
    /とは|なぜ|どう|why|how|what|when|where|who/i.test(output);
  if (!hasQuestion) {
    autopilotSigns.push('問いがない');
  }
  
  // 深い問いの欠如（多言語）
  const hasDeepQuestion = /なぜ|どうして|how come|why exactly|what if/i.test(output);
  if (!hasDeepQuestion) {
    autopilotSigns.push('深い問いが欠如');
  }
  
  // 単調な構造（多言語）
  const isMonotonous = (/です。$|ます。$/gm.test(output) || 
    /\.$\n?\.$/gm.test(output)) && output.split('\n').length < 3;
  if (isMonotonous) {
    autopilotSigns.push('単調な構造');
  }

  // メタ認知レベルを推定（多言語）
  let metacognitionLevel = 0.5;
  
  // 前提の明示
  if (/(?:前提|仮定|仮に|premise|assumption|suppose|assuming)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 制約の認識
  if (/(?:制約|限界|注意点|constraint|limitation|caveat)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 代替案の検討
  if (/(?:代替|別の|他の|alternative|another|other option)/i.test(output)) {
    metacognitionLevel += 0.1;
  }
  
  // 反例の探索（重要な指標）
  if (/(?:反例|反証|矛盾|counter.?example|disprove|contradict)/i.test(output)) {
    metacognitionLevel += 0.15;
  }
  
  // 推論の明示
  if (/(?:推論|論理|理由|inference|logic|reason|because)/i.test(output)) {
    metacognitionLevel += 0.05;
  }
  
  if (autopilotSigns.length > 2) {
    metacognitionLevel -= 0.2;
  }
  metacognitionLevel = Math.max(0, Math.min(1, metacognitionLevel));

  const isThinking = autopilotSigns.length === 0 && metacognitionLevel > 0.4;

  return {
    isThinking,
    metacognitionLevel,
    autopilotSigns
  };
}

/**
 * @summary 思考モードの適切性を評価（多言語対応版）
 */
function evaluateThinkingMode(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['taxonomyOfThought'] {
  // 現在のモードを推定（多言語）
  let currentMode = context.currentMode || 'unknown';

  // 出力から使用された思考モードを推定（多言語）
  if (/(?:創造|新規|アイデア|発想|creative|novel|idea|innovation)/i.test(output)) {
    currentMode = 'creative';
  } else if (/(?:分析|検討|分解|論理|analytical|analysis|logical|breakdown)/i.test(output)) {
    currentMode = 'analytical';
  } else if (/(?:批判|検証|反例|問題点|critical|review|problem|issue)/i.test(output)) {
    currentMode = 'critical';
  } else if (/(?:実装|実現|具体的|手順|practical|implement|concrete|step)/i.test(output)) {
    currentMode = 'practical';
  } else if (/(?:合意|調整|協議|関係者|consensus|coordinate|stakeholder)/i.test(output)) {
    currentMode = 'social';
  } else if (/(?:配慮|倫理|感情|共感|considerate|ethical|empathy|emotion)/i.test(output)) {
    currentMode = 'emotional';
  }

  // 推奨モードを決定（多言語）
  let recommendedMode = currentMode;
  let modeRationale = '現在のモードが適切';

  if (context.task) {
    const task = context.task.toLowerCase();
    
    // 設計・デザインタスク
    if (/(?:設計|デザイン|design|architect)/.test(task) && currentMode !== 'creative') {
      recommendedMode = 'creative';
      modeRationale = '設計タスクには創造的モードが推奨';
    }
    // レビュータスク
    else if (/(?:レビュー|評価|review|evaluate)/.test(task) && currentMode !== 'critical') {
      recommendedMode = 'critical';
      modeRationale = 'レビュータスクには批判的モードが推奨';
    }
    // 実装タスク
    else if (/(?:実装|開発|implement|develop)/.test(task) && currentMode !== 'practical') {
      recommendedMode = 'practical';
      modeRationale = '実装タスクには実践的モードが推奨';
    }
    // 分析タスク
    else if (/(?:分析|調査|analyze|investigate)/.test(task) && currentMode !== 'analytical') {
      recommendedMode = 'analytical';
      modeRationale = '分析タスクには分析的モードが推奨';
    }
  }

  return {
    currentMode,
    recommendedMode,
    modeRationale
  };
}

/**
 * @summary 論理的誤謬を検出（多言語対応版）
 */
function detectFallacies(output: string): MetacognitiveCheck['logic'] {
  const fallacies: FallacyDetection[] = [];
  const validInferences: string[] = [];
  const invalidInferences: string[] = [];

  // 多言語パターン定義
  const patterns = {
    // 後件肯定 (Affirming the Consequent)
    affirmingConsequent: {
      ja: [/ならば.*だから.*だろう/, /もし.*なら.*だから/],
      en: [/if.*then.*because/i, /since.*therefore.*must/i, /implies.*so.*probably/i]
    },
    // 前提否定 (Denying the Antecedent)
    denyingAntecedent: {
      ja: [/でないなら.*だから.*でない/, /ではないので.*ではない/],
      en: [/not.*so.*not/i, /since not.*therefore not/i]
    },
    // 転移の誤謬 (Hasty Generalization)
    hastyGeneralization: {
      ja: [/一人が.*なら.*全員も/, /全員が.*なら.*一人も/, /一つの例から.*一般/],
      en: [/one.*so all/i, /everyone.*so one/i, /therefore always/i, /must be.*all/i]
    },
    // 偽の二分法 (False Dichotomy)
    falseDichotomy: {
      ja: [/どちらか|いずれか|二択|二者択一/],
      en: [/either.*or/i, /only two/i, /no other choice/i, /must choose between/i]
    },
    // 循環論法 (Circular Reasoning)
    circularReasoning: {
      ja: [/なぜなら.*だから/, /理由は.*である/],
      en: [/because.*therefore/i, /reason.*is that/i]
    },
    // 滑り坂 (Slippery Slope)
    slipperySlope: {
      ja: [/そうなれば.*結局/, /一歩踏み出せば.*最終的に/],
      en: [/will lead to/i, /eventually.*will/i, /slippery slope/i]
    },
    // 稲妻の人 (Straw Man)
    strawMan: {
      ja: [/極端な.*言うなら/, /あたかも.*かのように/],
      en: [/would have you believe/i, /so you're saying/i, /essentially claiming/i]
    },
    // 人身攻撃 (Ad Hominem)
    adHominem: {
      ja: [/個人的には.*信頼/, /人物として/],
      en: [/personally.*don't trust/i, /as a person/i, /character.*questionable/i]
    },
    // 権威への訴え (Appeal to Authority)
    appealToAuthority: {
      ja: [/専門家が.*言う/, /権威.*によれば/],
      en: [/experts say/i, /authority.*states/i, /according to.*expert/i]
    },
    // 感情への訴え (Appeal to Emotion)
    appealToEmotion: {
      ja: [/可哀想.*だから/, /悲しい.*だから/],
      en: [/feel.*sorry/i, /heartbreaking.*so/i, /outrage.*therefore/i]
    }
  };

  // 有効な推論パターン（多言語）
  const validPatterns = {
    deductive: {
      ja: [/したがって|ゆえに|それゆえ|結論として/],
      en: [/therefore/i, /thus/i, /hence/i, /consequently/i, /it follows that/i]
    },
    careful: {
      ja: [/傾向がある|一般的に|多くの場合|傾向として/],
      en: [/tend to/i, /generally/i, /in many cases/i, /typically/i, /often/i]
    },
    probabilistic: {
      ja: [/おそらく|可能性が高い|考えられる|推測される/],
      en: [/probably/i, /likely/i, /possibly/i, /may be/i, /suggests that/i]
    },
    evidence: {
      ja: [/証拠に基づき|データから|検証結果/],
      en: [/based on evidence/i, /data shows/i, /verified by/i, /according to data/i]
    }
  };

  // 後件肯定の検出（多言語）
  for (const pattern of [...patterns.affirmingConsequent.ja, ...patterns.affirmingConsequent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '後件肯定',
        location: '推論部分',
        description: 'P→Q、Q から P を導出しようとしている可能性（必要条件を十分条件と混同）',
        correction: '必要条件と十分条件を区別し、逆は常に真とは限らないことを確認'
      });
      invalidInferences.push('後件肯定の可能性');
      break;
    }
  }

  // 前提否定の検出（多言語）
  for (const pattern of [...patterns.denyingAntecedent.ja, ...patterns.denyingAntecedent.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '前提否定',
        location: '推論部分',
        description: 'P→Q、¬P から ¬Q を導出しようとしている可能性',
        correction: '前提が偽でも結論が真である可能性を考慮'
      });
      invalidInferences.push('前提否定の可能性');
      break;
    }
  }

  // 転移の誤謬の検出（多言語）
  for (const pattern of [...patterns.hastyGeneralization.ja, ...patterns.hastyGeneralization.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '転移の誤謬',
        location: '一般化部分',
        description: '個別的事例と全体的傾向を混同している可能性',
        correction: 'サンプルサイズと代表性を確認'
      });
      invalidInferences.push('転移の誤謬の可能性');
      break;
    }
  }

  // 偽の二分法の検出（多言語）
  const hasFalseDichotomy = patterns.falseDichotomy.ja.some(p => p.test(output)) ||
    patterns.falseDichotomy.en.some(p => p.test(output));
  const hasOr = /または|or\b/i.test(output);
  if (hasFalseDichotomy && hasOr) {
    fallacies.push({
      type: '偽の二分法',
      location: '選択肢提示部分',
      description: '選択肢を2つに限定しているが、他の可能性があるかもしれない',
      correction: '第三の選択肢や中間的な選択肢を検討'
    });
    invalidInferences.push('偽の二分法の可能性');
  }

  // 循環論法の検出（多言語）
  for (const pattern of [...patterns.circularReasoning.ja, ...patterns.circularReasoning.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '循環論法',
        location: '論証部分',
        description: '結論を前提として使用している可能性',
        correction: '論証を独立した前提から再構築する'
      });
      invalidInferences.push('循環論法の可能性');
      break;
    }
  }

  // 滑り坂の検出（多言語）
  for (const pattern of [...patterns.slipperySlope.ja, ...patterns.slipperySlope.en]) {
    if (pattern.test(output)) {
      fallacies.push({
        type: '滑り坂',
        location: '因果連鎖部分',
        description: '極端な結果を予測し、中間段階の可能性を無視している',
        correction: '各段階の因果関係を個別に検証する'
      });
      invalidInferences.push('滑り坂の可能性');
      break;
    }
  }

  // 有効な推論を検出（多言語）
  for (const pattern of [...validPatterns.deductive.ja, ...validPatterns.deductive.en]) {
    if (pattern.test(output)) {
      validInferences.push('演繹的推論の使用');
      break;
    }
  }
  for (const pattern of [...validPatterns.careful.ja, ...validPatterns.careful.en]) {
    if (pattern.test(output)) {
      validInferences.push('慎重な一般化');
      break;
    }
  }
  for (const pattern of [...validPatterns.probabilistic.ja, ...validPatterns.probabilistic.en]) {
    if (pattern.test(output)) {
      validInferences.push('確率的推論の明示');
      break;
    }
  }
  for (const pattern of [...validPatterns.evidence.ja, ...validPatterns.evidence.en]) {
    if (pattern.test(output)) {
      validInferences.push('証拠に基づく推論');
      break;
    }
  }

  return {
    fallacies,
    validInferences,
    invalidInferences
  };
}

/**
 * 推論チェーンを表すインターフェース
 * @summary 推論チェーン構造
 */
export interface InferenceChain {
  /** 前提文 */
  premises: string[];
  /** 推論ステップ */
  steps: InferenceStep[];
  /** 結論文 */
  conclusion: string;
  /** チェーン全体の妥当性 */
  validity: 'valid' | 'invalid' | 'uncertain';
  /** 検出された論理的飛躍 */
  gaps: string[];
}

/**
 * 個別の推論ステップ
 * @summary 推論ステップ
 */
export interface InferenceStep {
  /** ステップ番号 */
  stepNumber: number;
  /** 入力（前提または前のステップの出力） */
  input: string;
  /** 推論タイプ */
  inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical' | 'unknown';
  /** 出力 */
  output: string;
  /** 妥当性 */
  isValid: boolean;
  /** 根拠 */
  justification?: string;
}

/**
 * 推論チェーンを解析する
 * @summary 推論チェーンを解析
 * @param output 出力テキスト
 * @returns 解析された推論チェーン
 */
export function parseInferenceChain(output: string): InferenceChain {
  const premises: string[] = [];
  const steps: InferenceStep[] = [];
  const gaps: string[] = [];
  let conclusion = '';
  let validity: 'valid' | 'invalid' | 'uncertain' = 'uncertain';

  // 前提を抽出するパターン
  const premisePatterns = [
    /(?:前提|仮定|仮に|assuming|given|suppose|premise)[:：]\s*(.+?)(?:\n|$)/gi,
    /(?:もし|if)\s+(.+?)\s*(?:ならば|then)/gi,
    /(?:当然|obviously|clearly|it is evident that)\s+(.+?)(?:\n|,|。|\.)/gi
  ];

  for (const pattern of premisePatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        premises.push(match[1].trim());
      }
    }
  }

  // 結論を抽出するパターン
  const conclusionPatterns = [
    /(?:結論|結局|したがって|ゆえに|conclusion|therefore|thus|hence)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi,
    /(?:結果として|as a result|consequently)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi
  ];

  for (const pattern of conclusionPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        conclusion = match[1].trim();
        break;
      }
    }
    if (conclusion) break;
  }

  // 推論ステップを抽出
  const stepPatterns = [
    /(\d+)[.．、)]\s*(.+?)(?=\d+[.．、)]|$)/g,
    /(?:ステップ|step)\s*(\d+)[:：]?\s*(.+?)(?=ステップ|step|$)/gi
  ];

  let stepNumber = 1;
  for (const pattern of stepPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const stepText = match[2]?.trim() ?? '';
      if (stepText.length > 10) {
        // 推論タイプを推定
        let inferenceType: InferenceStep['inferenceType'] = 'unknown';
        if (/(?:したがって|ゆえに|therefore|thus|hence)/i.test(stepText)) {
          inferenceType = 'deductive';
        } else if (/(?:おそらく|likely|probably|tends to)/i.test(stepText)) {
          inferenceType = 'inductive';
        } else if (/(?:恐らく|probably|might|could be because)/i.test(stepText)) {
          inferenceType = 'abductive';
        } else if (/(?:同様に|similarly|like|analogous)/i.test(stepText)) {
          inferenceType = 'analogical';
        }

        steps.push({
          stepNumber: stepNumber++,
          input: '',
          inferenceType,
          output: stepText,
          isValid: inferenceType === 'deductive' || inferenceType === 'unknown'
        });
      }
    }
  }

  // 論理的飛躍を検出
  if (premises.length > 0 && conclusion && steps.length === 0) {
    gaps.push('前提から結論への推論ステップが明示されていない');
    validity = 'uncertain';
  }

  if (steps.length > 1) {
    for (let i = 1; i < steps.length; i++) {
      if (!steps[i-1]?.output || steps[i]?.input === '') {
        gaps.push(`ステップ${i}から${i+1}の間の論理的つながりが不明確`);
      }
    }
  }

  // 妥当性判定
  const fallacies = detectFallacies(output);
  if (fallacies.fallacies.length > 0) {
    validity = 'invalid';
  } else if (gaps.length === 0 && premises.length > 0 && conclusion) {
    validity = 'valid';
  }

  return {
    premises,
    steps,
    conclusion,
    validity,
    gaps
  };
}

/**
 * @summary アポリア回避の誘惑を検出
 * @param aporias 検出されたアポリアのリスト
 * @param output 出力内容
 * @returns 検出された回避パターン
 */
export function detectAporiaAvoidanceTemptation(
  aporias: AporiaDetection[],
  output: string
): string[] {
  const temptations: string[] = [];

  aporias.forEach(aporia => {
    // ヘーゲル的弁証法（統合）への誘惑
    if (output.includes('統合') || output.includes('両立') || output.includes('バランス')) {
      temptations.push(`${aporia.description}に対する「統合」による解決への誘惑`);
    }

    // 過度な文脈依存
    if (output.includes('状況による') || output.includes('ケースバイケース')) {
      temptations.push(`${aporia.description}に対する文脈への過度な依存による原則放棄のリスク`);
    }

    // 早まった決断
    if (aporia.tensionLevel < 0.5 && (output.includes('決定') || output.includes('結論'))) {
      temptations.push(`${aporia.description}に対する十分な検討なしの決断の可能性`);
    }
  });

  return temptations;
}

/**
 * @summary メタ認科チェックのサマリーを生成
 * @param check メタ認科チェック結果
 * @returns サマリー文字列
 */
export function generateMetacognitiveSummary(check: MetacognitiveCheck): string {
  const issues: string[] = [];
  const strengths: string[] = [];

  // 脱構築の問題点
  if (check.deconstruction.binaryOppositions.length > 0) {
    issues.push(`二項対立: ${check.deconstruction.binaryOppositions.join(', ')}`);
  }
  if (check.deconstruction.aporias.length > 0) {
    issues.push(`アポリア: ${check.deconstruction.aporias.map(a => a.description).join(', ')}`);
  }

  // スキゾ分析の問題点
  if (check.schizoAnalysis.innerFascismSigns.length > 0) {
    issues.push(`内なるファシズム兆候: ${check.schizoAnalysis.innerFascismSigns.join(', ')}`);
  }

  // 思考哲学の問題点
  if (!check.philosophyOfThought.isThinking) {
    issues.push(`オートパイロット兆候: ${check.philosophyOfThought.autopilotSigns.join(', ')}`);
  }

  // 論理の問題点
  if (check.logic.fallacies.length > 0) {
    issues.push(`論理的誤謬: ${check.logic.fallacies.map(f => f.type).join(', ')}`);
  }

  // 強みを抽出
  if (check.logic.validInferences.length > 0) {
    strengths.push(`有効な推論: ${check.logic.validInferences.join(', ')}`);
  }
  if (check.philosophyOfThought.metacognitionLevel > 0.7) {
    strengths.push('高いメタ認知レベル');
  }
  if (check.eudaimonia.meaningfulGrowth) {
    strengths.push(`意味ある成長: ${check.eudaimonia.meaningfulGrowth}`);
  }

  let summary = '【メタ認知チェック結果】\n';

  if (issues.length > 0) {
    summary += `\n検出された問題点:\n${issues.map(i => `- ${i}`).join('\n')}`;
  }

  if (strengths.length > 0) {
    summary += `\n\n強み:\n${strengths.map(s => `- ${s}`).join('\n')}`;
  }

  if (check.taxonomyOfThought.currentMode !== check.taxonomyOfThought.recommendedMode) {
    summary += `\n\n推奨: ${check.taxonomyOfThought.modeRationale}`;
  }

  return summary;
}
