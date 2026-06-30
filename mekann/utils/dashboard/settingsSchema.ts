import { MEKANN_DASHBOARD_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
	return {
		key,
		type: "boolean",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: true,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean である必要があります"];
		},
	};
}

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
	return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) {
		const n = Number(value);
		if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
		if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
		return [];
	} };
}

function color(key: string, category: string, defaultValue: string, description: string): SettingSchema<string> {
	return { key, type: "string", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) {
		if (typeof value !== "string" || value.length === 0) return ["色文字列である必要があります"];
		// Accept #rgb / #rrggbb hex; anything else is passed through verbatim so
		// named/css colors still work without blocking the editor.
		return [];
	} };
}

const d = MEKANN_DASHBOARD_DEFAULTS;

export const dashboardSettingsSchema: FeatureSettingsSchema = {
	feature: "dashboard",
	title: "Dashboard",
	settings: [
		bool("enabled", "General", true, "/dashboard command と dashboard 関連 UI integration を有効にします。"),
		// IC-233: Kitty graphics-escape chunk size
		num("kittyChunkChars", "Kitty Graphics", d.kittyChunkChars, 512, 65536, "Kitty graphics protocol の base64 チャンクサイズ(文字数)。巨大画像のエスケープ洪水を抑えます。"),
		// IC-239: terminal-width clamp range
		num("widthMin", "Layout", d.widthMin, 8, 80, "テキスト描画の最小端末幅クランプ。これ未満の極狭端末での崩れを防ぎます。"),
		num("widthMax", "Layout", d.widthMax, 40, 1000, "テキスト描画の最大端末幅クランプ。これを超える広い端末での余白過多を防ぎます。"),
		// IC-236: GitHub contribution quartile colors (lowest → highest)
		color("levelColorNone", "Contribution Colors", d.levelColorNone, "活動なしのセル色(#rrggbb)。"),
		color("levelColorFirst", "Contribution Colors", d.levelColorFirst, "第1四分位(最少)のセル色。"),
		color("levelColorSecond", "Contribution Colors", d.levelColorSecond, "第2四分位のセル色。"),
		color("levelColorThird", "Contribution Colors", d.levelColorThird, "第3四分位のセル色。"),
		color("levelColorFourth", "Contribution Colors", d.levelColorFourth, "第4四分位(最多)のセル色。"),
	],
};
