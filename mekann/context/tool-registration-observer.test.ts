import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Isolate the observer from the real tool-schema store so we can assert the
// measurement call directly. The context-tracker integration tests already
// cover end-to-end state mutation via the real store, so here we focus on the
// monkey-patch contract itself (idempotency, transparency, exception safety,
// and breakage detection).
vi.mock("./context-control/tool-schemas.js", () => ({
	recordToolSchemaCurrent: vi.fn(),
}));

import { observeToolRegistrations } from "./tool-registration-observer.js";
import { recordToolSchemaCurrent } from "./context-control/tool-schemas.js";

const recordSpy = vi.mocked(recordToolSchemaCurrent);

type Tool = Parameters<ExtensionAPI["registerTool"]>[0];

function tool(name: string | undefined): Tool {
	return {
		name,
		parameters: { type: "object", properties: { q: { type: "string" } } },
		execute: async () => ({ content: "ok" }),
	} as unknown as Tool;
}

// `pi` is cast to `any` (matching the context-tracker test convention) because
// a hand-rolled stub cannot satisfy the full ExtensionAPI surface; only the
// members the observer touches are exercised.
function fakePi(opts: { registerTool?: (...args: any[]) => any } = {}): any {
	return {
		on: vi.fn(),
		registerCommand: vi.fn(),
		registerTool: opts.registerTool ?? vi.fn(),
	};
}

describe("observeToolRegistrations — monkey-patch side effects", () => {
	beforeEach(() => {
		recordSpy.mockClear();
	});

	it("invokes the schema measurement function when a tool is registered", () => {
		const pi = fakePi();
		observeToolRegistrations(pi);

		expect(recordSpy).not.toHaveBeenCalled();
		pi.registerTool(tool("observed_tool"));
		expect(recordSpy).toHaveBeenCalledTimes(1);
		expect(recordSpy).toHaveBeenCalledWith("observed_tool", expect.any(Number));
	});

	it("forwards the tool to the underlying registerTool exactly once", () => {
		const underlying = vi.fn();
		const pi = fakePi({ registerTool: underlying });
		observeToolRegistrations(pi);

		pi.registerTool(tool("once_tool"));
		expect(underlying).toHaveBeenCalledTimes(1);
		expect(underlying).toHaveBeenCalledWith(expect.objectContaining({ name: "once_tool" }));
	});

	it("is idempotent: decorating the same ExtensionAPI twice wraps only once", () => {
		const underlying = vi.fn();
		const pi = fakePi({ registerTool: underlying });
		observeToolRegistrations(pi);
		observeToolRegistrations(pi);

		pi.registerTool(tool("idempotent_tool"));
		expect(underlying).toHaveBeenCalledTimes(1);
		expect(recordSpy).toHaveBeenCalledTimes(1);
	});

	it("decorates distinct ExtensionAPIs independently of one another", () => {
		const a = fakePi();
		const b = fakePi();
		observeToolRegistrations(a);
		observeToolRegistrations(b);

		a.registerTool(tool("a_tool"));
		b.registerTool(tool("b_tool"));
		expect(recordSpy).toHaveBeenCalledTimes(2);
	});

	it("transparently returns the underlying registerTool's return value", () => {
		const handle = { dispose: vi.fn() };
		const pi = fakePi({ registerTool: vi.fn(() => handle) });
		observeToolRegistrations(pi);

		const result = pi.registerTool(tool("returning_tool"));
		expect(result).toBe(handle);
	});

	it("propagates underlying registerTool failures without recording an observation", () => {
		const pi = fakePi({ registerTool: vi.fn(() => { throw new Error("registration failed"); }) });
		observeToolRegistrations(pi);

		expect(() => pi.registerTool(tool("boom_tool"))).toThrow("registration failed");
		expect(recordSpy).not.toHaveBeenCalled();
	});

	it("keeps registration working when the observation itself throws (best-effort)", () => {
		const handle = { ok: true };
		const pi = fakePi({ registerTool: vi.fn(() => handle) });
		observeToolRegistrations(pi);

		recordSpy.mockImplementationOnce(() => { throw new Error("telemetry exploded"); });

		// Must not throw — monitoring must never break the caller.
		const result = pi.registerTool(tool("resilient_tool"));
		expect(result).toBe(handle);
		expect(recordSpy).toHaveBeenCalledTimes(1);
	});

	it("records a non-zero schema byte length derived from the parameters", () => {
		const pi = fakePi();
		observeToolRegistrations(pi);
		pi.registerTool({
			name: "sized_tool",
			parameters: { type: "object", properties: { query: { type: "string" }, flag: { type: "boolean" } } },
			execute: async () => ({ content: "ok" }),
		} as unknown as Tool);

		expect(recordSpy).toHaveBeenCalledWith("sized_tool", expect.any(Number));
		expect(recordSpy.mock.calls[0][1]).toBeGreaterThan(0);
	});

	it("reports 'unknown' as the name when the tool omits one", () => {
		const pi = fakePi();
		observeToolRegistrations(pi);
		pi.registerTool({ parameters: { type: "object" }, execute: async () => ({ content: "ok" }) } as unknown as Tool);
		expect(recordSpy).toHaveBeenCalledWith("unknown", expect.any(Number));
	});

	describe("breakage detection (SDK implements registerTool as getter/proxy/non-writable)", () => {
		// The init-time ExtensionAPI has no UI/log surface, so diagnostics
		// degrade to console.warn (see observer impl). Spy once per test.
		let warnSpy: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		});
		afterEach(() => {
			warnSpy.mockRestore();
		});

		it("warns via console.warn and stays un-instrumented when the assignment throws (non-writable)", () => {
			const underlying = vi.fn();
			const pi: any = { on: vi.fn(), registerCommand: vi.fn() };
			Object.defineProperty(pi, "registerTool", { value: underlying, writable: false, configurable: true });

			expect(() => observeToolRegistrations(pi)).not.toThrow();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0][0]).toMatch(/monkey-patch failed/);

			pi.registerTool(tool("blocked_tool"));
			expect(recordSpy).not.toHaveBeenCalled();
			expect(underlying).toHaveBeenCalledTimes(1);
		});

		it("warns via console.warn and stays un-instrumented when the assignment silently fails (Proxy read-back mismatch)", () => {
			const underlying = vi.fn();
			const target: any = { on: vi.fn(), registerCommand: vi.fn(), registerTool: underlying };
			const pi = new Proxy(target, {
				set: () => true,
				get: (t, prop, receiver) => {
					if (prop === "registerTool") return underlying; // ignore any assignment
					return Reflect.get(t, prop, receiver);
				},
			});

			expect(() => observeToolRegistrations(pi)).not.toThrow();
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0][0]).toMatch(/did not take effect/);

			pi.registerTool(tool("proxy_tool"));
			expect(recordSpy).not.toHaveBeenCalled();
			expect(underlying).toHaveBeenCalledTimes(1);
		});
	});
});
