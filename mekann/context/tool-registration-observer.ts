import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { canonicalizeJson } from "../core/prompt-core/index.js";
import { safeByteLen } from "../utils/safe-bytes/index.js";
import { recordToolSchemaCurrent } from "./context-control/tool-schemas.js";

function recordToolRegistrationObservation(name: string, parameters: unknown): void {
	try {
		// canonicalizeJson gives a stable representation so the same logical schema
		// always reports the same byte length; safeByteLen never collapses to 0
		// even if canonicalization throws (cyclic parameters, BigInt, etc.).
		recordToolSchemaCurrent(name, safeByteLen(parameters ?? {}, canonicalizeJson));
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}

const decoratedApis = new WeakSet<ExtensionAPI>();

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Instrument Pi's tool-registration boundary once per ExtensionAPI.
 *
 * Context tracking measures the total LLM-visible tool-schema surface. Because
 * the pi SDK exposes no official "tool registered" lifecycle hook yet, this
 * monkey-patches the shared `pi.registerTool` method. The patched method
 * therefore records **every** registration that flows through it — including
 * tools registered by *other* extensions, not only the context suite's own
 * tools. The observation cannot be scoped to Mekann-owned tools without an
 * SDK-provided hook; total-surface measurement is the current intent.
 *
 * This is a **transition-period workaround** tracked in #180 / ADR-0028
 * (IC-197). Residual risks while the patch remains:
 *
 * - **(a) Shared boundary:** other extensions' `registerTool` calls are
 *   observed too. Acceptable for total-surface tracking; narrowing the scope
 *   to Mekann tools only is out of scope.
 * - **(b) Getter/proxy/non-writable:** if the SDK ever implements
 *   `registerTool` as an accessor, a Proxy, or a non-writable property, the
 *   assignment may throw or silently fail. We detect both cases (try/catch
 *   plus a read-back identity check) and warn at startup, degrading to
 *   un-instrumented registration rather than breaking startup. A Proxy whose
 *   `get` trap returns our wrapper while dispatching the original remains
 *   undetectable and is treated as a known limit.
 * - **(c) Patch contention:** another extension patching the same method
 *   could double-wrap or unwrap. Per-ExtensionAPI idempotency is guaranteed
 *   via `decoratedApis`, but cross-extension ordering is not coordinated.
 *
 * Once `pi.onToolRegistered` (or equivalent) ships, switch this module to the
 * hook and drop both the patch and `decoratedApis` (see #180).
 */
export function observeToolRegistrations(pi: ExtensionAPI): void {
	if (decoratedApis.has(pi)) return;
	const registerTool = pi.registerTool.bind(pi);
	const wrapper = ((tool: Parameters<ExtensionAPI["registerTool"]>[0]) => {
		const result = registerTool(tool);
		recordToolRegistrationObservation(String(tool.name ?? "unknown"), tool.parameters ?? {});
		return result;
	}) as ExtensionAPI["registerTool"];
	// The init-time `ExtensionAPI` exposes no user-facing notification surface
	// (no `ui`/`notify`/`log`); those live on `ExtensionContext` inside
	// command/event handlers, which are not available here. `console.warn` is the
	// one channel reachable in every runtime mode, so breakage degrades to it
	// rather than to silent failure. A typed diagnostic channel is tracked in #180.
	try {
		pi.registerTool = wrapper;
	} catch (error) {
		console.warn(`[context] registerTool monkey-patch failed (${describeError(error)}); tool-schema observation disabled.`);
		return;
	}
	if (pi.registerTool !== wrapper) {
		console.warn("[context] registerTool monkey-patch did not take effect (read-back mismatch — likely a getter/proxy implementation); tool-schema observation disabled.");
		return;
	}
	decoratedApis.add(pi);
}
