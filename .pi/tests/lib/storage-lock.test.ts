/**
 * @file .pi/lib/storage-lock.ts の単体テスト
 * @description 同期ファイルロックおよびアトミック書き込み機構のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	getSyncSleepDiagnostics,
	type FileLockOptions,
} from "../../lib/storage/storage-lock.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock fs functions
vi.mock("node:fs", () => ({
	openSync: vi.fn(),
	closeSync: vi.fn(),
	renameSync: vi.fn(),
	statSync: vi.fn(),
	unlinkSync: vi.fn(),
	writeFileSync: vi.fn(),
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
}));

describe("getSyncSleepDiagnostics", () => {
	describe("正常系", () => {
		it("should return diagnostic object", () => {
			const diagnostics = getSyncSleepDiagnostics();

			expect(diagnostics).toHaveProperty("hasSharedArrayBuffer");
			expect(diagnostics).toHaveProperty("hasAtomics");
			expect(diagnostics).toHaveProperty("hasAtomicsWait");
			expect(diagnostics).toHaveProperty("isAvailable");
			expect(diagnostics).toHaveProperty("reason");
		});

		it("should return boolean values for checks", () => {
			const diagnostics = getSyncSleepDiagnostics();

			expect(typeof diagnostics.hasSharedArrayBuffer).toBe("boolean");
			expect(typeof diagnostics.hasAtomics).toBe("boolean");
			expect(typeof diagnostics.hasAtomicsWait).toBe("boolean");
			expect(typeof diagnostics.isAvailable).toBe("boolean");
			expect(typeof diagnostics.reason).toBe("string");
		});

		it("should have consistent isAvailable value", () => {
			const diagnostics = getSyncSleepDiagnostics();

			// isAvailable should be true only if all requirements are met
			const expectedAvailable =
				diagnostics.hasSharedArrayBuffer && diagnostics.hasAtomicsWait;
			expect(diagnostics.isAvailable).toBe(expectedAvailable);
		});
	});

	describe("境界条件", () => {
		it("should provide meaningful reason when unavailable", () => {
			const diagnostics = getSyncSleepDiagnostics();

			if (!diagnostics.isAvailable) {
				expect(diagnostics.reason.length).toBeGreaterThan(0);
				expect(diagnostics.reason).toContain("SharedArrayBuffer");
			} else {
				expect(diagnostics.reason).toContain("available");
			}
		});
	});
});

describe("FileLockOptions", () => {
	describe("正常系", () => {
		it("should accept empty options", () => {
			const options: FileLockOptions = {};
			expect(options).toBeDefined();
		});

		it("should accept partial options", () => {
			const options: FileLockOptions = {
				maxWaitMs: 5000,
			};
			expect(options.maxWaitMs).toBe(5000);
		});

		it("should accept all options", () => {
			const options: FileLockOptions = {
				maxWaitMs: 10000,
				pollMs: 100,
				staleMs: 60000,
			};
			expect(options.maxWaitMs).toBe(10000);
			expect(options.pollMs).toBe(100);
			expect(options.staleMs).toBe(60000);
		});
	});
});
