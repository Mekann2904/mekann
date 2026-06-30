import { describe, it, expect } from "vitest";
import { createSequentialId, randomIdSuffix, randomToken } from "./id.js";

describe("utils/id", () => {
	describe("createSequentialId", () => {
		it("produces the legacy 2-segment form when no random is given", () => {
			// Same contract as the ledger's createEventId(time, counter): no
			// random suffix → 2 segments, matching existing /^<p>_[a-z0-9]+_[a-z0-9]+$/ checks.
			expect(createSequentialId("og", 123456789, 35)).toBe("og_21i3v9_z");
			expect(createSequentialId("og", 123456789, 35)).toMatch(/^og_[a-z0-9]+_[a-z0-9]+$/);
		});

		it("appends the random suffix as a 3rd segment when provided", () => {
			expect(createSequentialId("ctx", 1000, 1, "a1b2c3")).toBe("ctx_rs_1_a1b2c3");
			expect(createSequentialId("arc", 1000, 7, "deadbeef")).toMatch(/^arc_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/i);
		});

		it("is pure / deterministic without randomness", () => {
			expect(createSequentialId("x", 5, 9)).toBe(createSequentialId("x", 5, 9));
		});
	});

	describe("randomIdSuffix", () => {
		it("defaults to 3 bytes (6 hex chars)", () => {
			expect(randomIdSuffix()).toMatch(/^[0-9a-f]{6}$/);
		});

		it("respects the byte length", () => {
			expect(randomIdSuffix(8)).toMatch(/^[0-9a-f]{16}$/);
		});
	});

	describe("cross-process uniqueness", () => {
		it("nextXxxId-style ids never collide across a large batch", () => {
			// Simulates N parallel processes each starting their counter at 0
			// in the same millisecond: the random suffix must keep them unique.
			const seen = new Set<string>();
			const createdAt = 1_700_000_000_000;
			const processes = 64;
			const perProcess = 500;
			for (let p = 0; p < processes; p++) {
				for (let c = 1; c <= perProcess; c++) {
					const id = createSequentialId("og", createdAt, c, randomIdSuffix());
					expect(seen.has(id)).toBe(false);
					seen.add(id);
				}
			}
			expect(seen.size).toBe(processes * perProcess);
		});
	});

	describe("randomToken", () => {
		it("is hex of the requested byte length", () => {
			expect(randomToken()).toMatch(/^[0-9a-f]{32}$/); // 16 bytes default
			expect(randomToken(8)).toHaveLength(16);
		});

		it("does not use Math.random (cryptographically strong, hard to forge)", () => {
			const samples = new Set<string>();
			for (let i = 0; i < 1000; i++) samples.add(randomToken());
			expect(samples.size).toBe(1000);
		});
	});
});
