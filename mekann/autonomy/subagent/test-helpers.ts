/**
 * Shared test helpers for subagent tests.
 * Extracted from index.test.ts to eliminate 7 duplicate createMockApi() definitions.
 */
import { vi } from "vitest";

export type MockApi = ReturnType<typeof createMockApi>;

export function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function; description?: string }> = {};
	let flags: Record<string, unknown> = { "subagent-display": "none", "subagent-max-depth": "2" };
	const registeredTools: Array<Record<string, any>> = [];
	const registeredFlags: Array<{ name: string; config: unknown }> = [];

	return {
		registerFlag: vi.fn((name: string, config: unknown) => {
			registeredFlags.push({ name, config });
		}),
		registerTool: vi.fn((tool: Record<string, any>) => {
			registeredTools.push(tool);
		}),
		registerCommand: vi.fn((name: string, config: any) => {
			commands[name] = config;
		}),
		on: vi.fn((event: string, handler: Function) => {
			hooks[event] = handler;
		}),
		getFlag: (name: string) => flags[name],
		getActiveTools: vi.fn(() => []),
		events: {
			on: vi.fn(),
			emit: vi.fn(),
		},
		appendEntry: vi.fn(),
		sendUserMessage: vi.fn(),
		// Test accessors
		get _hooks() {
			return hooks;
		},
		get _commands() {
			return commands;
		},
		set _flags(f: Record<string, unknown>) {
			flags = f;
		},
		get _registeredTools() {
			return registeredTools;
		},
		get _registeredFlags() {
			return registeredFlags;
		},
	};
}

/**
 * Helper: load the subagent extension with a mock API.
 * Resets module cache so each test gets a fresh extension instance.
 */
export async function loadExtension(mockApi: MockApi) {
	const { default: subagentExtension } = await import("./index.js");
	await subagentExtension(mockApi as any);
	return mockApi;
}
