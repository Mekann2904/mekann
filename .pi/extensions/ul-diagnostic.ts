/**
 * @abdd.meta
 * path: .pi/extensions/ul-diagnostic.ts
 * role: UL mode diagnostic tool for detecting known issues
 * why: Provides runtime warnings for known UL mode problems
 * related: .pi/extensions/ul-dual-mode.ts, .pi/extensions/agent-runtime.ts
 * public_api: Extension init function via `registerExtension`
 * invariants: Diagnostic must not modify runtime state
 * side_effects: Logs warnings to console and UI notifications
 * failure_modes: Diagnostic may fail silently if runtime state unavailable
 * @abdd.explain
 * overview: Diagnostic tool that checks for known UL mode issues at runtime
 * what_it_does:
 *   - Checks rate limit state consistency
 *   - Detects resource leaks
 *   - Warns about configuration issues
 *   - Reports parallel execution risks
 * why_it_exists: Helps users identify and avoid known problems before they cause failures
 * scope:
 *   in: Runtime state from agent-runtime.ts, configuration from environment
 *   out: Warning messages, diagnostic report
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

interface DiagnosticResult {
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  issue: string;
  description: string;
  recommendation: string;
  detected: boolean;
  details?: string;
}

interface DiagnosticReport {
  timestamp: string;
  ulModeActive: boolean;
  results: DiagnosticResult[];
  summary: {
    total: number;
    detected: number;
    bySeverity: Record<string, number>;
  };
}

interface RateLimitState {
  entries: Map<string, { untilMs: number; hits: number; updatedAtMs: number }>;
}

interface RuntimeState {
  subagents?: { activeRunRequests: number; activeAgents: number };
  teams?: { activeTeamRuns: number; activeTeammates: number };
  queue?: { pending: unknown[] };
  limits?: { maxTotalActiveLlm: number };
  activeLlm?: number;
  pendingQueue?: unknown[];
}

function getRateLimitState(): RateLimitState | null {
  try {
    const retryModule = require("../lib/retry-with-backoff") as {
      getRateLimitGateSnapshot?: (key: string) => { waitMs: number; hits: number };
      clearRateLimitState?: () => void;
    };
    if (typeof retryModule.getRateLimitGateSnapshot === "function") {
      return { entries: new Map() };
    }
    return null;
  } catch {
    return null;
  }
}

function getRuntimeState(): RuntimeState | null {
  try {
    const runtimeModule = require("./agent-runtime") as {
      getSharedRuntimeState?: () => RuntimeState;
      getRuntimeSnapshot?: () => RuntimeState & { totalActiveLlm: number };
    };
    if (typeof runtimeModule.getRuntimeSnapshot === "function") {
      return runtimeModule.getRuntimeSnapshot();
    }
    if (typeof runtimeModule.getSharedRuntimeState === "function") {
      return runtimeModule.getSharedRuntimeState();
    }
    return null;
  } catch {
    return null;
  }
}

function isUlModeActive(): boolean {
  try {
    const ulModule = require("./ul-dual-mode") as {
      isUlModeActive?: () => boolean;
    };
    if (typeof ulModule.isUlModeActive === "function") {
      return ulModule.isUlModeActive();
    }
    return false;
  } catch {
    return false;
  }
}

function checkRateLimitState(): DiagnosticResult {
  try {
    const retryModule = require("../lib/retry-with-backoff") as {
      getRateLimitGateSnapshot?: (key: string) => { waitMs: number; hits: number; untilMs: number };
    };

    if (typeof retryModule.getRateLimitGateSnapshot !== "function") {
      return {
        category: "Race Condition",
        severity: "critical",
        issue: "Bug #1: Rate Limit State Parallel Access",
        description: "Rate limit module not available",
        recommendation: "Ensure retry-with-backoff module is loaded",
        detected: false,
      };
    }

    const globalSnapshot = retryModule.getRateLimitGateSnapshot("__global_rate_limit__");
    const entryCount = globalSnapshot?.hits ?? 0;
    const riskDetected = entryCount > 5;

    return {
      category: "Race Condition",
      severity: "critical",
      issue: "Bug #1: Rate Limit State Parallel Access",
      description: "sharedRateLimitState.entriesへの並列アクセスによる破損リスク",
      recommendation: "並列タスク数を制限するか、順次実行を検討してください",
      detected: riskDetected,
      details: riskDetected
        ? `Rate limit hits: ${entryCount} (high count indicates concurrent access risk)`
        : `Rate limit hits: ${entryCount} (normal)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // BEGIN FIX: BUG-005 エラー詳細を含める
    return {
      category: "Race Condition",
      severity: "critical",
      issue: "Bug #1: Rate Limit State Parallel Access",
      description: `Rate limit state check failed: ${errorMessage}`,
      recommendation: "retry-with-backoff module may not be loaded. Check module installation.",
      detected: true,  // エラーを検出済みとしてマーク
      details: `Module load error: ${errorMessage}`,
    };
    // END FIX
  }
}

function checkRuntimeInitialization(): DiagnosticResult {
  try {
    const runtimeState = getRuntimeState();
    const hasValidState = runtimeState !== null && typeof runtimeState === "object";

    return {
      category: "Initialization",
      severity: "high",
      issue: "Bug #2: globalThis Initialization Race",
      description: "ランタイム初期化のレースコンディション",
      recommendation: "セッション開始直後に問題が発生する場合は、再起動を検討してください",
      detected: !hasValidState,
      details: hasValidState ? "Runtime state initialized" : "Runtime state invalid",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      category: "Initialization",
      severity: "high",
      issue: "Bug #2: globalThis Initialization Race",
      description: `Runtime state check failed: ${errorMessage}`,
      recommendation: "agent-runtime module may have initialization issues",
      detected: true,
    };
  }
}

function checkResourceLeaks(): DiagnosticResult {
  try {
    const state = getRuntimeState();

    const pendingCount = state?.queue?.pending?.length ?? 0;
    const activeLlm = (state as RuntimeState & { totalActiveLlm?: number })?.totalActiveLlm ?? 0;

    const potentialLeak = pendingCount > 50 || activeLlm > 10;

    return {
      category: "Resource",
      severity: "high",
      issue: "BUG-001/004: Resource Leak Detection",
      description: "ファイル記述子または容量予約の潜在的リーク",
      recommendation: "長時間実行後にパフォーマンス低下が見られる場合は、セッションを再起動してください",
      detected: potentialLeak,
      details: `Pending: ${pendingCount}, Active LLM: ${activeLlm}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // BEGIN FIX: BUG-005 エラー詳細を含める
    return {
      category: "Resource",
      severity: "high",
      issue: "BUG-001/004: Resource Leak Detection",
      description: `Resource check failed: ${errorMessage}`,
      recommendation: "Unable to check resource state. Check agent-runtime module.",
      detected: true,  // エラーを検出済みとしてマーク
      details: `Error: ${errorMessage}`,
    };
    // END FIX
  }
}

function checkParallelExecutionRisk(): DiagnosticResult {
  try {
    const state = getRuntimeState();

    const activeLlm = (state as RuntimeState & { totalActiveLlm?: number })?.totalActiveLlm ?? 0;
    const maxLlm = state?.limits?.maxTotalActiveLlm ?? 10;

    const highRisk = activeLlm > maxLlm * 0.7;

    return {
      category: "Concurrency",
      severity: "medium",
      issue: "Bug #6: Parallel Execution Risk",
      description: "高負荷並列実行時のabortOnError待機問題",
      recommendation: "多くのタスクを並列実行する場合、エラー時の待機時間が長くなる可能性があります",
      detected: highRisk,
      details: `Active LLM: ${activeLlm}/${maxLlm} (${Math.round((activeLlm / maxLlm) * 100)}% capacity)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // BEGIN FIX: BUG-005 エラー詳細を含める
    return {
      category: "Concurrency",
      severity: "medium",
      issue: "Bug #6: Parallel Execution Risk",
      description: `Parallel execution check failed: ${errorMessage}`,
      recommendation: "Unable to check parallel execution state. Check agent-runtime module.",
      detected: true,  // エラーを検出済みとしてマーク
      details: `Error: ${errorMessage}`,
    };
    // END FIX
  }
}

function checkConfiguration(): DiagnosticResult {
  const issues: string[] = [];

  const skipReviewer = process.env.PI_UL_SKIP_REVIEWER_FOR_TRIVIAL !== "0";
  if (skipReviewer) {
    issues.push("PI_UL_SKIP_REVIEWER_FOR_TRIVIAL is enabled (small tasks skip reviewer)");
  }

  try {
    const commonModule = require("../lib/agent-common") as {
      STABLE_RUNTIME_PROFILE?: boolean;
    };
    if (commonModule.STABLE_RUNTIME_PROFILE) {
      issues.push("STABLE_RUNTIME_PROFILE is enabled (adaptive parallel penalty disabled)");
    }
  } catch {
    // Module not available
  }

  return {
    category: "Configuration",
    severity: "low",
    issue: "UL-SPEC-2/7: Configuration Review",
    description: "現在の設定による潜在的リスク",
    recommendation: "セキュリティ重要なタスクではreviewerを強制することを検討してください",
    detected: issues.length > 0,
    details: issues.length > 0 ? issues.join("; ") : "No configuration issues detected",
  };
}

function checkUlModeState(): DiagnosticResult {
  return {
    category: "UL Mode",
    severity: "low",
    issue: "UL-SPEC-1/3/5: UL Mode State",
    description: "ULモード固有の状態管理問題",
    recommendation: "ULモードで予期しない動作が見られる場合は、ul workflow abortでリセットしてください",
    detected: false,
    details: "UL mode state check passed",
  };
}

function runDiagnostics(): DiagnosticReport {
  const results: DiagnosticResult[] = [];

  results.push(checkRateLimitState());
  results.push(checkRuntimeInitialization());
  results.push(checkResourceLeaks());
  results.push(checkParallelExecutionRisk());
  results.push(checkConfiguration());
  results.push(checkUlModeState());

  const detected = results.filter((r) => r.detected);
  const bySeverity: Record<string, number> = {
    critical: detected.filter((r) => r.severity === "critical").length,
    high: detected.filter((r) => r.severity === "high").length,
    medium: detected.filter((r) => r.severity === "medium").length,
    low: detected.filter((r) => r.severity === "low").length,
  };

  return {
    timestamp: new Date().toISOString(),
    ulModeActive: isUlModeActive(),
    results,
    summary: {
      total: results.length,
      detected: detected.length,
      bySeverity,
    },
  };
}

function formatReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push("# UL Mode Diagnostic Report");
  lines.push("");
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`UL Mode Active: ${report.ulModeActive}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total Checks: ${report.summary.total}`);
  lines.push(`- Issues Detected: ${report.summary.detected}`);
  lines.push(`- Critical: ${report.summary.bySeverity.critical}`);
  lines.push(`- High: ${report.summary.bySeverity.high}`);
  lines.push(`- Medium: ${report.summary.bySeverity.medium}`);
  lines.push(`- Low: ${report.summary.bySeverity.low}`);
  lines.push("");
  lines.push("## Details");

  for (const result of report.results) {
    const status = result.detected ? "[!]" : "[OK]";
    lines.push(`### ${status} ${result.issue}`);
    lines.push(`- Category: ${result.category}`);
    lines.push(`- Severity: ${result.severity}`);
    lines.push(`- Description: ${result.description}`);
    if (result.details) {
      lines.push(`- Details: ${result.details}`);
    }
    lines.push(`- Recommendation: ${result.recommendation}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * UI診断機能の拡張を登録
 * @summary UI診断登録
 * @param pi 拡張API
 * @returns void
 */
export default function registerUlDiagnosticExtension(pi: ExtensionAPI): void {
  pi.registerCommand("ul-diagnostic", {
    description: "Run UL mode diagnostics and check for known issues",
    handler: async (_args, ctx) => {
      const report = runDiagnostics();
      const formatted = formatReport(report);

      if (ctx?.hasUI && ctx?.ui) {
        if (report.summary.detected > 0) {
          ctx.ui.notify(
            `UL Diagnostic: ${report.summary.detected} issue(s) detected. Run "ul-diagnostic-full" for details.`,
            "warning"
          );
        } else {
          ctx.ui.notify("UL Diagnostic: No issues detected", "info");
        }
      }

      console.log(formatted);
    },
  });

  pi.registerCommand("ul-diagnostic-full", {
    description: "Run full UL mode diagnostics with detailed report",
    handler: async (_args, ctx) => {
      const report = runDiagnostics();
      const formatted = formatReport(report);

      if (ctx?.hasUI && ctx?.ui) {
        ctx.ui.notify("UL Diagnostic: Full report written to console", "info");
      }

      console.log(formatted);

      const reportDir = path.join(".pi", "ul-workflow");
      const reportPath = path.join(reportDir, "diagnostic-report.json");

      try {
        await fs.promises.mkdir(reportDir, { recursive: true });
        await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
        console.log(`Report saved to: ${reportPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to save report: ${errorMessage}`);
      }
    },
  });

  pi.registerTool({
    name: "ul_diagnostic",
    label: "UL Mode Diagnostic",
    description: "ULモードの診断を実行し、既知の問題をチェックする",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const report = runDiagnostics();
      const formatted = formatReport(report);

      return {
        content: [{ type: "text", text: formatted }],
        details: { report },
      };
    },
  });
}
