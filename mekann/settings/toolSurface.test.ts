import { describe, expect, it } from "vitest";

import {
	getToolSurfaceShadowSnapshot,
	observeToolSurfaceShadow,
	recordToolSurfaceProjection,
	recordToolSurfaceSchemaBytes,
	setToolsActive,
} from "./toolSurface.js";

/**
 * Minimal in-memory tool-surface double. `setToolsActive` only needs
 * `getActiveTools`/`setActiveTools`, so we back both by a mutable array and
 * expose it for assertions.
 */
function makeSurface(active: string[]): {
	pi: { getActiveTools: () => string[]; setActiveTools: (names: string[]) => void };
	current: () => string[];
} {
	let current = [...active];
	return {
		pi: {
			getActiveTools: () => current,
			setActiveTools: (names: string[]) => {
				current = names;
			},
		},
		current: () => current,
	};
}

describe("setToolsActive", () => {
	it("activates new tools without dropping existing ones", () => {
		const s = makeSurface(["a", "b"]);
		setToolsActive(s.pi, ["b", "c"], true);
		expect(s.current()).toEqual(["a", "b", "c"]);
	});

	it("does not duplicate already-active tools", () => {
		const s = makeSurface(["a", "b"]);
		setToolsActive(s.pi, ["a", "b"], true);
		expect(s.current()).toEqual(["a", "b"]);
	});

	it("deactivates the requested tools and preserves the rest", () => {
		const s = makeSurface(["a", "b", "c"]);
		setToolsActive(s.pi, ["b"], false);
		expect(s.current()).toEqual(["a", "c"]);
	});

	it("is a no-op (no setActiveTools call) when activation already matches", () => {
		const s = makeSurface(["a", "b"]);
		let calls = 0;
		s.pi.setActiveTools = () => {
			calls++;
		};
		// Every wanted tool is already active, so next === current.
		setToolsActive(s.pi, ["a", "b"], true);
		expect(calls).toBe(0);
	});

	it("is a no-op when deactivation removes nothing", () => {
		const s = makeSurface(["a", "b"]);
		let calls = 0;
		s.pi.setActiveTools = () => {
			calls++;
		};
		setToolsActive(s.pi, ["z"], false);
		expect(calls).toBe(0);
	});

	it("preserves existing tool order and appends only genuinely-new tools", () => {
		const s = makeSurface(["x", "y"]);
		setToolsActive(s.pi, ["z", "x"], true);
		// x is already active (kept in place); z is new and appended.
		expect(s.current()).toEqual(["x", "y", "z"]);
	});

	it("scales to large tool sets without quadratic membership scans (issue #168 / IC-257)", () => {
		// Build a large active set + a large requested set. The O(1) Set-based
		// membership test keeps this trivial; the behaviour (no drops, no dups)
		// is what we assert. This is a smoke test that the Set path is wired up.
		const existing = Array.from({ length: 2000 }, (_, i) => `tool-${i}`);
		const s = makeSurface(existing);
		const requested = Array.from({ length: 4000 }, (_, i) => `tool-${i}`);
		setToolsActive(s.pi, requested, true);
		// No duplicates, no drops: union of existing and requested, existing order first.
		expect(s.current()).toHaveLength(new Set([...existing, ...requested]).size);
		expect(s.current().slice(0, existing.length)).toEqual(existing);
	});

	it("is a no-op when the api lacks the surface hooks", () => {
		const s = makeSurface(["a"]);
		// Only getActiveTools is present; setActiveTools is missing.
		const pi = { getActiveTools: s.pi.getActiveTools } as unknown as Parameters<typeof setToolsActive>[0];
		expect(() => setToolsActive(pi, ["a", "b"], true)).not.toThrow();
		expect(s.current()).toEqual(["a"]);
	});

	it("fails open and records a diagnostic when the host throws", () => {
		const pi = {
			getActiveTools: () => ["a"],
			setActiveTools: () => { throw new Error("host changed"); },
		};
		expect(() => setToolsActive(pi, ["a"], false)).not.toThrow();
		expect(getToolSurfaceShadowSnapshot(pi).diagnostics).toContain(
			"Tool surface optimization failed open: host changed",
		);
	});
});

describe("tool surface shadow mode", () => {
	it("records Mekann ownership, projected inactivity, and schema savings without changing tools", () => {
		const s = makeSurface(["pi_tool", "goal_tool"]);
		recordToolSurfaceSchemaBytes("goal_tool", 640);
		recordToolSurfaceProjection(s.pi, "goal", ["goal_tool"], false);

		expect(s.current()).toEqual(["pi_tool", "goal_tool"]);
		expect(getToolSurfaceShadowSnapshot(s.pi)).toMatchObject({
			mode: "shadow",
			ownedTools: ["goal_tool"],
			projectedInactiveTools: ["goal_tool"],
			prospectiveSchemaBytes: 640,
		});
	});

	it("counts calls that the projection would have missed", () => {
		let handler: ((event: { toolName?: string }) => void) | undefined;
		const pi = {
			getActiveTools: () => ["goal_tool"],
			setActiveTools: () => {},
			on: (event: string, next: typeof handler) => { if (event === "tool_call") handler = next; },
		};
		observeToolSurfaceShadow(pi);
		recordToolSurfaceProjection(pi, "goal", ["goal_tool"], false);
		handler?.({ toolName: "goal_tool" });
		handler?.({ toolName: "unowned_tool" });

		expect(getToolSurfaceShadowSnapshot(pi).missedToolCalls).toEqual({ goal_tool: 1 });
	});

	it("exposes concise shadow telemetry through /tool-surface", () => {
		let command: { handler: (args: string | undefined, ctx: any) => void } | undefined;
		const pi = {
			getActiveTools: () => ["goal_tool"],
			setActiveTools: () => {},
			registerCommand: (_name: string, value: typeof command) => { command = value; },
		};
		recordToolSurfaceProjection(pi, "goal", ["goal_tool"], false);
		observeToolSurfaceShadow(pi);
		let notification = "";
		command?.handler(undefined, { ui: { notify: (message: string) => { notification = message; } } });
		expect(notification).toContain("Mekann tool surface: shadow");
		expect(notification).toContain("Projected inactive: 1");
	});

	it("does not replace the host tool surface when restore-all hooks are incomplete", async () => {
		let command: { handler: (args: string | undefined, ctx: any) => void | Promise<void> } | undefined;
		let setCalls = 0;
		const pi = {
			setActiveTools: () => { setCalls++; },
			registerCommand: (_name: string, value: typeof command) => { command = value; },
		};
		observeToolSurfaceShadow(pi as any);
		await command?.handler("all", { ui: { notify: () => {} } });
		expect(setCalls).toBe(0);
		expect(getToolSurfaceShadowSnapshot(pi).diagnostics).toContain(
			"Restore-all unavailable: host tool-surface hooks are incomplete",
		);
	});

	it("restores the pre-override surface when leaving the all override", async () => {
		let command: { handler: (args: string | undefined, ctx: any) => void | Promise<void> } | undefined;
		const s = makeSurface(["pi_tool", "get_goal"]);
		const pi = {
			...s.pi,
			registerCommand: (_name: string, value: typeof command) => { command = value; },
		};
		observeToolSurfaceShadow(pi as any);
		recordToolSurfaceProjection(pi, "goal", ["get_goal"], false);
		setToolsActive(pi, ["get_goal"], false);
		expect(s.current()).toEqual(["pi_tool"]);
		await command?.handler("all", { ui: { notify: () => {} } });
		expect(s.current()).toContain("get_goal");
		await command?.handler("shadow", { ui: { notify: () => {} } });
		expect(s.current()).toEqual(["pi_tool"]);
	});
});
