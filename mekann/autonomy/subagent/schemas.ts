import { Type } from "@sinclair/typebox";

const SemanticTargetSchema = Type.Object({ kind: Type.String(), name: Type.String() });
const ValidationCommandSchema = Type.Union([
  Type.Object({ kind: Type.Literal("npm_script"), script: Type.String(), args: Type.Optional(Type.Array(Type.String())) }),
  Type.Object({ kind: Type.Literal("shell_allowlisted"), command_id: Type.String(), args: Type.Optional(Type.Array(Type.String())) }),
]);
const AuthoritySchema = Type.Object({
  mode: Type.Union([Type.Literal("read_only"), Type.Literal("propose_patch"), Type.Literal("edit")]),
  write_scope: Type.Optional(Type.Array(Type.String())),
  semantic_scope: Type.Optional(Type.Array(SemanticTargetSchema)),
  allowed_commands: Type.Optional(Type.Array(ValidationCommandSchema)),
  max_patch_bytes: Type.Optional(Type.Number()),
  require_base_hash: Type.Optional(Type.Boolean()),
  isolated_worktree: Type.Optional(Type.Union([Type.Literal("required"), Type.Literal("preferred"), Type.Literal("none")])),
});

const RoiCategorySchema = Type.Union([
  Type.Literal("parallel_search"),
  Type.Literal("fault_localization"),
  Type.Literal("candidate_generation"),
  Type.Literal("fresh_review"),
  Type.Literal("verification"),
  Type.Literal("large_context_isolation"),
  Type.Literal("other"),
], {
  description:
    'ROI category for spawning. Must be exactly one of: "parallel_search", "fault_localization", "candidate_generation", "fresh_review", "verification", "large_context_isolation", "other". Do not put prose here; put prose in justification.',
});
const CostIntentSchema = Type.Union([Type.Literal("cheap"), Type.Literal("standard"), Type.Literal("expensive")]);
const SubagentTypeSchema = Type.Union([Type.Literal("explore"), Type.Literal("verify"), Type.Literal("review"), Type.Literal("patch")]);

const SpawnProperties = {
  task_name: Type.String({
    description:
      'Task name / path for the subagent. Relative to current agent path (e.g. "research/api_scan") or absolute (e.g. "/root/research/api_scan").',
  }),
  message: Type.String({ description: "Initial message / task description for the subagent." }),
  model: Type.Optional(Type.String({ description: 'Model override. Format: "provider/model_id" or just "model_id".' })),
  reasoning_effort: Type.Optional(Type.Union([
    Type.Literal("off"),
    Type.Literal("minimal"),
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
    Type.Literal("xhigh"),
  ], { description: "Reasoning effort level. If omitted, the subagent inherits the parent session thinking level deterministically." })),
  role: Type.Optional(Type.String({ description: "Optional role description for the subagent." })),
  nickname: Type.Optional(Type.String({ description: "Optional short nickname for the subagent." })),
  fork_turns: Type.Optional(Type.Union([
    Type.Number({ description: "Number of recent user turns to fork (0 = none)." }),
    Type.Literal("all", { description: "Fork all parent conversation." }),
    Type.Literal("none", { description: "No context fork (default)." }),
  ], { description: "How much parent context to fork into the subagent. Default: none." })),
  authority: Type.Optional(AuthoritySchema),
  result_contract: Type.Optional(Type.Union([Type.Literal("free_text"), Type.Literal("subagent_result_v1")])),
  roi_category: Type.Optional(RoiCategorySchema),
  justification: Type.Optional(Type.String({ description: "Why this subagent is worth the extra child-loop cost." })),
  cost_intent: Type.Optional(CostIntentSchema),
  type: Type.Optional(SubagentTypeSchema),
};

export const SpawnSchema = Type.Object(SpawnProperties);

export const DelegateAgentSchema = Type.Object({
  ...SpawnProperties,
  timeout_ms: Type.Optional(Type.Number({ description: "Total timeout in milliseconds for the synchronous delegation. Default: 300000. Max: 600000." })),
}, { description: "Spawn a subagent and wait synchronously for its final result." });

export const MessageAgentSchema = Type.Object({
  target: Type.String({ description: 'Target agent path (e.g. "research/api_scan" or "/root/research/api_scan").' }),
  message: Type.String({ description: "Message to send to the target agent." }),
  mode: Type.Union([Type.Literal("note"), Type.Literal("task")], {
    description: "note queues context without triggering a turn; task queues a follow-up task and triggers a turn when idle.",
  }),
});

export const WaitAgentSchema = Type.Object({
  timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds. Default: 30000. Max: 600000." })),
});

export const ListAgentsSchema = Type.Object({
  path_prefix: Type.Optional(Type.String({ description: "Filter agents by path prefix." })),
});

export const CloseAgentSchema = Type.Object({
  target: Type.String({ description: 'Target agent path to close (e.g. "research/api_scan").' }),
});

export const AgentResultsSchema = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("show"), Type.Literal("apply"), Type.Literal("reject"), Type.Literal("retry")], {
    description: "Structured subagent result action.",
  }),
  status: Type.Optional(Type.String()),
  outcome: Type.Optional(Type.String()),
  agent_path: Type.Optional(Type.String()),
  result_id: Type.Optional(Type.String()),
  include_patch: Type.Optional(Type.Boolean()),
  source: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("result_ids")])),
  result_ids: Type.Optional(Type.Array(Type.String())),
  order: Type.Optional(Type.Literal("fifo")),
  max_results: Type.Optional(Type.Number()),
  rollback_on_failure: Type.Optional(Type.Boolean()),
  allow_high_risk: Type.Optional(Type.Boolean()),
  reason: Type.Optional(Type.String()),
});
