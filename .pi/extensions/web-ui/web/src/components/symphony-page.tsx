/**
 * @path .pi/extensions/web-ui/web/src/components/symphony-page.tsx
 * @role Symphony 風 orchestration 状態を表示する専用ページ
 * @why workflow contract と自走状態を 1 画面で監視できるようにするため
 * @related ../hooks/useSymphonyStatus.ts, ../app.tsx, ./runtime-status-panel.tsx, ./layout/index.ts
 */

import { RefreshCw, Waypoints, FileText, ListTodo, Bot, CheckCircle2 } from "lucide-preact";
import { route } from "preact-router";
import { Button } from "./ui/button";
import {
  PageLayout,
  PageHeader,
  StatsGrid,
  StatsCard,
  ErrorBanner,
  LoadingState,
} from "./layout";
import { useSymphonyStatus } from "../hooks/useSymphonyStatus";

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div class="flex items-center justify-between text-sm">
      <span class="text-muted-foreground">{label}</span>
      <span class={value ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
        {value ? "on" : "off"}
      </span>
    </div>
  );
}

function buildCandidateReasonCounts(
  candidates: Array<{
    reason: string;
    eligible: boolean;
    blockedBy?: Array<{
      id: string | null;
      identifier: string | null;
      state: string | null;
    }>;
  }>,
): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    if (candidate.eligible) {
      continue;
    }
    counts.set(candidate.reason, (counts.get(candidate.reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function buildBlockerCounts(
  candidates: Array<{
    reason: string;
    blockedBy?: Array<{
      id: string | null;
      identifier: string | null;
      state: string | null;
    }>;
  }>,
): Array<{ key: string; label: string; state: string | null; count: number }> {
  const counts = new Map<string, { key: string; label: string; state: string | null; count: number }>();

  for (const candidate of candidates) {
    if (candidate.reason !== "blocked-by-active-issue") {
      continue;
    }

    for (const blocker of candidate.blockedBy ?? []) {
      const key = blocker.identifier ?? blocker.id ?? "unknown";
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }

      counts.set(key, {
        key,
        label: blocker.identifier ?? blocker.id ?? "unknown",
        state: blocker.state ?? null,
        count: 1,
      });
    }
  }

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

export function SymphonyPage() {
  const {
    snapshot,
    loading,
    error,
    actionError,
    refresh,
    startOrchestrator,
    stopOrchestrator,
    tickOrchestrator,
  } = useSymphonyStatus();
  const candidateReasonCounts = buildCandidateReasonCounts(snapshot?.scheduler.candidates ?? []);
  const blockerCounts = buildBlockerCounts(snapshot?.scheduler.candidates ?? []);

  const navigateToTask = (taskId: string | null) => {
    if (!taskId) {
      return;
    }
    route(`/tasks?taskId=${encodeURIComponent(taskId)}`);
  };

  if (loading && !snapshot) {
    return (
      <div class="flex h-full items-center justify-center">
        <LoadingState message="Symphony snapshot を読み込んでいます" size="lg" showCard={false} />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <PageLayout>
        <PageHeader
          title="Symphony"
          description="agent-first orchestration snapshot"
          actions={<Button size="sm" variant="outline" onClick={refresh}><RefreshCw class="h-4 w-4" /></Button>}
        />
        {error && <ErrorBanner message={error} onRetry={refresh} />}
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Symphony"
        description={`mekann on ${snapshot.workflow.runtimeKind} · generated_at: ${snapshot.generatedAt}`}
        actions={(
          <div class="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={tickOrchestrator}>
              Tick
            </Button>
            {snapshot.orchestrator.running ? (
              <Button size="sm" variant="outline" onClick={stopOrchestrator}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startOrchestrator}>
                Start
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw class="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        )}
      />

      {error && <ErrorBanner message={error} onRetry={refresh} onDismiss={() => undefined} />}
      {actionError && <ErrorBanner message={`action: ${actionError}`} onRetry={refresh} onDismiss={() => undefined} />}
      {snapshot.health.trackerStatus === "error" && snapshot.health.lastTrackerError && (
        <ErrorBanner
          message={`tracker: ${snapshot.health.lastTrackerError}`}
          onRetry={refresh}
          onDismiss={() => undefined}
        />
      )}

      <StatsGrid cols={4}>
        <StatsCard label="Orchestrator" value={snapshot.orchestrator.running ? "running" : "stopped"} />
        <StatsCard label="Eligible" value={snapshot.scheduler.eligibleCount} />
        <StatsCard label="Running" value={snapshot.orchestration.running} />
        <StatsCard label="Workpads" value={snapshot.workpads.total} />
      </StatsGrid>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section class="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Waypoints class="h-4 w-4 text-primary" />
            <h2 class="text-base font-semibold">Workflow Contract</h2>
          </div>
          <div class="space-y-2">
            <p class="text-sm text-muted-foreground break-all">{snapshot.workflow.path}</p>
            <p class="text-sm text-muted-foreground break-all">workspace_root: {snapshot.workflow.workspaceRoot}</p>
            <p class="text-sm text-muted-foreground">
              tracker: {snapshot.workflow.trackerKind}
              {snapshot.workflow.trackerProjectSlug ? ` (${snapshot.workflow.trackerProjectSlug})` : ""}
            </p>
            <p class="text-sm text-muted-foreground">
              tracker_status: {snapshot.health.trackerStatus}
            </p>
            {snapshot.health.lastTrackerError && (
              <p class="text-sm text-red-600 dark:text-red-400">
                tracker_error: {snapshot.health.lastTrackerError}
              </p>
            )}
            <p class="text-sm text-muted-foreground">runtime: {snapshot.workflow.runtimeKind}</p>
            <p class="text-sm">{snapshot.workflow.bodyPreview || "No prompt body"}</p>
            <div class="rounded-lg border border-border/60 p-3 text-sm">
              <p>loop: {snapshot.orchestrator.running ? "running" : "stopped"}</p>
              <p class="text-muted-foreground">poll_interval_ms: {snapshot.orchestrator.pollIntervalMs}</p>
              <p class="text-muted-foreground">tick_count: {snapshot.orchestrator.tickCount}</p>
              <p class="text-muted-foreground">last_tick_at: {snapshot.orchestrator.lastTickAt || "-"}</p>
              {snapshot.orchestrator.lastError && (
                <p class="text-red-600 dark:text-red-400">last_error: {snapshot.orchestrator.lastError}</p>
              )}
            </div>
            <div class="space-y-1 rounded-lg bg-muted/30 p-3">
              <BoolRow label="single in-progress" value={snapshot.workflow.completionGate.singleInProgress} />
              <BoolRow label="proof artifacts" value={snapshot.workflow.completionGate.proofArtifacts} />
              <BoolRow label="workspace verification" value={snapshot.workflow.completionGate.workspaceVerification} />
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entrypoints</p>
              <p class="mt-1 text-sm">{snapshot.workflow.entrypoints.join(", ") || "-"}</p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required Commands</p>
              <p class="mt-1 text-sm">{snapshot.workflow.requiredCommands.join(", ") || "-"}</p>
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <ListTodo class="h-4 w-4 text-primary" />
            <h2 class="text-base font-semibold">Task Queue</h2>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg bg-muted/30 p-3">todo: {snapshot.taskQueue.todo}</div>
            <div class="rounded-lg bg-muted/30 p-3">in_progress: {snapshot.taskQueue.inProgress}</div>
            <div class="rounded-lg bg-muted/30 p-3">completed: {snapshot.taskQueue.completed}</div>
            <div class="rounded-lg bg-muted/30 p-3">failed: {snapshot.taskQueue.failed}</div>
            <div class="rounded-lg bg-muted/30 p-3">verify_passed: {snapshot.taskQueue.workspaceVerificationPassed}</div>
            <div class="rounded-lg bg-muted/30 p-3">verify_failed: {snapshot.taskQueue.workspaceVerificationFailed}</div>
            <div class="rounded-lg bg-muted/30 p-3">gate_blocked: {snapshot.taskQueue.completionGateBlocked}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scheduler</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-sm xl:grid-cols-4">
              <div class="rounded bg-muted/30 px-3 py-2">eligible: {snapshot.scheduler.eligibleCount}</div>
              <div class="rounded bg-muted/30 px-3 py-2">blocked: {snapshot.scheduler.blockedCount}</div>
              <div class="rounded bg-muted/30 px-3 py-2">terminal: {snapshot.scheduler.terminalCount}</div>
              <div class="rounded bg-muted/30 px-3 py-2">retry_wait: {snapshot.taskQueue.retryScheduled}</div>
            </div>
            <div class="mt-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Blocked Reasons</p>
              {candidateReasonCounts.length > 0 ? (
                <div class="mt-2 flex flex-wrap gap-2">
                  {candidateReasonCounts.map((item) => (
                    <div key={item.reason} class="rounded bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                      {item.reason}: {item.count}
                    </div>
                  ))}
                </div>
              ) : (
                <p class="mt-2 text-sm text-muted-foreground">No blocked candidates</p>
              )}
            </div>
            <div class="mt-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top Blockers</p>
              {blockerCounts.length > 0 ? (
                <div class="mt-2 space-y-2">
                  {blockerCounts.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      class="w-full rounded bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                      onClick={() => navigateToTask(item.key)}
                    >
                      {item.label}
                      {item.state ? ` (${item.state})` : ""}
                      {`: ${item.count}`}
                    </button>
                  ))}
                </div>
              ) : (
                <p class="mt-2 text-sm text-muted-foreground">No blocker bottleneck</p>
              )}
            </div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Task</p>
            {snapshot.scheduler.nextEligibleTask ? (
              <div class="mt-2">
                <p class="font-medium">{snapshot.scheduler.nextEligibleTask.title}</p>
                <p class="text-sm text-muted-foreground">
                  {snapshot.scheduler.nextEligibleTask.id} · {snapshot.scheduler.nextEligibleTask.priority} · {snapshot.scheduler.nextEligibleTask.status}
                </p>
              </div>
            ) : (
              <p class="mt-2 text-sm text-muted-foreground">No queued task</p>
            )}
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">UL Workflow</p>
            <p class="mt-2 text-sm">total: {snapshot.ulWorkflow.total}</p>
            <p class="text-sm text-muted-foreground">
              active: {snapshot.ulWorkflow.activeTaskId ?? "-"} {snapshot.ulWorkflow.activePhase ? `(${snapshot.ulWorkflow.activePhase})` : ""}
            </p>
          </div>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section class="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <FileText class="h-4 w-4 text-primary" />
            <h2 class="text-base font-semibold">Latest Workpad</h2>
          </div>
          {snapshot.workpads.latest ? (
            <div class="space-y-3">
              <div>
                <p class="font-medium">{snapshot.workpads.latest.task}</p>
                <p class="text-xs text-muted-foreground">{snapshot.workpads.latest.id} · {snapshot.workpads.latest.updatedAt}</p>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
                <div class="mt-1 whitespace-pre-wrap text-sm">{snapshot.workpads.latest.sections.progress || "-"}</div>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification</p>
                <div class="mt-1 whitespace-pre-wrap text-sm">{snapshot.workpads.latest.sections.verification || "-"}</div>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next</p>
                <div class="mt-1 whitespace-pre-wrap text-sm">{snapshot.workpads.latest.sections.next || "-"}</div>
              </div>
            </div>
          ) : (
            <p class="text-sm text-muted-foreground">No workpad yet</p>
          )}
        </section>

        <section class="rounded-xl border border-border/60 bg-card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Bot class="h-4 w-4 text-primary" />
            <h2 class="text-base font-semibold">Runtime</h2>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg bg-muted/30 p-3">active_llm: {snapshot.runtime?.activeLlm ?? 0}</div>
            <div class="rounded-lg bg-muted/30 p-3">active_requests: {snapshot.runtime?.activeRequests ?? 0}</div>
            <div class="rounded-lg bg-muted/30 p-3">running: {snapshot.orchestration.running}</div>
            <div class="rounded-lg bg-muted/30 p-3">queued: {snapshot.orchestration.claimed + snapshot.orchestration.retrying}</div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orchestration State</p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div class="rounded bg-muted/30 px-3 py-2">claimed: {snapshot.orchestration.claimed}</div>
              <div class="rounded bg-muted/30 px-3 py-2">retrying: {snapshot.orchestration.retrying}</div>
              <div class="rounded bg-muted/30 px-3 py-2">released: {snapshot.orchestration.released}</div>
              <div class="rounded bg-muted/30 px-3 py-2">tracked: {snapshot.orchestration.totalTracked}</div>
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Orchestrations</p>
            <div class="mt-2 space-y-2">
              {snapshot.orchestration.recent.length > 0 ? snapshot.orchestration.recent.map((item) => (
                <div key={`${item.issueId}-${item.updatedAt}`} class="rounded-lg border border-border/60 p-3">
                  <p class="text-sm font-medium">{item.title || item.issueId}</p>
                  <p class="text-xs text-muted-foreground">{item.issueId} · {item.runState} · {item.updatedAt}</p>
                  {item.reason && (
                    <p class="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                  )}
                </div>
              )) : (
                <p class="text-sm text-muted-foreground">No recent orchestration state</p>
              )}
            </div>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Candidates</p>
            <div class="mt-2 space-y-2">
              {snapshot.scheduler.candidates.length > 0 ? snapshot.scheduler.candidates.slice(0, 5).map((item) => (
                <div key={item.id} class="rounded-lg border border-border/60 p-3">
                  <p class="text-sm font-medium">{item.title}</p>
                  <p class="text-xs text-muted-foreground">
                    {item.id} · {item.priority} · {item.status} · {item.eligible ? "eligible" : "blocked"}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                  {item.blockedBy && item.blockedBy.length > 0 && (
                    <div class="mt-2 space-y-1">
                      {item.blockedBy.map((blocker) => (
                        <p key={`${item.id}-${blocker.identifier ?? blocker.id ?? "blocker"}`} class="text-[11px] text-muted-foreground">
                          blocked by: {blocker.identifier ?? blocker.id ?? "unknown"}{blocker.state ? ` (${blocker.state})` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.reason === "retry-delayed" && (
                    <p class="mt-1 text-[11px] text-muted-foreground">
                      waiting for retry window
                    </p>
                  )}
                </div>
              )) : (
                <p class="text-sm text-muted-foreground">No scheduler candidates</p>
              )}
            </div>
          </div>
          <div class="rounded-lg border border-border/60 p-3">
            <div class="flex items-center gap-2">
              <CheckCircle2 class="h-4 w-4 text-green-600 dark:text-green-400" />
              <p class="text-sm font-medium">Operator posture</p>
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              This page is read-only. It shows the mekann extension contract for pi-mono, current task queue, runtime load, and durable workpads in one place.
            </p>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
