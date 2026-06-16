/**
 * extension-test-utils.ts — sandbox extension テストの共有 helpers。
 *
 * Mock ExtensionAPI とモックモジュール (createBashTool, macSeatbelt,
 * permissions) のセットアップを提供する。各 focused suite はこれらを
 * import して利用する。tests/extension.test.ts から抽出された。
 */

import { vi } from "vitest";

// Mock peer dependencies
vi.mock("@earendil-works/pi-coding-agent", () => ({
	createBashTool: (_cwd: string) => ({
		execute: vi.fn(() => ({
			content: [{ type: "text", text: "mock output" }],
		})),
	}),
}));

// Mock macSeatbelt — isMacSandboxAvailable returns false by default (unit tests)
vi.mock("../macSeatbelt.js", () => ({
	isMacSandboxAvailable: vi.fn(() => Promise.resolve(false)),
	runSandboxedShellMac: vi.fn(() => Promise.resolve({
		code: 0,
		signal: null,
		stdout: "mock stdout",
		stderr: "",
	})),
	buildMacSeatbeltPolicy: vi.fn(() => "(version 1)\n(deny default)\n"),
	escapeSbplString: vi.fn((s: string) => s),
	pathLiteral: vi.fn((p: string) => `(literal "${p}")`),
	pathSubpath: vi.fn((p: string) => `(subpath "${p}")`),
	buildSandboxEnv: vi.fn(() => ({
		PATH: "/usr/bin:/bin",
		HOME: "/tmp/mock-home",
	})),
	validatePolicy: vi.fn(() => Promise.resolve()),
	resolveGitdirPaths: vi.fn(() => Promise.resolve([])),
}));

// Mock pathPolicy
vi.mock("../permissions.js", () => ({
	resolveRealPaths: vi.fn((paths: string[]) => Promise.resolve(paths)),
	validateWorkspaceRoot: vi.fn(() => Promise.resolve()),
	resolveSafeRealPath: vi.fn((p: string) => Promise.resolve(p)),
	assertPathInsideRoot: vi.fn(() => Promise.resolve()),
	isProtectedPath: vi.fn(() => false),
	protectedDirsSbplAlternation: vi.fn(() => "\\.git|\\.pi|\\.codex|\\.agents"),
	checkUnsafeRoot: vi.fn(() => Promise.resolve(null)),
	readOnlyPolicy: vi.fn((cwd: string, workspaceRoots: string[] = []) => ({ mode: "read_only", cwd, workspaceRoots, writableRoots: [], network: false })),
	workspaceWritePolicy: vi.fn(),
	yoloPolicy: vi.fn(),
	shouldRequestApproval: vi.fn((_mode: string, command: string) => {
		if (/\brm\s+-rf\b/i.test(command)) return { needsApproval: true, reason: "再帰的強制削除" };
		return { needsApproval: false };
	}),
	yoloApprovalMessage: vi.fn(),
}));

// ─── Mock infrastructure ─────────────────────────────────────────

export interface MockCtx {
	cwd: string;
	model: null;
	modelRegistry: { find: () => undefined };
	ui: {
		notify: ReturnType<typeof vi.fn>;
		confirm: ReturnType<typeof vi.fn>;
		theme: { fg: (c: string, t: string) => string };
		setWidget: ReturnType<typeof vi.fn>;
	};
}

export function createMockCtx(overrides?: Partial<MockCtx>): MockCtx {
	return {
		cwd: "/tmp/sandbox-test-project",
		model: null,
		modelRegistry: { find: () => undefined },
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
			theme: { fg: (_c: string, t: string) => t },
			setWidget: vi.fn(),
		},
		...overrides,
	};
}

export function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function; getArgumentCompletions?: Function }> = {};
	let flags: Record<string, unknown> = {};
	const registeredTools: Array<Record<string, any>> = [];
	let activeTools: string[] = [];
	const registeredFlags: Array<{ name: string; config: unknown }> = [];
	const eventHandlers: Record<string, Function> = {};

	const api = {
		registerFlag: vi.fn((name: string, config: unknown) => {
			registeredFlags.push({ name, config });
		}),
		registerTool: vi.fn((tool: Record<string, any>) => {
			registeredTools.push(tool);
			if (typeof tool.name === "string" && !activeTools.includes(tool.name)) activeTools.push(tool.name);
		}),
		registerCommand: vi.fn((name: string, config: { handler: Function; getArgumentCompletions?: Function }) => {
			commands[name] = config;
		}),
		on: vi.fn((event: string, handler: Function) => {
			hooks[event] = handler;
		}),
		getFlag: (name: string) => flags[name],
		getActiveTools: vi.fn(() => activeTools),
		setActiveTools: vi.fn((tools: string[]) => { activeTools = tools; }),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		events: {
			on: vi.fn((name: string, handler: Function) => {
				eventHandlers[name] = handler;
			}),
			emit: vi.fn((name: string, data: unknown) => {
				eventHandlers[name]?.(data);
			}),
		},
		// Test accessors
		get _hooks() { return hooks; },
		get _commands() { return commands; },
		set _flags(f: Record<string, unknown>) { flags = f; },
		get _registeredTools() { return registeredTools; },
		get _activeTools() { return activeTools; },
		get _registeredFlags() { return registeredFlags; },
		get _eventHandlers() { return eventHandlers; },
	};

	return api;
}

export async function loadExtension(mockApi: ReturnType<typeof createMockApi>) {
	const { default: sandboxExtension } = await import("../index.js");
	sandboxExtension(mockApi as any);
}

// ─── Prompt provider ─────────────────────────────────────────────
