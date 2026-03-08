// Path: .pi/extensions/web-ui/lib/analytics/anomaly-detector.d.ts
// What: anomaly-detector.js の公開 API に最小の型を与える
// Why: analytics route が異常検知サマリーを型付きで読めるようにする
// Related: .pi/extensions/web-ui/lib/analytics/anomaly-detector.js, .pi/extensions/web-ui/src/routes/analytics.ts, .pi/extensions/web-ui/lib/analytics/efficiency-analyzer.d.ts

export interface AnalyticsAnomalySummary {
  totalAnomalies: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  recentAnomalies: unknown[];
}

export function getAnomalySummary(cwd?: string): AnalyticsAnomalySummary;
