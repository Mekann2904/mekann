/**
 * @abdd.meta
 * path: .pi/lib/analytics/aggregator.ts
 * role: LLM行動メトリクスの集計ジョブ
 * why: 期間ごとの統計データを生成し、傾向分析を可能にする
 * related: .pi/lib/analytics/behavior-storage.ts, .pi/lib/analytics/efficiency-analyzer.ts
 * public_api: aggregateHourly, aggregateDaily, aggregateWeekly, runAggregation
 * invariants: 集計ファイルは期間で一意
 * side_effects: ファイルシステムへの書き込み
 * failure_modes: レコード読み込みエラー時はスキップ
 * @abdd.explain
 * overview: 収集されたメトリクスを時間・日・週単位で集計し、傾向分析用データを生成
 * what_it_does:
 *   - aggregateHourly: 1時間ごとの集計
 *   - aggregateDaily: 1日ごとの集計
 *   - aggregateWeekly: 1週間ごとの集計
 *   - runAggregation: 全期間の集計を実行
 * why_it_exists:
 *   - 大量のレコードから傾向を把握するため
 *   - 異常検知のベースラインを自動更新するため
 * scope:
 *   in: recordsディレクトリ内のJSONファイル
 *   out: aggregatesディレクトリへの集計JSON
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LLMBehaviorRecord, LLMBehaviorAggregates } from "./llm-behavior-types.js";
import { loadBehaviorRecords, getAnalyticsPaths } from "./behavior-storage.js";
import { calculateAggregates } from "./efficiency-analyzer.js";

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * 時間単位の集計
 * @summary 指定日時の1時間ごとの集計を生成
 * @param date 対象日時
 * @param cwd 作業ディレクトリ
 * @returns 生成された集計ファイルパスの配列
 */
export function aggregateHourly(date: Date, cwd?: string): string[] {
  const paths = getAnalyticsPaths(cwd);
  const generatedFiles: string[] = [];

  // 1日の各時間を集計
  for (let hour = 0; hour < 24; hour += 1) {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);

    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);

    const records = loadBehaviorRecords(hourStart, hourEnd, cwd);

    if (records.length === 0) {
      continue;
    }

    const aggregates = calculateAggregates(records, "hour");
    if (!aggregates) {
      continue;
    }

    // 保存（ローカル日付を使用）
    const localDate = `${hourStart.getFullYear()}-${String(hourStart.getMonth() + 1).padStart(2, "0")}-${String(hourStart.getDate()).padStart(2, "0")}`;
    const hourStr = `${localDate}T${hour.toString().padStart(2, "0")}`;
    const outputDir = join(paths.aggregates, "hourly");
    ensureDir(outputDir);

    const outputPath = join(outputDir, `${hourStr}.json`);
    writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");
    generatedFiles.push(outputPath);
  }

  return generatedFiles;
}

/**
 * 日単位の集計
 * @summary 指定日の全レコードを集計
 * @param date 対象日
 * @param cwd 作業ディレクトリ
 * @returns 生成された集計ファイルパス
 */
export function aggregateDaily(date: Date, cwd?: string): string | null {
  const paths = getAnalyticsPaths(cwd);

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const records = loadBehaviorRecords(dayStart, dayEnd, cwd);

  if (records.length === 0) {
    return null;
  }

  const aggregates = calculateAggregates(records, "day");
  if (!aggregates) {
    return null;
  }

  // 保存（ローカル日付を使用）
  const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;
  const outputDir = join(paths.aggregates, "daily");
  ensureDir(outputDir);

  const outputPath = join(outputDir, `${dateStr}.json`);
  writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");

  return outputPath;
}

/**
 * 週単位の集計
 * @summary 指定週の全レコードを集計
 * @param date 対象週の日付
 * @param cwd 作業ディレクトリ
 * @returns 生成された集計ファイルパス
 */
export function aggregateWeekly(date: Date, cwd?: string): string | null {
  const paths = getAnalyticsPaths(cwd);

  // 週の開始（月曜日）を計算
  const weekStart = new Date(date);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  // 週の終了（日曜日）
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const records = loadBehaviorRecords(weekStart, weekEnd, cwd);

  if (records.length === 0) {
    return null;
  }

  const aggregates = calculateAggregates(records, "week");
  if (!aggregates) {
    return null;
  }

  // ISO週番号を計算
  const weekNumber = getISOWeek(weekStart);

  // 保存
  const year = weekStart.getFullYear();
  const outputDir = join(paths.aggregates, "weekly");
  ensureDir(outputDir);

  const outputPath = join(outputDir, `${year}-W${weekNumber.toString().padStart(2, "0")}.json`);
  writeFileSync(outputPath, JSON.stringify(aggregates, null, 2), "utf-8");

  return outputPath;
}

// ============================================================================
// Full Aggregation
// ============================================================================

/**
 * 全期間の集計を実行
 * @summary 過去N日分の集計を生成
 * @param days 集計対象日数
 * @param cwd 作業ディレクトリ
 * @returns 生成されたファイル数
 */
export function runAggregation(days: number = 7, cwd?: string): {
  hourly: number;
  daily: number;
  weekly: number;
} {
  const result = {
    hourly: 0,
    daily: 0,
    weekly: 0,
  };

  for (let i = 0; i < days; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // 日次集計
    const dailyFile = aggregateDaily(date, cwd);
    if (dailyFile) {
      result.daily += 1;
    }

    // 時間集計
    const hourlyFiles = aggregateHourly(date, cwd);
    result.hourly += hourlyFiles.length;
  }

  // 週次集計（現在の週のみ）
  const weeklyFile = aggregateWeekly(new Date(), cwd);
  if (weeklyFile) {
    result.weekly = 1;
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * ディレクトリを確保
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * ISO週番号を取得
 */
function getISOWeek(date: Date): number {
  const tmpDate = new Date(date.valueOf());
  tmpDate.setHours(0, 0, 0, 0);
  // 木曜日を基準にする
  tmpDate.setDate(tmpDate.getDate() + 4 - (tmpDate.getDay() || 7));
  // 年初からの日数 / 7
  const yearStart = new Date(tmpDate.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((tmpDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNumber;
}

// ============================================================================
// Aggregates Loading
// ============================================================================

/**
 * 集計データを読み込み
 * @summary 指定期間・種別の集計データを読み込む
 * @param period 期間種別
 * @param startDate 開始日
 * @param endDate 終了日
 * @param cwd 作業ディレクトリ
 * @returns 集計データ配列
 */
export function loadAggregates(
  period: "hourly" | "daily" | "weekly",
  startDate: Date,
  endDate: Date,
  cwd?: string,
): LLMBehaviorAggregates[] {
  const paths = getAnalyticsPaths(cwd);
  const aggregateDir = join(paths.aggregates, period);

  if (!existsSync(aggregateDir)) {
    return [];
  }

  const files = readdirSync(aggregateDir).filter((f: string) => f.endsWith(".json"));

  const aggregates: LLMBehaviorAggregates[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(aggregateDir, file), "utf-8");
      const agg = JSON.parse(content) as LLMBehaviorAggregates;

      // 日付範囲チェック
      const aggStart = new Date(agg.startTime);
      if (aggStart >= startDate && aggStart <= endDate) {
        aggregates.push(agg);
      }
    } catch (error) {
      console.error('[analytics/aggregator] Failed to read analytics file:', join(aggregateDir, file), error);
    }
  }

  return aggregates.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * 最新の集計サマリーを取得
 * @summary 現在の状態を要約
 * @param cwd 作業ディレクトリ
 * @returns サマリー情報
 */
export function getAggregationSummary(cwd?: string): {
  today: LLMBehaviorAggregates | null;
  thisWeek: LLMBehaviorAggregates | null;
  last24Hours: LLMBehaviorAggregates[];
} {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // 今日の集計
  const todayAggregates = loadAggregates("daily", todayStart, now, cwd);
  const today = todayAggregates.length > 0 ? todayAggregates[todayAggregates.length - 1] : null;

  // 今週の集計
  const weekAggregates = loadAggregates("weekly", weekStart, now, cwd);
  const thisWeek = weekAggregates.length > 0 ? weekAggregates[weekAggregates.length - 1] : null;

  // 過去24時間の集計
  const last24Hours = loadAggregates("hourly", yesterday, now, cwd);

  return {
    today,
    thisWeek,
    last24Hours,
  };
}
