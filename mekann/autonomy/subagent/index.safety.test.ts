/**
 * index.safety.test.ts — External Pi safety (kitty-split without unsafe opt-in) のテスト
 *
 * subagent/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./test-helpers.ts を参照。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(() =>
    Promise.resolve({
      session: {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
    }),
  ),
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

const AgentControlModule = import("./agentControl.js");

describe("External Pi safety: kitty-split without unsafe opt-in", () => {
	let AgentControl: any;
	beforeEach(async () => {
		AgentControl = (await AgentControlModule).AgentControl;
	});

	function createControlMockPi() {
		return {
			getActiveTools: vi.fn(() => []),
		} as any;
	}

	const baseCtx = {
		cwd: "/tmp/test",
		model: { id: "test-model" },
		modelRegistry: {
			find: vi.fn(() => undefined),
			getAvailable: vi.fn(() => Promise.resolve([{ id: "test-model" }])),
		},
	} as any;

	it("kitty-split without unsafe flag spawns in-process agent with no display", async () => {
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
		};

		const control = new AgentControl(createControlMockPi(), 4, 2, undefined, undefined, {
			displayMode: "kitty-split",
			kitty: fakeKitty as any,
			allowUnsafeExternalPi: false,
		});
		control.registry.ensureRoot("root");

		const result = await control.spawn(
			{ task_name: "task1", message: "test" },
			baseCtx,
		);

		const agent = control.registry.get("/root/task1");
		expect(agent?.authorityEnforced).toBe(true);
		expect(agent?.display).toBeUndefined();
		expect(result.status).toBe("pending_init");
	});

	it("kitty-pi without unsafe flag spawns in-process agent with no display", async () => {
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
		};

		const control = new AgentControl(createControlMockPi(), 4, 2, undefined, undefined, {
			displayMode: "kitty-pi",
			kitty: fakeKitty as any,
			allowUnsafeExternalPi: false,
		});
		control.registry.ensureRoot("root");

		const result = await control.spawn(
			{ task_name: "task1", message: "test" },
			baseCtx,
		);

		const agent = control.registry.get("/root/task1");
		expect(agent?.authorityEnforced).toBe(true);
		expect(agent?.display).toBeUndefined();
	});

	it("external Pi accepts final result after terminal status advisory", async () => {
		let childListener: ((message: any) => void) | undefined;
		const fakeHub = {
			onMessage: vi.fn((listener: (message: any) => void) => { childListener = listener; return vi.fn(); }),
			start: vi.fn(() => Promise.resolve()),
			waitForHello: vi.fn(() => Promise.resolve({ type: "hello", agentId: "sub_external", agentPath: "/root/external-status-first", pid: 123, cwd: "/tmp/test", capabilities: ["followup", "message"] })),
			stop: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve()),
		};
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
			close: vi.fn(() => Promise.resolve()),
			launchPiSplit: vi.fn(() => Promise.resolve({ kind: "kitty-split", status: "open", windowId: "w1", agentId: "sub_external", title: "external", cwd: "/tmp/test" })),
		};
		const ctx = { ...baseCtx, model: { id: "test-model", provider: "test-provider" } } as any;

		const control = new AgentControl(createControlMockPi(), 3, 2, undefined, undefined, {
			displayMode: "kitty-split",
			kitty: fakeKitty as any,
			hubFactory: vi.fn(() => fakeHub),
			allowUnsafeExternalPi: true,
			externalPiSlots: 1,
		});
		control.registry.ensureRoot("root");

		await control.spawn({ task_name: "external-status-first", message: "test" }, ctx);
		expect(childListener).toBeDefined();

		childListener!({ type: "status", agentId: "sub_external", status: "completed" });
		childListener!({ type: "final", agentId: "sub_external", status: "completed", message: "done after status" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		const finals = control.mailbox.pendingFor("/root").filter((item: any) => item.kind === "final_result");
		expect(finals).toHaveLength(1);
		expect(finals[0].content).toBe("done after status");
	});

	it("external Pi emits only one final result when duplicate or late messages arrive", async () => {
		let childListener: ((message: any) => void) | undefined;
		const fakeHub = {
			onMessage: vi.fn((listener: (message: any) => void) => { childListener = listener; return vi.fn(); }),
			start: vi.fn(() => Promise.resolve()),
			waitForHello: vi.fn(() => Promise.resolve({ type: "hello", agentId: "sub_external", agentPath: "/root/external", pid: 123, cwd: "/tmp/test", capabilities: ["followup", "message"] })),
			stop: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve()),
		};
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
			close: vi.fn(() => Promise.resolve()),
			launchPiSplit: vi.fn(() => Promise.resolve({ kind: "kitty-split", status: "open", windowId: "w1", agentId: "sub_external", title: "external", cwd: "/tmp/test" })),
		};
		const ctx = { ...baseCtx, model: { id: "test-model", provider: "test-provider" } } as any;

		const control = new AgentControl(createControlMockPi(), 3, 2, undefined, undefined, {
			displayMode: "kitty-split",
			kitty: fakeKitty as any,
			hubFactory: vi.fn(() => fakeHub),
			allowUnsafeExternalPi: true,
			externalPiSlots: 1,
		});
		control.registry.ensureRoot("root");

		await control.spawn({ task_name: "external", message: "test" }, ctx);
		expect(childListener).toBeDefined();

		childListener!({ type: "final", agentId: "sub_external", status: "completed", message: "done once" });
		childListener!({ type: "status", agentId: "sub_external", status: "running" });
		childListener!({ type: "final", agentId: "sub_external", status: "completed", message: "done twice" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		const finals = control.mailbox.pendingFor("/root").filter((item: any) => item.kind === "final_result");
		expect(finals).toHaveLength(1);
		expect(finals[0].content).toBe("done once");
	});

	it("external Pi spawn failure does not leave a ghost open agent", async () => {
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
			close: vi.fn(() => Promise.resolve()),
		};

		const control = new AgentControl(createControlMockPi(), 3, 2, undefined, undefined, {
			displayMode: "kitty-split",
			kitty: fakeKitty as any,
			allowUnsafeExternalPi: true,
		});
		control.registry.ensureRoot("root");

		await expect(control.spawn(
			{ task_name: "bad-external", message: "test" },
			baseCtx,
		)).rejects.toThrow("External Pi subagents require an exact provider/model_id");

		const ghost = control.registry.get("/root/bad-external");
		expect(ghost?.open).toBe(false);
		expect(control.openCount).toBe(1);

		await expect(control.spawn(
			{ task_name: "next-task", message: "test" },
			baseCtx,
		)).rejects.toThrow("External Pi subagents require an exact provider/model_id");
		expect(control.openCount).toBe(1);
	});

	it("list() includes authority and authority_enforced fields", async () => {
		const fakeKitty = {
			appendLog: vi.fn(() => Promise.resolve()),
		};

		const control = new AgentControl(createControlMockPi(), 4, 2, undefined, undefined, {
			displayMode: "kitty-split",
			kitty: fakeKitty as any,
			allowUnsafeExternalPi: false,
		});
		control.registry.ensureRoot("root");

		await control.spawn(
			{ task_name: "task1", message: "test" },
			baseCtx,
		);

		const listResult = control.list({});
		const agentEntry = listResult.agents.find((a: any) => a.agent_path === "/root/task1");
		expect(agentEntry).toBeDefined();
		expect(agentEntry.authority).toBeDefined();
		expect(agentEntry.authority.mode).toBe("propose_patch");
		expect(agentEntry.authority_enforced).toBe(true);
	});

	it("retry spawns as sibling path instead of child", async () => {
		const control = new AgentControl(createControlMockPi(), 4, 2, undefined, undefined, {
			displayMode: "none",
			allowUnsafeExternalPi: false,
		});
		control.registry.ensureRoot("root");

		// Simulate a stored result from /root/audit/patch-test
		const store = control.resultStoreFor("/tmp/test");
		const fakeAgent = {
			agentId: "agent-old",
			agentPath: "/root/audit/patch-test",
			authority: { mode: "propose_patch" as const, require_base_hash: true, max_patch_bytes: 50000 },
			authorityEnforced: true,
			workspaceCwd: "/tmp/test",
		};

		const stored = store.save(fakeAgent as any, {
			schema: "subagent.result.v1",
			outcome: "no_change",
			summary: "test",
		} as any);

		// Mark it rejected so retry can proceed
		store.markRejected(stored.result_id, "manual_reject");

		const spawned = await control.retryAgentResult(
			{ result_id: stored.result_id, reason: "stale" },
			baseCtx,
		);

		// retry path should be sibling: /root/audit/retry_patch-test_* not /root/audit/patch-test/retry_*
		expect(spawned.spawned.task_name).toMatch(/^\/root\/audit\/retry_patch-test_/);
	});
});
