/**
 * @file .pi/lib/context-reporter.ts の単体テスト
 * @description 軽量コンテキストレポーターのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// テスト対象をインポート
import {
	reportContextUsage,
	getParentPid,
	getCurrentHistoryFilePath,
	clearHistory,
	MAX_HISTORY,
	SHARED_DIR,
	type ContextEntry,
} from "../../lib/context-reporter.js";

// ============================================================================
// Mocks
// ============================================================================

// モック用のパス生成
const getTestHistoryPath = (pid: number) =>
	path.join(os.homedir(), ".pi-shared", `context-history-${pid}.json`);

// ============================================================================
// getParentPid
// ============================================================================

describe("getParentPid", () => {
	const originalEnv = process.env.PI_PARENT_PID;

	afterEach(() => {
		// 環境変数を復元
		if (originalEnv === undefined) {
			delete process.env.PI_PARENT_PID;
		} else {
			process.env.PI_PARENT_PID = originalEnv;
		}
	});

	describe("正常系", () => {
		it("should_return_env_value_when_set", () => {
			process.env.PI_PARENT_PID = "12345";
			expect(getParentPid()).toBe(12345);
		});

		it("should_fallback_to_ppid_when_env_not_set", () => {
			delete process.env.PI_PARENT_PID;
			expect(getParentPid()).toBe(process.ppid);
		});

		it("should_fallback_to_ppid_when_env_is_invalid", () => {
			process.env.PI_PARENT_PID = "invalid";
			expect(getParentPid()).toBe(process.ppid);
		});

		it("should_fallback_to_ppid_when_env_is_negative", () => {
			process.env.PI_PARENT_PID = "-1";
			expect(getParentPid()).toBe(process.ppid);
		});

		it("should_fallback_to_ppid_when_env_is_zero", () => {
			process.env.PI_PARENT_PID = "0";
			expect(getParentPid()).toBe(process.ppid);
		});
	});
});

// ============================================================================
// reportContextUsage
// ============================================================================

describe("reportContextUsage", () => {
	// PI_PARENT_PIDが設定されていない場合、getParentPid()はppidを返す
	// そのためテストでもppidベースのパスを使用する
	const testPid = process.ppid;
	const testHistoryFile = getTestHistoryPath(testPid);

	beforeEach(() => {
		// テスト用の履歴ファイルをクリア
		try {
			if (fs.existsSync(testHistoryFile)) {
				fs.unlinkSync(testHistoryFile);
			}
		} catch {
			// Ignore
		}
		// 環境変数をクリア
		delete process.env.PI_PARENT_PID;
	});

	afterEach(() => {
		// クリーンアップ
		try {
			if (fs.existsSync(testHistoryFile)) {
				fs.unlinkSync(testHistoryFile);
			}
		} catch {
			// Ignore
		}
	});

	describe("正常系", () => {
		it("should_create_history_file_if_not_exists", () => {
			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: 100,
				output: 50,
			});

			expect(fs.existsSync(testHistoryFile)).toBe(true);
		});

		it("should_write_entry_to_file", () => {
			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: 100,
				output: 50,
			});

			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history).toHaveLength(1);
			expect(history[0].timestamp).toBe("2025-02-28T00:00:00Z");
			expect(history[0].input).toBe(100);
			expect(history[0].output).toBe(50);
			expect(history[0].pid).toBe(process.pid);
			expect(history[0].parentPid).toBe(process.ppid);
		});

		it("should_append_to_existing_history", () => {
			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: 100,
				output: 50,
			});

			reportContextUsage({
				timestamp: "2025-02-28T00:01:00Z",
				input: 200,
				output: 75,
			});

			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history).toHaveLength(2);
			expect(history[0].input).toBe(100);
			expect(history[1].input).toBe(200);
		});

		it("should_use_parent_pid_from_env", () => {
			const mockParentPid = 99999;
			process.env.PI_PARENT_PID = String(mockParentPid);
			const expectedPath = getTestHistoryPath(mockParentPid);

			try {
				reportContextUsage({
					timestamp: "2025-02-28T00:00:00Z",
					input: 100,
					output: 50,
				});

				expect(fs.existsSync(expectedPath)).toBe(true);

				const content = fs.readFileSync(expectedPath, "utf-8");
				const history = JSON.parse(content) as ContextEntry[];

				expect(history[0].parentPid).toBe(mockParentPid);
			} finally {
				// クリーンアップ
				try {
					if (fs.existsSync(expectedPath)) {
						fs.unlinkSync(expectedPath);
					}
				} catch {
					// Ignore
				}
			}
		});
	});

	describe("境界条件", () => {
		it("should_trim_history_to_max_size", () => {
			// MAX_HISTORY + 10 entries
			const totalEntries = MAX_HISTORY + 10;

			for (let i = 0; i < totalEntries; i++) {
				reportContextUsage({
					timestamp: `2025-02-28T00:${String(i).padStart(2, "0")}:00Z`,
					input: i,
					output: i * 2,
				});
			}

			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history.length).toBe(MAX_HISTORY);
			// 最新のエントリが保持されていることを確認
			expect(history[history.length - 1].input).toBe(totalEntries - 1);
			// 古いエントリが削除されていることを確認
			expect(history[0].input).toBe(10); // totalEntries - MAX_HISTORY
		});

		it("should_handle_zero_tokens", () => {
			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: 0,
				output: 0,
			});

			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history[0].input).toBe(0);
			expect(history[0].output).toBe(0);
		});

		it("should_handle_large_token_values", () => {
			const largeValue = Number.MAX_SAFE_INTEGER;

			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: largeValue,
				output: largeValue,
			});

			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history[0].input).toBe(largeValue);
		});

		it("should_handle_corrupted_history_file", () => {
			// 破損したJSONファイルを作成
			fs.mkdirSync(path.dirname(testHistoryFile), { recursive: true });
			fs.writeFileSync(testHistoryFile, "not valid json {{{");

			// 新しいエントリを追加
			reportContextUsage({
				timestamp: "2025-02-28T00:00:00Z",
				input: 100,
				output: 50,
			});

			// 破損ファイルが上書きされ、新しいエントリのみになる
			const content = fs.readFileSync(testHistoryFile, "utf-8");
			const history = JSON.parse(content) as ContextEntry[];

			expect(history).toHaveLength(1);
			expect(history[0].input).toBe(100);
		});
	});
});

// ============================================================================
// getCurrentHistoryFilePath
// ============================================================================

describe("getCurrentHistoryFilePath", () => {
	it("should_return_path_with_current_pid", () => {
		delete process.env.PI_PARENT_PID;
		const filePath = getCurrentHistoryFilePath();
		expect(filePath).toContain("context-history-");
		expect(filePath).toContain(SHARED_DIR);
	});

	it("should_use_env_parent_pid", () => {
		process.env.PI_PARENT_PID = "12345";
		const filePath = getCurrentHistoryFilePath();
		expect(filePath).toContain("context-history-12345.json");
		delete process.env.PI_PARENT_PID;
	});
});

// ============================================================================
// clearHistory
// ============================================================================

describe("clearHistory", () => {
	const testPid = 88888;
	const testFile = getTestHistoryPath(testPid);

	beforeEach(() => {
		// テスト用ファイルを作成
		fs.mkdirSync(path.dirname(testFile), { recursive: true });
		fs.writeFileSync(testFile, "[]");
	});

	afterEach(() => {
		try {
			if (fs.existsSync(testFile)) {
				fs.unlinkSync(testFile);
			}
		} catch {
			// Ignore
		}
	});

	it("should_delete_history_file", () => {
		expect(fs.existsSync(testFile)).toBe(true);
		clearHistory(testPid);
		expect(fs.existsSync(testFile)).toBe(false);
	});

	it("should_not_throw_if_file_not_exists", () => {
		// 先に削除
		fs.unlinkSync(testFile);

		// 存在しないファイルを削除してもエラーにならない
		expect(() => clearHistory(testPid)).not.toThrow();
	});
});

// ============================================================================
// Constants
// ============================================================================

describe("Constants", () => {
	it("SHARED_DIR should_be_in_home_directory", () => {
		expect(SHARED_DIR).toBe(path.join(os.homedir(), ".pi-shared"));
	});

	it("MAX_HISTORY should_be_100", () => {
		expect(MAX_HISTORY).toBe(100);
	});
});
