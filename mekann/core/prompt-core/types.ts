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
export type RenderedPrompt = { stableText: string; semiStableText: string; dynamicText: string; stablePrefixText: string; stablePrefixHash: string; stableFragments: PromptFragment[]; semiStableFragments: PromptFragment[]; dynamicFragments: PromptFragment[]; fragmentHashes: PromptFragmentHash[]; warnings: PromptInspectionWarning[]; };
export type PromptFragmentHash = { id: string; source: string; kind: PromptFragmentKind; stability: PromptStability; hash: string; chars?: number; tokenEstimate?: number; };
export type PromptInspectionSeverity = "info" | "warning" | "error";
export type PromptInspectionWarning = { severity: PromptInspectionSeverity; code: string; message: string; fragmentId?: string; source?: string; };
export type RunKeySource = "sessionId" | "conversationId" | "session.id" | "runId" | "cwd" | "default";
export type CacheFriendlyCorrelationConfidence = "requestId_matched" | "runKey_latest" | "missing";
export type CacheFriendlySnapshotSource = "before_agent_start" | "missing";
export type CacheFriendlyRequestLog = { timestamp: string; runKey?: string; runKeySource?: RunKeySource; requestId?: string; snapshotSource?: CacheFriendlySnapshotSource; correlationConfidence?: CacheFriendlyCorrelationConfidence; provider?: string; model?: string; baseSystemHash?: string; stablePrefixHash: string; stablePrefixChars: number; stablePrefixTokenEstimate?: number; semiStableHash?: string; semiStableChars?: number; semiStableTokenEstimate?: number; featureCacheablePrefixHash?: string; featureCacheablePrefixChars?: number; featureCacheablePrefixTokenEstimate?: number; providerPrefixHash?: string; providerPrefixChars?: number; providerPrefixTokenEstimate?: number; totalPromptChars?: number; totalPromptTokenEstimate?: number; promptProviderIds?: string[]; fragmentHashes: PromptFragmentHash[]; injectedStableFragmentHashes?: PromptFragmentHash[]; injectedSemiStableFragmentHashes?: PromptFragmentHash[]; latestDynamicFragmentHashes?: PromptFragmentHash[]; latestDynamicCollectedAt?: string; warnings: PromptInspectionWarning[]; };
