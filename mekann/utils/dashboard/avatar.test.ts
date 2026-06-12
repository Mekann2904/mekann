import { describe, expect, it } from "vitest";
import { isLikelyKitty } from "./avatar.js";

describe("kitty avatar", () => {
	it("detects kitty-like environments", () => {
		expect(isLikelyKitty({ KITTY_WINDOW_ID: "1" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isLikelyKitty({ TERM: "xterm-kitty" } as NodeJS.ProcessEnv)).toBe(true);
		expect(isLikelyKitty({ TERM: "xterm-256color" } as NodeJS.ProcessEnv)).toBe(false);
	});
});
