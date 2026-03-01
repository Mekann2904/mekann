/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/ui/chart.tsx
 * @role Recharts wrapper components for Preact
 * @why Provide shadcn/ui-compatible chart components for data visualization
 * @related context-usage-page.tsx, analytics-page.tsx
 * @public_api ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig, ChartLegend
 * @invariants Components must be Preact-compatible
 * @side_effects None
 * @failure_modes Invalid config, missing data
 *
 * @abdd.explain
 * @overview Recharts wrapper components following shadcn/ui patterns
 * @what_it_does Provides ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend for chart rendering
 * @why_it_exists Enables consistent chart styling and configuration across the app
 * @scope(in) Chart configuration, data
 * @scope(out) Rendered chart components
 */

import { h, FunctionalComponent } from "preact";
import { cn } from "@/lib/utils";

/**
 * @summary Chart configuration type
 */
export type ChartConfig = {
  [k: string]: {
    label?: string;
    color?: string;
  };
};

/**
 * @summary Chart container props
 */
interface ChartContainerProps {
  config: ChartConfig;
  children: preact.ComponentChildren;
  class?: string;
}

/**
 * @summary Container component for charts with CSS variable support
 */
export const ChartContainer: FunctionalComponent<ChartContainerProps> = ({
  config,
  children,
  class: className,
}) => {
  // CSS変数としてチャート色を設定
  const cssVariables = Object.entries(config).reduce((acc, [key, value]) => {
    if (value.color) {
      acc[`--color-${key}`] = value.color;
    }
    return acc;
  }, {} as Record<string, string>);

  return (
    <div
      class={cn("h-[350px] w-full", className)}
      style={cssVariables}
    >
      {children}
    </div>
  );
};

/**
 * @summary Chart tooltip props (recharts compatibility)
 */
interface ChartTooltipProps {
  content?: preact.ComponentType<ChartTooltipContentProps>;
  cursor?: boolean;
}

/**
 * @summary Tooltip wrapper for recharts
 */
export const ChartTooltip: FunctionalComponent<ChartTooltipProps> = () => {
  // rechartsがTooltipをレンダリングするため、ここはプレースホルダー
  return null;
};

/**
 * @summary Tooltip content props
 */
export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
  config?: ChartConfig;
}

/**
 * @summary Custom tooltip content component
 */
export const ChartTooltipContent: FunctionalComponent<ChartTooltipContentProps> = ({
  active,
  payload,
  label,
  config,
}) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div class="rounded-lg border bg-background p-2 shadow-sm">
      <div class="text-xs text-muted-foreground mb-1">{label}</div>
      {payload.map((item, index) => {
        const itemConfig = config?.[item.name];
        return (
          <div key={index} class="flex items-center gap-2 text-sm">
            <div
              class="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span class="text-muted-foreground">
              {itemConfig?.label ?? item.name}:
            </span>
            <span class="font-medium">{item.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * @summary Chart legend props
 */
interface ChartLegendProps {
  payload?: Array<{
    value: string;
    type: string;
    id: string;
    color: string;
  }>;
  config?: ChartConfig;
  class?: string;
}

/**
 * @summary Custom legend component for charts
 */
export const ChartLegend: FunctionalComponent<ChartLegendProps> = ({
  payload,
  config,
  class: className,
}) => {
  if (!payload?.length) {
    return null;
  }

  return (
    <div class={cn("flex flex-wrap items-center justify-center gap-4", className)}>
      {payload.map((item, index) => {
        const itemConfig = config?.[item.id];
        return (
          <div key={index} class="flex items-center gap-1.5 text-xs">
            <div
              class="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span class="text-muted-foreground">
              {itemConfig?.label ?? item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * @summary Chart legend content for recharts Legend component
 */
export function ChartLegendContent({ payload, config }: ChartLegendProps) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div class="flex flex-wrap items-center justify-center gap-4">
      {payload.map((entry, index) => {
        const itemConfig = config?.[entry.id];
        return (
          <div key={index} class="flex items-center gap-1.5 text-xs">
            <div
              class="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span class="text-muted-foreground">
              {itemConfig?.label ?? entry.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
