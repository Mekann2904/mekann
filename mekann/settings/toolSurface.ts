type ToolSurfaceAPI = {
	getActiveTools?: () => string[];
	setActiveTools?: (toolNames: string[]) => void;
};

export function setToolsActive(pi: ToolSurfaceAPI, toolNames: readonly string[], active: boolean): void {
	const api = pi;
	if (typeof api.getActiveTools !== "function" || typeof api.setActiveTools !== "function") return;
	const wanted = new Set(toolNames);
	const current = api.getActiveTools();
	// O(1) membership test instead of `current.includes(name)` (linear) per tool —
	// this runs on every tool-surface lifecycle event (issue #168 / IC-257).
	const currentSet = new Set(current);
	const next = active
		? [...current, ...toolNames.filter((name) => !currentSet.has(name))]
		: current.filter((name) => !wanted.has(name));
	if (next.length === current.length && next.every((name, index) => name === current[index])) return;
	api.setActiveTools(next);
}
