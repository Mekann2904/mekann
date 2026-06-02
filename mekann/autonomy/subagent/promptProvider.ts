import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

export function registerSubagentPromptProvider(): void {
  registerPromptProvider({
    id: "subagent",
    getFragments() {
      return [{
        id: "subagent:policy",
        source: "subagent",
        kind: "subagent_policy",
        stability: "stable",
        scope: "global",
        priority: 350,
        version: "v2",
        cacheIntent: "prefer_cache",
        content: [
          "Prefer direct tools. Use subagents only when they buy independent exploration, candidate diversity, fresh review, verification, or large-context isolation.",
          `Limits: ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} running, ${MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents} queued by default. Extra spawns queue FIFO and remain visible to list_agents/wait_agent.`,
          "Before spawning, check that at least 3 ROI conditions hold: natural decomposition, independent evidence, parent-verifiable result, high failure cost, too many reads/tool calls for local context, comparable candidates, or explicit user request for parallel/multi-agent work.",
          "Do not spawn for short Q&A, simple summaries, single grep/read, 1-3 file cross-references, single-file edits, tightly coupled implementation, ambiguous requirements, verifier-less debate, or multiple agents reading the same files with the same goal.",
          "Use roi_category and justification when spawning so the cost can be audited. roi_category must be exactly one of: parallel_search | fault_localization | candidate_generation | fresh_review | verification | large_context_isolation | other. Put prose in justification, not roi_category.",
          "Spawn all genuinely independent tasks first, then wait_agent before summarizing or deciding next steps. Do not repeatedly wait by reflex; do non-overlapping local work while subagents run.",
          "Write subagent task messages in English.",
          "Request compact, structured, evidence/path-oriented results for the parent agent only.",
          "Do not request progress reports, greetings, apologies, narration, or polished prose.",
        ].join("\n"),
      }];
    },
  });
}
