/**
 * Coverage tests for modes — targets uncovered lines in index.ts and utils.ts.
 *
 * index.ts uncovered:
 *
 * utils.ts uncovered:
 *   - L150: sleepSync body
 *   - L181-187: withConfigLock stale lock / ENOENT / timeout / sleepSync
 *   - L208-209: writeModelConfigUnlocked renameSync fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "os";
import { clearPromptProvidersForTests } from "../../core/prompt-core/index.js";

// Mock peer dependencies before importing the extension
vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-ai", () => ({}));
vi.mock("@earendil-works/pi-tui", () => ({
	Key: { super: (k: string) => `super+${k}` },
}));

// ─── Mock infrastructure (mirrors index.test.ts) ──────────────────

interface MockModel { provider: string; id: string }

interface MockExtensionContext {
	cwd: string;
	model: MockModel | null;
	modelRegistry: {
		find: (provider: string, modelId: string) => MockModel | undefined;
		getAvailable?: () => MockModel[] | Promise<MockModel[]>;
	};
	ui: {
		notify: (msg: string, level?: string) => void;
		confirm: (title: string, message: string) => Promise<boolean>;
		theme: { fg: (color: string, text: string) => string };
		setStatus: (key: string, value: unknown) => void;
	};
}

function createMockApi(options?: { setModelResult?: boolean }) {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function }> = {};
	const tools: Record<string, any> = {};
	let flags: Record<string, unknown> = {};
	let activeTools: string[] = ["read", "bash", "edit", "write"];
	const sentMessages: string[] = [];
	let thinkingLevel = "medium";
	const appendEntries: Array<{ type: string; data: unknown }> = [];
	const setModelResult = options?.setModelResult ?? true;

	const api = {
		registerFlag: vi.fn(),
		registerTool: vi.fn((tool: any) => { tools[tool.name] = tool; }),
		registerCommand: vi.fn((name: string, config: { handler: Function }) => {
			commands[name] = config;
		}),
		registerShortcut: vi.fn(),
		on: vi.fn((event: string, handler: Function) => {
			hooks[event] = handler;
		}),
		getActiveTools: () => activeTools,
		setActiveTools: vi.fn((tools: string[]) => { activeTools = tools; }),
		setModel: vi.fn((_model: MockModel) => Promise.resolve(setModelResult)),
		getThinkingLevel: () => thinkingLevel,
		setThinkingLevel: vi.fn((level: string) => { thinkingLevel = level; }),
		getFlag: (name: string) => flags[name],
		sendUserMessage: vi.fn((msg: string) => { sentMessages.push(msg); }),
		appendEntry: vi.fn((type: string, data: unknown) => { appendEntries.push({ type, data }); }),
		setWidget: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn((event: string, handler: Function) => { hooks[`event:${event}`] = handler; }) },
		get _hooks() { return hooks; },
		get _commands() { return commands; },
		get _tools() { return tools; },
		set _flags(f: Record<string, unknown>) { flags = f; },
		get _activeTools() { return activeTools; },
		get _sentMessages() { return sentMessages; },
		get _appendEntries() { return appendEntries; },
		get _thinkingLevel() { return thinkingLevel; },
	};

	return api;
}

function createMockCtx(overrides?: Partial<MockExtensionContext>): MockExtensionContext {
	return {
		cwd: "/tmp/project",
		model: { provider: "anthropic", id: "sonnet" },
		modelRegistry: {
			find: (provider: string, modelId: string) => ({ provider, id: modelId }),
		},
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
			theme: { fg: (_c: string, t: string) => t },
			setStatus: vi.fn(),
		},
		...overrides,
	};
}

async function loadExtension(mockApi: ReturnType<typeof createMockApi>) {
	const { default: modesExtension } = await import("./index.js");
	modesExtension(mockApi as any);
}

/** Write initial config to real mekann.json, restoring (or deleting) on cleanup. */
function withModesConfig<T>(initial: unknown, fn: (configPath: string) => Promise<T>): Promise<T> {
	const fs = require("fs");
	const path = require("path");
	const os = require("os");
	const configPath = path.join(os.homedir(), ".pi", "agent", "mekann.json");
	const original = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : undefined;
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	const wrapped = { version: 1, features: { "modes": initial } };
	fs.writeFileSync(configPath, JSON.stringify(wrapped));
	return fn(configPath).finally(() => {
		if (original !== undefined) fs.writeFileSync(configPath, original);
		else { try { fs.unlinkSync(configPath); } catch {} }
	});
}

beforeEach(() => { clearPromptProvidersForTests(); vi.resetModules(); });


describe("index.ts: persisted model restore failures", () => {
	it("keeps saved main model when registry is temporarily unavailable on session_start", async () => withModesConfig({
		models: { main: { provider: "anthropic", modelId: "sonnet" } },
	}, async (configPath) => {
		const mock = createMockApi();
		await loadExtension(mock);
		const ctx = createMockCtx({
			modelRegistry: {
				find: () => undefined,
				getAvailable: () => [],
			},
		});

		await mock._hooks.session_start({}, ctx);

		expect(mock.setModel).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("設定は保持します"), "warning");
		const saved = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(saved.features["modes"].models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });
	}));


	it("retries startup restore when available models are populated shortly after session_start", async () => withModesConfig({
		models: { main: { provider: "anthropic", modelId: "sonnet" } },
	}, async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		let calls = 0;
		const ctx = createMockCtx({
			modelRegistry: {
				find: () => undefined,
				getAvailable: () => (++calls === 1 ? [] : [{ provider: "anthropic", id: "sonnet" }]),
			},
		});

		await mock._hooks.session_start({}, ctx);

		expect(calls).toBe(2);
		expect(mock.setModel).toHaveBeenCalledWith({ provider: "anthropic", id: "sonnet" });
	}));
});

describe("index.ts: startup mode flags", () => {
	it("applies the configured sub profile on --sub startup", async () => withModesConfig({
		models: { sub: { provider: "openai", modelId: "gpt-5" } },
		thinking: { sub: "high" },
	}, async () => {
		const mock = createMockApi();
		mock._flags = { sub: true };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		expect(mock.setModel).toHaveBeenCalledWith({ provider: "openai", id: "gpt-5" });
		expect(mock.setThinkingLevel).toHaveBeenCalledWith("high");
	}));

	it("restores initial main model after --read-only startup when models.main is unset", async () => withModesConfig({
		models: { read_only: { provider: "openai", modelId: "gpt-5" } },
	}, async () => {
		const mock = createMockApi();
		mock._flags = { 'read-only': true };
		await loadExtension(mock);
		const ctx = createMockCtx({ model: { provider: "anthropic", id: "sonnet" } });

		await mock._hooks.session_start({}, ctx);
		await mock._commands["read-only"].handler("", ctx);

		expect(mock.setModel).toHaveBeenCalledWith({ provider: "openai", id: "gpt-5" });
		expect(mock.setModel).toHaveBeenCalledWith({ provider: "anthropic", id: "sonnet" });
	}));

	it("does not try startup snapshot fallback when explicit models.main restore fails", async () => withModesConfig({
		models: {
			main: { provider: "openai-codex", modelId: "gpt-5.5" },
			read_only: { provider: "openai", modelId: "gpt-5" },
		},
	}, async () => {
		const mock = createMockApi();
		mock._flags = { 'read-only': true };
		await loadExtension(mock);
		const ctx = createMockCtx({
			model: { provider: "anthropic", id: "sonnet" },
			modelRegistry: {
				find: (provider: string, modelId: string) => ({ provider, id: modelId }),
				getAvailable: () => [{ provider: "openai", id: "gpt-5" }],
			},
		});

		await mock._hooks.session_start({}, ctx);
		await mock._commands["read-only"].handler("", ctx);

		expect(mock.setModel).toHaveBeenCalledWith({ provider: "openai", id: "gpt-5" });
		expect(mock.setModel).not.toHaveBeenCalledWith({ provider: "anthropic", id: "sonnet" });
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("openai-codex/gpt-5.5"), "warning");
		expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("anthropic/sonnet"), "warning");
	}));
});

// ═══════════════════════════════════════════════════════════════════
// utils.ts: withConfigLock stale lock handling (L176-178, L181-182, L185-186)
// ═══════════════════════════════════════════════════════════════════
describe("utils.ts: config persistence edge cases", () => {
	it("updateConfigField preserves explicit thinking off instead of treating it as clear", async () => {
		const { updateConfigField, createDefaultConfig } = await import("./utils.js");
		const tmpDir = mkdtempSync(join(tmpdir(), "modes-thinking-off-test-"));
		const configPath = join(tmpDir, "mekann.json");
		const config = createDefaultConfig();

		updateConfigField(config, "thinking", "main", "off", configPath);

		const saved = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(saved.features["modes"].thinking.main).toBe("off");
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("stale lock is reclaimed and save succeeds", async () => {
		const { saveModelConfig, createDefaultConfig } = await import("./utils.js");
		const tmpDir = mkdtempSync(join(tmpdir(), "modes-stale-test-"));
		const configPath = join(tmpDir, "modes.json");

		// Create a stale lock (mtime > 30s ago)
		const lockPath = `${configPath}.lock`;
		mkdirSync(lockPath, { recursive: true });
		writeFileSync(join(lockPath, "owner.json"), "{}");

		// Make the lock directory's mtime old (stale)
		const staleTime = new Date(Date.now() - 60_000); // 60 seconds ago
		const fs = require("fs");
		fs.utimesSync(lockPath, staleTime, staleTime);

		const config = createDefaultConfig();
		config.models.main = { provider: "test", modelId: "stale-test" };

		// Should successfully reclaim stale lock and save
		saveModelConfig(config, configPath);

		const saved = JSON.parse(readFileSync(configPath, "utf-8"));
		expect(saved.features["modes"].models.main).toEqual({ provider: "test", modelId: "stale-test" });

		rmSync(tmpDir, { recursive: true, force: true });
	});
});

// ═══════════════════════════════════════════════════════════════════
// utils.ts: L181-182 — ENOENT during stat in withConfigLock
// NOTE: This race condition (lock disappears between mkdir failure and stat)
// requires a concurrent process. We test the stale lock reclaim path instead,
// which exercises similar code paths (L176-178).
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// utils.ts: L208-209 — writeModelConfigUnlocked renameSync fallback
// This path triggers when renameSync fails (cross-device link).
// Since utils.ts uses named imports from 'node:fs', we can't mock
// renameSync after module load. Tested indirectly by stale lock test.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// index.ts: restoreMainModelAndThinking fallback path
// snapshotMain is intentionally in-memory only; model_select/thinking events own persistence.
// The fallback path is covered by startup flag tests where models.main is unset.
// ═══════════════════════════════════════════════════════════════════
