/**
 * @abdd.meta
 * path: .pi/lib/analytics/behavior-storage.ts
 * role: LLM行動メトリクスの永続化
 * why: メトリクスをファイルシステムに保存し、後で分析できるようにする
 * related: .pi/lib/analytics/llm-behavior-types.ts, .pi/lib/analytics/metric-collectors.ts
 * public_api: recordBehaviorMetrics, loadBehaviorRecords, getAnalyticsPaths, cleanupOldRecords
 * invariants: レコードは日付別ディレクトリに保存、ファイル名はレコードID
 * side_effects: ファイルシステムへの書き込み
 * failure_modes: ディスク容量不足、権限エラー
 * @abdd.explain
 * overview: LLM行動メトリクスをJSONファイルとして保存・読み込みするストレージモジュール
 * what_it_does:
 *   - recordBehaviorMetrics: メトリクスを日付別ディレクトリにJSON保存
 *   - loadBehaviorRecords: 指定期間のレコードを読み込み
 *   - getAnalyticsPaths: ストレージパスを取得
 *   - cleanupOldRecords: 古いレコードを削除
 * why_it_exists:
 *   - メトリクスの永続化により、長期的な傾向分析を可能にするため
 *   - ファイルベースのストレージでシンプルに実装するため
 * scope:
 *   in: LLMBehaviorRecord, 期間指定
 *   out: ファイルシステムへのJSON書き出し
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LLMBehaviorRecord, LLMBehaviorConfig } from "./llm-behavior-types.js";
import { DEFAULT_LLM_BEHAVIOR_CONFIG } from "./llm-behavior-types.js";
import { createRunId } from "../agent/agent-utils.js";
import {
  collectPromptMetrics,
  collectOutputMetrics,
  collectQualityMetrics,
  collectExecutionMetrics,
  extractExecutionContext,
} from "./metric-collectors.js";

// ============================================================================
// Path Management
// ============================================================================

/**
 * アナリティクスパスを取得
 * @summary ストレージのルートパスとサブディレクトリパスを返す
 * @param cwd 作業ディレクトリ（オプション）
 * @returns パス情報
 */
export function getAnalyticsPaths(cwd?: string) {
  const root = cwd ?? process.cwd();
  const basePath = join(root, ".pi", "analytics", "llm-behavior");

  return {
    base: basePath,
    records: join(basePath, "records"),
    aggregates: join(basePath, "aggregates"),
    anomalies: join(basePath, "anomalies"),
  };
}

/**
 * ディレクトリを確保
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Record Storage
// ============================================================================

/**
 * 行動メトリクスを記録
 * @summary メトリクスをJSONファイルとして保存
 * @param record 行動レコード
 * @param cwd 作業ディレクトリ（オプション）
 * @returns 保存されたファイルパス
 */
export function recordBehaviorMetrics(
  record: LLMBehaviorRecord,
  cwd?: string,
): string {
  const paths = getAnalyticsPaths(cwd);

  // 日付別ディレクトリを作成
  const dateStr = record.timestamp.split("T")[0]; // YYYY-MM-DD
  const dateDir = join(paths.records, dateStr);
  ensureDir(dateDir);

  // ファイルに保存
  const filePath = join(dateDir, `${record.id}.json`);
  writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");

  return filePath;
}

/**
 * 行動メトリクスを作成して記録
 * @summary メトリクス収集から保存までを一括実行
 * @param params メトリクスパラメータ
 * @returns 作成されたレコード
 */
export function createAndRecordMetrics(params: {
  source: "subagent" | "team_member" | "main_agent";
  prompt: {
    text: string;
    skills?: string[];
    hasSystemPrompt?: boolean;
    hasExamples?: boolean;
  };
  output: {
    text: string;
    isValid?: boolean;
  };
  execution: {
    durationMs: number;
    retryCount: number;
    outcomeCode: string;
    modelUsed: string;
    thinkingLevel: string;
  };
  context: {
    task: string;
    agentId: string;
    parentRunId?: string;
  };
  cwd?: string;
}): LLMBehaviorRecord {
  // 動的インポートで循環依存を回避
  const record: LLMBehaviorRecord = {
    id: createRunId(),
    timestamp: new Date().toISOString(),
    source: params.source,
    prompt: collectPromptMetrics(params.prompt.text, {
      skills: params.prompt.skills,
      hasSystemPrompt: params.prompt.hasSystemPrompt,
      hasExamples: params.prompt.hasExamples,
    }),
    output: collectOutputMetrics(params.output.text),
    execution: collectExecutionMetrics({
      durationMs: params.execution.durationMs,
      retryCount: params.execution.retryCount,
      outcomeCode: params.execution.outcomeCode,
      modelUsed: params.execution.modelUsed,
      thinkingLevel: params.execution.thinkingLevel,
    }),
    quality: collectQualityMetrics(params.output.text, {
      isValid: params.output.isValid,
    }),
    context: extractExecutionContext(
      params.context.task,
      params.context.agentId,
      params.context.parentRunId,
    ),
  };

  recordBehaviorMetrics(record, params.cwd);

  return record;
}

// ============================================================================
// Record Loading
// ============================================================================

/**
 * 行動レコードを読み込み
 * @summary 指定期間のレコードを全て読み込み
 * @param startDate 開始日
 * @param endDate 終了日
 * @param cwd 作業ディレクトリ（オプション）
 * @returns レコード配列
 */
export function loadBehaviorRecords(
  startDate: Date,
  endDate: Date,
  cwd?: string,
): LLMBehaviorRecord[] {
  const paths = getAnalyticsPaths(cwd);
  const records: LLMBehaviorRecord[] = [];

  if (!existsSync(paths.records)) {
    return records;
  }

  // 日付ディレクトリを走査
  const dateDirs = readdirSync(paths.records);

  for (const dateDir of dateDirs) {
    // 日付範囲チェック
    const dirDate = new Date(dateDir);
    if (dirDate < startDate || dirDate > endDate) {
      continue;
    }

    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }

    // JSONファイルを読み込み
    const files = readdirSync(fullPath).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filePath = join(fullPath, file);
        const content = readFileSync(filePath, "utf-8");
        const record = JSON.parse(content) as LLMBehaviorRecord;
        records.push(record);
      } catch (error) {
        // 読み込みエラーはスキップ
        console.warn(`Failed to load record: ${file}`, error);
      }
    }
  }

  return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * 最新のレコードを取得
 * @summary 指定件数の最新レコードを返す
 * @param limit 取得件数
 * @param cwd 作業ディレクトリ（オプション）
 * @returns レコード配列
 */
export function loadRecentRecords(limit: number, cwd?: string): LLMBehaviorRecord[] {
  const paths = getAnalyticsPaths(cwd);

  if (!existsSync(paths.records)) {
    return [];
  }

  const records: LLMBehaviorRecord[] = [];
  const dateDirs = readdirSync(paths.records).sort().reverse();

  for (const dateDir of dateDirs) {
    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }

    const files = readdirSync(fullPath)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files) {
      if (records.length >= limit) {
        return records;
      }

      try {
        const filePath = join(fullPath, file);
        const content = readFileSync(filePath, "utf-8");
        const record = JSON.parse(content) as LLMBehaviorRecord;
        records.push(record);
      } catch (error) {
        console.warn(`Failed to load record: ${file}`, error);
      }
    }
  }

  return records;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * 古いレコードを削除
 * @summary 保持期間を超えたレコードを削除
 * @param config 設定（オプション）
 * @param cwd 作業ディレクトリ（オプション）
 * @returns 削除されたファイル数
 */
export function cleanupOldRecords(
  config: LLMBehaviorConfig = DEFAULT_LLM_BEHAVIOR_CONFIG,
  cwd?: string,
): number {
  const paths = getAnalyticsPaths(cwd);

  if (!existsSync(paths.records)) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.retention.recordsDays);

  let deletedCount = 0;
  const dateDirs = readdirSync(paths.records);

  for (const dateDir of dateDirs) {
    const dirDate = new Date(dateDir);

    if (dirDate < cutoffDate) {
      const fullPath = join(paths.records, dateDir);

      try {
        const files = readdirSync(fullPath);
        for (const file of files) {
          unlinkSync(join(fullPath, file));
          deletedCount += 1;
        }

        // 空ディレクトリを削除
        try {
          unlinkSync(fullPath);
        } catch {
          // ディレクトリ削除エラーは無視
        }
      } catch (error) {
        console.warn(`Failed to cleanup: ${dateDir}`, error);
      }
    }
  }

  return deletedCount;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * ストレージ統計を取得
 * @summary 現在のストレージ状態を返す
 * @param cwd 作業ディレクトリ（オプション）
 * @returns 統計情報
 */
export function getStorageStats(cwd?: string): {
  totalRecords: number;
  totalSizeBytes: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  dateDirCount: number;
} {
  const paths = getAnalyticsPaths(cwd);

  if (!existsSync(paths.records)) {
    return {
      totalRecords: 0,
      totalSizeBytes: 0,
      oldestRecord: null,
      newestRecord: null,
      dateDirCount: 0,
    };
  }

  let totalRecords = 0;
  let totalSizeBytes = 0;
  let oldestRecord: string | null = null;
  let newestRecord: string | null = null;
  let dateDirCount = 0;

  const dateDirs = readdirSync(paths.records).sort();

  for (const dateDir of dateDirs) {
    const fullPath = join(paths.records, dateDir);
    if (!statSync(fullPath).isDirectory()) {
      continue;
    }

    dateDirCount += 1;

    const files = readdirSync(fullPath).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = join(fullPath, file);
      const stats = statSync(filePath);

      totalRecords += 1;
      totalSizeBytes += stats.size;

      if (!oldestRecord) {
        oldestRecord = dateDir;
      }
      newestRecord = dateDir;
    }
  }

  return {
    totalRecords,
    totalSizeBytes,
    oldestRecord,
    newestRecord,
    dateDirCount,
  };
}
