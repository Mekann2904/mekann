// Path: .pi/lib/tool-telemetry-store.ts
// Role: 直近のツール実行履歴を保持し、重複検出と prompt hint 生成を行う
// Why: 実行観測を次のツール選択と timeout 判断に接続するため
// Related: .pi/lib/tool-telemetry.ts, .pi/lib/tool-policy-engine.ts, .pi/extensions/startup-context.ts

import {
  type ToolModeStats,
  type PendingToolExecution,
  type PromptHintOptions,
  type ToolExecutionRecord,
  type ToolStats,
  calculatePercentile,
} from "./tool-telemetry.js";

const DEFAULT_MAX_RECORDS = 300;
const DEFAULT_DUPLICATE_WINDOW_MS = 10_000;
const DEFAULT_SLOW_CALL_THRESHOLD_MS = 2_000;

class ToolTelemetryStore {
  private readonly maxRecords: number;
  private readonly records: ToolExecutionRecord[] = [];
  private readonly pending = new Map<string, PendingToolExecution>();

  constructor(maxRecords = DEFAULT_MAX_RECORDS) {
    this.maxRecords = maxRecords;
  }

  reset(): void {
    this.records.length = 0;
    this.pending.clear();
  }

  start(record: PendingToolExecution): PendingToolExecution {
    this.pending.set(record.id, record);
    return record;
  }

  finish(record: ToolExecutionRecord): ToolExecutionRecord {
    this.pending.delete(record.id);
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }
    return record;
  }

  getRecentRecords(limit = 50): ToolExecutionRecord[] {
    return this.records.slice(-limit);
  }

  findRecentDuplicate(signature: string, windowMs = DEFAULT_DUPLICATE_WINDOW_MS): ToolExecutionRecord | undefined {
    const cutoff = Date.now() - windowMs;
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record.finishedAtMs < cutoff) break;
      if (record.normalizedSignature === signature) {
        return record;
      }
    }
    return undefined;
  }

  findRecentExactDuplicate(inputFingerprint: string, windowMs = DEFAULT_DUPLICATE_WINDOW_MS): ToolExecutionRecord | undefined {
    const cutoff = Date.now() - windowMs;
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record.finishedAtMs < cutoff) break;
      if (record.inputFingerprint === inputFingerprint) {
        return record;
      }
    }
    return undefined;
  }

  getToolStats(toolName: string): ToolStats {
    const toolRecords = this.records.filter((record) => record.toolName === toolName);
    if (toolRecords.length === 0) {
      return {
        count: 0,
        successRate: 0,
        timeoutRate: 0,
        averageDurationMs: 0,
        p95DurationMs: 0,
        averageOutputBytes: 0,
        recentDuplicateCount: 0,
        probeToFullEscalationRate: 0,
        modeStats: {},
      };
    }

    const successes = toolRecords.filter((record) => record.success).length;
    const timeouts = toolRecords.filter((record) => record.timedOut).length;
    const duplicates = toolRecords.filter((record) => Boolean(record.duplicateOfId)).length;
    const durations = toolRecords.map((record) => record.durationMs);
    const outputBytes = toolRecords.map((record) => record.outputBytes);
    const lastRecord = toolRecords[toolRecords.length - 1];
    const modeStats = this.buildModeStats(toolRecords);
    const probeToFullEscalationRate = this.calculateProbeToFullEscalationRate(toolRecords);

    return {
      count: toolRecords.length,
      successRate: successes / toolRecords.length,
      timeoutRate: timeouts / toolRecords.length,
      averageDurationMs: durations.reduce((sum, value) => sum + value, 0) / toolRecords.length,
      p95DurationMs: calculatePercentile(durations, 95),
      averageOutputBytes: outputBytes.reduce((sum, value) => sum + value, 0) / toolRecords.length,
      recentDuplicateCount: duplicates,
      probeToFullEscalationRate,
      modeStats,
      lastUsedAtMs: lastRecord?.finishedAtMs,
    };
  }

  buildPromptHints(options: PromptHintOptions = {}): string[] {
    const maxHints = options.maxHints ?? 4;
    const slowCallThresholdMs = options.slowCallThresholdMs ?? DEFAULT_SLOW_CALL_THRESHOLD_MS;
    const duplicateWindowMs = options.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
    const recent = this.getRecentRecords(30);
    const hints: string[] = [];

    const slowRecords = recent
      .filter((record) => record.durationMs >= slowCallThresholdMs)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 2);
    for (const record of slowRecords) {
      hints.push(`Slow tool: ${record.toolName} took ${record.durationMs}ms`);
    }

    const timedOut = recent.filter((record) => record.timedOut).slice(-2);
    for (const record of timedOut) {
      hints.push(`Recent timeout: ${record.toolName} hit ${record.timeoutMs}ms`);
    }

    const duplicates = new Map<string, number>();
    const cutoff = Date.now() - duplicateWindowMs;
    for (const record of recent) {
      if (record.finishedAtMs < cutoff) continue;
      duplicates.set(record.normalizedSignature, (duplicates.get(record.normalizedSignature) ?? 0) + 1);
    }
    for (const [signature, count] of duplicates.entries()) {
      if (count < 2) continue;
      const toolName = signature.split(":")[0] ?? "tool";
      hints.push(`Duplicate call: ${toolName} repeated ${count} times recently`);
    }

    const toolNames = [...new Set(recent.map((record) => record.toolName))];
    for (const toolName of toolNames) {
      const stats = this.getToolStats(toolName);
      if (stats.modeStats.probe?.count && stats.probeToFullEscalationRate >= 0.5) {
        hints.push(
          `Probe escalates often: ${toolName} promotes to full ${Math.round(stats.probeToFullEscalationRate * 100)}% of the time`
        );
      }
    }

    return [...new Set(hints)].slice(0, maxHints);
  }

  private buildModeStats(toolRecords: ToolExecutionRecord[]): Partial<Record<"probe" | "full", ToolModeStats>> {
    const modes: Array<"probe" | "full"> = ["probe", "full"];
    const result: Partial<Record<"probe" | "full", ToolModeStats>> = {};

    for (const mode of modes) {
      const records = toolRecords.filter((record) => record.executionMode === mode);
      if (records.length === 0) continue;

      const durations = records.map((record) => record.durationMs);
      result[mode] = {
        count: records.length,
        successRate: records.filter((record) => record.success).length / records.length,
        timeoutRate: records.filter((record) => record.timedOut).length / records.length,
        averageDurationMs: durations.reduce((sum, value) => sum + value, 0) / records.length,
        p95DurationMs: calculatePercentile(durations, 95),
      };
    }

    return result;
  }

  private calculateProbeToFullEscalationRate(toolRecords: ToolExecutionRecord[]): number {
    const latestBySignature = new Map<string, { probe: boolean; full: boolean }>();

    for (const record of toolRecords) {
      const entry = latestBySignature.get(record.normalizedSignature) ?? { probe: false, full: false };
      if (record.executionMode === "probe") {
        entry.probe = true;
      }
      if (record.executionMode === "full") {
        entry.full = true;
      }
      latestBySignature.set(record.normalizedSignature, entry);
    }

    const probed = [...latestBySignature.values()].filter((entry) => entry.probe);
    if (probed.length === 0) {
      return 0;
    }

    const escalated = probed.filter((entry) => entry.full).length;
    return escalated / probed.length;
  }
}

let sharedStore: ToolTelemetryStore | null = null;

export function getToolTelemetryStore(): ToolTelemetryStore {
  if (!sharedStore) {
    sharedStore = new ToolTelemetryStore();
  }
  return sharedStore;
}

export function resetToolTelemetryStore(): void {
  getToolTelemetryStore().reset();
}
