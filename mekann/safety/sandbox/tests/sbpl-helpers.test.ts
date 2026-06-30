/**
 * SBPL 文字列組み立てヘルパーのテスト。
 *
 * escapeSbplString / pathLiteral / pathSubpath を検証する。
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import { escapeSbplString, pathLiteral, pathSubpath } from "../macSeatbelt.js";

describe("escapeSbplString", () => {
	it("バックスラッシュをエスケープする", () => {
		expect(escapeSbplString("a\\b")).toBe("a\\\\b");
	});

	it("ダブルクォートをエスケープする", () => {
		expect(escapeSbplString('a"b')).toBe('a\\"b');
	});

	it("バックスラッシュとダブルクォートの混在をエスケープする", () => {
		expect(escapeSbplString('a\\"b')).toBe('a\\\\\\"b');
	});

	it("エスケープ不要な文字列はそのまま返す", () => {
		expect(escapeSbplString("hello world")).toBe("hello world");
	});
});

describe("pathLiteral", () => {
	it("絶対パスを literal 形式に変換する", () => {
		const result = pathLiteral("/tmp/test");
		expect(result).toBe('(literal "/tmp/test")');
	});

	it("相対パスを resolve して literal 形式に変換する", () => {
		const result = pathLiteral("relative/path");
		expect(result).toContain('(literal "');
		expect(result).toContain(resolve("relative/path"));
	});
});

describe("pathSubpath", () => {
	it("絶対パスを subpath 形式に変換する", () => {
		const result = pathSubpath("/tmp/test");
		expect(result).toBe('(subpath "/tmp/test")');
	});

	it("相対パスを resolve して subpath 形式に変換する", () => {
		const result = pathSubpath("relative/path");
		expect(result).toContain('(subpath "');
		expect(result).toContain(resolve("relative/path"));
	});
});

