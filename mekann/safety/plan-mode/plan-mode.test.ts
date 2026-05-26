import { describe, it, expect } from "vitest";
import {
	isPlanReadOnlyCommandIntent,
	classifyCommandIntent,
	buildBlockReason,
	loadPrompt,
	hashContent,
	READ_ONLY_MODE_TOOLS,
	parseModelRef,
	formatModelRef,
	sameModelRef,
	createDefaultConfig,
	normalizeConfig,
	createInitialState,
	isReadOnlyMode,
	modeLabel,
} from "./utils.js";

describe("read-only command intent", () => {
	it("allows read-only investigation commands", () => {
		expect(isPlanReadOnlyCommandIntent("git status")).toBe(true);
		expect(isPlanReadOnlyCommandIntent("ls -la")).toBe(true);
	});

	it("blocks commands with write/destructive intent", () => {
		expect(isPlanReadOnlyCommandIntent("npm install")).toBe(false);
		expect(classifyCommandIntent("touch x").kind).not.toBe("read_only");
	});
});

describe("read-only tool policy", () => {
	it("exposes the read-only tool allowlist", () => {
		expect(READ_ONLY_MODE_TOOLS.has("read")).toBe(true);
		expect(READ_ONLY_MODE_TOOLS.has("bash")).toBe(true);
		expect(READ_ONLY_MODE_TOOLS.has("edit")).toBe(false);
		expect(READ_ONLY_MODE_TOOLS.has("write")).toBe(false);
	});

	it("builds read-only block reasons", () => {
		const reason = buildBlockReason("edit", { path: "src/a.ts" }, 1);
		expect(reason).toContain("Read-only mode");
		expect(reason).toContain("src/a.ts");
	});
});

describe("prompts", () => {
	it("loads plan and read-only prompts", () => {
		expect(loadPrompt("plan-mode")).toContain("grill-with-docs");
		expect(loadPrompt("read-only-mode")).toContain("Read-only mode");
	});
});

describe("hashContent", () => {
	it("returns stable 12-char hashes", () => {
		expect(hashContent("hello")).toBe(hashContent("hello"));
		expect(hashContent("hello")).toHaveLength(12);
		expect(hashContent("hello")).not.toBe(hashContent("world"));
	});
});

describe("mode state", () => {
	it("initializes in main mode", () => {
		const state = createInitialState();
		expect(state.mode).toBe("main");
		expect(state.planPromptDelivered).toBe(false);
	});

	it("treats only read_only as read-only", () => {
		expect(isReadOnlyMode("main")).toBe(false);
		expect(isReadOnlyMode("plan")).toBe(false);
		expect(isReadOnlyMode("read_only")).toBe(true);
	});

	it("labels plan and read-only modes", () => {
		expect(modeLabel("plan")).toBe("PLAN MODE");
		expect(modeLabel("read_only")).toBe("READ-ONLY MODE");
		expect(modeLabel("main")).toBe("");
	});
});

describe("model config utilities", () => {
	it("parses and formats model refs", () => {
		const ref = parseModelRef("anthropic/claude-sonnet-4-5");
		expect(ref).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
		expect(formatModelRef(ref)).toBe("anthropic/claude-sonnet-4-5");
	});

	it("compares model refs", () => {
		expect(sameModelRef({ provider: "a", modelId: "b" }, { provider: "a", modelId: "b" })).toBe(true);
		expect(sameModelRef({ provider: "a", modelId: "b" }, { provider: "a", modelId: "c" })).toBe(false);
	});

	it("normalizes read_only model and thinking settings", () => {
		const config = normalizeConfig({
			models: { read_only: { provider: "p", modelId: "m" } },
			thinking: { read_only: "low" },
		});
		expect(config.models.read_only).toEqual({ provider: "p", modelId: "m" });
		expect(config.thinking.read_only).toBe("low");
		expect(createDefaultConfig().models).toEqual({});
	});
});
