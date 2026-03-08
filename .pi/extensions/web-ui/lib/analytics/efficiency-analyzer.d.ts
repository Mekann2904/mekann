// Path: .pi/extensions/web-ui/lib/analytics/efficiency-analyzer.d.ts
// What: efficiency-analyzer.js の公開 API に最小の型を与える
// Why: analytics route が集計計算関数を型付きで読めるようにする
// Related: .pi/extensions/web-ui/lib/analytics/efficiency-analyzer.js, .pi/extensions/web-ui/src/routes/analytics.ts, .pi/extensions/web-ui/lib/analytics/aggregator.d.ts

export interface CalculatedAggregate {
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

export function calculateAggregates(
  records: unknown[],
  period?: "hour" | "day" | "week",
): CalculatedAggregate | null;
