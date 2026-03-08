// Path: .pi/extensions/web-ui/lib/analytics/behavior-storage.d.ts
// What: behavior-storage.js の公開 API に最小の型を与える
// Why: root typecheck から dynamic import を安全に扱えるようにする
// Related: .pi/extensions/web-ui/lib/analytics/behavior-storage.js, .pi/extensions/web-ui/src/routes/analytics.ts, .pi/extensions/web-ui/lib/analytics/aggregator.js

export interface AnalyticsStorageStats {
  totalRecords: number;
  totalSizeBytes: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  dateDirCount: number;
}

export interface AnalyticsPaths {
  base: string;
  records: string;
  aggregates: string;
  anomalies: string;
}

export function getAnalyticsPaths(cwd?: string): AnalyticsPaths;
export function loadBehaviorRecords(startDate: Date, endDate: Date, cwd?: string): unknown[];
export function loadRecentRecords(limit: number, cwd?: string): unknown[];
export function getStorageStats(cwd?: string): AnalyticsStorageStats;
