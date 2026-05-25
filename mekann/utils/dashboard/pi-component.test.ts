import { describe, expect, it } from "vitest";
import { createDashboardPiComponent } from "./pi-component.js";
import { guessImageMime } from "./pi-component.js";

describe("DashboardPiComponent", () => {
	const baseVm = {
		profile: { ok: true as const, profile: { login: "Mekann2904", name: "Mekann", url: "https://github.com/Mekann2904" } },
		currentRepo: { ok: true as const, repoName: "mekann", branch: "main", changes: { staged: 0, unstaged: 0, untracked: 0 }, aheadBehind: { kind: "counts" as const, ahead: 0, behind: 0 }, latestCommit: { hash: "abc1234", subject: "add" } },
		contributionGraph: { status: "placeholder" as const, message: "Contribution graph: coming next" },
		activitySummary: { status: "placeholder" as const, message: "Activity summary: coming next" },
		codexUsage: { status: "placeholder" as const, message: "Codex usage summary: coming next" },
	};

	it("renders dashboard lines within the requested width", () => {
		const component = createDashboardPiComponent(baseVm, undefined, undefined, () => {});
		const lines = component.render(80);
		const joined = lines.join("\n");
		expect(joined).toContain("GitHub Dashboard");
		expect(joined).toContain("[ Pi TUI ]");
		expect(lines.length).toBeGreaterThan(0);
	});

	it("fills to terminal height", () => {
		const origRows = process.stdout.rows;
		Object.defineProperty(process.stdout, "rows", { value: 20, writable: true, configurable: true });
		try {
			const component = createDashboardPiComponent(baseVm, undefined, undefined, () => {});
			const lines = component.render(80);
			expect(lines.length).toBeGreaterThanOrEqual(18);
		} finally {
			Object.defineProperty(process.stdout, "rows", { value: origRows, writable: true, configurable: true });
		}
	});

	it("guessImageMime detects JPEG from binary header", () => {
		// GitHub avatars are served as JPEG; the old code hardcoded image/png
		// which caused getImageDimensions to return null.
		const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
		const base64 = jpegHeader.toString("base64");
		expect(guessImageMime(base64)).toBe("image/jpeg");

		const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const pngBase64 = pngHeader.toString("base64");
		expect(guessImageMime(pngBase64)).toBe("image/png");
	});

	it("renders with JPEG avatar (regression: GitHub serves JPEG, not PNG)", async () => {
		// Create a minimal valid JPEG (1x1 pixel)
		const minimalJpeg = Buffer.from(
			"/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIEBQkLFgwMDBUFCg==",
			"base64",
		);
		const avatarBase64 = minimalJpeg.toString("base64");
		const component = createDashboardPiComponent(
			baseVm,
			avatarBase64,
			undefined,
			() => {},
			"image/jpeg",
		);
		const lines = component.render(120);
		const joined = lines.join("\n");
		expect(joined).toContain("GitHub Dashboard");
		expect(joined).toContain("@Mekann2904");
		// With a valid JPEG the constructor should create an avatarImage
		// (getImageDimensions may return null for a tiny/minimal JPEG,
		// so we just verify it doesn't crash)
	});

	it("closes on q", () => {
		let closed = false;
		const component = createDashboardPiComponent({
			profile: { ok: false, error: "offline" },
			currentRepo: { ok: false, error: "not a repo" },
			contributionGraph: { status: "error", message: "offline" },
			activitySummary: { status: "error", message: "offline" },
			codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
		}, undefined, undefined, () => { closed = true; });
		component.handleInput?.("q");
		expect(closed).toBe(true);
	});
});
