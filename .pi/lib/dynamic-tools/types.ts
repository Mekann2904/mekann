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
 * 動的ツール関連のパス
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
 * ツールパラメータ定義
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
 * 検証状態
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
 * ツール登録リクエスト
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
 * ツール登録結果
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
 * ツール一覧オプション
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
 * 許可された操作のallowlist
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
 * ツール品質メトリクス
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
 * 監査操作の種類
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
 * リフレクションコンテキスト
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
