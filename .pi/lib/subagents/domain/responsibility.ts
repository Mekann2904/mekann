/**
 * @abdd.meta
 * path: .pi/lib/subagents/domain/responsibility.ts
 * role: 責任重複チェックのドメインロジック
 * why: サブエージェント間の責任重複を検出し、SRPを維持するため
 * related: ./subagent-definition.ts
 * public_api: ResponsibilityCheck, validateSingleResponsibility
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 責任重複検出の純粋関数
 * what_it_does:
 *   - スキルの重複検出
 *   - 違反レポートの生成
 * why_it_exists: 単一責任の原則を維持するため
 * scope:
 *   in: SubagentDefinition
 *   out: application層
 */

import type { SubagentDefinition } from "./subagent-definition.js";

/**
 * 責任重複チェック結果
 * @summary 責任重複チェック結果
 */
export interface ResponsibilityCheck {
  /** サブエージェントID */
  subagentId: string;
  /** 重複しているスキル一覧 */
  skills: string[];
  /** 重複先のエージェントID一覧 */
  overlaps: string[];
}

/**
 * サブエージェント間でスキル（責任）の重複を検出する
 * 純粋関数: 入力に対して常に同じ出力を返す
 * @summary 責任重複検出
 * @param subagents - サブエージェント定義の配列
 * @returns 重複しているスキルと関連エージェントのリスト
 */
export function validateSingleResponsibility(
  subagents: SubagentDefinition[]
): ResponsibilityCheck[] {
  const skillMap = new Map<string, string[]>();

  // 各スキルを持つエージェントをマッピング
  for (const subagent of subagents) {
    for (const skill of subagent.skills || []) {
      const existing = skillMap.get(skill) || [];
      existing.push(subagent.id);
      skillMap.set(skill, existing);
    }
  }

  const violations: ResponsibilityCheck[] = [];
  const processedAgents = new Set<string>();

  // 重複しているスキルを検出
  for (const [skill, owners] of skillMap) {
    if (owners.length > 1) {
      // 最初のエージェントを代表として、他を重複先として記録
      const primaryAgent = owners[0];
      if (!processedAgents.has(primaryAgent)) {
        violations.push({
          subagentId: primaryAgent,
          skills: [skill],
          overlaps: owners.slice(1),
        });
        processedAgents.add(primaryAgent);
      } else {
        // 既存の違反に追加
        const existing = violations.find((v) => v.subagentId === primaryAgent);
        if (existing) {
          existing.skills.push(skill);
        }
      }
    }
  }

  return violations;
}

/**
 * 責任重複の重大度を判定
 * @summary 重大度判定
 * @param check - 責任チェック結果
 * @returns 重大度（low/medium/high）
 */
export function getResponsibilitySeverity(
  check: ResponsibilityCheck
): "low" | "medium" | "high" {
  const skillCount = check.skills.length;
  const overlapCount = check.overlaps.length;

  if (skillCount >= 3 || overlapCount >= 3) {
    return "high";
  }
  if (skillCount >= 2 || overlapCount >= 2) {
    return "medium";
  }
  return "low";
}

/**
 * 責任重複の推奨アクションを生成
 * @summary 推奨アクション生成
 * @param check - 責任チェック結果
 * @returns 推奨アクション
 */
export function getRecommendedAction(check: ResponsibilityCheck): string {
  const severity = getResponsibilitySeverity(check);

  if (severity === "high") {
    return `重大な責任重複があります。スキルの再割り当てを強く推奨します。
重複スキル: ${check.skills.join(", ")}
重複先: ${check.overlaps.join(", ")}`;
  }

  if (severity === "medium") {
    return `責任の重複があります。スキルの見直しを推奨します。
重複スキル: ${check.skills.join(", ")}`;
  }

  return `軽微な重複があります。必要に応じてスキルを調整してください。`;
}

/**
 * すべての責任重複をチェックして要約を生成
 * @summary 責任チェック要約
 * @param subagents - サブエージェント定義の配列
 * @returns チェック結果の要約
 */
export function summarizeResponsibilityChecks(
  subagents: SubagentDefinition[]
): {
  hasViolations: boolean;
  violationCount: number;
  highSeverityCount: number;
  checks: ResponsibilityCheck[];
} {
  const checks = validateSingleResponsibility(subagents);
  const highSeverityCount = checks.filter(
    (c) => getResponsibilitySeverity(c) === "high"
  ).length;

  return {
    hasViolations: checks.length > 0,
    violationCount: checks.length,
    highSeverityCount,
    checks,
  };
}
