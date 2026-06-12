/**
 * Zip Repo Extension のテスト。
 *
 * 純粋関数 (formatFileSize, buildZipPath, escapeAppleScriptPath,
 * buildClipboardScript, parseDirtyFiles) を検証する。
 */

import { describe, it, expect } from "vitest";
import {
	formatFileSize,
	buildZipPath,
	escapeAppleScriptPath,
	buildClipboardScript,
	parseDirtyFiles,
} from "./index.js";

// ─── formatFileSize ──────────────────────────────────────────────

describe("formatFileSize", () => {
	it("0 バイト", () => {
		expect(formatFileSize(0)).toBe("0 B");
	});

	it("1 バイト", () => {
		expect(formatFileSize(1)).toBe("1 B");
	});

	it("100 バイト", () => {
		expect(formatFileSize(100)).toBe("100 B");
	});

	it("1023 バイト (境界値: B)", () => {
		expect(formatFileSize(1023)).toBe("1023 B");
	});

	it("1024 バイト (境界値: KB)", () => {
		expect(formatFileSize(1024)).toBe("1.0 KB");
	});

	it("1.5 KB", () => {
		expect(formatFileSize(1536)).toBe("1.5 KB");
	});

	it("10 KB", () => {
		expect(formatFileSize(10240)).toBe("10.0 KB");
	});

	it("1048575 バイト (境界値: KB)", () => {
		expect(formatFileSize(1048575)).toBe("1024.0 KB");
	});

	it("1048576 バイト (境界値: MB)", () => {
		expect(formatFileSize(1048576)).toBe("1.0 MB");
	});

	it("10 MB", () => {
		expect(formatFileSize(10485760)).toBe("10.0 MB");
	});

	it("1 GB", () => {
		expect(formatFileSize(1073741824)).toBe("1.0 GB");
	});

	it("1.5 GB", () => {
		expect(formatFileSize(1610612736)).toBe("1.5 GB");
	});

	it("負の値は拒否", () => {
		expect(() => formatFileSize(-1)).toThrow(RangeError);
	});

	it("NaN / Infinity は拒否", () => {
		expect(() => formatFileSize(Number.NaN)).toThrow(RangeError);
		expect(() => formatFileSize(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});
});

// ─── buildZipPath ────────────────────────────────────────────────

describe("buildZipPath", () => {
	it("基本的なパス生成", () => {
		const result = buildZipPath("/Users/dev/project", "abc123def456");
		expect(result).toBe("/Users/dev/project-abc123def456.zip");
	});

	it("ネストされたパス", () => {
		const result = buildZipPath("/Users/dev/projects/my-app", "a1b2c3d4e5f6");
		expect(result).toBe("/Users/dev/projects/my-app-a1b2c3d4e5f6.zip");
	});

	it("ルート直下のパス", () => {
		const result = buildZipPath("/tmp/repo", "deadbeef1234");
		expect(result).toBe("/tmp/repo-deadbeef1234.zip");
	});

	it("空の shortHead", () => {
		const result = buildZipPath("/home/project", "");
		expect(result).toBe("/home/project-.zip");
	});
});

// ─── escapeAppleScriptPath ────────────────────────────────────────

describe("escapeAppleScriptPath", () => {
	it("エスケープ不要なパスはそのまま返す", () => {
		expect(escapeAppleScriptPath("/tmp/file.zip")).toBe("/tmp/file.zip");
	});

	it("バックスラッシュをエスケープする", () => {
		expect(escapeAppleScriptPath("path\\to\\file")).toBe("path\\\\to\\\\file");
	});

	it("ダブルクォートをエスケープする", () => {
		expect(escapeAppleScriptPath('path"to"file')).toBe('path\\"to\\"file');
	});

	it("バックスラッシュとダブルクォートの混在", () => {
		expect(escapeAppleScriptPath('a\\"b')).toBe('a\\\\\\"b');
	});

	it("日本語パスはそのまま", () => {
		expect(escapeAppleScriptPath("/Users/太郎/プロジェクト")).toBe("/Users/太郎/プロジェクト");
	});

	it("スペースを含むパスはそのまま", () => {
		expect(escapeAppleScriptPath("/tmp/my project/file.zip")).toBe("/tmp/my project/file.zip");
	});

	it("空文字列はそのまま", () => {
		expect(escapeAppleScriptPath("")).toBe("");
	});
});

// ─── buildClipboardScript ─────────────────────────────────────────

describe("buildClipboardScript", () => {
	it("Foundation と AppKit フレームワークを含む", () => {
		const script = buildClipboardScript("/tmp/test.zip");
		expect(script).toContain("Foundation");
		expect(script).toContain("AppKit");
	});

	it("NSURL fileURLWithPath を含む", () => {
		const script = buildClipboardScript("/tmp/test.zip");
		expect(script).toContain("NSURL");
		expect(script).toContain("fileURLWithPath");
		expect(script).toContain("/tmp/test.zip");
	});

	it("NSPasteboard generalPasteboard を含む", () => {
		const script = buildClipboardScript("/tmp/test.zip");
		expect(script).toContain("NSPasteboard");
		expect(script).toContain("generalPasteboard");
	});

	it("clearContents / writeObjects と成功判定を含む", () => {
		const script = buildClipboardScript("/tmp/test.zip");
		expect(script).toContain("clearContents");
		expect(script).toContain("writeObjects");
		expect(script).toContain("NSPasteboard writeObjects returned false");
	});

	it("書き込み後に readback 検証する", () => {
		const script = buildClipboardScript("/tmp/test.zip");
		expect(script).toContain("readObjectsForClasses");
		expect(script).toContain("NSPasteboard readback returned no file URL");
		expect(script).toContain("NSPasteboard readback mismatch");
	});

	it("エスケープされたパスを渡す", () => {
		const escaped = escapeAppleScriptPath('/tmp/path"with"quotes');
		const script = buildClipboardScript(escaped);
		expect(script).toContain('\\"');
	});
});

// ─── parseDirtyFiles ──────────────────────────────────────────────

describe("parseDirtyFiles", () => {
	it("空文字列は空配列", () => {
		expect(parseDirtyFiles("")).toEqual([]);
	});

	it("1つのファイル", () => {
		expect(parseDirtyFiles("src/index.ts")).toEqual(["src/index.ts"]);
	});

	it("複数のファイル", () => {
		const output = "src/index.ts\npackage.json\nREADME.md";
		expect(parseDirtyFiles(output)).toEqual(["src/index.ts", "package.json", "README.md"]);
	});

	it("末尾の改行を無視する", () => {
		expect(parseDirtyFiles("file.ts\n")).toEqual(["file.ts"]);
	});

	it("先頭の改行を無視する", () => {
		expect(parseDirtyFiles("\nfile.ts")).toEqual(["file.ts"]);
	});

	it("連続する改行を無視する", () => {
		expect(parseDirtyFiles("a.ts\n\nb.ts")).toEqual(["a.ts", "b.ts"]);
	});

	it("空白のみの行を無視しない (filter(Boolean) は空白のみを保持)", () => {
		expect(parseDirtyFiles("a.ts\n   \nb.ts")).toEqual(["a.ts", "   ", "b.ts"]);
	});

	it("git status 出力形式 (M, A, ??)", () => {
		const output = "M src/index.ts\nA new-file.ts\n?? untracked.txt";
		expect(parseDirtyFiles(output)).toEqual(["M src/index.ts", "A new-file.ts", "?? untracked.txt"]);
	});

	it("パスにスペースを含むファイル", () => {
		const output = "path with spaces/file.ts";
		expect(parseDirtyFiles(output)).toEqual(["path with spaces/file.ts"]);
	});
});
