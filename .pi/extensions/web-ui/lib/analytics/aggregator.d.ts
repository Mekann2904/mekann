// Path: .pi/extensions/web-ui/lib/analytics/aggregator.d.ts
// What: aggregator.js の公開 API に最小の型を与える
// Why: analytics route が集計モジュールを any なしで読めるようにする
// Related: .pi/extensions/web-ui/lib/analytics/aggregator.js, .pi/extensions/web-ui/src/routes/analytics.ts, .pi/extensions/web-ui/lib/analytics/efficiency-analyzer.d.ts

export interface AnalyticsAggregate {
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

export interface AnalyticsAggregationSummary {
  today: AnalyticsAggregate | null;
  thisWeek: AnalyticsAggregate | null;
  last24Hours: AnalyticsAggregate[];
}

export function loadAggregates(
  period: "hourly" | "daily" | "weekly",
  startDate: Date,
  endDate: Date,
  cwd?: string,
): AnalyticsAggregate[];

export function getAggregationSummary(cwd?: string): AnalyticsAggregationSummary;
