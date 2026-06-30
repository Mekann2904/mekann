import { describe, expect, it } from "vitest";
import { isLikelyKitty } from "./avatar.js";

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
