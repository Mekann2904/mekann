/**
 * 動的ツール生成システム - レジストリ
 * ツールの登録・管理・永続化を担当
 *
 * 提供:
 * - DynamicToolRegistry クラス: オブジェクト指向API
 * - 関数ベースAPI: 手続き的な操作
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import {
  type DynamicToolDefinition,
  type DynamicToolRegistrationRequest,
  type DynamicToolRegistrationResult,
  type DynamicToolListOptions,
  type VerificationStatus,
  type DynamicToolsPaths,
  getDynamicToolsPaths,
  DEFAULT_DYNAMIC_TOOLS_CONFIG,
} from "./types.js";
import {
  quickSafetyCheck,
  analyzeCodeSafety,
} from "./safety.js";
import { assessCodeQuality } from "./quality.js";
import { logAudit, type AuditAction } from "./audit.js";

// ============================================================================
// 拡張機能互換型定義
// ============================================================================

 /**
  * ツールパラメータのプロパティ定義
  * @param type パラメータの型
  * @param description パラメータの説明
  * @param default デフォルト値
  * @param enum 列挙型の候補値
  * @param minimum 最小値
  * @param maximum 最大値
  */
export interface ToolParameterProperty {
  type: string;
  description: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

 /**
  * ツールパラメータのスキーマ定義
  * @param properties プロパティ定義のマッピング
  * @param required 必須プロパティ名の配列
  */
export interface ToolParameterSchema {
  properties: Record<string, ToolParameterProperty>;
  required: string[];
}

 /**
  * ツール実行結果
  * @param success 実行が成功したか
  * @param result 実行結果
  * @param error エラーメッセージ
  * @param executionTimeMs 実行時間（ミリ秒）
  */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs: number;
}

 /**
  * ツール検索オプション（拡張機能互換）
  * @param name ツール名
  * @param tags タグ一覧
  * @param minSafetyScore 最小セーフティスコア
  * @param limit 結果の最大件数
  */
export interface ToolSearchOptions {
  name?: string;
  tags?: string[];
  minSafetyScore?: number;
  limit?: number;
}

 /**
  * ツール登録オプション
  * @param name ツール名
  * @param description ツールの説明
  * @param code 実行コード
  * @param parameters パラメータスキーマ
  * @param tags タグ
  * @param generatedFrom 生成元
  */
export interface RegisterToolOptions {
  name: string;
  description: string;
  code: string;
  parameters?: ToolParameterSchema;
  tags?: string[];
  generatedFrom?: string;
}

 /**
  * ツール登録結果（拡張機能互換）
  * @param success 登録が成功したかどうか
  * @param toolId ツールID
  * @param error エラーメッセージ
  * @param warnings 警告メッセージの配列
  */
export interface RegisterToolResult {
  success: boolean;
  toolId?: string;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// パス定義
// ============================================================================

const CWD = process.cwd();

 /**
  * 動的ツールのディレクトリパスを確保する
  * @param paths - ツールおよびスキルのディレクトリパスを含むオブジェクト
  * @returns なし
  */
export function ensureDynamicToolsPaths(paths: DynamicToolsPaths): void {
  if (!existsSync(paths.toolsDir)) {
    mkdirSync(paths.toolsDir, { recursive: true });
  }
  if (!existsSync(paths.skillsDir)) {
    mkdirSync(paths.skillsDir, { recursive: true });
  }
  const logsDir = join(CWD, ".pi", "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

// ============================================================================
// ツールID生成
// ============================================================================

 /**
  * ツールIDを生成する
  * @param name ツール名
  * @param code ツールコード
  * @returns 生成されたツールID
  */
export function generateToolId(name: string, code: string): string {
  const hash = createHash("sha256")
    .update(`${name}:${code}`)
    .digest("hex")
    .slice(0, 12);
  return `dt_${hash}`;
}

 /**
  * 実行IDを生成する
  * @returns 生成された実行ID
  */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `run_${timestamp}_${random}`;
}

// ============================================================================
// ツールストレージ
// ============================================================================

 /**
  * ツール定義を保存する
  * @param tool ツール定義
  * @param paths ツールのパス情報
  * @returns なし
  */
export function saveToolDefinition(
  tool: DynamicToolDefinition,
  paths: DynamicToolsPaths
): void {
  const toolFile = join(paths.toolsDir, `${tool.id}.json`);
  writeFileSync(toolFile, JSON.stringify(tool, null, 2), "utf-8");
}

 /**
  * ツール定義を読み込む
  * @param toolId ツールID
  * @param paths パス設定
  * @returns ツール定義、見つからない場合はnull
  */
export function loadToolDefinition(
  toolId: string,
  paths: DynamicToolsPaths
): DynamicToolDefinition | null {
  const toolFile = join(paths.toolsDir, `${toolId}.json`);
  if (!existsSync(toolFile)) {
    return null;
  }
  try {
    const content = readFileSync(toolFile, "utf-8");
    return JSON.parse(content) as DynamicToolDefinition;
  } catch {
    return null;
  }
}

/**
 * ツール定義を名前でロード
 * @param name ツール名
 * @param paths パス設定
 * @returns ツール定義、見つからなければnull
 */
export function loadToolDefinitionByName(
  name: string,
  paths: DynamicToolsPaths
): DynamicToolDefinition | null {
  if (!existsSync(paths.toolsDir)) {
    return null;
  }

  const files = readdirSync(paths.toolsDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = readFileSync(join(paths.toolsDir, file), "utf-8");
      const tool = JSON.parse(content) as DynamicToolDefinition;
      if (tool.name === name) {
        return tool;
      }
    } catch {
      // Skip invalid files
    }
  }

  return null;
}

 /**
  * IDまたは名前でツール定義を取得
  * @param toolIdOrName ツールのIDまたは名前
  * @param paths 動的ツールのパス設定
  * @returns 見つかったツール定義、見つからない場合はnull
  */
export function resolveToolDefinition(
  toolIdOrName: string,
  paths: DynamicToolsPaths
): DynamicToolDefinition | null {
  // Try as ID first
  if (toolIdOrName.startsWith("dt_")) {
    const tool = loadToolDefinition(toolIdOrName, paths);
    if (tool) return tool;
  }

  // Try as name
  return loadToolDefinitionByName(toolIdOrName, paths);
}

 /**
  * 全ツール定義をロード
  * @param paths ツールのパス設定
  * @returns ロードされたツール定義の配列
  */
export function loadAllToolDefinitions(
  paths: DynamicToolsPaths
): DynamicToolDefinition[] {
  if (!existsSync(paths.toolsDir)) {
    return [];
  }

  const tools: DynamicToolDefinition[] = [];
  const files = readdirSync(paths.toolsDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = readFileSync(join(paths.toolsDir, file), "utf-8");
      const tool = JSON.parse(content) as DynamicToolDefinition;
      tools.push(tool);
    } catch {
      // Skip invalid files
    }
  }

  return tools;
}

 /**
  * ツール定義を削除する
  * @param toolId 削除するツールのID
  * @param paths ツールのパス設定
  * @returns 削除に成功したかどうか
  */
export function deleteToolDefinition(
  toolId: string,
  paths: DynamicToolsPaths
): boolean {
  const toolFile = join(paths.toolsDir, `${toolId}.json`);
  if (!existsSync(toolFile)) {
    return false;
  }

  try {
    rmSync(toolFile);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// ツール登録
// ============================================================================

 /**
  * 動的ツールを登録
  * @param request 登録リクエスト
  * @param options 登録オプション
  * @param options.actor 実行主体
  * @param options.skipVerification 検証をスキップするか
  * @param options.paths パス設定
  * @returns 登録結果
  */
export async function registerDynamicTool(
  request: DynamicToolRegistrationRequest,
  options?: {
    actor?: string;
    skipVerification?: boolean;
    paths?: DynamicToolsPaths;
  }
): Promise<DynamicToolRegistrationResult> {
  const paths = options?.paths ?? getDynamicToolsPaths();
  const actor = options?.actor ?? "system";

  ensureDynamicToolsPaths(paths);

  // 名前の検証
  const nameValidation = validateToolName(request.name);
  if (!nameValidation.valid) {
    return {
      success: false,
      error: nameValidation.error,
    };
  }

  // 重複チェック
  const existingTool = loadToolDefinitionByName(request.name, paths);
  if (existingTool) {
    return {
      success: false,
      error: `ツール名 "${request.name}" は既に存在します（ID: ${existingTool.id}）`,
    };
  }

  // 最大ツール数チェック
  const allTools = loadAllToolDefinitions(paths);
  if (allTools.length >= DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools) {
    return {
      success: false,
      error: `最大ツール数（${DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools}）に達しています`,
    };
  }

  // 安全性検証
  let safetyResult: import("./safety.js").SafetyAnalysisResult | undefined;
  if (!options?.skipVerification && DEFAULT_DYNAMIC_TOOLS_CONFIG.autoVerificationEnabled) {
    safetyResult = analyzeCodeSafety(request.code);

    // 重大な問題がある場合はブロック
    const hasCriticalIssues = safetyResult.issues.some(i => i.severity === "critical");
    if (hasCriticalIssues) {
      await logAudit({
        action: "verification.fail" as AuditAction,
        toolName: request.name,
        actor,
        details: {
          reason: "critical_risk",
          issues: safetyResult.issues.map(i => ({ type: i.type, description: i.description })),
        },
        success: false,
        errorMessage: "重大なセキュリティリスクが検出されました",
      }, paths);

      return {
        success: false,
        error: "重大なセキュリティリスクが検出されました",
      };
    }
  }

  // ツールID生成
  const toolId = generateToolId(request.name, request.code);
  const now = new Date().toISOString();

  // 信頼度スコアの計算（安全性と品質の最小値）
  const safetyScore = safetyResult?.score ?? 0.5;
  const qualityResult = assessCodeQuality(request.code);
  const qualityScore = qualityResult.score;
  const confidenceScore = Math.min(safetyScore, qualityScore);

  // ツール定義作成
  const tool: DynamicToolDefinition = {
    id: toolId,
    name: request.name,
    description: request.description,
    mode: request.mode,
    parameters: request.parameters ?? [],
    code: request.code,
    createdAt: now,
    updatedAt: now,
    createdFromTask: request.createdFromTask,
    usageCount: 0,
    confidenceScore,
    verificationStatus: (safetyResult?.isSafe ?? false) ? "passed" : "unverified",
    tags: request.tags ?? [],
    createdBy: request.createdBy ?? actor,
  };

  // 保存
  saveToolDefinition(tool, paths);

  // 監査ログ
  await logAudit({
    action: "tool.create" as AuditAction,
    toolId: tool.id,
    toolName: tool.name,
    actor,
    details: {
      mode: tool.mode,
      hasParameters: tool.parameters.length > 0,
      verificationStatus: tool.verificationStatus,
    },
    success: true,
  }, paths);

  return {
    success: true,
    tool,
  };
}

/**
 * ツール名の検証
 */
function validateToolName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "ツール名は必須です" };
  }

  if (name.length > 64) {
    return { valid: false, error: "ツール名は64文字以内で指定してください" };
  }

  // 小文字、数字、アンダースコア、ハイフンを許可
  const validNamePattern = /^[a-z][a-z0-9_-]*$/;
  if (!validNamePattern.test(name)) {
    return {
      valid: false,
      error: "ツール名は小文字の英字で始まり、小文字・数字・アンダースコア・ハイフンのみ使用可能です",
    };
  }

  // 予約語チェック
  const reservedNames = [
    "create_tool", "run_dynamic_tool", "list_dynamic_tools", "delete_dynamic_tool",
    "bash", "read", "write", "edit", "question",
  ];
  if (reservedNames.includes(name)) {
    return { valid: false, error: `"${name}" は予約された名前です` };
  }

  return { valid: true };
}

// ============================================================================
// ツール一覧
// ============================================================================

 /**
  * 動的ツール一覧を取得
  * @param options フィルタリングオプション
  * @param paths ツール定義ファイルのパス
  * @returns ツール定義の配列
  */
export function listDynamicTools(
  options?: DynamicToolListOptions,
  paths?: DynamicToolsPaths
): DynamicToolDefinition[] {
  const toolPaths = paths ?? getDynamicToolsPaths();
  let tools = loadAllToolDefinitions(toolPaths);

  // フィルタリング
  if (options?.tags && options.tags.length > 0) {
    tools = tools.filter(t =>
      options.tags!.some(tag => t.tags.includes(tag))
    );
  }

  if (options?.verificationStatus && options.verificationStatus.length > 0) {
    tools = tools.filter(t =>
      options.verificationStatus!.includes(t.verificationStatus)
    );
  }

  if (options?.mode && options.mode.length > 0) {
    tools = tools.filter(t =>
      options.mode!.includes(t.mode)
    );
  }

  // ソート
  const sortBy = options?.sortBy ?? "createdAt";
  const sortOrder = options?.sortOrder ?? "desc";

  tools.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "createdAt":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "updatedAt":
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "usageCount":
        comparison = a.usageCount - b.usageCount;
        break;
      case "confidenceScore":
        comparison = a.confidenceScore - b.confidenceScore;
        break;
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // 制限
  if (options?.limit && options.limit > 0) {
    tools = tools.slice(0, options.limit);
  }

  return tools;
}

// ============================================================================
// ツール削除
// ============================================================================

 /**
  * ダイナミックツールを削除する
  * @param toolIdOrName ツールIDまたはツール名
  * @param options.actor 実行者
  * @param options.paths ツール設定のパス
  * @returns 成功したかどうかとエラー情報
  */
export async function deleteDynamicTool(
  toolIdOrName: string,
  options?: {
    actor?: string;
    paths?: DynamicToolsPaths;
  }
): Promise<{ success: boolean; error?: string }> {
  const paths = options?.paths ?? getDynamicToolsPaths();
  const actor = options?.actor ?? "system";

  const tool = resolveToolDefinition(toolIdOrName, paths);
  if (!tool) {
    return {
      success: false,
      error: `ツール "${toolIdOrName}" が見つかりません`,
    };
  }

  const deleted = deleteToolDefinition(tool.id, paths);

  if (deleted) {
    await logAudit({
      action: "tool.delete" as AuditAction,
      toolId: tool.id,
      toolName: tool.name,
      actor,
      details: {
        deletedAt: new Date().toISOString(),
      },
      success: true,
    }, paths);
  }

  return {
    success: deleted,
    error: deleted ? undefined : "削除に失敗しました",
  };
}

// ============================================================================
// 使用統計の更新
// ============================================================================

 /**
  * ツールの使用統計を更新します。
  * @param toolId ツールID
  * @param success 成功したかどうか
  * @param executionTimeMs 実行時間（ミリ秒）
  * @param paths 動的ツールのパス（省略可）
  * @returns なし
  */
export function updateToolUsage(
  toolId: string,
  success: boolean,
  executionTimeMs: number,
  paths?: DynamicToolsPaths
): void {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const tool = loadToolDefinition(toolId, toolPaths);

  if (!tool) return;

  tool.usageCount += 1;
  tool.lastUsedAt = new Date().toISOString();

  if (!success) {
    // 信頼度を少し下げる
    tool.confidenceScore = Math.max(0.1, tool.confidenceScore - 0.05);
  } else {
    // 信頼度を少し上げる
    tool.confidenceScore = Math.min(1.0, tool.confidenceScore + 0.02);
  }

  saveToolDefinition(tool, toolPaths);
}

// ============================================================================
// ツール検索
// ============================================================================

 /**
  * キーワードでツールを検索
  * @param keyword 検索キーワード
  * @param paths 検索対象のパス（省略可）
  * @returns 検索条件に一致するツール定義の配列
  */
export function searchDynamicTools(
  keyword: string,
  paths?: DynamicToolsPaths
): DynamicToolDefinition[] {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const allTools = loadAllToolDefinitions(toolPaths);
  const loweredKeyword = keyword.toLowerCase();

  return allTools.filter(tool =>
    tool.name.toLowerCase().includes(loweredKeyword) ||
    tool.description.toLowerCase().includes(loweredKeyword) ||
    tool.tags.some(tag => tag.toLowerCase().includes(loweredKeyword))
  );
}

 /**
  * タスクに適したツールを推奨する
  * @param task タスクを表す文字列
  * @param paths ツール定義のパス（省略可）
  * @returns 推奨されるツール定義の配列
  */
export function recommendToolsForTask(
  task: string,
  paths?: DynamicToolsPaths
): DynamicToolDefinition[] {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const allTools = loadAllToolDefinitions(toolPaths);

  // キーワード抽出（簡易版）
  const keywords = task.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  // スコアリング
  const scored = allTools.map(tool => {
    let score = 0;
    const toolText = `${tool.name} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase();

    for (const keyword of keywords) {
      if (toolText.includes(keyword)) {
        score += 1;
      }
    }

    // 信頼度で重み付け
    score *= (0.5 + tool.confidenceScore * 0.5);

    return { tool, score };
  });

  // スコア順にソート
  scored.sort((a, b) => b.score - a.score);

  return scored.filter(s => s.score > 0).map(s => s.tool);
}

// ============================================================================
// DynamicToolRegistry クラス
// 拡張機能との互換性のためのクラスベースAPI
// ============================================================================

 /**
  * 動的ツールのレジストリクラス
  * @param paths - パス設定（省略可）
  */
export class DynamicToolRegistry {
  private paths: DynamicToolsPaths;
  private tools: Map<string, DynamicToolDefinition> = new Map();
  private initialized = false;

  constructor(paths?: DynamicToolsPaths) {
    this.paths = paths ?? getDynamicToolsPaths();
  }

  /**
   * レジストリを初期化（ツールをロード）
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    ensureDynamicToolsPaths(this.paths);
    const tools = loadAllToolDefinitions(this.paths);
    for (const tool of tools) {
      this.tools.set(tool.id, tool);
    }
    this.initialized = true;
  }

   /**
    * ツールを登録する
    * @param options - 登録オプション
    * @returns 登録結果
    */
  register(options: RegisterToolOptions): RegisterToolResult {
    this.ensureInitialized();

    // 名前の検証
    const nameValidation = validateToolName(options.name);
    if (!nameValidation.valid) {
      return {
        success: false,
        error: nameValidation.error,
      };
    }

    // 重複チェック
    for (const tool of Array.from(this.tools.values())) {
      if (tool.name === options.name) {
        return {
          success: false,
          error: `ツール名 "${options.name}" は既に存在します（ID: ${tool.id}）`,
        };
      }
    }

    // 最大ツール数チェック
    if (this.tools.size >= DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools) {
      return {
        success: false,
        error: `最大ツール数（${DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools}）に達しています`,
      };
    }

    // 安全性解析（簡易版）
    const safetyScore = this.calculateSafetyScore(options.code);
    const qualityScore = this.calculateQualityScore(options.code);

    // ツールID生成
    const toolId = generateToolId(options.name, options.code);
    const now = new Date().toISOString();

    // 拡張機能互換のパラメータをtypes.tsの形式に変換
    const parameters = this.convertParameters(options.parameters);

    // ツール定義作成
    const tool: DynamicToolDefinition = {
      id: toolId,
      name: options.name,
      description: options.description,
      mode: "function",
      parameters,
      code: options.code,
      createdAt: now,
      updatedAt: now,
      createdFromTask: options.generatedFrom,
      usageCount: 0,
      confidenceScore: Math.min(safetyScore, qualityScore),
      verificationStatus: safetyScore >= 0.5 ? "passed" : "unverified",
      tags: options.tags ?? [],
      createdBy: "extension",
    };

    // メモリに保存
    this.tools.set(toolId, tool);

    // ファイルに永続化
    saveToolDefinition(tool, this.paths);

    // 監査ログ
    logAudit({
      action: "tool.create" as AuditAction,
      toolId: tool.id,
      toolName: tool.name,
      actor: "extension",
      details: {
        mode: tool.mode,
        hasParameters: tool.parameters.length > 0,
        verificationStatus: tool.verificationStatus,
      },
      success: true,
    }, this.paths).catch(() => {});

    const warnings: string[] = [];
    if (safetyScore < 0.5) {
      warnings.push("安全性スコアが低いため、検証状態はunverifiedです");
    }

    return {
      success: true,
      toolId,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

   /**
    * IDでツールを取得
    * @param toolId ツールID
    * @returns ツール定義、存在しない場合はundefined
    */
  getById(toolId: string): DynamicToolDefinition | undefined {
    this.ensureInitialized();
    return this.tools.get(toolId);
  }

   /**
    * 名前でツールを検索
    * @param name ツール名
    * @returns 該当するツール定義、見つからない場合はundefined
    */
  findByName(name: string): DynamicToolDefinition | undefined {
    this.ensureInitialized();
    for (const tool of Array.from(this.tools.values())) {
      if (tool.name === name) {
        return tool;
      }
    }
    return undefined;
  }

   /**
    * ツールを検索
    * @param options 検索オプション
    * @returns 検索条件に一致するツール定義の配列
    */
  search(options: ToolSearchOptions): DynamicToolDefinition[] {
    this.ensureInitialized();

    let results = Array.from(this.tools.values());

    // 名前でフィルタ
    if (options.name) {
      const loweredName = options.name.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(loweredName)
      );
    }

    // タグでフィルタ
    if (options.tags && options.tags.length > 0) {
      results = results.filter(t =>
        options.tags!.some(tag => t.tags.includes(tag))
      );
    }

    // 安全性スコアでフィルタ
    if (options.minSafetyScore !== undefined) {
      results = results.filter(t =>
        t.confidenceScore >= options.minSafetyScore!
      );
    }

    // 制限
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

   /**
    * ツールを削除します
    * @param toolId - 削除するツールのID
    * @returns 成功したかどうかと、失敗時のエラーメッセージを含むオブジェクト
    */
  delete(toolId: string): { success: boolean; error?: string } {
    this.ensureInitialized();

    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        error: `ツール "${toolId}" が見つかりません`,
      };
    }

    // メモリから削除
    this.tools.delete(toolId);

    // ファイルから削除
    const deleted = deleteToolDefinition(toolId, this.paths);

    // 監査ログ
    logAudit({
      action: "tool.delete" as AuditAction,
      toolId: tool.id,
      toolName: tool.name,
      actor: "extension",
      details: {
        deletedAt: new Date().toISOString(),
      },
      success: deleted,
    }, this.paths).catch(() => {});

    return {
      success: deleted,
      error: deleted ? undefined : "削除に失敗しました",
    };
  }

   /**
    * ツールの使用を記録する
    * @param toolId ツールID
    * @returns なし
    */
  recordUsage(toolId: string): void {
    this.ensureInitialized();

    const tool = this.tools.get(toolId);
    if (!tool) return;

    tool.usageCount += 1;
    tool.lastUsedAt = new Date().toISOString();

    // ファイルを更新
    saveToolDefinition(tool, this.paths);
  }

   /**
    * 全ツールを取得
    * @returns 全ての動的ツール定義の配列
    */
  getAll(): DynamicToolDefinition[] {
    this.ensureInitialized();
    return Array.from(this.tools.values());
  }

   /**
    * ツール数を取得
    * @returns ツールの総数
    */
  count(): number {
    this.ensureInitialized();
    return this.tools.size;
  }

  // ============================================================================
  // プライベートヘルパー
  // ============================================================================

  /**
   * 安全性スコアを計算（簡易版）
   */
  private calculateSafetyScore(code: string): number {
    const quickCheck = quickSafetyCheck(code);
    if (!quickCheck.isSafe) {
      return 0.3;
    }

    const analysis = analyzeCodeSafety(code);
    return analysis.score;
  }

  /**
   * 品質スコアを計算
   */
  private calculateQualityScore(code: string): number {
    const assessment = assessCodeQuality(code);
    return assessment.score;
  }

  /**
   * パラメータ形式を変換
   */
  private convertParameters(
    params?: ToolParameterSchema
  ): import("./types.js").ToolParameterDefinition[] {
    if (!params) return [];

    const result: import("./types.js").ToolParameterDefinition[] = [];

    for (const [name, prop] of Object.entries(params.properties)) {
      result.push({
        name,
        type: this.convertType(prop.type),
        required: params.required.includes(name),
        description: prop.description,
        default: prop.default,
        allowedValues: prop.enum,
      });
    }

    return result;
  }

  /**
   * 型を変換
   */
  private convertType(type: string): "string" | "number" | "boolean" | "object" | "array" {
    switch (type) {
      case "string":
      case "number":
      case "boolean":
      case "object":
      case "array":
        return type;
      default:
        return "string";
    }
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

let registryInstance: DynamicToolRegistry | null = null;

 /**
  * レジストリのシングルトンインスタンスを取得
  * @returns DynamicToolRegistryのインスタンス
  */
export function getRegistry(): DynamicToolRegistry {
  if (!registryInstance) {
    registryInstance = new DynamicToolRegistry();
  }
  return registryInstance;
}

 /**
  * レジストリをリセット（テスト用）
  * @returns {void}
  */
export function resetRegistry(): void {
  registryInstance = null;
}
