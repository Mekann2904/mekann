/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/audit.ts
 * role: 動的ツール生成システムの監査ログ記録・参照モジュール
 * why: 全操作を追跡可能にし、セキュリティインシデント調査やデバッグを可能にするため
 * related: types.js, manager.ts, registry.ts, cli.ts
 * public_api: logAudit, readAuditLog
 * invariants:
 *   - ログエントリは一意のIDを持つ
 *   - タイムスタンプはISO 8601形式
 *   - ログファイルはJSONL形式で追記のみ
 * side_effects:
 *   - 監査ログファイルへの追記書き込み
 *   - ログディレクトリの自動作成
 *   - 標準エラー出力へのエラー出力
 * failure_modes:
 *   - ファイル書き込み権限不足でログ記録失敗（処理は継続）
 *   - 不正なJSONL行は読み込み時にスキップ
 *   - ログファイル不在時は空配列を返却
 * @abdd.explain
 * overview: 動的ツール生成システムにおける全操作の監査証跡をJSONL形式で永続化する
 * what_it_does:
 *   - ツール作成/更新/削除/有効化/無効化操作を監査ログとして記録
 *   - ツールID、アクション種別、実行者、時刻、成否をエントリに含む
 *   - ツールID/アクション種別/開始日時によるログフィルタリング機能を提供
 * why_it_exists:
 *   - セキュリティ監査のため全操作の証跡を保持
 *   - 障害発生時の原因追跡と再現を可能にする
 * scope:
 *   in: AuditAction型のアクション種別、tools/toolId/toolName/actor/details/success/errorMessage
 *   out: JSONL形式の監査ログファイル、フィルタ済みAuditLogEntry配列
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
  * 監査ログを読み込む
  * @param options 検索オプション（取得件数、ツールID、アクション、開始日時）
  * @param paths パス設定（省略時はデフォルト）
  * @returns 監査ログエントリの配列
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
  * ツールの操作履歴を取得
  * @param toolId ツールID
  * @param paths 動的ツールのパス設定
  * @returns 監査ログエントリの配列
  */
export function getToolHistory(
  toolId: string,
  paths?: DynamicToolsPaths
): AuditLogEntry[] {
  return readAuditLog({ toolId }, paths);
}

 /**
  * 指定期間内の監査統計を取得
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
  * 監査ログエントリをフォーマットする
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
