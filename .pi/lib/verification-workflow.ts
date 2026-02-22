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
  
  if (confidence > 0.9 && specificityScore < 2) {
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
  
  // 代替解釈の兆候を探す
  const hasAlternatives = /ALTERNATIVE:|代替|別の解釈|他の可能性|一方で|あるいは|または|could also|alternatively|another possibility|other explanation/i.test(output);
  const hasCounterEvidence = /COUNTER_EVIDENCE:|反証|否定する証拠|矛盾する|disconfirming|contradicting|however|but|nevertheless/i.test(output);
  const hasLimitations = /LIMITATION:|制限|限界|注意点| caveat|limitation|constraint|boundary/i.test(output);
  
  // 結論があり、高信頼度だが、代替解釈、反証、制限の記述がない場合
  if (hasConclusion && !hasAlternatives && !hasCounterEvidence && !hasLimitations && confidence > 0.8) {
    return { detected: true, reason: "Missing alternative interpretations for high-confidence conclusion" };
  }
  
  // DISCUSSIONセクションがあるかどうか
  const hasDiscussion = /DISCUSSION:|議論|考察/i.test(output);
  
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
  return {
    deconstruction: detectBinaryOppositions(output, context.task || ''),
    schizoAnalysis: detectInnerFascism(output, context),
    eudaimonia: evaluateEudaimonia(output, context),
    utopiaDystopia: analyzeWorldCreation(output),
    philosophyOfThought: assessThinkingQuality(output, context),
    taxonomyOfThought: evaluateThinkingMode(output, context),
    logic: detectFallacies(output)
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
  const fascismPatterns = [
    { pattern: /常に|必ず|絶対に/g, sign: '自己監視の強制' },
    { pattern: /すべき|しなければならない|ねばならない/g, sign: '規範への過度な服従' },
    { pattern: /正しい|適切な|正当な|適正な/g, sign: '一価値への収斂' },
    { pattern: /許可|承認|確認|許可済/g, sign: '権力への依存' },
    { pattern: /排除|禁止|否定|拒否/g, sign: '異質なものの排除' }
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

  // 欲望の生産性を分析
  if (output.includes('完了') || output.includes('達成') || output.includes('成功')) {
    desireProductions.push('生産性への欲望');
  }
  if (output.includes('正確') || output.includes('正しい') || output.includes('妥当')) {
    desireProductions.push('正確性への欲望');
  }
  if (output.includes('合意') || output.includes('同意') || output.includes('承認')) {
    desireProductions.push('合意形成への欲望');
  }
  if (output.includes('効率') || output.includes('最適') || output.includes('改善')) {
    desireProductions.push('効率化への欲望');
  }

  return {
    desireProduction: desireProductions,
    innerFascismSigns: signs,
    microFascisms
  };
}

/**
 * @summary 二項対立とアポリアを検出
 * @param output 検査対象
 * @param context コンテキスト
 * @returns 脱構築分析結果
 */
export function detectBinaryOppositions(
  output: string,
  context: string
): MetacognitiveCheck['deconstruction'] {
  const binaryPatterns = [
    { pattern: /正しい\/間違い|良い\/悪い|成功\/失敗/, name: '善悪の二項対立' },
    { pattern: /完全\/不完全|完了\/未完了/, name: '完全性の二項対立' },
    { pattern: /安全\/危険|リスク\/機会/, name: '安全性の二項対立' },
    { pattern: /正解\/不正解|真\/偽/, name: '真偽の二項対立' },
    { pattern: /善\/悪|良い\/悪い/, name: '道徳的対立' }
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

  // アポリア検出
  if (/速度|効率|速/.test(output) && /品質|正確|完全/.test(output)) {
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
  if (/安全|リスク|注意/.test(output) && /有用|価値|効果/.test(output)) {
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
  if (/自律|自主|裁量/.test(output) && /従順|指示|規則/.test(output)) {
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
  if (/一貫|統一|原則/.test(output) && /文脈|状況|臨機応変/.test(output)) {
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

  return {
    binaryOppositions,
    exclusions,
    aporias
  };
}

/**
 * @summary 幸福論（エウダイモニア）の評価
 */
function evaluateEudaimonia(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['eudaimonia'] {
  // 快楽主義の罠を検出
  const pleasureTrapIndicators = [
    '簡単',
    '楽',
    'すぐ',
    '手軽',
    '便利'
  ];
  const pleasureTrap = pleasureTrapIndicators.some(indicator => output.includes(indicator));

  // 卓越性の追求を検出
  let excellencePursuit = 'タスク完了の卓越性を追求';
  if (output.includes('品質') || output.includes('正確')) {
    excellencePursuit = '品質と正確性の卓越性を追求';
  }
  if (output.includes('効率') || output.includes('最適')) {
    excellencePursuit = '効率と最適化の卓越性を追求';
  }

  // 意味ある成長を検出
  let meaningfulGrowth = '思考プロセスの深化';
  if (output.includes('学習') || output.includes('改善')) {
    meaningfulGrowth = '継続的な学習と改善';
  }
  if (output.includes('発見') || output.includes('新た')) {
    meaningfulGrowth = '新たな発見と気づき';
  }

  return {
    excellencePursuit,
    pleasureTrap,
    meaningfulGrowth
  };
}

/**
 * @summary ユートピア/ディストピア分析
 */
function analyzeWorldCreation(output: string): MetacognitiveCheck['utopiaDystopia'] {
  // 創造している世界を推定
  let worldBeingCreated = '効率的なタスク実行の世界';
  if (output.includes('自動') || output.includes('効率')) {
    worldBeingCreated = '自動化された効率的な世界';
  }
  if (output.includes('協調') || output.includes('合意')) {
    worldBeingCreated = '協調的合意形成の世界';
  }

  // 全体主義リスクを検出
  const totalitarianRisk: string[] = [];
  if (output.includes('統一') || output.includes('標準')) {
    totalitarianRisk.push('標準化への圧力');
  }
  if (output.includes('監視') || output.includes('確認')) {
    totalitarianRisk.push('過度な監視の可能性');
  }
  if (output.includes('排除') || output.includes('禁止')) {
    totalitarianRisk.push('排除の論理');
  }

  // 権力動態を分析
  const powerDynamics: string[] = ['ユーザー-エージェント関係'];
  if (output.includes('指示') || output.includes('命令')) {
    powerDynamics.push('指示-実行の階層');
  }
  if (output.includes('合意') || output.includes('協議')) {
    powerDynamics.push('水平的協調関係');
  }

  return {
    worldBeingCreated,
    totalitarianRisk,
    powerDynamics
  };
}

/**
 * @summary 思考の質を評価
 */
function assessThinkingQuality(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['philosophyOfThought'] {
  const autopilotSigns: string[] = [];

  // オートパイロットの兆候を検出
  if (output.length < 100) {
    autopilotSigns.push('出力が短い');
  }
  if (!output.includes('?') && !output.includes('か？') && !output.includes('とは')) {
    autopilotSigns.push('問いがない');
  }
  if (!output.includes('なぜ') && !output.includes('どう')) {
    autopilotSigns.push('深い問いが欠如');
  }
  if (/です。$|ます。$/gm.test(output) && output.split('\n').length < 3) {
    autopilotSigns.push('単調な構造');
  }

  // メタ認知レベルを推定
  let metacognitionLevel = 0.5;
  if (output.includes('前提') || output.includes('仮定')) {
    metacognitionLevel += 0.1;
  }
  if (output.includes('制約') || output.includes('限界')) {
    metacognitionLevel += 0.1;
  }
  if (output.includes('代替') || output.includes('別の')) {
    metacognitionLevel += 0.1;
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
 * @summary 思考モードの適切性を評価
 */
function evaluateThinkingMode(
  output: string,
  context: { task?: string; currentMode?: string }
): MetacognitiveCheck['taxonomyOfThought'] {
  // 現在のモードを推定
  let currentMode = context.currentMode || 'unknown';

  // 出力から使用された思考モードを推定
  if (/創造|新規|アイデア|発想/.test(output)) {
    currentMode = 'creative';
  } else if (/分析|検討|分解|論理/.test(output)) {
    currentMode = 'analytical';
  } else if (/批判|検証|反例|問題点/.test(output)) {
    currentMode = 'critical';
  } else if (/実装|実現|具体的|手順/.test(output)) {
    currentMode = 'practical';
  } else if (/合意|調整|協議|関係者/.test(output)) {
    currentMode = 'social';
  } else if (/配慮|倫理|感情|共感/.test(output)) {
    currentMode = 'emotional';
  }

  // 推奨モードを決定
  let recommendedMode = currentMode;
  let modeRationale = '現在のモードが適切';

  if (context.task) {
    const task = context.task.toLowerCase();
    if (task.includes('設計') && currentMode !== 'creative') {
      recommendedMode = 'creative';
      modeRationale = '設計タスクには創造的モードが推奨';
    } else if (task.includes('レビュー') && currentMode !== 'critical') {
      recommendedMode = 'critical';
      modeRationale = 'レビュータスクには批判的モードが推奨';
    } else if (task.includes('実装') && currentMode !== 'practical') {
      recommendedMode = 'practical';
      modeRationale = '実装タスクには実践的モードが推奨';
    }
  }

  return {
    currentMode,
    recommendedMode,
    modeRationale
  };
}

/**
 * @summary 論理的誤謬を検出
 */
function detectFallacies(output: string): MetacognitiveCheck['logic'] {
  const fallacies: FallacyDetection[] = [];
  const validInferences: string[] = [];
  const invalidInferences: string[] = [];

  // 後件肯定の検出
  if (/ならば.*だから.*だろう/.test(output)) {
    fallacies.push({
      type: '後件肯定',
      location: '推論部分',
      description: 'P→Q、Q から P を導出しようとしている可能性',
      correction: '必要条件と十分条件を区別し、逆は常に真とは限らないことを確認'
    });
    invalidInferences.push('後件肯定の可能性');
  }

  // 前提否定の検出
  if (/でないなら.*だから.*でない/.test(output)) {
    fallacies.push({
      type: '前提否定',
      location: '推論部分',
      description: 'P→Q、¬P から ¬Q を導出しようとしている可能性',
      correction: '前提が偽でも結論が真である可能性を考慮'
    });
    invalidInferences.push('前提否定の可能性');
  }

  // 転移の誤謬の検出
  if (/一人が.*なら.*全員も/.test(output) || /全員が.*なら.*一人も/.test(output)) {
    fallacies.push({
      type: '転移の誤謬',
      location: '一般化部分',
      description: '個別的事例と全体的傾向を混同している可能性',
      correction: 'サンプルサイズと代表性を確認'
    });
    invalidInferences.push('転移の誤謬の可能性');
  }

  // 偽の二分法の検出
  if (/どちらか|いずれか|二択|二者択一/.test(output) && output.includes('または')) {
    fallacies.push({
      type: '偽の二分法',
      location: '選択肢提示部分',
      description: '選択肢を2つに限定しているが、他の可能性があるかもしれない',
      correction: '第三の選択肢や中間的な選択肢を検討'
    });
    invalidInferences.push('偽の二分法の可能性');
  }

  // 有効な推論を検出
  if (/したがって|ゆえに|それゆえ/.test(output)) {
    validInferences.push('演繹的推論の使用');
  }
  if (/傾向がある|一般的に|多くの場合/.test(output)) {
    validInferences.push('慎重な一般化');
  }
  if (/おそらく|可能性が高い|考えられる/.test(output)) {
    validInferences.push('確率的推論の明示');
  }

  return {
    fallacies,
    validInferences,
    invalidInferences
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
