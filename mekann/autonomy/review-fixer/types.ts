/**
 * Review fixer types and structured result schema.
 */

export interface ReviewFixerResult {
  schema: "review-fixer.result.v1";
  status: "changed" | "no_change" | "failed";
  issue: {
    number: number;
    title: string;
    url: string;
  };
  findings: Array<{
    severity: "blocker" | "major" | "minor";
    description: string;
    file?: string;
    line?: number;
    remediation?: string;
    applied: boolean;
  }>;
  changes: {
    files_changed: string[];
    structural_changes: string[];
    behavior_changes: string[];
    tests_added_or_modified: string[];
  };
  verification: {
    commands_run: string[];
    results: Array<{ command: string; exit_code: number; passed: boolean }>;
    all_passed: boolean;
  };
  remaining_risks: string[];
  parent_next_steps: string;
}

export interface ReviewFixerSettings {
  /**
   * NOTE: there is intentionally no `enabled` field here. The review-fixer
   * enable/disable gate is owned solely by `isFeatureEnabled("review-fixer")`
   * (mekann/settings/enabled.ts) and surfaced in the settings editor via
   * settingsSchema.ts (default `true`). Keeping a parallel `enabled` here
   * created a dead, contradictory default — see issue #82.
   */
  model: { provider: string; modelId: string } | undefined;
  reasoningEffort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  maxFixRetries: number;
}
