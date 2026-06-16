import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	inferRoleFromSnapshot,
	requestRoleOf,
	resolveRequestRole,
} from "./request-correlation.js";

// ---------------------------------------------------------------------------
// requestRoleOf
// ---------------------------------------------------------------------------

describe("requestRoleOf", () => {
	// Reset before each test so a host-provided PI_SUBAGENT_ROLE (e.g. when the
	// suite itself runs inside a child Pi) cannot leak into the "no signal"
	// cases. afterEach alone is insufficient because it runs after the test.
	beforeEach(() => {
		delete process.env.PI_SUBAGENT_ROLE;
	});
	afterEach(() => {
		delete process.env.PI_SUBAGENT_ROLE;
	});

	it("defaults to main root-process when no signal is present", () => {
		expect(requestRoleOf({}, {})).toEqual({
			requestRole: "main",
			requestRoleSource: "default:root-process",
		});
	});

	it("respects PI_SUBAGENT_ROLE=child env override", () => {
		process.env.PI_SUBAGENT_ROLE = "child";
		expect(requestRoleOf({}, {})).toEqual({
			requestRole: "subagent",
			requestRoleSource: "env:PI_SUBAGENT_ROLE",
		});
	});

	it("maps explicit role strings to roles", () => {
		expect(requestRoleOf({ role: "subagent" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ requestRole: "sub-agent" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ agentRole: "child" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ role: "tool-call" }, {}).requestRole).toBe("tool");
		expect(requestRoleOf({ role: "main" }, {}).requestRole).toBe("main");
		expect(requestRoleOf({ role: "root" }, {}).requestRole).toBe("main");
	});

	it("classifies via isSubagent boolean flag (event and ctx)", () => {
		expect(requestRoleOf({ isSubagent: true }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ subagent: true }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ session: { isSubagent: true } }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({}, { isSubagent: false }).requestRole).toBe("main");
		expect(requestRoleOf({ isSubagent: "true" }, {}).requestRole).toBe("subagent");
	});

	it("classifies a session with a parent session as subagent", () => {
		expect(requestRoleOf({ parentSession: "sess-parent" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ session: { parent: "sess-parent" } }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({}, { parent: "sess-parent" }).requestRole).toBe("subagent");
	});

	it("classifies via agentPath heuristics", () => {
		expect(requestRoleOf({ agentPath: "/root" }, {}).requestRole).toBe("main");
		expect(requestRoleOf({ agentPath: "/root/research/api_scan" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ agent: { path: "/root/anything" } }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ session: { path: "/root/sub" } }, {}).requestRole).toBe("subagent");
	});

	it("classifies via taskName / task.name / taskPath as subagent", () => {
		expect(requestRoleOf({ taskName: "research/api_scan" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ task: { name: "scan" } }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({ taskPath: "/root/scan" }, {}).requestRole).toBe("subagent");
		expect(requestRoleOf({}, { task: { name: "scan" } }).requestRole).toBe("subagent");
	});
});

// ---------------------------------------------------------------------------
// inferRoleFromSnapshot
// ---------------------------------------------------------------------------

describe("inferRoleFromSnapshot", () => {
	it("returns null when state is null/undefined", () => {
		expect(inferRoleFromSnapshot(null)).toBeNull();
		expect(inferRoleFromSnapshot(undefined)).toBeNull();
	});

	it("trusts an already-resolved non-default role", () => {
		expect(inferRoleFromSnapshot({ requestRole: "subagent", requestRoleSource: "taskName" })).toEqual({
			requestRole: "subagent",
			requestRoleSource: "snapshot:taskName",
		});
	});

	it("does not trust a weak/default stored role", () => {
		expect(inferRoleFromSnapshot({ requestRole: "main", requestRoleSource: "default:root-process" })).toBeNull();
		expect(inferRoleFromSnapshot({ requestRole: "main", requestRoleSource: "(none)" })).toBeNull();
		expect(inferRoleFromSnapshot({ requestRole: "unknown", requestRoleSource: "explicit:x" })).toBeNull();
	});

	it("infers main from runKeySource=cwd when no trusted role", () => {
		expect(inferRoleFromSnapshot({ runKeySource: "cwd" })).toEqual({
			requestRole: "main",
			requestRoleSource: "snapshot:runKeySource:cwd",
		});
	});

	it("returns null for a neutral runKeySource without a trusted role", () => {
		expect(inferRoleFromSnapshot({ runKeySource: "sessionId" })).toBeNull();
		expect(inferRoleFromSnapshot({ runKeySource: "conversationId" })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// resolveRequestRole
// ---------------------------------------------------------------------------

describe("resolveRequestRole", () => {
	it("returns the explicit role when an event signal is present", () => {
		expect(
			resolveRequestRole({ event: { taskName: "scan" }, ctx: {}, snapshot: null }),
		).toEqual({ requestRole: "subagent", requestRoleSource: "taskName" });
	});

	it("uses snapshot inference when no explicit signal fires (runKeySource=cwd)", () => {
		expect(
			resolveRequestRole({
				event: {},
				ctx: {},
				snapshot: { runKeySource: "cwd" },
			}),
		).toEqual({ requestRole: "main", requestRoleSource: "snapshot:runKeySource:cwd" });
	});

	it("uses the role-only memo hint when neither explicit nor snapshot signal fire", () => {
		expect(
			resolveRequestRole({
				event: {},
				ctx: {},
				snapshot: { runKeySource: "sessionId" },
				roleHint: { requestRole: "subagent", requestRoleSource: "taskName" },
			}),
		).toEqual({ requestRole: "subagent", requestRoleSource: "memo:taskName" });
	});

	it("falls back to the default main guess when nothing fires", () => {
		expect(resolveRequestRole({ event: {}, ctx: {}, snapshot: null })).toEqual({
			requestRole: "main",
			requestRoleSource: "default:root-process",
		});
	});

	it("prefers explicit signal over snapshot inference", () => {
		expect(
			resolveRequestRole({
				event: { role: "main" },
				ctx: {},
				snapshot: { requestRole: "subagent", requestRoleSource: "taskName" },
			}),
		).toEqual({ requestRole: "main", requestRoleSource: "explicit:main" });
	});

	it("prefers snapshot inference over the role-only memo hint", () => {
		expect(
			resolveRequestRole({
				event: {},
				ctx: {},
				snapshot: { runKeySource: "cwd" },
				roleHint: { requestRole: "subagent", requestRoleSource: "taskName" },
			}),
		).toEqual({ requestRole: "main", requestRoleSource: "snapshot:runKeySource:cwd" });
	});
});
