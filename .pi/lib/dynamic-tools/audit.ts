/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/audit.ts
 * role: 監査ログの記録および読み込み
 * why: 全操作の履歴をJSONL形式で永続化し、追跡可能性を確保するため
 * related: .pi/lib/dynamic-tools/types.ts, node:fs, node:crypto
 * public_api: logAudit, readAuditLog
 * invariants: ログエントリは一意のIDとISO 8601形式のタイムスタンプを持つ
 * side_effects: ファイルシステムへのログファイル追記、ディレクトリの自動作成
 * failure_modes: ファイル書き込み失敗時はエラーコンソール出力のみで処理続行、不正なJSON行は読み込み時に無視
 * @abdd.explain
 * overview: 動的ツール生成システムにおける操作監査ログを管理するモジュール
 * what_it_does:
 *   - 操作アクション、実行者、詳細を含む監査エントリを非同期で生成・記録する
 *   - JSONL形式のログファイルを読み込み、ツールIDやアクション種別でフィルタリングする
 * why_it_exists:
 *   - システム内の変更履歴や操作履歴を保持し、トラブルシューティングや監査対応を可能にする
 * scope:
 *   in: アクション種別、ツールID、実行者情報、詳細データ、フィルタオプション
 * out: 生成された監査エントリ、フィルタリングされたエントリ配列
 */

/**
 * 動的ツール生成システム - 監査ログ
 * 全操作をJSONL形式で記録
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  type AuditLogEntry,
  type AuditAction,
  type DynamicToolsPaths,
  getDynamicToolsPaths,
} from "./types.js";

// ============================================================================
// 監査ログ機能
// ============================================================================

/**
 * エントリIDを生成
 */
function generateEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `audit_${timestamp}_${random}`;
}

 /**
  * 監査ログを非同期で記録する
  * @param entry 監査ログエントリ（アクション、実行者、詳細等）
  * @param paths 動的ツールのパス設定（省略可）
  * @returns 作成された監査ログエントリ
  */
export async function logAudit(
  entry: {
    action: AuditAction;
    toolId?: string;
    toolName?: string;
    actor: string;
    details: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
  },
  paths?: DynamicToolsPaths
): Promise<AuditLogEntry> {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const auditLogFile = toolPaths.auditLogFile;

  // ログディレクトリを確保
  const logsDir = dirname(auditLogFile);
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const logEntry: AuditLogEntry = {
    id: generateEntryId(),
    timestamp: new Date().toISOString(),
    action: entry.action,
    toolId: entry.toolId,
    toolName: entry.toolName,
    actor: entry.actor,
    details: entry.details,
    success: entry.success,
    errorMessage: entry.errorMessage,
  };

  // JSONL形式で追記
  const line = JSON.stringify(logEntry) + "\n";

  try {
    appendFileSync(auditLogFile, line, "utf-8");
  } catch (error) {
    // ログ記録の失敗は処理を停止しない
    console.error("[DynamicTools Audit] Failed to write audit log:", error);
  }

  return logEntry;
}

/**
 * ログ読込
 * @summary ログを読み込む
 * @param {{ limit?: number; toolId?: string; action?: AuditAction; since?: Date; }} [options] オプション設定
 * @param {DynamicToolsPaths} [paths] パス設定
 * @returns {AuditLogEntry[]} 監査ログエントリ配列
 */
export function readAuditLog(
  options?: {
    limit?: number;
    toolId?: string;
    action?: AuditAction;
    since?: Date;
  },
  paths?: DynamicToolsPaths
): AuditLogEntry[] {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const auditLogFile = toolPaths.auditLogFile;

  if (!existsSync(auditLogFile)) {
    return [];
  }

  try {
    const content = readFileSync(auditLogFile, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    let entries = lines.map(line => {
      try {
        return JSON.parse(line) as AuditLogEntry;
      } catch {
        return null;
      }
    }).filter((e): e is AuditLogEntry => e !== null);

    // フィルタリング
    if (options?.toolId) {
      entries = entries.filter(e => e.toolId === options.toolId);
    }

    if (options?.action) {
      entries = entries.filter(e => e.action === options.action);
    }

    if (options?.since) {
      const sinceTime = options.since.getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    // 新しい順にソート
    entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 制限
    if (options?.limit && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * 履歴取得
 * @summary 履歴を取得
 * @param {string} toolId ツールID
 * @param {DynamicToolsPaths} [paths] パス設定
 * @returns {AuditLogEntry[]} 監査ログエントリ配列
 */
export function getToolHistory(
  toolId: string,
  paths?: DynamicToolsPaths
): AuditLogEntry[] {
  return readAuditLog({ toolId }, paths);
}

/**
 * 監査統計を取得
 * @summary 監査統計を取得
 * @param since 集計の開始日時
 * @param paths オプションのパス設定
 * @returns アクション数、成功率、ツール別集計などを含む統計データ
 */
export function getAuditStatistics(
  since: Date,
  paths?: DynamicToolsPaths
): {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actionsByType: Record<AuditAction, number>;
  topTools: Array<{ toolId: string; toolName: string; count: number }>;
} {
  const entries = readAuditLog({ since }, paths);

  const actionsByType: Record<string, number> = {};
  const toolCounts: Record<string, { toolName: string; count: number }> = {};

  let successfulActions = 0;
  let failedActions = 0;

  for (const entry of entries) {
    // アクション種別カウント
    actionsByType[entry.action] = (actionsByType[entry.action] || 0) + 1;

    // 成功/失敗カウント
    if (entry.success) {
      successfulActions++;
    } else {
      failedActions++;
    }

    // ツール別カウント
    if (entry.toolId) {
      if (!toolCounts[entry.toolId]) {
        toolCounts[entry.toolId] = {
          toolName: entry.toolName || entry.toolId,
          count: 0,
        };
      }
      toolCounts[entry.toolId].count++;
    }
  }

  // トップツールを抽出
  const topTools = Object.entries(toolCounts)
    .map(([toolId, data]) => ({
      toolId,
      toolName: data.toolName,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalActions: entries.length,
    successfulActions,
    failedActions,
    actionsByType: actionsByType as Record<AuditAction, number>,
    topTools,
  };
}

/**
 * 監査ログをフォーマット
 * @summary 監査ログをフォーマット
 * @param entry 監査ログエントリ
 * @returns フォーマット済みの文字列
 */
export function formatAuditLogEntry(entry: AuditLogEntry): string {
  const timestamp = new Date(entry.timestamp).toLocaleString("ja-JP");
  const status = entry.success ? "[OK]" : "[FAIL]";

  let line = `${timestamp} ${status} ${entry.action}`;

  if (entry.toolName) {
    line += ` tool="${entry.toolName}"`;
  }

  if (entry.actor !== "system") {
    line += ` actor="${entry.actor}"`;
  }

  if (entry.errorMessage) {
    line += ` error="${entry.errorMessage}"`;
  }

  return line;
}

/**
 * 監査ログレポートを生成
 * @summary レポートを生成
 * @param since 集計開始日時
 * @param paths パス設定オプション
 * @returns 生成されたレポート文字列
 */
export function generateAuditReport(
  since: Date,
  paths?: DynamicToolsPaths
): string {
  const stats = getAuditStatistics(since, paths);
  const entries = readAuditLog({ since, limit: 50 }, paths);

  const lines: string[] = [
    `# 動的ツール監査レポート`,
    ``,
    `## 期間: ${since.toLocaleDateString("ja-JP")} 〜 ${new Date().toLocaleDateString("ja-JP")}`,
    ``,
    `## 統計`,
    ``,
    `- 総操作数: ${stats.totalActions}`,
    `- 成功: ${stats.successfulActions}`,
    `- 失敗: ${stats.failedActions}`,
    ``,
    `## 操作種別`,
    ``,
  ];

  for (const [action, count] of Object.entries(stats.actionsByType)) {
    lines.push(`- ${action}: ${count}`);
  }

  lines.push(``);
  lines.push(`## 使用頻度トップツール`);
  lines.push(``);

  for (const tool of stats.topTools) {
    lines.push(`- ${tool.toolName}: ${tool.count}回`);
  }

  lines.push(``);
  lines.push(`## 最近の操作（最新50件）`);
  lines.push(``);

  for (const entry of entries) {
    lines.push(formatAuditLogEntry(entry));
  }

  return lines.join("\n");
}

/**
 * 古いログをアーカイブ
 * @summary 古いログをアーカイブ
 * @param daysToKeep 保存日数
 * @param paths パス設定（省略可）
 * @returns アーカイブ数とエラー情報
 */
export function archiveOldLogs(
  daysToKeep: number = 30,
  paths?: DynamicToolsPaths
): { archived: number; error?: string } {
  const toolPaths = paths ?? getDynamicToolsPaths();
  const auditLogFile = toolPaths.auditLogFile;

  if (!existsSync(auditLogFile)) {
    return { archived: 0 };
  }

  try {
    const content = readFileSync(auditLogFile, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTime = cutoffDate.getTime();

    const recentEntries: string[] = [];
    let archivedCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditLogEntry;
        const entryTime = new Date(entry.timestamp).getTime();

        if (entryTime >= cutoffTime) {
          recentEntries.push(line);
        } else {
          archivedCount++;
        }
      } catch {
        // 不正な行はスキップ
      }
    }

    // 最近のエントリだけを残す
    if (archivedCount > 0) {
      const { writeFileSync } = require("node:fs");
      writeFileSync(auditLogFile, recentEntries.join("\n") + "\n", "utf-8");
    }

    return { archived: archivedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { archived: 0, error: errorMessage };
  }
}

// ============================================================================
// エクスポート
// ============================================================================

export type { AuditLogEntry, AuditAction };
