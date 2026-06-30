import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
	isLikelyKitty,
	classifyAvatarUrl,
	fetchKittyAvatar,
	kittyGraphicsEscape,
	AVATAR_PNG_MAGIC,
	AVATAR_MAX_BYTES,
} from "./avatar.js";
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

describe("classifyAvatarUrl (IC-232 SSRF guard)", () => {
	it("accepts a trusted HTTPS GitHub avatar URL", () => {
		const result = classifyAvatarUrl("https://avatars.githubusercontent.com/u/42?v=4&s=160");
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.parsed.hostname).toBe("avatars.githubusercontent.com");
	});

	it("rejects plain HTTP", () => {
		const result = classifyAvatarUrl("http://avatars.githubusercontent.com/u/42");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/HTTPS/i);
	});

	it("rejects localhost (internal network)", () => {
		const result = classifyAvatarUrl("http://localhost/avatar.png");
		expect(result.ok).toBe(false);
	});

	it("rejects an untrusted host", () => {
		const result = classifyAvatarUrl("https://evil.example.com/u/42.png");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/not trusted/i);
	});

	it("rejects a malformed URL", () => {
		const result = classifyAvatarUrl("not-a-url");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/invalid/i);
	});
});

describe("fetchKittyAvatar (IC-232 SSRF + PNG validation)", () => {
	const ORIGINAL_KITTY = process.env.KITTY_WINDOW_ID;
	const ORIGINAL_FETCH = globalThis.fetch;

	beforeEach(() => {
		process.env.KITTY_WINDOW_ID = "1";
	});

	afterEach(() => {
		if (ORIGINAL_KITTY === undefined) delete process.env.KITTY_WINDOW_ID;
		else process.env.KITTY_WINDOW_ID = ORIGINAL_KITTY;
		globalThis.fetch = ORIGINAL_FETCH as typeof fetch;
		vi.unstubAllGlobals();
	});

	function mockFetch(body: Buffer, status = 200): void {
		globalThis.fetch = vi.fn(async () => ({
			ok: status >= 200 && status < 300,
			status,
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
		} as unknown as Response)) as unknown as typeof fetch;
	}

	it("returns undefined when disabled", async () => {
		const result = await fetchKittyAvatar("https://avatars.githubusercontent.com/u/1", { enabled: false });
		expect(result).toBeUndefined();
	});

	it("returns undefined when no url", async () => {
		const result = await fetchKittyAvatar(undefined, { enabled: true });
		expect(result).toBeUndefined();
	});

	it("rejects an internal/localhost URL without fetching", async () => {
		let called = false;
		globalThis.fetch = vi.fn(async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
		const result = await fetchKittyAvatar("http://169.254.169.254/latest/meta-data/", { enabled: true });
		expect(result).toBeDefined();
		expect((result as { ok: false; error: string }).ok).toBe(false);
		expect(called).toBe(false);
	});

	it("accepts a valid PNG from the trusted host and writes it", async () => {
		const png = Buffer.concat([AVATAR_PNG_MAGIC, Buffer.from("rest-of-png-bytes")]);
		mockFetch(png);
		const result = await fetchKittyAvatar("https://avatars.githubusercontent.com/u/1?s=160", { enabled: true });
		expect((result as { ok: boolean }).ok).toBe(true);
	});

	it("rejects non-PNG bytes (does not treat arbitrary content as an image)", async () => {
		mockFetch(Buffer.from("<html>not an image</html>"));
		const result = await fetchKittyAvatar("https://avatars.githubusercontent.com/u/1", { enabled: true });
		expect((result as { ok: false; error: string }).ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(/PNG/i);
	});

	it("rejects an oversized payload", async () => {
		const oversized = Buffer.alloc(AVATAR_MAX_BYTES + 1, 0x89);
		mockFetch(oversized);
		const result = await fetchKittyAvatar("https://avatars.githubusercontent.com/u/1", { enabled: true });
		expect((result as { ok: false; error: string }).ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(/size/i);
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
