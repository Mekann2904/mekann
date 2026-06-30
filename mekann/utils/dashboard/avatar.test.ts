import { describe, expect, it } from "vitest";
import { isLikelyKitty, kittyGraphicsEscape } from "./avatar.js";
import { MEKANN_DASHBOARD_DEFAULTS } from "../../config.js";

describe("kitty avatar", () => {
	it("detects kitty-like environments", () => {
		expect(isLikelyKitty({ KITTY_WINDOW_ID: "1" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isLikelyKitty({ TERM: "xterm-kitty" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isLikelyKitty({ TERM: "xterm-256color" } as NodeJS.ProcessEnv)).toBe(false);
	});

	it("does not false-positive on `st-kitty-256color` (st with kitty keyboard, no graphics)", () => {
		// IC-231: substring match on "kitty" previously sent kitty-graphics escapes here.
		expect(isLikelyKitty({ TERM: "st-kitty-256color" } as NodeJS.ProcessEnv)).toBe(false);
		expect(isLikelyKitty({} as NodeJS.ProcessEnv)).toBe(false);
	});
});

describe("kittyGraphicsEscape — configurable chunk size (issue #166 / IC-233)", () => {
	it("defaults to the documented chunk size", () => {
		// Payload large enough to require multiple default-sized chunks.
		const bytes = Buffer.alloc((MEKANN_DASHBOARD_DEFAULTS.kittyChunkChars * 2) * 0.75 + 8, 0xab);
		const escape = kittyGraphicsEscape(bytes, { columns: 10, rows: 4 });
		// Each APC command is wrapped by ESC _ G ... ESC backslash.
		const count = (escape.match(/\x1b\\/g) ?? []).length;
		expect(count).toBeGreaterThan(1);
	});

	it("respects an overridden chunkChars to reduce escape flood", () => {
		const bytes = Buffer.alloc(8192, 0xcd);
		const small = kittyGraphicsEscape(bytes, { columns: 10, rows: 4, chunkChars: 1024 });
		const large = kittyGraphicsEscape(bytes, { columns: 10, rows: 4, chunkChars: 65536 });
		const smallChunks = (small.match(/\x1b_G/g) ?? []).length;
		const largeChunks = (large.match(/\x1b_G/g) ?? []).length;
		expect(smallChunks).toBeGreaterThan(largeChunks);
		expect(largeChunks).toBe(1);
	});
});
