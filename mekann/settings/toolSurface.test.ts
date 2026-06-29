import { describe, expect, it } from "vitest";

import { setToolsActive } from "./toolSurface.js";

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
});
