type ToolSurfaceAPI = {
	getActiveTools?: () => string[];
	setActiveTools?: (toolNames: string[]) => void;
};

export function setToolsActive(pi: ToolSurfaceAPI, toolNames: readonly string[], active: boolean): void {
	const api = pi;
	if (typeof api.getActiveTools !== "function" || typeof api.setActiveTools !== "function") return;
	const wanted = new Set(toolNames);
	const current = api.getActiveTools();
	const next = active
		? [...current, ...toolNames.filter((name) => !current.includes(name))]
		: current.filter((name) => !wanted.has(name));
	if (next.length === current.length && next.every((name, index) => name === current[index])) return;
	api.setActiveTools(next);
}
