/**
 * @file BDDスタイル記述ヘルパー
 * @description Given/When/Then形式のテスト記述を簡素化するヘルパー関数
 * @testFramework vitest
 */

import { beforeEach, afterEach, describe, it, vi } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface StepFunction {
	(description: string, fn: () => void | Promise<void>): void;
}

interface ScenarioFunction {
	(description: string, fn: () => void | Promise<void>): void;
}

// ============================================================================
// BDD Context Class
// ============================================================================

/**
 * BDDスタイルのテスト記述を管理するクラス
 * Given/When/Then形式のステップをチェーン可能にする
 *
 * 変数共有メカニズム:
 * - stepData プロパティを使用してステップ間でデータを共有できます
 * - GivenステップでstepDataに設定した値をWhen/Thenステップで参照できます
 */
export class BDDContext {
	private setupSteps: Array<{ description: string; fn: () => void | Promise<void> }> = [];
	private executionSteps: Array<{ description: string; fn: () => void | Promise<void> }> = [];
	private teardownSteps: Array<{ description: string; fn: () => void | Promise<void> }> = [];
	private phase: "setup" | "execution" | "teardown" = "setup";

	/**
	 * ステップ間で共有されるデータ
	 * Givenステップで値を設定し、When/Thenステップで参照できます
	 */
	public stepData: Record<string, unknown> = {};

	/**
	 * Givenステップ（事前条件の設定）
	 */
	given: StepFunction = (description, fn) => {
		this.phase = "setup";
		this.setupSteps.push({ description, fn });
	};

	/**
	 * Andステップ（追加の事前条件）
	 */
	and: StepFunction = (description, fn) => {
		if (this.phase === "execution") {
			this.executionSteps.push({ description, fn });
			return;
		}
		if (this.phase === "teardown") {
			this.teardownSteps.push({ description, fn });
			return;
		}
		this.setupSteps.push({ description, fn });
	};

	/**
	 * Whenステップ（アクションの実行）
	 */
	when: StepFunction = (description, fn) => {
		this.phase = "execution";
		this.executionSteps.push({ description, fn });
	};

	/**
	 * Thenステップ（結果の検証）
	 */
	then: StepFunction = (description, fn) => {
		this.phase = "teardown";
		this.teardownSteps.push({ description, fn });
	};

	/**
	 * すべてのステップを実行する
	 */
	async execute(): Promise<void> {
		// Givenステップの実行
		for (const step of this.setupSteps) {
			await step.fn();
		}

		// Whenステップの実行
		for (const step of this.executionSteps) {
			await step.fn();
		}

		// Thenステップの実行
		for (const step of this.teardownSteps) {
			await step.fn();
		}
	}
}

// ============================================================================
// BDD Test Builder
// ============================================================================

/**
 * シナリオビルダーを作成する関数
 */
export function describeScenario(
	feature: string,
	scenario: string,
	testFn: (ctx: BDDContext) => void | Promise<void>
): void {
	describe(`Feature: ${feature}`, () => {
		describe(`Scenario: ${scenario}`, () => {
			it("executes all steps", async () => {
				const ctx = new BDDContext();
				await testFn(ctx);
				await ctx.execute();
			});
		});
	});
}

/**
 * Given/When/Then形式でシナリオを記述する
 */
export function given(description: string): (fn: () => void | Promise<void>) => void {
	return (fn) => {
		// この関数はBDDContext内で使用される
		throw new Error("given() must be used within a describeScenario callback");
	};
}

/**
 * ユーザージャーニーベースのテスト記述ヘルパー
 */
export class UserJourneyTest {
	private journeyName: string;
	private steps: Array<{ step: string; action: () => void | Promise<void> }> = [];

	constructor(journeyName: string) {
		this.journeyName = journeyName;
	}

	/**
	 * ステップを追加する
	 */
	step(step: string): (action: () => void | Promise<void>) => UserJourneyTest {
		return (action) => {
			this.steps.push({ step, action });
			return this;
		};
	}

	/**
	 * ジャーニー全体を実行する
	 */
	async execute(): Promise<void> {
		for (const { step, action } of this.steps) {
			await action();
		}
	}
}

/**
 * ユーザージャーニーのビルダーを作成する
 */
export function createUserJourney(journeyName: string): UserJourneyTest {
	return new UserJourneyTest(journeyName);
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * 非同期操作の完了を待つヘルパー
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout: number = 5000,
	interval: number = 100
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		if (await condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, interval));
	}

	throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * エラーが投げられることを期待するヘルパー
 */
export async function expectThrow(
	fn: () => void | Promise<void>,
	errorMatcher: string | RegExp | ((error: Error) => boolean) = /./
): Promise<void> {
	try {
		await fn();
		throw new Error("Expected function to throw an error");
	} catch (error) {
		if (!(error instanceof Error)) {
			throw new Error("Expected error to be an Error instance");
		}

		if (typeof errorMatcher === "string") {
			if (!error.message.includes(errorMatcher)) {
				throw new Error(`Expected error message to include "${errorMatcher}", but got "${error.message}"`);
			}
		} else if (errorMatcher instanceof RegExp) {
			if (!errorMatcher.test(error.message)) {
				throw new Error(`Expected error message to match ${errorMatcher}, but got "${error.message}"`);
			}
		} else if (typeof errorMatcher === "function") {
			if (!errorMatcher(error)) {
				throw new Error(`Error did not match the expected condition: ${error.message}`);
			}
		}
	}
}

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * 拡張機能用のモックPIインスタンスを作成する
 */
export function createMockPi() {
	const tools = new Map<string, { name: string; execute: (...args: any[]) => Promise<any> }>();
	const commands = new Map<string, { name: string; handler: (...args: any[]) => Promise<any> }>();
	const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();
	const logs: Array<{ level: string; message: string }> = [];

	return {
		tools,
		commands,
		events,
		logs,

		uiNotify: vi.fn((message: string, level: string = "info") => {
			logs.push({ level, message });
		}),

		sendMessage: vi.fn(),

		appendEntry: vi.fn(),

		registerTool(def: any) {
			tools.set(def.name, def);
		},

		registerCommand(name: string, def: any) {
			commands.set(name, { name, handler: def.handler });
		},

		on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
			const handlers = events.get(eventName) ?? [];
			handlers.push(handler);
			events.set(eventName, handlers);
		},

		async emit(eventName: string, event: any, ctx: any): Promise<void> {
			const handlers = events.get(eventName) ?? [];
			for (const handler of handlers) {
				await handler(event, ctx);
			}
		},

		getTool(name: string) {
			return tools.get(name);
		},

		getCommand(name: string) {
			return commands.get(name);
		},

		clearLogs() {
			logs.length = 0;
		},

		getLogs(level?: string) {
			if (level) {
				return logs.filter(l => l.level === level);
			}
			return [...logs];
		},
	};
}

// ============================================================================
// File System Helpers
// ============================================================================

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 一時テストディレクトリを作成する
 */
export function createTempDir(prefix: string = "mekann-test-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * 一時ディレクトリを削除する
 */
export function cleanupTempDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * 一意な識別子を生成する
 */
export function generateId(prefix: string = "test"): string {
	return `${prefix}-${randomBytes(8).toString("hex")}`;
}
