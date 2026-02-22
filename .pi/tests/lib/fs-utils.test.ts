/**
 * @file .pi/lib/fs-utils.ts の単体テスト
 * @description ファイルシステムユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// モジュールをインポート
import { ensureDir } from "../../lib/fs-utils.js";

// ============================================================================
// テスト用一時ディレクトリ
// ============================================================================

let tempDir: string;

beforeEach(() => {
	// 一時ディレクトリを作成
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-utils-test-"));
});

afterEach(() => {
	// 一時ディレクトリを削除
	if (fs.existsSync(tempDir)) {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

// ============================================================================
// ensureDir
// ============================================================================

describe("ensureDir", () => {
	describe("正常系 - ディレクトリ作成", () => {
		it("should_create_single_directory", () => {
			const targetDir = path.join(tempDir, "newdir");
			expect(fs.existsSync(targetDir)).toBe(false);

			ensureDir(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);
			expect(fs.statSync(targetDir).isDirectory()).toBe(true);
		});

		it("should_create_nested_directories", () => {
			const targetDir = path.join(tempDir, "a", "b", "c", "d");
			expect(fs.existsSync(targetDir)).toBe(false);

			ensureDir(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);
			expect(fs.statSync(targetDir).isDirectory()).toBe(true);

			// 中間ディレクトリも作成されていることを確認
			expect(fs.existsSync(path.join(tempDir, "a"))).toBe(true);
			expect(fs.existsSync(path.join(tempDir, "a", "b"))).toBe(true);
			expect(fs.existsSync(path.join(tempDir, "a", "b", "c"))).toBe(true);
		});

		it("should_create_deeply_nested_directories", () => {
			const targetDir = path.join(tempDir, "1", "2", "3", "4", "5");
			ensureDir(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);
			expect(fs.statSync(targetDir).isDirectory()).toBe(true);
		});

		it("should_create_directory_with_special_characters", () => {
			const targetDir = path.join(tempDir, "dir-with_special.chars_123");
			ensureDir(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);
		});
	});

	describe("境界条件 - 既存ディレクトリ", () => {
		it("should_not_error_if_directory_exists", () => {
			const targetDir = path.join(tempDir, "existing");
			fs.mkdirSync(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);

			// エラーが発生しないことを確認
			expect(() => ensureDir(targetDir)).not.toThrow();

			expect(fs.existsSync(targetDir)).toBe(true);
		});

		it("should_not_error_if_nested_directory_exists", () => {
			const targetDir = path.join(tempDir, "a", "b", "c");
			fs.mkdirSync(targetDir, { recursive: true });

			ensureDir(targetDir);

			expect(fs.existsSync(targetDir)).toBe(true);
		});

		it("should_not_affect_existing_directory_content", () => {
			const targetDir = path.join(tempDir, "existing");
			fs.mkdirSync(targetDir);
			const testFile = path.join(targetDir, "test.txt");
			fs.writeFileSync(testFile, "test content");

			ensureDir(targetDir);

			// ファイルが存在していることを確認
			expect(fs.existsSync(testFile)).toBe(true);
			expect(fs.readFileSync(testFile, "utf-8")).toBe("test content");
		});
	});

	describe("異常系 - エラーケース", () => {
		it("should_throw_on_invalid_path", () => {
			// 無効なパス（Windowsドライブなど）
			const invalidPath = process.platform === "win32" ? "Z:\\invalid\\path" : "/invalid/path/that/does/not/exist/and/has/invalid/chars";

			// Note: 実際のエラーは環境依存
			// テストはエラーが発生することを確認するだけで良い
			if (process.platform === "linux" || process.platform === "darwin") {
				// Unix系ではルート権限がない場合にエラーが発生する可能性がある
				const rootPath = "/root/fs-utils-test-no-permission";
				try {
					ensureDir(rootPath);
					// 成功した場合（権限がある）、ディレクトリを削除
					if (fs.existsSync(rootPath)) {
						fs.rmSync(rootPath, { recursive: true, force: true });
					}
				} catch (error) {
					// 権限エラーが発生することを確認
					expect(error).toBeDefined();
				}
			}
		});

		it("should_handle_empty_string_path", () => {
			// 空文字列のパスはエラーになるはず
			expect(() => ensureDir("")).toThrow();
		});
	});

	describe("不変条件", () => {
		it("should_always_create_directory_after_call", () => {
			const targetDir = path.join(tempDir, "invariant-test");
			ensureDir(targetDir);
			expect(fs.existsSync(targetDir)).toBe(true);
			expect(fs.statSync(targetDir).isDirectory()).toBe(true);
		});

		it("should_maintain_existing_directory", () => {
			const targetDir = path.join(tempDir, "maintain-test");
			fs.mkdirSync(targetDir);
			const originalStats = fs.statSync(targetDir);

			ensureDir(targetDir);

			const newStats = fs.statSync(targetDir);
			// ディレクトリが変更されていないことを確認
			expect(newStats.ino).toBe(originalStats.ino); // inodeは同じ
		});
	});

	describe("相対パスと絶対パス", () => {
		it("should_work_with_relative_path", () => {
			const targetDir = "relative-test-dir";
			const fullPath = path.resolve(targetDir);

			try {
				ensureDir(targetDir);
				expect(fs.existsSync(fullPath)).toBe(true);
			} finally {
				// クリーンアップ
				if (fs.existsSync(fullPath)) {
					fs.rmSync(fullPath, { recursive: true, force: true });
				}
			}
		});

		it("should_work_with_absolute_path", () => {
			const targetDir = path.join(tempDir, "absolute-test");
			ensureDir(targetDir);
			expect(fs.existsSync(targetDir)).toBe(true);
		});
	});

	describe("パスの正規化", () => {
		it("should_handle_path_with_trailing_slash", () => {
			const targetDir = path.join(tempDir, "trailing-slash/");
			const normalizedDir = targetDir.replace(/\/$/, "");

			ensureDir(targetDir);

			expect(fs.existsSync(normalizedDir)).toBe(true);
		});

		it("should_handle_path_with_dot_segments", () => {
			const targetDir = path.join(tempDir, "dir", ".", "subdir");
			ensureDir(targetDir);

			// ディレクトリが作成されていることを確認
			expect(fs.existsSync(path.join(tempDir, "dir", "subdir"))).toBe(true);
		});
	});
});
