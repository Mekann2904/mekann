/**
 * @abdd.meta
 * path: .pi/lib/mediator-types.ts
 * role: 型定義モジュール
 * why: Mediator層のデータ構造と情報ギャップ検出のための型を統一管理するため
 * related: mediator-core.ts, session-manager.ts, conversation-handler.ts, gap-analyzer.ts
 * public_api: SessionId, Confidence, Timestamp, InformationGapType, InformationGap, GapCandidate, MessageRole, Message
 * invariants: Confidenceは0.0から1.0の範囲、TimestampはISO 8601形式、InformationGapのseverityはlow/medium/highのいずれか
 * side_effects: なし（純粋な型定義）
 * failure_modes: 型定義と実装の不一致による実行時エラー
 * @abdd.explain
 * overview: Mediator層における対話管理、意図推論、情報ギャップ検出に必要な型を定義するモジュール
 * what_it_does:
 *   - セッション、信頼度、時刻などの基本型を定義する
 *   - ユーザー入力の不足情報を分類するInformationGap型を定義する
 *   - 会話履歴を構築するためのMessage型を定義する
 * why_it_exists:
 *   - 意図推論と実行の分離（Equation 3）および文脈再構築（Equation 5）に基づくアーキテクチャを型で保証するため
 *   - Information Gap理論に基づく対話処理の型安全性を確保するため
 * scope:
 *   in: なし
 *   out: Mediator層全体で使用される共用型とインターフェース
 */

/**
 * Mediator層の型定義モジュール
 * 
 * 論文「Intent Mismatch Causes LLMs to Get Lost in Multi-Turn Conversation」
 * (arXiv:2602.07338v1) の知見に基づく型定義
 * 
 * Equation (3): P(R|C_t) = Σ P(R|I_t) * P(I_t|C_t)
 *   - 意図推論（P(I_t|C_t)）と実行（P(R|I_t)）の分離
 * 
 * Equation (5): Û ~ P(U | C_t, ℋ)
 *   - コンテキストC_tと履歴ℋから意図Uを再構築
 */

// ============================================================================
// 基本型
// ============================================================================

/**
 * セッションID型
 * @summary セッションの一意識別子
 */
export type SessionId = string;

/**
 * 信頼度型
 * @summary 0.0から1.0の範囲の信頼度スコア
 */
export type Confidence = number;

/**
 * タイムスタンプ型
 * @summary ISO 8601形式の日時文字列
 */
export type Timestamp = string;

// ============================================================================
// 情報ギャップ型
// ============================================================================

/**
 * 情報ギャップの種類
 * @summary ユーザー入力に不足している情報の分類
 */
export type InformationGapType =
  | "ambiguous_reference"      // 「あれ」「それ」など参照先が不明
  | "missing_target"           // 対象ファイル/モジュールが不明
  | "unclear_action"           // 「修正」の内容が不明
  | "missing_constraints"      // 制約条件が不明
  | "unclear_success_criteria" // 成功基準が不明
  | "context_mismatch"         // 文脈との不整合
  | "implicit_assumption";     // 暗黙の前提が不明

/**
 * 情報ギャップ
 * @summary ユーザー入力に不足している情報を表す
 * @param type ギャップの種類
 * @param term 曖昧な用語や不明な箇所
 * @param description ギャップの説明
 * @param candidates 推測される候補（ある場合）
 * @param severity 重要度（低/中/高）
 */
export interface InformationGap {
  /** ギャップの種類 */
  type: InformationGapType;
  /** 曖昧な用語や不明な箇所 */
  term: string;
  /** ギャップの説明 */
  description: string;
  /** 推測される候補（ある場合） */
  candidates?: GapCandidate[];
  /** 重要度 */
  severity: "low" | "medium" | "high";
  /** 文脈上の位置 */
  context?: string;
}

/**
 * ギャップ候補
 * @summary 情報ギャップに対する推測候補
 * @param value 候補値
 * @param description 候補の説明
 * @param confidence この候補の信頼度
 */
export interface GapCandidate {
  /** 候補値 */
  value: string;
  /** 候補の説明 */
  description: string;
  /** この候補の信頼度 */
  confidence: Confidence;
}

// ============================================================================
// 会話履歴型
// ============================================================================

/**
 * メッセージの役割
 * @summary 会話内での発言者の役割
 */
export type MessageRole = "user" | "assistant" | "mediator" | "system";

/**
 * メッセージ
 * @summary 会話内の1つのメッセージ
 * @param role 発言者の役割
 * @param content メッセージ内容
 * @param timestamp 発言時刻
 */
export interface Message {
  /** 発言者の役割 */
  role: MessageRole;
  /** メッセージ内容 */
  content: string;
  /** 発言時刻 */
  timestamp: Timestamp;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * 会話履歴
 * @summary セッション内の会話履歴
 * @param sessionId セッションID
 * @param messages メッセージのリスト
 * @param startedAt セッション開始時刻
 * @param lastUpdatedAt 最終更新時刻
 */
export interface ConversationHistory {
  /** セッションID */
  sessionId: SessionId;
  /** メッセージのリスト */
  messages: Message[];
  /** セッション開始時刻 */
  startedAt: Timestamp;
  /** 最終更新時刻 */
  lastUpdatedAt: Timestamp;
}

// ============================================================================
// 確認済み事実型
// ============================================================================

/**
 * 確認済み事実
 * @summary ユーザーとの対話で確認された事実
 * @param id 事実ID
 * @param key 事実のキー（例: 「あのファイル」）
 * @param value 事実の値（例: 「.pi/extensions/loop.ts」）
 * @param context 確認時の文脈
 * @param confirmedAt 確認時刻
 * @param sessionId 確認されたセッションID
 */
export interface ConfirmedFact {
  /** 事実ID */
  id: string;
  /** 事実のキー（例: 「あのファイル」） */
  key: string;
  /** 事実の値（例: 「.pi/extensions/loop.ts」） */
  value: string;
  /** 確認時の文脈 */
  context: string;
  /** 確認時刻 */
  confirmedAt: Timestamp;
  /** 確認されたセッションID */
  sessionId: SessionId;
}

/**
 * 確認済み事実ストア
 * @summary セッションをまたいだ確認済み事実の永続化データ
 * @param facts 確認済み事実のリスト
 * @param userPreferences ユーザーの設定・嗜好
 * @param lastUpdatedAt 最終更新時刻
 */
export interface ConfirmedFactsStore {
  /** 確認済み事実のリスト */
  facts: ConfirmedFact[];
  /** ユーザーの設定・嗜好 */
  userPreferences: UserPreferences;
  /** 最終更新時刻 */
  lastUpdatedAt: Timestamp;
}

/**
 * ユーザー設定
 * @summary ユーザーの嗜好や設定
 * @param preferredDetailLevel 詳細度の嗜好
 * @param preferredLanguage 好みの言語
 * @param codingStyle コーディングスタイルの嗜好
 */
export interface UserPreferences {
  /** 詳細度の嗜好 */
  preferredDetailLevel?: "brief" | "normal" | "detailed";
  /** 好みの言語 */
  preferredLanguage?: "ja" | "en";
  /** コーディングスタイルの嗜好 */
  codingStyle?: "minimal" | "comprehensive" | "refactor";
  /** カスタム設定 */
  custom?: Record<string, unknown>;
}

// ============================================================================
// 構造化意図型
// ============================================================================

/**
 * アクション種別
 * @summary ユーザーが求めているアクションの分類
 */
export type ActionType =
  | "create"      // 新規作成
  | "modify"      // 変更
  | "delete"      // 削除
  | "query"       // 検索・参照
  | "analyze"     // 分析
  | "execute"     // 実行
  | "debug"       // デバッグ
  | "document"    // ドキュメント作成
  | "test"        // テスト関連
  | "refactor"    // リファクタリング
  | "review"      // レビュー
  | "unknown";    // 不明

/**
 * ターゲット情報
 * @summary 操作対象の情報
 * @param files 対象ファイル
 * @param modules 対象モジュール
 * @param functions 対象関数
 * @param scope スコープの説明
 */
export interface TargetInfo {
  /** 対象ファイル */
  files?: string[];
  /** 対象モジュール */
  modules?: string[];
  /** 対象関数 */
  functions?: string[];
  /** スコープの説明 */
  scope: string;
  /** その他の対象 */
  other?: string[];
}

/**
 * アクション情報
 * @summary 実行するアクションの詳細
 * @param type アクション種別
 * @param description アクションの説明
 * @param steps 実行ステップ（判明している場合）
 * @param priority 優先度
 */
export interface ActionInfo {
  /** アクション種別 */
  type: ActionType;
  /** アクションの説明 */
  description: string;
  /** 実行ステップ（判明している場合） */
  steps?: string[];
  /** 優先度 */
  priority?: "low" | "medium" | "high" | "critical";
}

/**
 * 制約条件
 * @summary 実行時の制約
 * @param mustPreserve 維持すべき事項
 * @param mustSatisfy 満たすべき条件
 * @param avoid 避けるべき事項
 * @param assumptions 想定・前提
 */
export interface Constraints {
  /** 維持すべき事項 */
  mustPreserve: string[];
  /** 満たすべき条件 */
  mustSatisfy: string[];
  /** 避けるべき事項 */
  avoid: string[];
  /** 想定・前提 */
  assumptions: string[];
}

/**
 * 成功基準
 * @summary タスク完了の判定基準
 * @param criteria 基準のリスト
 * @param verificationMethod 検証方法
 * @param acceptanceTests 受け入れテスト
 */
export interface SuccessCriteria {
  /** 基準のリスト */
  criteria: string[];
  /** 検証方法 */
  verificationMethod?: string;
  /** 受け入れテスト */
  acceptanceTests?: string[];
}

/**
 * 構造化された意図
 * @summary Mediatorによって構造化されたユーザーの意図
 * 
 * 論文のEquation (5)におけるÛ（再構築された指示）に相当
 * 
 * @param target 操作対象
 * @param action 実行アクション
 * @param constraints 制約条件
 * @param successCriteria 成功基準
 * @param confidence 信頼度
 * @param clarificationNeeded さらに明確化が必要か
 */
export interface StructuredIntent {
  /** 操作対象 */
  target: TargetInfo;
  /** 実行アクション */
  action: ActionInfo;
  /** 制約条件 */
  constraints: Constraints;
  /** 成功基準 */
  successCriteria: SuccessCriteria;
  /** 信頼度（0.0-1.0） */
  confidence: Confidence;
  /** さらに明確化が必要か */
  clarificationNeeded: boolean;
  /** 元の入力 */
  originalInput: string;
  /** 解釈の根拠 */
  interpretationBasis: string[];
}

// ============================================================================
// Mediator入出力型
// ============================================================================

/**
 * Mediatorへの入力
 * @summary Mediator層への入力データ
 * @param userMessage ユーザーの入力メッセージ
 * @param conversationHistory 会話履歴（現在のセッション）
 * @param confirmedFacts 確認済み事実（過去セッション含む）
 * @param taskContext タスク固有のコンテキスト
 * @param sessionId 現在のセッションID
 */
export interface MediatorInput {
  /** ユーザーの入力メッセージ */
  userMessage: string;
  /** 会話履歴（現在のセッション） */
  conversationHistory: Message[];
  /** 確認済み事実（過去セッション含む） */
  confirmedFacts: ConfirmedFact[];
  /** タスク固有のコンテキスト */
  taskContext?: string;
  /** 現在のセッションID */
  sessionId: SessionId;
}

/**
 * Mediatorの出力
 * @summary Mediator層の出力結果
 * @param status 処理状態
 * @param interpretation ユーザー入力の解釈
 * @param gaps 検出された情報ギャップ
 * @param questions 確認用の質問
 * @param structuredIntent 構造化された意図（ready状態の場合）
 * @param confidence 全体的な信頼度
 */
export interface MediatorOutput {
  /** 処理状態 */
  status: MediatorStatus;
  /** ユーザー入力の解釈 */
  interpretation: string;
  /** 検出された情報ギャップ */
  gaps: InformationGap[];
  /** 確認用の質問（Question ツールで使用） */
  questions: MediatorQuestion[];
  /** 構造化された意図（ready状態の場合） */
  structuredIntent?: StructuredIntent;
  /** 全体的な信頼度 */
  confidence: Confidence;
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
}

/**
 * Mediatorの処理状態
 * @summary 案件結果の状態分類
 */
export type MediatorStatus =
  | "ready"                 // 実行可能な状態
  | "needs_clarification"   // 明確化が必要
  | "needs_confirmation"    // 確認が必要
  | "ambiguous"             // 解釈が曖昧
  | "error";                // エラー発生

/**
 * Mediatorからの質問
 * @summary Questionツールで使用する質問定義
 * @param header 質問ヘッダー（短いラベル）
 * @param question 質問文
 * @param options 選択肢
 * @param multiple 複数選択可否
 * @param custom カスタム入力可否
 * @param relatedGap 関連する情報ギャップ
 */
export interface MediatorQuestion {
  /** 質問ヘッダー（短いラベル、最大30文字） */
  header: string;
  /** 質問文（完全な文章） */
  question: string;
  /** 選択肢 */
  options: QuestionOption[];
  /** 複数選択可否 */
  multiple: boolean;
  /** カスタム入力可否 */
  custom: boolean;
  /** 関連する情報ギャップ */
  relatedGap: InformationGapType;
}

/**
 * 質問の選択肢
 * @summary Questionツールの選択肢定義
 * @param label 表示テキスト（1-5文字）
 * @param description 選択肢の説明
 */
export interface QuestionOption {
  /** 表示テキスト（1-5文字） */
  label: string;
  /** 選択肢の説明 */
  description: string;
}

// ============================================================================
// LiC検出型
// ============================================================================

/**
 * LiC（Lost in Conversation）検出結果
 * @summary マルチターン会話での意図乖離検出
 * @param detected LiCが検出されたか
 * @param severity 深刻度
 * @param evidence 検出根拠
 * @param recommendedAction 推奨アクション
 * @param driftScore ドリフトスコア（0.0-1.0）
 */
export interface LiCDetectionResult {
  /** LiCが検出されたか */
  detected: boolean;
  /** 深刻度 */
  severity: "low" | "medium" | "high";
  /** 検出根拠 */
  evidence: string[];
  /** 推奨アクション */
  recommendedAction: "continue" | "mediate" | "abort";
  /** ドリフトスコア（0.0-1.0、高いほど乖離大） */
  driftScore: number;
}

// ============================================================================
// 設定型
// ============================================================================

/**
 * Mediator設定
 * @summary Mediator層の動作設定
 * @param enableQuestioning Questionツール使用可否
 * @param maxQuestionsPerTurn 1ターンあたりの最大質問数
 * @param confidenceThreshold 構造化判定の信頼度閾値
 * @param historyDir 履歴ディレクトリパス
 * @param enableLicDetection LiC検出の有効化
 */
export interface MediatorConfig {
  /** Questionツール使用可否 */
  enableQuestioning: boolean;
  /** 1ターンあたりの最大質問数 */
  maxQuestionsPerTurn: number;
  /** 構造化判定の信頼度閾値 */
  confidenceThreshold: number;
  /** 履歴ディレクトリパス */
  historyDir: string;
  /** LiC検出の有効化 */
  enableLicDetection: boolean;
  /** デバッグモード */
  debugMode?: boolean;
}

/**
 * デフォルトのMediator設定
 */
export const DEFAULT_MEDIATOR_CONFIG: MediatorConfig = {
  enableQuestioning: true,
  maxQuestionsPerTurn: 3,
  confidenceThreshold: 0.7,
  historyDir: ".pi/memory",
  enableLicDetection: true,
  debugMode: false,
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 新しいセッションIDを生成
 * @summary セッションIDを生成
 * @returns タイムスタンプベースのセッションID
 */
export function generateSessionId(): SessionId {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6);
  return `session-${timestamp}-${random}`;
}

/**
 * 現在のタイムスタンプを取得
 * @summary ISO 8601形式のタイムスタンプ
 * @returns 現在時刻のISO文字列
 */
export function getCurrentTimestamp(): Timestamp {
  return new Date().toISOString();
}

/**
 * 信頼度が閾値を超えているか判定
 * @summary 信頼度チェック
 * @param confidence 信頼度
 * @param threshold 閾値
 * @returns 閾値以上の場合true
 */
export function isConfidenceAboveThreshold(
  confidence: Confidence,
  threshold: number = 0.7
): boolean {
  return confidence >= threshold;
}

/**
 * 空の構造化意図を作成
 * @summary デフォルト値で初期化
 * @param originalInput 元の入力
 * @returns 空のStructuredIntent
 */
export function createEmptyStructuredIntent(originalInput: string): StructuredIntent {
  return {
    target: {
      scope: "unknown",
    },
    action: {
      type: "unknown",
      description: "未確定",
    },
    constraints: {
      mustPreserve: [],
      mustSatisfy: [],
      avoid: [],
      assumptions: [],
    },
    successCriteria: {
      criteria: [],
    },
    confidence: 0,
    clarificationNeeded: true,
    originalInput,
    interpretationBasis: [],
  };
}

/**
 * 構造化意図を実行可能なプロンプトに変換
 * @summary StructuredIntentを文字列化
 * @param intent 構造化意図
 * @returns 実行可能なプロンプト文字列
 */
export function structuredIntentToPrompt(intent: StructuredIntent): string {
  const parts: string[] = [];

  // ターゲット
  parts.push("## ターゲット");
  if (intent.target.files?.length) {
    parts.push(`- ファイル: ${intent.target.files.join(", ")}`);
  }
  if (intent.target.modules?.length) {
    parts.push(`- モジュール: ${intent.target.modules.join(", ")}`);
  }
  if (intent.target.functions?.length) {
    parts.push(`- 関数: ${intent.target.functions.join(", ")}`);
  }
  parts.push(`- スコープ: ${intent.target.scope}`);
  parts.push("");

  // アクション
  parts.push("## アクション");
  parts.push(`- 種別: ${intent.action.type}`);
  parts.push(`- 説明: ${intent.action.description}`);
  if (intent.action.steps?.length) {
    parts.push("- ステップ:");
    intent.action.steps.forEach((step, i) => {
      parts.push(`  ${i + 1}. ${step}`);
    });
  }
  parts.push("");

  // 制約
  if (intent.constraints.mustPreserve.length > 0 ||
      intent.constraints.mustSatisfy.length > 0 ||
      intent.constraints.avoid.length > 0) {
    parts.push("## 制約条件");
    if (intent.constraints.mustPreserve.length > 0) {
      parts.push(`- 維持: ${intent.constraints.mustPreserve.join(", ")}`);
    }
    if (intent.constraints.mustSatisfy.length > 0) {
      parts.push(`- 満たすべき条件: ${intent.constraints.mustSatisfy.join(", ")}`);
    }
    if (intent.constraints.avoid.length > 0) {
      parts.push(`- 回避: ${intent.constraints.avoid.join(", ")}`);
    }
    parts.push("");
  }

  // 成功基準
  parts.push("## 成功基準");
  intent.successCriteria.criteria.forEach((criterion, i) => {
    parts.push(`${i + 1}. ${criterion}`);
  });

  return parts.join("\n");
}

// ============================================================================
// Extended Types for mediator-prompt.ts compatibility
// ============================================================================

/** 低信頼度閾値（明確化質問生成のトリガー） */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** LiC検出の信頼度閾値 */
export const LIC_CONFIDENCE_THRESHOLD = 0.7;

/** 最大明確化質問数 */
export const MAX_CLARIFICATION_QUESTIONS = 3;

/**
 * 拡張情報ギャップ種別（mediator-prompt.ts用）
 * @summary 拡張情報ギャップ種別
 */
export type InformationGapTypeExtended =
  | InformationGapType
  | "missing_parameter"
  | "preference_unknown";

/**
 * 意図カテゴリ
 * @summary 意図カテゴリ
 */
export type IntentCategory =
  | "task_execution"
  | "information_request"
  | "clarification"
  | "correction"
  | "continuation"
  | "context_switch"
  | "termination"
  | "ambiguous";

/**
 * 明確化質問タイプ
 * @summary 質問タイプ
 */
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "text_input"
  | "confirmation"
  | "ranking";

/**
 * 明確化質問オプション
 * @summary 質問オプション
 */
export interface QuestionOptionExtended {
  label: string;
  description?: string;
}

/**
 * 明確化質問
 * @summary 明確化質問
 */
export interface ClarificationQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: QuestionOptionExtended[];
  priority: "critical" | "high" | "medium" | "low";
  relatedGapId?: string;
}

/**
 * 構造化指示（簡易版）
 * @summary 構造化指示
 */
export interface StructuredInstruction {
  action: string;
  target?: string;
  expectedOutcome?: string;
  constraints: string[];
  prerequisites?: string[];
}

/**
 * 解釈された意図
 * @summary 解釈済み意図
 */
export interface InterpretedIntent {
  description: string;
  structuredInstruction: StructuredInstruction;
  confidence: number;
  category: IntentCategory;
}

/**
 * 情報ギャップ（拡張版）
 * @summary 拡張情報ギャップ
 */
export interface InformationGapExtended {
  id: string;
  description: string;
  type: InformationGapTypeExtended;
  importance: number;
  suggestedQuestions: string[];
}

/**
 * 意図解釈結果
 * @summary 意図解釈結果
 */
export interface IntentInterpretation {
  rawInput: string;
  possibleIntents: InterpretedIntent[];
  primaryIntentIndex: number;
  confidence: number;
  hasInformationGap: boolean;
  informationGaps: InformationGapExtended[];
}

/**
 * LiC兆候タイプ
 * @summary LiC兆候タイプ
 */
export type LiCIndicatorType =
  | "generic_response"
  | "context_ignore"
  | "premise_mismatch"
  | "repetition"
  | "topic_drift"
  | "confirmation_overload"
  | "assumption_conflict";

/**
 * LiC兆候オブジェクト
 * @summary LiC兆候オブジェクト
 */
export interface LiCIndicator {
  id: string;
  type: LiCIndicatorType;
  detectedContent: string;
  confidence: number;
  detectedAt: string;
  recommendedAction: string;
}

/**
 * 会話ターン
 * @summary 会話ターン
 */
export interface ConversationTurn {
  turnNumber: number;
  userInput: string;
  agentResponse: string;
  timestamp?: string;
  confirmedFactIds?: string[];
}

/**
 * 確認済み事実（拡張版 - mediator-prompt.ts用）
 * @summary 拡張確認済み事実
 */
export interface ConfirmedFactExtended {
  id: string;
  category: string;
  content: string;
  confidence: number;
  confirmedAt: string;
  tags?: string[];
}

/**
 * 会話要約フォーカス
 * @summary フォーカス情報
 */
export interface ConversationFocus {
  description: string;
  activeTask?: string;
}

/**
 * 会話要約（拡張版）
 * @summary 拡張会話要約
 */
export interface ConversationSummaryExtended {
  currentFocus?: ConversationFocus;
  openIssues: Array<{
    priority: string;
    description: string;
  }>;
}

/**
 * Mediatorコンテキスト
 * @summary Mediatorコンテキスト
 */
export interface MediatorContext {
  currentTurn: number;
  currentInput: string;
  recentHistory: ConversationTurn[];
  confirmedFacts: ConfirmedFactExtended[];
  conversationSummary: ConversationSummaryExtended;
  licIndicators: LiCIndicator[];
  intentState?: IntentInterpretation;
}

/**
 * Mediator推奨アクション
 * @summary 推奨アクション
 */
export type MediatorAction =
  | "proceed"
  | "clarify_first"
  | "confirm_interpretation"
  | "request_context"
  | "flag_lic"
  | "abort";

/**
 * Mediator処理結果
 * @summary Mediator処理結果
 */
export interface MediatorResult {
  interpretation: IntentInterpretation;
  clarificationQuestions: ClarificationQuestion[];
  informationGaps: InformationGapExtended[];
  newConfirmedFacts: ConfirmedFactExtended[];
  licIndicators: LiCIndicator[];
  recommendedAction: MediatorAction;
  confidence: number;
}

/**
 * Experience Pair
 * @summary 経験ペア
 */
export interface ExperiencePair {
  id: string;
  failureCase: {
    userInput: string;
    agentInterpretation: string;
    actualIntent: string;
    userFeedback?: string;
  };
  successCase: {
    userInput: string;
    agentInterpretation: string;
    actualIntent: string;
  };
}

/**
 * 抽出ガイドライン
 * @summary 抽出ガイドライン
 */
export interface ExtractedGuideline {
  id: string;
  content: string;
  applicabilityCondition: string;
  sourcePairId?: string;
  usageCount: number;
  successRate: number;
}
