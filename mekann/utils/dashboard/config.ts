/**
 * Dashboard rendering config resolution (issue #166, IC-233 / IC-236 / IC-239).
 *
 * `avatar.ts`, `contribution-image.ts`, and `render.ts` read their tunables
 * through {@link resolveDashboardConfig} so a single `mekann.json` override
 * (`features.dashboard.*`) adapts the Kitty chunk size, terminal-width clamp,
 * and GitHub-contribution quartile colors to terminal capability, theme, and
 * color-vision needs. Defaults reproduce the pre-issue behaviour exactly.
 */
import { MEKANN_DASHBOARD_DEFAULTS, type MekannDashboardConfig } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";

export type { MekannDashboardConfig } from "../../config.js";

function num(raw: unknown, fallback: number): number {
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
}

function str(raw: unknown, fallback: string): string {
	return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

export function resolveDashboardConfig(
	cwd: string = process.cwd(),
	home?: string,
): MekannDashboardConfig {
	const cfg = featureConfig("dashboard", cwd, home);
	const d = MEKANN_DASHBOARD_DEFAULTS;
	return {
		kittyChunkChars: num(cfg.kittyChunkChars, d.kittyChunkChars),
		widthMin: num(cfg.widthMin, d.widthMin),
		widthMax: num(cfg.widthMax, d.widthMax),
		levelColorNone: str(cfg.levelColorNone, d.levelColorNone),
		levelColorFirst: str(cfg.levelColorFirst, d.levelColorFirst),
		levelColorSecond: str(cfg.levelColorSecond, d.levelColorSecond),
		levelColorThird: str(cfg.levelColorThird, d.levelColorThird),
		levelColorFourth: str(cfg.levelColorFourth, d.levelColorFourth),
	};
}
