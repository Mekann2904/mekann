/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/types/recharts.d.ts
 * @role Type declarations for Recharts with Preact compatibility
 * @why Make Recharts work with Preact by widening type constraints
 * @related agent-usage-page.tsx, analytics-page.tsx
 * @public_api None (module augmentation)
 * @invariants None
 * @side_effects None
 * @failure_modes None
 *
 * @abdd.explain
 * @overview Type augmentations for Recharts library
 * @what_it_does Widens Recharts types to accept Preact VNodes
 * @why_it_exists Recharts expects React types, causing TS errors with Preact
 * @scope(in) None
 * @scope(out) Augmented type definitions
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "recharts" {
  import { ComponentType, VNode } from "preact";

  // Allow any component type for Recharts
  type AnyComponent = ComponentType<any> | VNode<any>;

  // Export all Recharts components with relaxed types
  export const ResponsiveContainer: AnyComponent;
  export const AreaChart: AnyComponent;
  export const Area: AnyComponent;
  export const BarChart: AnyComponent;
  export const Bar: AnyComponent;
  export const LineChart: AnyComponent;
  export const Line: AnyComponent;
  export const PieChart: AnyComponent;
  export const Pie: AnyComponent;
  export const CartesianGrid: AnyComponent;
  export const XAxis: AnyComponent;
  export const YAxis: AnyComponent;
  export const Tooltip: AnyComponent;
  export const Legend: AnyComponent;
  export const Cell: AnyComponent;
  export const Label: AnyComponent;
  export const ReferenceLine: AnyComponent;
  export const ReferenceDot: AnyComponent;
  export const ReferenceArea: AnyComponent;
  export const Brush: AnyComponent;
  export const ScatterChart: AnyComponent;
  export const Scatter: AnyComponent;
  export const RadarChart: AnyComponent;
  export const Radar: AnyComponent;
  export const RadialBarChart: AnyComponent;
  export const RadialBar: AnyComponent;
  export const Treemap: AnyComponent;
  export const Sankey: AnyComponent;
  export const SunburstChart: AnyComponent;
  export const FunnelChart: AnyComponent;
  export const Funnel: AnyComponent;
  export const ComposedChart: AnyComponent;
}

export {};
