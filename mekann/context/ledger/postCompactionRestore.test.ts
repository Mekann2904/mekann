import { describe, expect, it, vi } from "vitest";
import {
	POST_COMPACTION_RESTORE_FRAGMENT_ID,
	POST_COMPACTION_RESTORE_MAX_BYTES,
	POST_COMPACTION_RESTORE_PRIORITY,
	PostCompactionRestoreController,
	buildRestoreFragment,
	extractMessageText,
	messageDeliveredRestore,
} from "./postCompactionRestore.js";
import type { PromptProviderContext } from "../../core/prompt-core/index.js";

const ctx = (cwd: string): PromptProviderContext => ({ cwd });

describe("buildRestoreFragment", () => {
	it("produces a dynamic, avoid_cache current_context fragment with the canonical id/priority", () => {
		const f = buildRestoreFragment("<mekann_session_context></mekann_session_context>");
		expect(f.id).toBe(POST_COMPACTION_RESTORE_FRAGMENT_ID);
		expect(f.source).toBe("context-ledger");
		expect(f.kind).toBe("current_context");
		expect(f.stability).toBe("dynamic");
		expect(f.scope).toBe("turn");
		expect(f.priority).toBe(POST_COMPACTION_RESTORE_PRIORITY);
		expect(f.cacheIntent).toBe("avoid_cache");
		expect(f.content).toContain("post-compaction working-memory restore");
		expect(f.content).toContain("<mekann_session_context");
	});

	it("priority is unique among existing runtime-state fragments (goal 700, autoresearch 750, model-optimizer hint 180)", () => {
		expect(POST_COMPACTION_RESTORE_PRIORITY).toBe(720);
		expect([180, 700, 750]).not.toContain(POST_COMPACTION_RESTORE_PRIORITY);
	});
});

describe("extractMessageText", () => {
	it("passes strings through", () => {
		expect(extractMessageText("hello")).toBe("hello");
	});

	it("joins text parts of a content array", () => {
		expect(extractMessageText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
	});

	it("returns empty for unknown shapes", () => {
		expect(extractMessageText(42)).toBe("");
		expect(extractMessageText(undefined)).toBe("");
		expect(extractMessageText(null)).toBe("");
	});
});

describe("messageDeliveredRestore", () => {
	it("detects a freshly-built dynamic block carrying the restore fragment", () => {
		const messages = [
			{ role: "user", content: "hi" },
			{
				role: "user",
				customType: "cache-friendly-dynamic-context",
				content: [{ type: "text", text: `<!-- fragment:context-ledger:${POST_COMPACTION_RESTORE_FRAGMENT_ID}:current_context:dynamic:v1 -->\n<mekann_session_context/>` }],
			},
		];
		expect(messageDeliveredRestore(messages)).toBe(true);
	});

	it("ignores a dynamic block that lacks the restore fragment", () => {
		const messages = [
			{
				role: "user",
				customType: "cache-friendly-dynamic-context",
				content: [{ type: "text", text: "<!-- fragment:goal:goal:runtime-state:... -->" }],
			},
		];
		expect(messageDeliveredRestore(messages)).toBe(false);
	});

	it("ignores the restore marker sitting in a non-last (stale) message", () => {
		// A prior cycle's block survives in the middle; the last message is the
		// new user message, so this is not a fresh delivery.
		const messages = [
			{
				role: "user",
				customType: "cache-friendly-dynamic-context",
				content: [{ type: "text", text: POST_COMPACTION_RESTORE_FRAGMENT_ID }],
			},
			{ role: "assistant", content: "done" },
			{ role: "user", content: "next" },
		];
		expect(messageDeliveredRestore(messages)).toBe(false);
	});

	it("returns false for empty messages", () => {
		expect(messageDeliveredRestore([])).toBe(false);
	});
});

function makeController(opts: { enabled?: boolean; xml?: string } = {}) {
	const enabled = opts.enabled ?? true;
	const xml = opts.xml ?? `<mekann_session_context><task_events><event id="ev1" kind="task" priority="P1 (high)" status="active" effectiveStatus="active" evidenceLevel="observed" at="2024-01-01T00:00:00.000Z"><title>T</title><summary>S</summary></event></task_events></mekann_session_context>`;
	const readSnapshotXml = vi.fn(async () => xml);
	const controller = new PostCompactionRestoreController({ isEnabled: () => enabled, readSnapshotXml });
	return { controller, readSnapshotXml, xml };
}

describe("PostCompactionRestoreController", () => {
	it("returns no fragments when not armed", async () => {
		const { controller, readSnapshotXml } = makeController();
		expect(await controller.getFragments(ctx("/cwd"))).toEqual([]);
		expect(readSnapshotXml).not.toHaveBeenCalled();
	});

	it("arms on arm() and contributes the restore fragment", async () => {
		const { controller } = makeController();
		controller.arm();
		const fragments = await controller.getFragments(ctx("/cwd"));
		expect(fragments).toHaveLength(1);
		expect(fragments[0].id).toBe(POST_COMPACTION_RESTORE_FRAGMENT_ID);
		expect(fragments[0].cacheIntent).toBe("avoid_cache");
	});

	it("returns no fragments when disabled even if armed", async () => {
		const { controller } = makeController({ enabled: false });
		controller.arm();
		expect(await controller.getFragments(ctx("/cwd"))).toEqual([]);
	});

	it("returns no fragments when the ledger has no active events", async () => {
		const { controller } = makeController({ xml: `<mekann_session_context schemaVersion="mekann-context-snapshot/v2"></mekann_session_context>` });
		controller.arm();
		expect(await controller.getFragments(ctx("/cwd"))).toEqual([]);
	});

	it("disarms via consumeIfDelivered once delivered", async () => {
		const { controller } = makeController();
		controller.arm();
		expect(controller.isArmed()).toBe(true);

		const delivered = [{
			role: "user",
			customType: "cache-friendly-dynamic-context",
			content: [{ type: "text", text: POST_COMPACTION_RESTORE_FRAGMENT_ID }],
		}];
		controller.consumeIfDelivered(delivered);
		expect(controller.isArmed()).toBe(false);
		expect(await controller.getFragments(ctx("/cwd"))).toEqual([]);
	});

	it("stays armed when the block was not freshly delivered", async () => {
		const { controller } = makeController();
		controller.arm();
		// Last message is a regular user message (cache-friendly skipped).
		controller.consumeIfDelivered([{ role: "user", content: "hello" }]);
		expect(controller.isArmed()).toBe(true);
	});

	it("reset() disarms (fresh session)", async () => {
		const { controller } = makeController();
		controller.arm();
		controller.reset();
		expect(controller.isArmed()).toBe(false);
		expect(await controller.getFragments(ctx("/cwd"))).toEqual([]);
	});

	it("re-arms after being consumed when a new compaction fires", async () => {
		const { controller } = makeController();
		controller.arm();
		controller.consumeIfDelivered([{
			role: "user",
			customType: "cache-friendly-dynamic-context",
			content: [{ type: "text", text: POST_COMPACTION_RESTORE_FRAGMENT_ID }],
		}]);
		expect(controller.isArmed()).toBe(false);
		controller.arm();
		expect(await controller.getFragments(ctx("/cwd"))).toHaveLength(1);
	});

	it("uses the configured byte budget when reading the snapshot", async () => {
		expect(POST_COMPACTION_RESTORE_MAX_BYTES).toBe(4096);
	});
});
