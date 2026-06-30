import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createContributionSvg } from "./contribution-image.js";
import { MEKANN_DASHBOARD_DEFAULTS, type MekannDashboardConfig } from "../../config.js";

const day = (level: string) => ({ date: "2025-01-01", level, count: 1 });

describe("createContributionSvg — config-driven quartile colors (issue #166 / IC-236)", () => {
	it("renders the default fourth-quartile color for the highest activity", async () => {
		const result = await createContributionSvg([day("FOURTH_QUARTILE")], { enabled: true });
		expect(result?.ok).toBe(true);
		if (!result?.ok) return;
		const svg = await readFile(result.path, "utf8");
		expect(svg).toContain(MEKANN_DASHBOARD_DEFAULTS.levelColorFourth);
		// The "More" legend swatch also uses the fourth-quartile color.
		expect(svg.match(new RegExp(MEKANN_DASHBOARD_DEFAULTS.levelColorFourth, "g"))?.length).toBeGreaterThan(1);
	});

	it("honors an injected config to recolor every quartile", async () => {
		const config: MekannDashboardConfig = {
			...MEKANN_DASHBOARD_DEFAULTS,
			levelColorNone: "#000000",
			levelColorFirst: "#111111",
			levelColorSecond: "#222222",
			levelColorThird: "#333333",
			levelColorFourth: "#444444",
		};
		const result = await createContributionSvg(
			[day("NONE"), day("FIRST_QUARTILE"), day("SECOND_QUARTILE"), day("THIRD_QUARTILE"), day("FOURTH_QUARTILE")],
			{ enabled: true, config },
		);
		expect(result?.ok).toBe(true);
		if (!result?.ok) return;
		const svg = await readFile(result.path, "utf8");
		expect(svg).toContain("#444444"); // FOURTH_QUARTILE cell + legend
		expect(svg).toContain("#000000"); // NONE legend swatch
		expect(svg).not.toContain(MEKANN_DASHBOARD_DEFAULTS.levelColorFourth);
	});
});
