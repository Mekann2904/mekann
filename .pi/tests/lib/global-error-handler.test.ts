/**
 * @file .pi/lib/global-error-handler.ts の単体テスト
 * @description グローバルエラーハンドラ設定モジュールのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// モジュールをインポート
import {
	setupGlobalErrorHandlers,
	teardownGlobalErrorHandlers,
	isGlobalErrorHandlerSetup,
	type GlobalErrorHandlerOptions,
} from "../../lib/global-error-handler.js";

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * プロセスイベントリスナーをモック
 */
function mockProcessEvents() {
	const listeners = {
		unhandledRejection: [] as Array<(reason: unknown, promise: Promise<unknown>) => void>,
		uncaughtException: [] as Array<(error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void>,
	};

	const originalOn = process.on.bind(process);
	const originalOff = process.off.bind(process);

	vi.spyOn(process, "on").mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
		if (event === "unhandledRejection") {
			listeners.unhandledRejection.push(listener as typeof listeners.unhandledRejection[0]);
		} else if (event === "uncaughtException") {
			listeners.uncaughtException.push(listener as typeof listeners.uncaughtException[0]);
		}
		return process;
	});

	vi.spyOn(process, "off").mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
		if (event === "unhandledRejection") {
			listeners.unhandledRejection = listeners.unhandledRejection.filter(l => l !== listener);
		} else if (event === "uncaughtException") {
			listeners.uncaughtException = listeners.uncaughtException.filter(l => l !== listener);
		}
		return process;
	});

	return {
		listeners,
		emit: (event: "unhandledRejection" | "uncaughtException", ...args: unknown[]) => {
			if (event === "unhandledRejection") {
				listeners.unhandledRejection.forEach(l => l(args[0], args[1] as Promise<unknown>));
			} else if (event === "uncaughtException") {
				listeners.uncaughtException.forEach(l => l(args[0] as Error, args[1] as NodeJS.UncaughtExceptionOrigin));
			}
		},
	};
}

// ============================================================================
// setupGlobalErrorHandlers
// ============================================================================

describe("setupGlobalErrorHandlers", () => {
	let mockProcess: ReturnType<typeof mockProcessEvents>;

	beforeEach(() => {
		// ハンドラをリセット
		teardownGlobalErrorHandlers();
		mockProcess = mockProcessEvents();
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
		vi.restoreAllMocks();
	});

	describe("正常系", () => {
		it("should_setup_handlers_successfully", () => {
			// Act
			const result = setupGlobalErrorHandlers();

			// Assert
			expect(result).toBe(true);
			expect(isGlobalErrorHandlerSetup()).toBe(true);
		});

		it("should_register_unhandledRejection_listener", () => {
			// Act
			setupGlobalErrorHandlers();

			// Assert
			expect(process.on).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
		});

		it("should_register_uncaughtException_listener", () => {
			// Act
			setupGlobalErrorHandlers();

			// Assert
			expect(process.on).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
		});

		it("should_use_custom_logger", () => {
			// Arrange
			const customLogger = vi.fn();

			// Act
			setupGlobalErrorHandlers({ logger: customLogger });

			// Assert: カスタムロガーが設定される
			expect(isGlobalErrorHandlerSetup()).toBe(true);
		});
	});

	describe("二重登録防止", () => {
		it("should_return_false_on_duplicate_setup", () => {
			// Arrange
			setupGlobalErrorHandlers();

			// Act
			const result = setupGlobalErrorHandlers();

			// Assert
			expect(result).toBe(false);
		});

		it("should_not_register_duplicate_listeners", () => {
			// Arrange
			setupGlobalErrorHandlers();
			const callCount = (process.on as Mock).mock.calls.length;

			// Act
			setupGlobalErrorHandlers();

			// Assert: 呼び出し回数が増えていない
			expect((process.on as Mock).mock.calls.length).toBe(callCount);
		});
	});

	describe("オプション", () => {
		it("should_accept_exitOnUncaught_false", () => {
			// Arrange
			const options: GlobalErrorHandlerOptions = {
				exitOnUncaught: false,
			};

			// Act
			const result = setupGlobalErrorHandlers(options);

			// Assert
			expect(result).toBe(true);
		});

		it("should_accept_custom_exitCode", () => {
			// Arrange
			const options: GlobalErrorHandlerOptions = {
				exitOnUncaught: true,
				exitCode: 42,
			};

			// Act
			const result = setupGlobalErrorHandlers(options);

			// Assert
			expect(result).toBe(true);
		});
	});
});

// ============================================================================
// teardownGlobalErrorHandlers
// ============================================================================

describe("teardownGlobalErrorHandlers", () => {
	let mockProcess: ReturnType<typeof mockProcessEvents>;

	beforeEach(() => {
		teardownGlobalErrorHandlers();
		mockProcess = mockProcessEvents();
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
		vi.restoreAllMocks();
	});

	describe("正常系", () => {
		it("should_remove_handlers", () => {
			// Arrange
			setupGlobalErrorHandlers();

			// Act
			teardownGlobalErrorHandlers();

			// Assert
			expect(isGlobalErrorHandlerSetup()).toBe(false);
		});

		it("should_call_process_off_for_unhandledRejection", () => {
			// Arrange
			setupGlobalErrorHandlers();

			// Act
			teardownGlobalErrorHandlers();

			// Assert
			expect(process.off).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
		});

		it("should_call_process_off_for_uncaughtException", () => {
			// Arrange
			setupGlobalErrorHandlers();

			// Act
			teardownGlobalErrorHandlers();

			// Assert
			expect(process.off).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
		});
	});

	describe("未設定状態", () => {
		it("should_not_throw_when_not_setup", () => {
			// Act & Assert
			expect(() => teardownGlobalErrorHandlers()).not.toThrow();
		});

		it("should_not_call_process_off_when_not_setup", () => {
			// Act
			teardownGlobalErrorHandlers();

			// Assert
			expect(process.off).not.toHaveBeenCalled();
		});
	});
});

// ============================================================================
// isGlobalErrorHandlerSetup
// ============================================================================

describe("isGlobalErrorHandlerSetup", () => {
	beforeEach(() => {
		teardownGlobalErrorHandlers();
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
	});

	it("should_return_false_initially", () => {
		// Act
		const result = isGlobalErrorHandlerSetup();

		// Assert
		expect(result).toBe(false);
	});

	it("should_return_true_after_setup", () => {
		// Arrange
		const mockProcess = mockProcessEvents();
		setupGlobalErrorHandlers();

		// Act
		const result = isGlobalErrorHandlerSetup();

		// Assert
		expect(result).toBe(true);

		vi.restoreAllMocks();
	});

	it("should_return_false_after_teardown", () => {
		// Arrange
		const mockProcess = mockProcessEvents();
		setupGlobalErrorHandlers();
		teardownGlobalErrorHandlers();

		// Act
		const result = isGlobalErrorHandlerSetup();

		// Assert
		expect(result).toBe(false);

		vi.restoreAllMocks();
	});
});

// ============================================================================
// エラーハンドリング動作
// ============================================================================

describe("エラーハンドリング動作", () => {
	let mockProcess: ReturnType<typeof mockProcessEvents>;
	let customLogger: Mock;

	beforeEach(() => {
		teardownGlobalErrorHandlers();
		mockProcess = mockProcessEvents();
		customLogger = vi.fn();
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
		vi.restoreAllMocks();
	});

	describe("unhandledRejection", () => {
		it("should_log_error_message", () => {
			// Arrange
			setupGlobalErrorHandlers({ logger: customLogger });
			const error = new Error("Test rejection");

			// Act
			mockProcess.emit("unhandledRejection", error, Promise.resolve());

			// Assert
			expect(customLogger).toHaveBeenCalled();
		});

		it("should_log_stack_trace_when_available", () => {
			// Arrange
			setupGlobalErrorHandlers({ logger: customLogger });
			const error = new Error("Test rejection");

			// Act
			mockProcess.emit("unhandledRejection", error, Promise.resolve());

			// Assert: スタックトレースを含むログが出力される
			const calls = customLogger.mock.calls;
			const hasStackTrace = calls.some(call =>
				call.some(arg => typeof arg === "string" && arg.includes("Stack trace"))
			);
			expect(hasStackTrace).toBe(true);
		});

		it("should_handle_non_error_rejection", () => {
			// Arrange
			setupGlobalErrorHandlers({ logger: customLogger });

			// Act
			mockProcess.emit("unhandledRejection", "string rejection", Promise.resolve());

			// Assert: エラーがスローされない
			expect(customLogger).toHaveBeenCalled();
		});

		it("should_ignore_cancellation_errors", () => {
			// Arrange
			setupGlobalErrorHandlers({ logger: customLogger });
			const error = new Error("This operation was aborted");

			// Act
			mockProcess.emit("unhandledRejection", error, Promise.resolve());

			// Assert: キャンセルとしてログに出力される
			expect(customLogger).toHaveBeenCalled();
		});
	});

	describe("uncaughtException", () => {
		it("should_log_error_message", () => {
			// Arrange
			setupGlobalErrorHandlers({
				logger: customLogger,
				exitOnUncaught: false,
			});
			const error = new Error("Test exception");

			// Act
			mockProcess.emit("uncaughtException", error, "uncaughtException");

			// Assert
			expect(customLogger).toHaveBeenCalled();
		});

		it("should_log_origin", () => {
			// Arrange
			setupGlobalErrorHandlers({
				logger: customLogger,
				exitOnUncaught: false,
			});
			const error = new Error("Test exception");

			// Act
			mockProcess.emit("uncaughtException", error, "unhandledRejection");

			// Assert: originを含むログ
			const calls = customLogger.mock.calls;
			const hasOrigin = calls.some(call =>
				call.some(arg => typeof arg === "string" && arg.includes("origin"))
			);
			expect(hasOrigin).toBe(true);
		});
	});
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
	beforeEach(() => {
		teardownGlobalErrorHandlers();
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
		vi.restoreAllMocks();
	});

	it("should_handle_multiple_setup_teardown_cycles", () => {
		// Arrange
		const mockProcess = mockProcessEvents();

		// Act & Assert: 複数サイクル
		for (let i = 0; i < 5; i++) {
			expect(setupGlobalErrorHandlers()).toBe(true);
			expect(isGlobalErrorHandlerSetup()).toBe(true);
			teardownGlobalErrorHandlers();
			expect(isGlobalErrorHandlerSetup()).toBe(false);
		}

		vi.restoreAllMocks();
	});

	it("should_handle_empty_options", () => {
		// Arrange
		const mockProcess = mockProcessEvents();

		// Act
		const result = setupGlobalErrorHandlers({});

		// Assert
		expect(result).toBe(true);

		vi.restoreAllMocks();
	});

	it("should_handle_null_logger_gracefully", () => {
		// Arrange
		const mockProcess = mockProcessEvents();

		// Act: nullロガーを渡す（undefinedとして扱われる）
		const result = setupGlobalErrorHandlers({ logger: undefined });

		// Assert
		expect(result).toBe(true);

		vi.restoreAllMocks();
	});
});

// ============================================================================
// process.exit path tests
// ============================================================================

describe("process.exit path", () => {
	let mockProcess: ReturnType<typeof mockProcessEvents>;
	let customLogger: Mock;
	let originalExit: typeof process.exit;

	beforeEach(() => {
		teardownGlobalErrorHandlers();
		mockProcess = mockProcessEvents();
		customLogger = vi.fn();
		originalExit = process.exit;
	});

	afterEach(() => {
		teardownGlobalErrorHandlers();
		vi.restoreAllMocks();
		process.exit = originalExit;
	});

	it("should_call_process_exit_with_custom_exitCode_when_exitOnUncaught_true", () => {
		// Arrange
		const exitMock = vi.fn();
		process.exit = exitMock as typeof process.exit;

		setupGlobalErrorHandlers({
			logger: customLogger,
			exitOnUncaught: true,
			exitCode: 42,
		});
		const error = new Error("Test exception");

		// Act
		mockProcess.emit("uncaughtException", error, "uncaughtException");

		// Assert
		expect(exitMock).toHaveBeenCalledWith(42);
	});

	it("should_call_process_exit_with_default_exitCode_1_when_exitOnUncaught_true", () => {
		// Arrange
		const exitMock = vi.fn();
		process.exit = exitMock as typeof process.exit;

		setupGlobalErrorHandlers({
			logger: customLogger,
			exitOnUncaught: true,
		});
		const error = new Error("Test exception");

		// Act
		mockProcess.emit("uncaughtException", error, "uncaughtException");

		// Assert
		expect(exitMock).toHaveBeenCalledWith(1);
	});

	it("should_not_call_process_exit_when_exitOnUncaught_false", () => {
		// Arrange
		const exitMock = vi.fn();
		process.exit = exitMock as typeof process.exit;

		setupGlobalErrorHandlers({
			logger: customLogger,
			exitOnUncaught: false,
		});
		const error = new Error("Test exception");

		// Act
		mockProcess.emit("uncaughtException", error, "uncaughtException");

		// Assert
		expect(exitMock).not.toHaveBeenCalled();
	});

	it("should_not_call_process_exit_for_cancellation_errors_even_with_exitOnUncaught_true", () => {
		// Arrange
		const exitMock = vi.fn();
		process.exit = exitMock as typeof process.exit;

		setupGlobalErrorHandlers({
			logger: customLogger,
			exitOnUncaught: true,
			exitCode: 42,
		});
		const error = new Error("This operation was aborted");

		// Act
		mockProcess.emit("uncaughtException", error, "uncaughtException");

		// Assert: キャンセルエラーではexitしない
		expect(exitMock).not.toHaveBeenCalled();
	});
});
