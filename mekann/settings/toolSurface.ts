export type ToolSurfaceAPI = {
	getActiveTools?: () => string[];
	setActiveTools?: (toolNames: string[]) => void;
};

export type ToolSurfaceProjectionRecord = {
	feature: string;
	toolNames: string[];
	projectedActive: boolean;
	at: number;
};

export type ToolSurfaceShadowSnapshot = {
	mode: "shadow";
	optimizationAvailable: boolean;
	ownedTools: string[];
	projectedInactiveTools: string[];
	prospectiveSchemaBytes: number;
	missedToolCalls: Record<string, number>;
	diagnostics: string[];
	projections: ToolSurfaceProjectionRecord[];
};

type ShadowState = {
	ownedTools: Set<string>;
	projectedActive: Map<string, boolean>;
	missedToolCalls: Map<string, number>;
	diagnostics: string[];
	projections: ToolSurfaceProjectionRecord[];
	forceAll: boolean;
	activeToolsBeforeForceAll?: string[];
	latestRequestId?: string;
};

/** Mekann-owned tools; Pi and third-party tools are intentionally excluded. */
export const MEKANN_TOOL_INVENTORY = {
	goal: ["get_goal", "create_goal", "update_goal"],
	subagent: ["delegate_agent", "spawn_agent", "message_agent", "wait_agent", "list_agents", "agent_results", "close_agent"],
	autoresearch: ["autoresearch_evaluate_query", "autoresearch_init", "autoresearch_run", "autoresearch_log", "autoresearch_plan", "autoresearch_approve", "autoresearch_candidate_escrow", "autoresearch_list_candidates", "autoresearch_show_candidate", "autoresearch_reject_candidate", "autoresearch_apply_candidate", "autoresearch_suggest_subagents", "autoresearch_apply_candidate_isolated", "autoresearch_run_contract"],
	"output-gate": ["search_tool_outputs"],
	"context-ledger": ["search_context_events", "summarize_session_context"],
	sandbox: ["request_elevation"],
	"review-fixer": ["review_fixer"],
	"issue-workflow": ["issue_workflow"],
	"codex-web-search": ["codex_web_search"],
} as const;

const shadowByApi = new WeakMap<object, ShadowState>();
const schemaBytesByTool = new Map<string, number>();

export function shadowState(pi: object): ShadowState {
	let state = shadowByApi.get(pi);
	if (!state) {
		state = {
			ownedTools: new Set(),
			projectedActive: new Map(),
			missedToolCalls: new Map(),
			diagnostics: [],
			projections: [],
			forceAll: false,
		};
		shadowByApi.set(pi, state);
	}
	return state;
}

export function registerMekannToolInventory(pi: ToolSurfaceAPI): void {
	const state = shadowState(pi as object);
	for (const [feature, names] of Object.entries(MEKANN_TOOL_INVENTORY)) {
		for (const name of names) {
			state.ownedTools.add(name);
			if (!state.projectedActive.has(name)) state.projectedActive.set(name, true);
		}
		state.projections.push({ feature, toolNames: [...names], projectedActive: true, at: Date.now() });
	}
}

/** Record schema size for later shadow-mode savings calculation. */
export function recordToolSurfaceSchemaBytes(name: string, schemaBytes: number): void {
	if (!Number.isFinite(schemaBytes) || schemaBytes < 0) return;
	schemaBytesByTool.set(name, schemaBytes);
}

/**
 * Record the Feature-state projection without changing the existing tool surface.
 * Existing feature-local enforcement remains unchanged during the migration.
 */
export function recordToolSurfaceProjection(
	pi: ToolSurfaceAPI,
	feature: string,
	toolNames: readonly string[],
	projectedActive: boolean,
): void {
	const state = shadowState(pi as object);
	for (const name of toolNames) {
		state.ownedTools.add(name);
		state.projectedActive.set(name, projectedActive);
	}
	state.projections.push({ feature, toolNames: [...toolNames], projectedActive, at: Date.now() });
	if (state.projections.length > 200) state.projections.splice(0, state.projections.length - 200);
}

export function recordDiagnostic(state: ShadowState, message: string): void {
	state.diagnostics.push(message);
	if (state.diagnostics.length > 20) state.diagnostics.shift();
}

export function getToolSurfaceShadowSnapshot(pi: ToolSurfaceAPI): ToolSurfaceShadowSnapshot {
	const state = shadowState(pi as object);
	const projectedInactiveTools = [...state.ownedTools].filter((name) => state.projectedActive.get(name) === false).sort();
	return {
		mode: "shadow",
		optimizationAvailable: typeof pi.getActiveTools === "function" && typeof pi.setActiveTools === "function",
		ownedTools: [...state.ownedTools].sort(),
		projectedInactiveTools,
		prospectiveSchemaBytes: projectedInactiveTools.reduce((sum, name) => sum + (schemaBytesByTool.get(name) ?? 0), 0),
		missedToolCalls: Object.fromEntries([...state.missedToolCalls.entries()].sort(([a], [b]) => a.localeCompare(b))),
		diagnostics: [...state.diagnostics],
		projections: [...state.projections],
	};
}

/**
 * Preserve the existing active-tool behavior while failing open on host errors.
 * New projection policy must be recorded separately through
 * {@link recordToolSurfaceProjection} during shadow rollout.
 */
export function setToolsActive(pi: ToolSurfaceAPI, toolNames: readonly string[], active: boolean): void {
	if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
	if (shadowState(pi as object).forceAll) return;
	try {
		const wanted = new Set(toolNames);
		const current = pi.getActiveTools();
		const currentSet = new Set(current);
		const next = active
			? [...current, ...toolNames.filter((name) => !currentSet.has(name))]
			: current.filter((name) => !wanted.has(name));
		if (next.length === current.length && next.every((name, index) => name === current[index])) return;
		pi.setActiveTools(next);
	} catch (error) {
		const state = shadowState(pi as object);
		const message = error instanceof Error ? error.message : String(error);
		recordDiagnostic(state, `Tool surface optimization failed open: ${message}`);
	}
}
