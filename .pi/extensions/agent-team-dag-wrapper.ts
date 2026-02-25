/**
 * @abdd.meta
 * path: .pi/extensions/agent-team-dag-wrapper.ts
 * role: Agent team DAG dependency analyzer
 * why: Provide dependency inference and execution recommendations for agent teams
 * related: .pi/extensions/subagents.ts, .pi/lib/dag-generator.ts
 * public_api: Extension init function via `registerExtension`
 * invariants: Provides recommendations only, does not execute teams directly
 * side_effects: None (analysis only)
 * failure_modes: None (always returns recommendations)
 * @abdd.explain
 * overview: Analyzes tasks for team dependencies and recommends DAG execution
 * what_it_does:
 *   - Infers dependencies between teams based on task description
 *   - Recommends optimal execution strategy (DAG vs parallel)
 *   - Provides detailed dependency analysis
 * why_it_exists: Enable DAG-aware team execution planning without modifying pi core
 * scope:
 *   in: Task description, team IDs
 *   out: Dependency analysis and execution recommendations
 */

// File: .pi/extensions/agent-team-dag-wrapper.ts
// Description: Agent team DAG dependency analyzer
// Why: Provides dependency inference for team-based workflows
// Related: .pi/extensions/subagents.ts, .pi/lib/dag-generator.ts

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Infer dependencies between teams based on task description
 * @summary チーム間依存推論
 */
function inferTeamDependencies(
  teamIds: string[],
  task: string,
): {
  hasDependencies: boolean;
  dependencies: Map<string, string[]>;
  description: string;
  recommendedTool: string;
} {
  const dependencies = new Map<string, string[]>();
  const reasons: string[] = [];
  const lowerTask = task.toLowerCase();

  // Pattern 1: Research → Implement dependency
  const hasResearch = lowerTask.includes("research") || lowerTask.includes("調査") || lowerTask.includes("analyze");
  const hasImplement = lowerTask.includes("implement") || lowerTask.includes("実装") || lowerTask.includes("build");

  if (hasResearch && hasImplement) {
    const researchTeam = teamIds.find((id) => id.includes("research") || id.includes("investigator"));
    const implTeam = teamIds.find((id) => id.includes("implement") || id.includes("delivery") || id.includes("builder"));

    if (researchTeam && implTeam) {
      dependencies.set(implTeam, [researchTeam]);
      reasons.push(`${researchTeam} -> ${implTeam} (research before implement)`);
    }
  }

  // Pattern 2: Code → Review dependency
  const hasReview = lowerTask.includes("review") || lowerTask.includes("レビュー") || lowerTask.includes("check");
  const hasCode = lowerTask.includes("code") || lowerTask.includes("実装") || lowerTask.includes("write");

  if (hasReview && hasCode) {
    const codeTeam = teamIds.find((id) => id.includes("implement") || id.includes("delivery") || id.includes("builder"));
    const reviewTeam = teamIds.find((id) => id.includes("review") || id.includes("quality") || id.includes("auditor"));

    if (codeTeam && reviewTeam) {
      const existing = dependencies.get(reviewTeam) || [];
      dependencies.set(reviewTeam, [...existing, codeTeam]);
      reasons.push(`${codeTeam} -> ${reviewTeam} (code before review)`);
    }
  }

  // Pattern 3: Sequential steps indicated
  const sequentialPatterns = [
    /first.*then/i,
    /after.*before/i,
    /まず.*それから/,
    /実装.*後.*レビュー/,
  ];

  const hasSequential = sequentialPatterns.some((p) => p.test(task));
  if (hasSequential && teamIds.length >= 2) {
    // Assume first team depends on nothing, others depend on previous
    for (let i = 1; i < teamIds.length; i++) {
      const existing = dependencies.get(teamIds[i]) || [];
      dependencies.set(teamIds[i], [...existing, teamIds[i - 1]]);
    }
    reasons.push("Sequential steps detected in task description");
  }

  const hasDependencies = reasons.length > 0;
  const recommendedTool = hasDependencies ? "subagent_run_dag" : "agent_team_run_parallel";

  return {
    hasDependencies,
    dependencies,
    description: reasons.join("\n"),
    recommendedTool,
  };
}

export default function (pi: ExtensionAPI) {
  // Team dependency analyzer
  pi.registerTool({
    name: "analyze_team_dependencies",
    label: "Analyze Team Dependencies",
    description:
      "Analyze task for team dependencies and recommend optimal execution strategy. Use before agent_team_run_parallel for complex tasks.",
    parameters: Type.Object({
      task: Type.String({ description: "Task to analyze" }),
      teamIds: Type.Optional(Type.Array(Type.String(), { description: "Team IDs to consider" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task, teamIds } = params;

      // Default teams if not specified
      const targetTeamIds = teamIds && teamIds.length > 0
        ? teamIds
        : ["core-delivery-team", "quality-assurance-team"];

      const deps = inferTeamDependencies(targetTeamIds, task);

      const depList = Array.from(deps.dependencies.entries())
        .map(([teamId, deps]) => `  ${teamId} depends on: ${deps.join(", ")}`)
        .join("\n");

      const text = `## Team Dependency Analysis

Task: ${task.slice(0, 100)}${task.length > 100 ? "..." : ""}

### Teams
${targetTeamIds.map((id) => `- ${id}`).join("\n")}

### Dependencies Detected
${deps.hasDependencies ? deps.description : "No dependencies detected"}

### Dependency Graph
${deps.hasDependencies ? depList : "All teams can run in parallel"}

### Recommendation
**Use: \`${deps.recommendedTool}\`**

${deps.hasDependencies
  ? `DAG execution recommended because dependencies were detected. Use \`subagent_run_dag\` for dependency-aware parallel execution.

\`\`\`
subagent_run_dag({
  task: "${task.replace(/"/g, '\\"').slice(0, 80)}...",
  maxConcurrency: 2
})
\`\`\`
`
  : `No dependencies detected. Standard parallel execution is optimal.

\`\`\`
agent_team_run_parallel({
  task: "${task.replace(/"/g, '\\"').slice(0, 80)}...",
  teamIds: ${JSON.stringify(targetTeamIds)},
  strategy: "parallel"
})
\`\`\`
`
}
`;

      return {
        content: [{ type: "text", text }],
        details: {
          hasDependencies: deps.hasDependencies,
          dependencies: Object.fromEntries(deps.dependencies),
          recommendedTool: deps.recommendedTool,
          teamCount: targetTeamIds.length,
        },
      };
    },
  });
};
