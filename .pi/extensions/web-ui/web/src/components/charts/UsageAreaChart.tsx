/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/charts/UsageAreaChart.tsx
 * @role Reusable area chart for usage visualization
 * @why Extract chart rendering from agent-usage-page.tsx (915 lines) to reduce complexity
 * @related agent-usage-page.tsx
 * @public_api UsageAreaChart, UsageAreaChartProps
 * @invariants Chart data is properly formatted
 * @side_effects None (pure presentation)
 * @failure_modes Invalid data format
 *
 * @abdd.explain
 * @overview Area chart component for usage statistics
 * @what_it_does Renders cumulative or rate area chart with tool calls and errors
 * @why_it_exists Reduces agent-usage-page.tsx complexity by extracting chart logic
 * @scope(in) Chart data, chart type, colors
 * @scope(out) Rendered area chart
 */

import { h } from "preact";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { CHART_TOOLTIP_STYLE } from "../layout";

export interface ChartDataPoint {
  time: string;
  timestamp: number;
  calls: number;
  errors: number;
  contextRatio: number;
  cumulativeCalls: number;
  cumulativeErrors: number;
}

export interface UsageAreaChartProps {
  data: ChartDataPoint[];
  chartType: "cumulative" | "rate";
  height?: number;
  className?: string;
}

const CHART_COLORS = {
  calls: "hsl(var(--chart-1))",
  errors: "hsl(var(--chart-2))",
  context: "hsl(var(--chart-3))",
};

export function UsageAreaChart({
  data,
  chartType,
  height = 250,
  className,
}: UsageAreaChartProps) {
  if (data.length === 0) {
    return (
      <div class={cn("flex items-center justify-center text-muted-foreground", className)} style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <div class={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9 }}
            class="text-muted-foreground"
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            class="text-muted-foreground"
            tickFormatter={(value: number) => value.toLocaleString()}
            allowDecimals={false}
            width={50}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number | undefined, name: string | undefined) => [
              value?.toLocaleString() ?? "0",
              name ?? "",
            ]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey={chartType === "cumulative" ? "cumulativeCalls" : "calls"}
            name={chartType === "cumulative" ? "Total Calls" : "Calls"}
            stroke={CHART_COLORS.calls}
            fill={CHART_COLORS.calls}
            fillOpacity={0.3}
            isAnimationActive
            animationDuration={300}
          />
          <Area
            type="monotone"
            dataKey={chartType === "cumulative" ? "cumulativeErrors" : "errors"}
            name={chartType === "cumulative" ? "Total Errors" : "Errors"}
            stroke={CHART_COLORS.errors}
            fill={CHART_COLORS.errors}
            fillOpacity={0.3}
            isAnimationActive
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface ContextAreaChartProps {
  data: ChartDataPoint[];
  height?: number;
  className?: string;
}

export function ContextAreaChart({ data, height = 150, className }: ContextAreaChartProps) {
  if (data.length === 0) {
    return (
      <div class={cn("flex items-center justify-center text-muted-foreground", className)} style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <div class={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9 }}
            class="text-muted-foreground"
            interval="preserveStartEnd"
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            class="text-muted-foreground"
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            domain={[0, 100]}
            width={40}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`, "Context"]}
          />
          <Area
            type="monotone"
            dataKey="contextRatio"
            name="Context Usage"
            stroke={CHART_COLORS.context}
            fill={CHART_COLORS.context}
            fillOpacity={0.3}
            isAnimationActive
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
