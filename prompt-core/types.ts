export type PromptStability = "stable" | "semi_stable" | "dynamic";
export type PromptScope = "global" | "mode" | "session" | "turn";
export type PromptCacheIntent = "prefer_cache" | "neutral" | "avoid_cache";
export type PromptFragmentKind =
  | "base_policy" | "coding_guidelines" | "mode_policy" | "tool_policy" | "project_instruction"
  | "goal_policy" | "goal_objective" | "goal_runtime_state" | "implementation_plan"
  | "autoresearch_policy" | "autoresearch_state" | "subagent_policy" | "sandbox_policy"
  | "current_context" | "current_file" | "diagnostics" | "rag_result" | "tool_result"
  | "request_metadata" | "unknown";
export type PromptFragment = { id: string; source: string; kind: PromptFragmentKind; stability: PromptStability; scope: PromptScope; priority: number; version: string; content: string; cacheIntent?: PromptCacheIntent; enabled?: boolean; metadata?: Record<string, unknown>; };
export type PromptProviderContext = { cwd: string; provider?: string; model?: string; mode?: string; turnIndex?: number; };
export type PromptProvider = { id: string; getFragments(ctx: PromptProviderContext): PromptFragment[] | Promise<PromptFragment[]>; };
export type RenderedPrompt = { stableText: string; semiStableText: string; dynamicText: string; stablePrefixText: string; stablePrefixHash: string; fragmentHashes: PromptFragmentHash[]; warnings: PromptInspectionWarning[]; };
export type PromptFragmentHash = { id: string; source: string; kind: PromptFragmentKind; stability: PromptStability; hash: string; };
export type PromptInspectionSeverity = "info" | "warning" | "error";
export type PromptInspectionWarning = { severity: PromptInspectionSeverity; code: string; message: string; fragmentId?: string; source?: string; };
export type CacheFriendlyRequestLog = { timestamp: string; provider?: string; model?: string; stablePrefixHash: string; stablePrefixChars: number; stablePrefixTokenEstimate?: number; totalPromptChars?: number; totalPromptTokenEstimate?: number; fragmentHashes: PromptFragmentHash[]; warnings: PromptInspectionWarning[]; };
