import { describe, it, expect } from "vitest";
import { safeByteLen } from "./index.js";

describe("safeByteLen", () => {
	it("measures UTF-8 byte length of strings (including multibyte)", () => {
		expect(safeByteLen("")).toBe(0);
		expect(safeByteLen("abc")).toBe(3);
		// "あ" is 3 bytes in UTF-8.
		expect(safeByteLen("あ")).toBe(3);
		// "α" (Greek alpha, U+03B1) is 2 bytes in UTF-8.
		expect(safeByteLen("α")).toBe(2);
	});

	it("measures serialized byte length for plain objects via JSON.stringify", () => {
		const bytes = safeByteLen({ a: 1 });
		expect(bytes).toBe(Buffer.byteLength(JSON.stringify({ a: 1 }), "utf8"));
		expect(bytes).toBeGreaterThan(0);
	});

	it("measures serialized byte length for arrays", () => {
		const bytes = safeByteLen([1, 2, 3]);
		expect(bytes).toBe(Buffer.byteLength(JSON.stringify([1, 2, 3]), "utf8"));
	});

	it("falls back to String(value) byte length for BigInt values (never 0)", () => {
		// JSON.stringify throws on BigInt; previously this returned 0.
		const bytes = safeByteLen({ count: 123n });
		expect(bytes).toBeGreaterThan(0);
		expect(bytes).toBe(Buffer.byteLength(String({ count: 123n }), "utf8"));
	});

	it("falls back to a non-zero length for circular references (never 0)", () => {
		// JSON.stringify throws on circular references; previously this returned 0.
		const circular: any = { name: "loop" };
		circular.self = circular;
		const bytes = safeByteLen(circular);
		expect(bytes).toBeGreaterThan(0);
		expect(bytes).toBe(Buffer.byteLength(String(circular), "utf8"));
	});

	it("accepts a custom serializer such as canonicalizeJson", () => {
		const canonicalize = (value: unknown): string => JSON.stringify(value, null, 2);
		const bytes = safeByteLen({ a: 1 }, canonicalize);
		expect(bytes).toBe(Buffer.byteLength(canonicalize({ a: 1 }), "utf8"));
		expect(bytes).toBeGreaterThan(JSON.stringify({ a: 1 }).length);
	});

	it("falls back to String(value) when the custom serializer throws", () => {
		const throwing = (): string => {
			throw new Error("boom");
		};
		const bytes = safeByteLen({ a: 1 }, throwing);
		expect(bytes).toBe(Buffer.byteLength(String({ a: 1 }), "utf8"));
		expect(bytes).toBeGreaterThan(0);
	});
});
