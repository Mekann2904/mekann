/**
 * path: .pi/lib/harness-engineering.ts
 * role: agent-first harness の診断、スコア計算、report生成を担う共有ライブラリ
 * why: mekann が自分の自走基盤を自己診断し、足りない制御点を機械的に見つけられるようにするため
 * related: .pi/extensions/harness-engineering.ts, scripts/harness-engineering.ts, WORKFLOW.md, docs/05-meta/09-agent-first-harness.md
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface HarnessSignal {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface HarnessPillar {
  id: string;
  label: string;
  score: number;
  summary: string;
  signals: HarnessSignal[];
}

export interface HarnessAssessment {
  cwd: string;
  workflowPath: string;
  overallScore: number;
  readiness: "bootstrap" | "developing" | "strong" | "elite";
  pillars: HarnessPillar[];
  recommendations: string[];
  strengths: string[];
}

interface PackageJsonShape {
  scripts?: Record<string, unknown>;
  pi?: {
    extensions?: string[];
  };
}

const REQUIRED_RUNTIME_EXTENSIONS = [
  "./.pi/extensions/autonomy-policy.ts",
  "./.pi/extensions/long-running-supervisor.ts",
  "./.pi/extensions/workspace-verification.ts",
  "./.pi/extensions/ralph-loop.ts",
  "./.pi/extensions/task-auto-executor.ts",
  "./.pi/extensions/workflow-workpad.ts",
] as const;

const REQUIRED_DOCS = [
  "AGENTS.md",
  ".pi/INDEX.md",
  "docs/05-meta/08-autonomous-harness-playbook.md",
  "docs/05-meta/06-autonomy-improvement-plan.md",
  "docs/02-user-guide/07-plan.md",
] as const;

const REQUIRED_PACKAGE_SCRIPTS = [
  "typecheck",
  "lint",
  "test",
  "verify:workspace",
  "policy:workspace",
] as const;

const REQUIRED_WORKFLOW_MARKERS = [
  "quality-gates:",
  "compatibility:",
  "security:",
  ".pi/verification-runs/",
] as const;

function safeReadText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function safeReadJson(path: string): PackageJsonShape {
  const raw = safeReadText(path);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return {};
  }
}

function buildSignal(id: string, label: string, ok: boolean, detail: string): HarnessSignal {
  return { id, label, ok, detail };
}

function scoreSignals(signals: HarnessSignal[]): number {
  if (signals.length === 0) {
    return 0;
  }
  const passed = signals.filter((signal) => signal.ok).length;
  return Math.round((passed / signals.length) * 100);
}

function toReadiness(score: number): HarnessAssessment["readiness"] {
  if (score >= 90) {
    return "elite";
  }
  if (score >= 75) {
    return "strong";
  }
  if (score >= 50) {
    return "developing";
  }
  return "bootstrap";
}

function summarizePillar(score: number, label: string): string {
  if (score === 100) {
    return `${label} は必要な信号を満たしています。`;
  }
  if (score >= 70) {
    return `${label} は概ね整っていますが、数個の欠落があります。`;
  }
  if (score >= 40) {
    return `${label} は部分的です。人手依存のまま残っている箇所があります。`;
  }
  return `${label} は未整備です。自走の前提が不足しています。`;
}

export function createAgentFirstWorkflowTemplate(): string {
  return `<!-- /Users/mekann/github/pi-plugin/mekann/WORKFLOW.md -->
<!-- このファイルは、mekann における agent-first 実行の入口となる運用仕様を定義します。 -->
<!-- なぜ存在するか: 自律実行の起点を 1 ファイルに集約し、毎回同じ品質ループで開始できるようにするためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/AGENTS.md, /Users/mekann/github/pi-plugin/mekann/.pi/INDEX.md, /Users/mekann/github/pi-plugin/mekann/docs/05-meta/08-autonomous-harness-playbook.md, /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/07-plan.md -->
---
kind: mekann-agent-first-workflow
version: 1
entrypoints:
  - AGENTS.md
  - .pi/INDEX.md
  - docs/05-meta/08-autonomous-harness-playbook.md
  - docs/02-user-guide/07-plan.md
verification:
  required_commands:
    - npm run policy:workspace
    - npm run verify:workspace -- --fail-on-interactive
    - npm run ci
completion_gate:
  require_single_in_progress_step: true
  require_proof_artifacts: true
  require_workspace_verification: true
---

# WORKFLOW

この文書は Symphony 風の repo-native workflow です。

drop-in の外部仕様ではなく、mekann が自分のハーネスを回すための運用契約として使います。

## Start

1. \`AGENTS.md\` と \`.pi/INDEX.md\` を読む。
2. 関連コードと関連 docs を先に探索する。
3. live todo を 5〜9 step に切る。
4. \`in_progress\` は 1 件だけにする。

## Loop

1. search before change
2. planner owns direction, workers own completion
3. workers do not coordinate with each other directly
4. quick and dirty prototype first
5. local verification before closeout
6. proof artifact と next step を残す

各反復は fresh context を前提にし、継続状態は workpad / workflow artifacts / git に残す。

## Verify

- 変更に最も近い test / lint / typecheck を優先する
- workspace 全体の完了ゲートは \`workspace_verify\` または \`npm run verify:workspace\`
- 同じ失敗が 2 回続いたら scope を狭めて再計画する

## Done

- plan が更新されている
- verify 結果が残っている
- proof artifact か未検証理由が明記されている
- 次の一手が restartable に残っている
`;
}

export function assessHarnessEngineering(cwd: string): HarnessAssessment {
  const packageJsonPath = resolve(cwd, "package.json");
  const workflowPath = resolve(cwd, ".github", "workflows", "test.yml");
  const packageJson = safeReadJson(packageJsonPath);
  const scripts = packageJson.scripts ?? {};
  const extensions = packageJson.pi?.extensions ?? [];
  const workflow = safeReadText(workflowPath);

  const navigationSignals = [
    ...REQUIRED_DOCS.map((relativePath) => {
      const absolutePath = resolve(cwd, relativePath);
      return buildSignal(
        `doc:${relativePath}`,
        relativePath,
        existsSync(absolutePath),
        existsSync(absolutePath) ? "present" : "missing",
      );
    }),
    buildSignal(
      "doc:workflow",
      "WORKFLOW.md",
      existsSync(resolve(cwd, "WORKFLOW.md")),
      existsSync(resolve(cwd, "WORKFLOW.md")) ? "present" : "missing",
    ),
  ];

  const runtimeSignals = REQUIRED_RUNTIME_EXTENSIONS.map((extensionPath) => {
    return buildSignal(
      `extension:${extensionPath}`,
      extensionPath,
      extensions.includes(extensionPath),
      extensions.includes(extensionPath) ? "registered in package.json" : "not registered",
    );
  });

  const verificationSignals = [
    ...REQUIRED_PACKAGE_SCRIPTS.map((scriptName) => {
      const value = scripts[scriptName];
      return buildSignal(
        `script:${scriptName}`,
        scriptName,
        typeof value === "string" && value.trim().length > 0,
        typeof value === "string" && value.trim().length > 0 ? value : "missing",
      );
    }),
    ...REQUIRED_WORKFLOW_MARKERS.map((marker) => {
      return buildSignal(
        `workflow:${marker}`,
        marker,
        workflow.includes(marker),
        workflow.includes(marker) ? "present in CI workflow" : "missing from CI workflow",
      );
    }),
  ];

  const observabilitySignals = [
    buildSignal(
      "extension:playwright-cli",
      "./.pi/extensions/playwright-cli.ts",
      extensions.includes("./.pi/extensions/playwright-cli.ts"),
      extensions.includes("./.pi/extensions/playwright-cli.ts") ? "registered" : "not registered",
    ),
    buildSignal(
      "extension:background-process",
      "./.pi/extensions/background-process.ts",
      extensions.includes("./.pi/extensions/background-process.ts"),
      extensions.includes("./.pi/extensions/background-process.ts") ? "registered" : "not registered",
    ),
    buildSignal(
      "extension:repo-audit",
      "./.pi/extensions/repo-audit-orchestrator.ts",
      extensions.includes("./.pi/extensions/repo-audit-orchestrator.ts"),
      extensions.includes("./.pi/extensions/repo-audit-orchestrator.ts") ? "registered" : "not registered",
    ),
    buildSignal(
      "doc:verification-workflow",
      "docs/04-reference/verification-workflow.md",
      existsSync(resolve(cwd, "docs/04-reference/verification-workflow.md")),
      existsSync(resolve(cwd, "docs/04-reference/verification-workflow.md")) ? "present" : "missing",
    ),
  ];

  const pillars: HarnessPillar[] = [
    {
      id: "navigation",
      label: "Progressive Disclosure",
      score: scoreSignals(navigationSignals),
      summary: "",
      signals: navigationSignals,
    },
    {
      id: "runtime",
      label: "Execution Harness",
      score: scoreSignals(runtimeSignals),
      summary: "",
      signals: runtimeSignals,
    },
    {
      id: "verification",
      label: "Mechanical Verification",
      score: scoreSignals(verificationSignals),
      summary: "",
      signals: verificationSignals,
    },
    {
      id: "observability",
      label: "Review And Garbage Collection",
      score: scoreSignals(observabilitySignals),
      summary: "",
      signals: observabilitySignals,
    },
  ].map((pillar) => ({
    ...pillar,
    summary: summarizePillar(pillar.score, pillar.label),
  }));

  const overallScore = Math.round(
    pillars.reduce((sum, pillar) => sum + pillar.score, 0) / pillars.length,
  );

  const recommendations = pillars.flatMap((pillar) => {
    return pillar.signals
      .filter((signal) => !signal.ok)
      .map((signal) => `${pillar.label}: ${signal.label} を追加または接続する`);
  });

  const strengths = pillars.flatMap((pillar) => {
    return pillar.signals
      .filter((signal) => signal.ok)
      .slice(0, 2)
      .map((signal) => `${pillar.label}: ${signal.label}`);
  }).slice(0, 6);

  return {
    cwd,
    workflowPath,
    overallScore,
    readiness: toReadiness(overallScore),
    pillars,
    recommendations,
    strengths,
  };
}

export function renderHarnessAssessmentMarkdown(assessment: HarnessAssessment): string {
  const lines: string[] = [
    "<!-- generated by harness-engineering -->",
    `# Harness Engineering Report`,
    "",
    `- cwd: \`${assessment.cwd}\``,
    `- overall_score: **${assessment.overallScore}**`,
    `- readiness: **${assessment.readiness}**`,
    "",
    "## Pillars",
    "",
  ];

  for (const pillar of assessment.pillars) {
    lines.push(`### ${pillar.label} (${pillar.score})`);
    lines.push("");
    lines.push(pillar.summary);
    lines.push("");
    for (const signal of pillar.signals) {
      lines.push(`- [${signal.ok ? "x" : " "}] ${signal.label}: ${signal.detail}`);
    }
    lines.push("");
  }

  lines.push("## Strengths", "");
  for (const item of assessment.strengths) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Next Actions", "");
  if (assessment.recommendations.length === 0) {
    lines.push("- No immediate gaps detected.");
  } else {
    for (const item of assessment.recommendations) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
