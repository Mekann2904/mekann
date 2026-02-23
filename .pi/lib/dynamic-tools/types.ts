/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/types.ts
 * role: 動的ツールシステムの型定義とパス設定定義
 * why: Live-SWE-agent統合におけるツール定義、実行モード、検証状態、格納パスのデータ構造を一元管理するため
 * related: .pi/lib/dynamic-tools/executor.ts, .pi/lib/dynamic-tools/manager.ts, .pi/lib/dynamic-tools/storage.ts
 * public_api: DynamicToolsPaths, getDynamicToolsPaths, DynamicToolMode, ToolParameterDefinition, DynamicToolDefinition, VerificationStatus
 * invariants: DynamicToolDefinitionのconfidenceScoreは0以上1以下、IDは一意、verificationStatusは定義済みのいずれか
 * side_effects: なし（純粋な型定義とパス生成関数のみ）
 * failure_modes: getDynamicToolsPaths実行時のCWD権限エラー、パス文字列の不正
 * @abdd.explain
 * overview: 動的ツール生成システムの共通データ構造とファイルシステム上のパス配置を定義するモジュール
 * what_it_does:
 *   - ツール保存先、スキル保存先、監査ログ等のファイルパスを定義・生成する
 *   - ツールの実行モード（bash, function, template, skill）を型定義する
 *   - ツールのパラメータ構造（名前、型、必須、制約）を定義する
 *   - ツールのメタデータ（作成者、使用回数、信頼度スコア、検証状態）を定義する
 * why_it_exists:
 *   - ツール定義の構造を静的に検証し、型安全性を保証するため
 *   - 動的生成されるコードとシステム間で共通のインターフェースを確立するため
 *   - パス設定を集中管理し、ハードコードによるバグを防ぐため
 * scope:
 *   in: process.cwd() (カレントワーキングディレクトリ)
 *   out: DynamicToolsPathsオブジェクト、各種TypeScript型エイリアス、インターフェース
 */

/**
 * 動的ツール生成システム - 型定義
 * Live-SWE-agent統合用の共通型
 */

import { join } from "node:path";

const CWD = process.cwd();

// ============================================================================
// パス定義
// ============================================================================

/**
 * @summary パス設定
 * 動的ツール関連のファイルパスを定義
 */
export interface DynamicToolsPaths {
  /** ツール保存ディレクトリ */
  toolsDir: string;
  /** スキル保存ディレクトリ */
  skillsDir: string;
  /** 監査ログファイル */
  auditLogFile: string;
  /** 品質メトリクスファイル */
  metricsFile: string;
}

/**
 * デフォルトパスを取得
 * @summary デフォルトパスを取得
 * @returns ダイナミックツールのパス設定オブジェクト
 */
export function getDynamicToolsPaths(): DynamicToolsPaths {
  return {
    toolsDir: join(CWD, ".pi", "tools"),
    skillsDir: join(CWD, ".pi", "skills", "dynamic"),
    auditLogFile: join(CWD, ".pi", "logs", "dynamic-tools-audit.jsonl"),
    metricsFile: join(CWD, ".pi", "logs", "dynamic-tools-metrics.json"),
  };
}

// ============================================================================
// ツール定義
// ============================================================================

/**
 * ツール実行モード
 * @summary 実行モードを指定
 */
export type DynamicToolMode =
  | "bash"          // Bash コマンド実行
  | "function"      // TypeScript関数実行
  | "template"      // テンプレートベース
  | "skill";        // スキルとして保存

/**
 * ツールパラメータ定義
 * @summary パラメータを定義
 */
export interface ToolParameterDefinition {
  /** パラメータ名 */
  name: string;
  /** パラメータの型 */
  type: "string" | "number" | "boolean" | "object" | "array";
  /** 必須かどうか */
  required: boolean;
  /** 説明 */
  description: string;
  /** デフォルト値 */
  default?: unknown;
  /** 値の制約（allowlist） */
  allowedValues?: unknown[];
}

/**
 * 動的ツールの定義
 * @summary ツール定義を取得
 */
export interface DynamicToolDefinition {
  /** ツールID（自動生成） */
  id: string;
  /** ツール名（コマンド名として使用） */
  name: string;
  /** 説明 */
  description: string;
  /** 実行モード */
  mode: DynamicToolMode;
  /** パラメータ定義 */
  parameters: ToolParameterDefinition[];
  /** 実行コードまたはコマンドテンプレート */
  code: string;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
  /** 作成元のタスク/コンテキスト */
  createdFromTask?: string;
  /** 使用回数 */
  usageCount: number;
  /** 最終使用日時 */
  lastUsedAt?: string;
  /** 信頼度スコア（0-1） */
  confidenceScore: number;
  /** 検証状態 */
  verificationStatus: VerificationStatus;
  /** タグ */
  tags: string[];
  /** 作成者（エージェントID等） */
  createdBy: string;
}

/**
 * 検証ステータス
 * @summary 検証状況を示す
 */
export type VerificationStatus =
  | "unverified"     // 未検証
  | "pending"        // 検証中
  | "passed"         // 検証通過
  | "failed"         // 検証失敗
  | "deprecated";    // 非推奨

// ============================================================================
// 実行結果
// ============================================================================

/**
 * ツール実行結果
 * @summary 実行結果を返す
 */
export interface DynamicToolResult {
  /** 成功したかどうか */
  success: boolean;
  /** 出力 */
  output: string;
  /** エラーメッセージ */
  error?: string;
  /** 実行時間（ミリ秒） */
  executionTimeMs: number;
  /** ツールID */
  toolId: string;
  /** 実行ID */
  runId: string;
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * @summary 実行オプション
 * @description 動的ツールの実行時設定を定義するインターフェース。
 * @param {string} toolIdOrName - ツールIDまたは名前
 * @param {object} parameters - 実行パラメータ
 * @param {number} timeoutMs - タイムアウト時間(ミリ秒)
 * @param {AbortSignal} signal - 中断シグナル
 * @param {boolean} debug - デバッグモード
 */
export interface DynamicToolRunOptions {
  /** ツールIDまたは名前 */
  toolIdOrName: string;
  /** パラメータ値 */
  parameters: Record<string, unknown>;
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
  /** 中止シグナル */
  signal?: AbortSignal;
  /** デバッグモード */
  debug?: boolean;
}

// ============================================================================
// 登録・管理
// ============================================================================

/**
 * @summary 登録リクエスト
 * @description 動的ツールの登録時に必要な情報を定義するインターフェース。
 * @param {string} name - ツール名
 * @param {string} description - 説明
 * @param {string} mode - 動作モード
 * @param {object} parameters - パラメータ定義
 * @param {string} code - 実行コード
 */
export interface DynamicToolRegistrationRequest {
  /** ツール名 */
  name: string;
  /** 説明 */
  description: string;
  /** 実行モード */
  mode: DynamicToolMode;
  /** パラメータ定義 */
  parameters?: ToolParameterDefinition[];
  /** 実行コード */
  code: string;
  /** 作成元のタスク */
  createdFromTask?: string;
  /** タグ */
  tags?: string[];
  /** 作成者 */
  createdBy?: string;
}

/**
 * @summary 登録結果
 * @description 動的ツールの登録結果を表すインターフェース。
 * @param {boolean} success - 成功したか
 * @param {object} tool - 登録されたツール情報
 * @param {string} error - エラーメッセージ
 * @param {SafetyVerificationResult} verificationResult - 検証結果
 * @param {string} createdFromTask - 作成元のタスク
 * @param {string[]} tags - タグ
 */
export interface DynamicToolRegistrationResult {
  /** 成功したかどうか */
  success: boolean;
  /** 作成されたツール定義 */
  tool?: DynamicToolDefinition;
  /** エラーメッセージ */
  error?: string;
  /** 検証結果 */
  verificationResult?: SafetyVerificationResult;
}

/**
 * @summary 一覧オプション
 * @description 動的ツールの一覧取得時のフィルタリングやソート条件を定義するインターフェース。
 * @param {string[]} tags - フィルタ対象のタグ
 * @param {string} verificationStatus - 検証ステータス
 * @param {string} mode - モード
 * @param {string} sortBy - ソート項目
 * @param {string} sortOrder - ソート順序
 */
export interface DynamicToolListOptions {
  /** フィルタ: タグ */
  tags?: string[];
  /** フィルタ: 検証状態 */
  verificationStatus?: VerificationStatus[];
  /** フィルタ: 実行モード */
  mode?: DynamicToolMode[];
  /** ソート順 */
  sortBy?: "name" | "createdAt" | "updatedAt" | "usageCount" | "confidenceScore";
  /** 昇順/降順 */
  sortOrder?: "asc" | "desc";
  /** 最大件数 */
  limit?: number;
}

// ============================================================================
// 安全性検証
// ============================================================================

/**
 * @summary 検証結果を格納
 * @description 安全性検証の結果を格納するインターフェース。
 * @param {boolean} safe - 安全かどうか
 * @param {string} riskLevel - リスクレベル
 * @param {string[]} issues - 検出された問題
 * @param {string[]} recommendations - 推奨事項
 * @param {string} verifiedAt - 検証日時
 */
export interface SafetyVerificationResult {
  /** 安全かどうか */
  safe: boolean;
  /** リスクレベル */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** 検出された問題 */
  issues: SafetyIssue[];
  /** 推奨事項 */
  recommendations: string[];
  /** 検証時刻 */
  verifiedAt: string;
}

/**
 * 検出されたセキュリティ問題の詳細を表します。
 * @summary セキュリティ問題取得
 * @property {SafetyIssueType} type - 問題種別
 * @property {string} severity - 重大度
 * @property {string} description - 説明
 * @property {object} location - 発生位置
 * @property {string} suggestion - 修正提案
 */
export interface SafetyIssue {
  /** 問題の種類 */
  type: SafetyIssueType;
  /** 重要度 */
  severity: "low" | "medium" | "high" | "critical";
  /** 説明 */
  description: string;
  /** コード内の位置 */
  location?: {
    line?: number;
    column?: number;
  };
  /** 修正提案 */
  suggestion?: string;
}

/**
 * セキュリティ問題の種別を定義します。
 * @summary 問題種別定義
 */
export type SafetyIssueType =
  | "forbidden-function"      // 禁止関数の使用
  | "network-access"          // ネットワークアクセス
  | "file-system-modification" // ファイルシステム変更
  | "code-injection"          // コードインジェクション
  | "eval-usage"              // eval/Function使用
  | "unsafe-regex"            // 危険な正規表現
  | "command-injection"       // コマンドインジェクション
  | "missing-validation"      // 入力検証不足
  | "hardcoded-secret"        // ハードコードされた秘密情報
  | "excessive-permissions";  // 過度な権限

/**
 * 許可された操作範囲を定義します。
 * @summary 操作範囲定義取得
 * @property {string[]} allowedModules - 許可モジュール
 * @property {string[]} allowedCommands - 許可コマンド
 * @property {string[]} allowedFilePaths - 許可ファイルパス
 * @property {string[]} allowedDomains - 許可ドメイン
 * @property {number} maxExecutionTimeMs - 最大実行時間
 */
export interface AllowedOperations {
  /** 許可されたNode.jsモジュール */
  allowedModules: string[];
  /** 許可されたbashコマンド */
  allowedCommands: string[];
  /** 許可されたファイルパスパターン */
  allowedFilePaths: string[];
  /** 許可されたネットワークドメイン */
  allowedDomains: string[];
  /** 最大実行時間（ミリ秒） */
  maxExecutionTimeMs: number;
  /** 最大出力サイズ（バイト） */
  maxOutputSizeBytes: number;
}

// ============================================================================
// 品質メトリクス
// ============================================================================

/**
 * 動的ツールごとの品質メトリクス詳細を表します。
 * @summary ツール品質詳細取得
 * @property {string} toolId - ツールID
 * @property {number} successRate - 成功率
 * @property {number} averageExecutionTimeMs - 平均実行時間
 * @property {number} totalUsageCount - 総使用回数
 * @property {number} errorCount - エラー回数
 */
export interface DynamicToolQualityMetrics {
  /** ツールID */
  toolId: string;
  /** 成功率 */
  successRate: number;
  /** 平均実行時間（ミリ秒） */
  averageExecutionTimeMs: number;
  /** 総使用回数 */
  totalUsageCount: number;
  /** エラー回数 */
  errorCount: number;
  /** 最終エラー */
  lastError?: string;
  /** 最終エラー日時 */
  lastErrorAt?: string;
  /** ユーザー評価（もしあれば） */
  userRating?: number;
  /** 品質スコア（0-1） */
  qualityScore: number;
  /** 計算日時 */
  calculatedAt: string;
}

/**
 * 品質メトリクスレポートを表します。
 * @summary メトリクスレポート取得
 * @property {number} userRating - ユーザー評価
 * @property {number} qualityScore - 品質スコア（0-1）
 * @property {string} calculatedAt - 計算日時
 */
export interface QualityMetricsReport {
  /** 全ツール数 */
  totalTools: number;
  /** アクティブなツール数（30日以内に使用） */
  activeTools: number;
  /** 平均成功率 */
  averageSuccessRate: number;
  /** 平均品質スコア */
  averageQualityScore: number;
  /** トップツール（使用回数順） */
  topTools: Array<{
    toolId: string;
    name: string;
    usageCount: number;
    successRate: number;
  }>;
  /** 問題のあるツール */
  problematicTools: Array<{
    toolId: string;
    name: string;
    issue: string;
  }>;
  /** 生成日時 */
  generatedAt: string;
}

// ============================================================================
// 監査ログ
// ============================================================================

/**
 * システム監査ログのエントリを表します。
 * @summary 監査ログエントリ
 * @param id ログエントリの一意ID
 * @param timestamp タイムスタンプ
 * @param action 実行されたアクションの種類
 * @param toolId 対象のツールID
 * @param toolName 対象のツール名
 * @param details アクションの詳細情報
 * @param success 成功したかどうか
 * @param errorMessage エラーメッセージ
 * @returns 監査ログエントリオブジェクト
 */
export interface AuditLogEntry {
  /** エントリID */
  id: string;
  /** タイムスタンプ */
  timestamp: string;
  /** 操作種類 */
  action: AuditAction;
  /** ツールID */
  toolId?: string;
  /** ツール名 */
  toolName?: string;
  /** 操作者 */
  actor: string;
  /** 操作の詳細 */
  details: Record<string, unknown>;
  /** 成功したかどうか */
  success: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * 監査ログに記録されるアクションの種別を定義します。
 * @summary アクション種別定義
 * @returns アクションの種別
 */
export type AuditAction =
  | "tool.create"       // ツール作成
  | "tool.run"          // ツール実行
  | "tool.delete"       // ツール削除
  | "tool.update"       // ツール更新
  | "tool.export"       // ツールエクスポート
  | "tool.import"       // ツールインポート
  | "verification.run"  // 検証実行
  | "verification.pass" // 検証通過
  | "verification.fail";// 検証失敗

// ============================================================================
// スキル変換
// ============================================================================

/**
 * スキル変換時のオプションを指定します。
 * @summary スキル変換オプション
 * @param toolId 対象のツールID
 * @param skillName スキル名（指定しない場合はツール名を使用）
 * @param skillDescription スキルの説明（指定しない場合はツールの説明を使用）
 * @param overwrite 既存ファイルを上書きするかどうか
 * @returns オプションオブジェクト
 */
export interface ConvertToSkillOptions {
  /** ツールID */
  toolId: string;
  /** スキル名（指定しない場合はツール名を使用） */
  skillName?: string;
  /** スキルの説明（指定しない場合はツールの説明を使用） */
  skillDescription?: string;
  /** 上書きするかどうか */
  overwrite?: boolean;
}

/**
 * スキル変換の実行結果を表します。
 * @summary スキル変換結果
 * @param success 成功したかどうか
 * @param skillPath 生成されたスキルのパス
 * @param error エラーメッセージ
 * @param toolId 対象のツールID
 * @returns スキル変換結果オブジェクト
 */
export interface ConvertToSkillResult {
  /** 成功したかどうか */
  success: boolean;
  /** スキルのパス */
  skillPath?: string;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// リフレクション・反省
// ============================================================================

/**
 * ツールのリフレクション結果を表します。
 * @summary リフレクション結果取得
 * @param needsReflection リフレクションが必要かどうか
 * @param shouldCreateTool ツールを作成すべきかどうか
 * @param proposedTool 提案されたツール定義
 * @param improvementSuggestions 改善提案のリスト
 * @param reflectionReason リフレクションの理由
 * @param error エラーメッセージ
 * @returns リフレクション結果オブジェクト
 */
export interface ToolReflectionResult {
  /** リフレクションが必要かどうか */
  needsReflection: boolean;
  /** 新しいツールを作成すべきかどうか */
  shouldCreateTool: boolean;
  /** 提案されるツール定義 */
  proposedTool?: {
    name: string;
    description: string;
    mode: DynamicToolMode;
    code: string;
    reason: string;
  };
  /** 改善提案 */
  improvementSuggestions: string[];
  /** リフレクションの理由 */
  reflectionReason: string;
}

/**
 * ツールのリフレクションコンテキスト
 * @summary リフレクション内容
 * @param {string} lastToolName - 最後のツール名
 * @param {unknown} lastToolResult - 最後のツール実行結果
 * @param {string} currentTask - 現在のタスク
 * @param {number} failureCount - 失敗回数
 * @param {string} patternMatch - パターン一致
 * @param {string[]} improvementSuggestions - 改善提案
 * @param {string} reflectionReason - リフレクションの理由
 */
export interface ToolReflectionContext {
  /** 直前のツール名 */
  lastToolName: string;
  /** 直前のツール結果 */
  lastToolResult: string;
  /** 現在のタスク */
  currentTask: string;
  /** 失敗回数 */
  failureCount: number;
  /** パターンマッチ（繰り返し操作の検出） */
  patternMatch?: {
    detected: boolean;
    pattern: string;
    occurrences: number;
  };
}

// ============================================================================
// 設定
// ============================================================================

/**
 * 動的ツールの設定
 * @summary 動的ツール設定
 * @param {boolean} enabled - 有効化フラグ
 * @param {boolean} autoCreateEnabled - 自動作成の有効化
 * @param {boolean} autoVerificationEnabled - 自動検証の有効化
 * @param {number} maxTools - 最大ツール数
 * @param {number} defaultTimeoutMs - デフォルトタイムアウト(ms)
 */
export interface DynamicToolsConfig {
  /** 有効かどうか */
  enabled: boolean;
  /** 自動ツール生成を有効にするか */
  autoCreateEnabled: boolean;
  /** 自動検証を有効にするか */
  autoVerificationEnabled: boolean;
  /** 最大ツール数 */
  maxTools: number;
  /** デフォルトのタイムアウト（ミリ秒） */
  defaultTimeoutMs: number;
  /** 監査ログを有効にするか */
  auditLogEnabled: boolean;
  /** スキル自動変換を有効にするか */
  autoConvertToSkill: boolean;
  /** 許可された操作のallowlist */
  allowedOperations: AllowedOperations;
}

/**
 * デフォルト設定
 */
export const DEFAULT_DYNAMIC_TOOLS_CONFIG: DynamicToolsConfig = {
  enabled: true,
  autoCreateEnabled: true,
  autoVerificationEnabled: true,
  maxTools: 100,
  defaultTimeoutMs: 30000,
  auditLogEnabled: true,
  autoConvertToSkill: false,
  allowedOperations: {
    allowedModules: [
      "node:fs",
      "node:path",
      "node:os",
      "node:util",
      "node:crypto",
    ],
    allowedCommands: [
      "ls",
      "cat",
      "grep",
      "find",
      "head",
      "tail",
      "wc",
      "sort",
      "uniq",
      "cut",
      "echo",
      "pwd",
      "which",
      "dirname",
      "basename",
    ],
    allowedFilePaths: [
      "./**",
      "../**",
    ],
    allowedDomains: [],
    maxExecutionTimeMs: 30000,
    maxOutputSizeBytes: 1024 * 1024, // 1MB
  },
};
