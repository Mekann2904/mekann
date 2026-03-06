/**
 * @path .pi/extensions/web-ui/web/src/components/benchmark-page.tsx
 * @role Agent benchmark の比較結果と最近の実行履歴を表示する。
 * @why Prompt Stack と Model Adapter の改善効果を Web UI で追跡するため。
 * @related ../app.tsx, ../../../src/routes/benchmark.ts, ../../../src/services/benchmark-service.ts
 */

import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  Activity,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  TimerReset,
  Trophy,
} from "lucide-preact";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageLayout,
  SimpleStatsCard,
  SPACING,
  StatsGrid,
  TYPOGRAPHY,
} from "./layout";

interface PromptLayerTokens {
  "tool-description": number;
  "system-policy": number;
  "startup-context": number;
  "runtime-notification": number;
}

interface AgentBenchmarkRun {
  variantId: string;
  scenarioId: string;
  completed: boolean;
  toolCalls: number;
  toolFailures: number;
  retries: number;
  emptyOutputs: number;
  turns: number;
  latencyMs?: number;
  promptChars?: number;
  runtimeNotificationCount?: number;
}

interface AgentBenchmarkVariantSummary {
  variantId: string;
  runCount: number;
  scenarioCount: number;
  completionRate: number;
  toolFailureRate: number;
  retryRate: number;
  emptyOutputRate: number;
  averageTurns: number;
  averageLatencyMs: number;
  averagePromptTokens: number;
  averageRuntimeNotificationCount: number;
  averagePromptLayerTokens: PromptLayerTokens;
}

interface BenchmarkStatusResponse {
  success: boolean;
  data: {
    cwd: string;
    variants: AgentBenchmarkVariantSummary[];
    recentRuns: AgentBenchmarkRun[];
    bestVariant: AgentBenchmarkVariantSummary | null;
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function formatPromptLayerLabel(layer: keyof PromptLayerTokens): string {
  if (layer === "tool-description") return "Tool";
  if (layer === "system-policy") return "Policy";
  if (layer === "startup-context") return "Startup";
  return "Runtime";
}

function truncateScenarioId(value: string): string {
  if (value.length <= 48) {
    return value;
  }

  return `${value.slice(0, 45)}...`;
}

function buildBenchmarkUrl(input: { variantId?: string }): string {
  const params = new URLSearchParams();
  if (input.variantId) {
    params.set("variantId", input.variantId);
  }

  const query = params.toString();
  return query ? `/api/v2/benchmark?${query}` : "/api/v2/benchmark";
}

export function BenchmarkPage() {
  const [status, setStatus] = useState<BenchmarkStatusResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantInput, setVariantInput] = useState("");
  const [appliedVariant, setAppliedVariant] = useState("");

  const fetchStatus = async (isRefresh = false, variantId = appliedVariant) => {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(buildBenchmarkUrl({ variantId }));
      if (!response.ok) {
        throw new Error("Failed to fetch benchmark status");
      }

      const payload = (await response.json()) as BenchmarkStatusResponse;
      setStatus(payload.data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus(false, appliedVariant);
  }, [appliedVariant]);

  const topVariant = status?.bestVariant ?? status?.variants[0] ?? null;
  const stats = useMemo(() => {
    if (!status) {
      return {
        totalRuns: 0,
        totalVariants: 0,
        averageNotifications: 0,
        averagePromptTokens: 0,
      };
    }

    const averageNotifications =
      status.variants.length > 0
        ? status.variants.reduce((sum, item) => sum + item.averageRuntimeNotificationCount, 0) /
          status.variants.length
        : 0;
    const averagePromptTokens =
      status.variants.length > 0
        ? status.variants.reduce((sum, item) => sum + item.averagePromptTokens, 0) / status.variants.length
        : 0;

    return {
      totalRuns: status.recentRuns.length,
      totalVariants: status.variants.length,
      averageNotifications,
      averagePromptTokens,
    };
  }, [status]);

  return (
    <PageLayout variant="default">
      <PageHeader
        title="Benchmark"
        description={status ? status.cwd : "Agent benchmark telemetry"}
        actions={
          <div class={cn("flex items-center", SPACING.element)}>
            <div class="relative">
              <Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={variantInput}
                onInput={(event) => setVariantInput((event.target as HTMLInputElement).value)}
                placeholder="variant filter"
                class="h-8 w-48 pl-7"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAppliedVariant(variantInput.trim())}
            >
              Apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStatus(true)}
              disabled={refreshing}
            >
              <RefreshCw class={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {loading && <LoadingState message="Benchmark data を読み込んでいます" />}

      {error && (
        <ErrorBanner
          message={`Error: ${error}`}
          onRetry={() => fetchStatus()}
          onDismiss={() => setError(null)}
        />
      )}

      {!loading && !error && status && (
        <>
          <Card class="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader class="pb-4">
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-2">
                  <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                    <Sparkles class="h-3.5 w-3.5 text-primary" />
                    Measured agent architecture performance
                  </div>
                  <CardTitle class="text-xl">
                    {topVariant ? topVariant.variantId : "No benchmark runs yet"}
                  </CardTitle>
                  <CardDescription class="max-w-2xl">
                    Prompt Stack と runtime notification の挙動を、variant 単位で比較します。
                  </CardDescription>
                </div>
                {topVariant && (
                  <div class="rounded-2xl border border-primary/20 bg-background/80 px-4 py-3 text-right shadow-sm">
                    <div class="flex items-center justify-end gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <Trophy class="h-3.5 w-3.5 text-primary" />
                      Best Variant
                    </div>
                    <div class="mt-2 text-2xl font-semibold text-primary">
                      {formatPercent(topVariant.completionRate)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      completion rate
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <StatsGrid cols={4}>
                <SimpleStatsCard value={stats.totalVariants} label="Variants" />
                <SimpleStatsCard value={stats.totalRuns} label="Recent runs" />
                <SimpleStatsCard
                  value={formatNumber(stats.averagePromptTokens)}
                  label="Avg prompt tokens"
                />
                <SimpleStatsCard
                  value={formatNumber(stats.averageNotifications)}
                  label="Avg runtime notices"
                />
              </StatsGrid>
            </CardContent>
          </Card>

          {status.variants.length === 0 ? (
            <EmptyState
              title="Benchmark data not found"
              description="loop_run または subagent_run_dag を実行すると benchmark 履歴が保存されます。"
            />
          ) : (
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle class="flex items-center gap-2">
                    <Activity class="h-4 w-4 text-primary" />
                    Variant Comparison
                  </CardTitle>
                  <CardDescription>
                    completion, retries, failures, prompt pressure
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-3">
                  {status.variants.map((variant) => (
                    <div
                      key={variant.variantId}
                      class="rounded-xl border border-border/60 bg-muted/20 p-4"
                    >
                      <div class="flex items-start justify-between gap-4">
                        <div>
                          <div class="font-medium">{variant.variantId}</div>
                          <div class="mt-1 text-xs text-muted-foreground">
                            {variant.runCount} runs / {variant.scenarioCount} scenarios
                          </div>
                        </div>
                        <div class="text-right">
                          <div class="text-lg font-semibold text-primary">
                            {formatPercent(variant.completionRate)}
                          </div>
                          <div class="text-xs text-muted-foreground">completion</div>
                        </div>
                      </div>

                      <div class="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        <SimpleStatsCard
                          value={formatPercent(variant.toolFailureRate)}
                          label="Tool failure"
                        />
                        <SimpleStatsCard
                          value={formatPercent(variant.retryRate)}
                          label="Retry"
                        />
                        <SimpleStatsCard
                          value={formatNumber(variant.averageTurns)}
                          label="Turns"
                        />
                        <SimpleStatsCard
                          value={formatNumber(variant.averageRuntimeNotificationCount)}
                          label="Runtime notices"
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle class="flex items-center gap-2">
                    <Layers3 class="h-4 w-4 text-primary" />
                    Prompt Layer Mix
                  </CardTitle>
                  <CardDescription>
                    best variant の layer 別平均 token
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-3">
                  {topVariant ? (
                    (Object.entries(topVariant.averagePromptLayerTokens) as Array<
                      [keyof PromptLayerTokens, number]
                    >).map(([layer, value]) => (
                      <div key={layer} class="space-y-1">
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-muted-foreground">
                            {formatPromptLayerLabel(layer)}
                          </span>
                          <span class={cn(TYPOGRAPHY.mono, "text-foreground")}>
                            {Math.round(value)} tok
                          </span>
                        </div>
                        <div class="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            class="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (value /
                                  Math.max(
                                    1,
                                    ...Object.values(topVariant.averagePromptLayerTokens),
                                  )) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No prompt layer data"
                      description="Benchmark run が保存されると layer 構成が表示されます。"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {status.recentRuns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2">
                  <TimerReset class="h-4 w-4 text-primary" />
                  Recent Runs
                </CardTitle>
                <CardDescription>
                  最近の実行を新しい順に表示します
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[760px] text-sm">
                    <thead class="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th class="pb-3">Variant</th>
                        <th class="pb-3">Scenario</th>
                        <th class="pb-3">Status</th>
                        <th class="pb-3 text-right">Turns</th>
                        <th class="pb-3 text-right">Tool failures</th>
                        <th class="pb-3 text-right">Retries</th>
                        <th class="pb-3 text-right">Prompt chars</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.recentRuns.map((run) => (
                        <tr key={`${run.variantId}:${run.scenarioId}`} class="border-t border-border/60">
                          <td class="py-3 font-medium">{run.variantId}</td>
                          <td class="py-3 text-muted-foreground">{truncateScenarioId(run.scenarioId)}</td>
                          <td class="py-3">
                            <span
                              class={cn(
                                "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                                run.completed
                                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400",
                              )}
                            >
                              {run.completed ? "completed" : "incomplete"}
                            </span>
                          </td>
                          <td class="py-3 text-right font-mono">{run.turns}</td>
                          <td class="py-3 text-right font-mono">{run.toolFailures}</td>
                          <td class="py-3 text-right font-mono">{run.retries}</td>
                          <td class="py-3 text-right font-mono">{run.promptChars ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageLayout>
  );
}
