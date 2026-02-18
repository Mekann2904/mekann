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
  * 動的ツール関連のパス設定
  * @param toolsDir ツール保存ディレクトリ
  * @param skillsDir スキル保存ディレクトリ
  * @param auditLogFile 監査ログファイル
  * @param metricsFile 品質メトリクスファイル
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
  * デフォルトのダイナミックツールパスを取得
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
  * 動的ツールの実行モード
  */
export type DynamicToolMode =
  | "bash"          // Bash コマンド実行
  | "function"      // TypeScript関数実行
  | "template"      // テンプレートベース
  | "skill";        // スキルとして保存

 /**
  * ツールのパラメータ定義
  * @param name パラメータ名
  * @param type パラメータの型
  * @param required 必須かどうか
  * @param description 説明
  * @param default デフォルト値
  * @param allowedValues 値の制約（allowlist）
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
  * 動的ツール定義
  * @param id ツールID（自動生成）
  * @param name ツール名（コマンド名として使用）
  * @param description 説明
  * @param mode 実行モード
  * @param parameters パラメータ定義
  * @param code 実行コードまたはコマンドテンプレート
  * @param createdAt 作成日時
  * @param updatedAt 更新日時
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
  * 検証状態を表す文字列リテラル型
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
  * 動的ツールの実行結果を表します
  * @param success 成功したかどうか
  * @param output 出力
  * @param error エラーメッセージ
  * @param executionTimeMs 実行時間（ミリ秒）
  * @param toolId ツールID
  * @param runId 実行ID
  * @param timestamp タイムスタンプ
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
  * ツール実行オプション
  * @param toolIdOrName ツールIDまたは名前
  * @param parameters パラメータ値
  * @param timeoutMs タイムアウト（ミリ秒）
  * @param signal 中止シグナル
  * @param debug デバッグモード
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
  * 動的ツール登録リクエスト
  * @param name ツール名
  * @param description 説明
  * @param mode 実行モード
  * @param parameters パラメータ定義
  * @param code 実行コード
  * @param createdFromTask 作成元のタスク
  * @param tags タグ
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
  * 動的ツールの登録結果
  * @param success 成功したかどうか
  * @param tool 作成されたツール定義
  * @param error エラーメッセージ
  * @param verificationResult 検証結果
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
  * ツール一覧のフィルタ・ソートオプション
  * @param tags フィルタ: タグ
  * @param verificationStatus フィルタ: 検証状態
  * @param mode フィルタ: 実行モード
  * @param sortBy ソート順
  * @param sortOrder 昇順/降順
  * @param limit 最大件数
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
  * 安全性検証結果
  * @param safe 安全かどうか
  * @param riskLevel リスクレベル
  * @param issues 検出された問題
  * @param recommendations 推奨事項
  * @param verifiedAt 検証時刻
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
  * 安全性の問題
  * @param type 問題の種類
  * @param severity 重要度
  * @param description 説明
  * @param location コード内の位置
  * @param suggestion 修正提案
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
  * 安全性問題の種類
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
  * 許可された操作の設定
  * @param allowedModules 許可されたNode.jsモジュール
  * @param allowedCommands 許可されたbashコマンド
  * @param allowedFilePaths 許可されたファイルパスパターン
  * @param allowedDomains 許可されたネットワークドメイン
  * @param maxExecutionTimeMs 最大実行時間（ミリ秒）
  * @param maxOutputSizeBytes 最大出力サイズ（バイト）
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
  * 動的ツールの品質メトリクス
  * @param toolId ツールID
  * @param successRate 成功率
  * @param averageExecutionTimeMs 平均実行時間（ミリ秒）
  * @param totalUsageCount 総使用回数
  * @param errorCount エラー回数
  * @param lastError 最終エラー
  * @param lastErrorAt 最終エラー日時
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
  * 品質メトリクス収集結果
  * @param totalTools 全ツール数
  * @param activeTools アクティブなツール数（30日以内に使用）
  * @param averageSuccessRate 平均成功率
  * @param averageQualityScore 平均品質スコア
  * @param topTools トップツール（使用回数順）
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
  * 監査ログエントリ
  * @param id エントリID
  * @param timestamp タイムスタンプ
  * @param action 操作種類
  * @param toolId ツールID
  * @param toolName ツール名
  * @param actor 操作者
  * @param details 操作の詳細
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
 * 監査ログに記録される操作の種類を表す文字列リテラル型。
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
  * スキルへの変換オプション
  * @param toolId ツールID
  * @param skillName スキル名（指定しない場合はツール名を使用）
  * @param skillDescription スキルの説明（指定しない場合はツールの説明を使用）
  * @param overwrite 上書きするかどうか
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
  * スキル変換結果
  * param success 成功したかどうか
  * param skillPath スキルのパス
  * param error エラーメッセージ
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
  * ツール実行後のリフレクション結果
  * @param needsReflection - リフレクションが必要かどうか
  * @param shouldCreateTool - 新しいツールを作成すべきかどうか
  * @param proposedTool - 提案されるツール定義
  * @param improvementSuggestions - 改善提案
  * @param reflectionReason - リフレクションの理由
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
 * @param lastToolName 直前のツール名
 * @param lastToolResult 直前のツール結果
 * @param currentTask 現在のタスク
 * @param failureCount 失敗回数
 * @param patternMatch パターンマッチ（繰り返し操作の検出）
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
  * 動的ツールシステムの設定
  * @param enabled 有効かどうか
  * @param autoCreateEnabled 自動ツール生成を有効にするか
  * @param autoVerificationEnabled 自動検証を有効にするか
  * @param maxTools 最大ツール数
  * @param defaultTimeoutMs デフォルトのタイムアウト（ミリ秒）
  * @param auditLogEnabled 監査ログを有効にするか
  * @param autoConvertToSkill スキル自動変換を有効にするか
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
