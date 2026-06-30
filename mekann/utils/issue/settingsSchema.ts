import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function number(
	key: string,
	category: string,
	defaultValue: number,
	description: string,
	validate: (value: unknown) => string[],
): SettingSchema<number> {
	return {
		key,
		type: "number",
		defaultValue,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate,
	};
}

function enumeration(
	key: string,
	category: string,
	defaultValue: string,
	enumValues: string[],
	description: string,
	validate: (value: unknown) => string[],
): SettingSchema<string> {
	return {
		key,
		type: "enum",
		defaultValue,
		enumValues,
		description,
		category,
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate,
	};
}

const GATE_POLICY_VALUES = ["merged", "on-closed-skip", "on-draft-wait"];

function gatePolicyValidator(value: unknown): string[] {
	return typeof value === "string" && GATE_POLICY_VALUES.includes(value)
		? []
		: [`orchestration.continueGate は ${GATE_POLICY_VALUES.join(" / ")} のいずれかである必要があります`];
}

function positiveInt(message: string) {
	return (value: unknown): string[] => {
		if (typeof value !== "number" || !Number.isFinite(value)) return [message];
		if (!Number.isInteger(value) || value < 1) return ["1 以上の整数である必要があります"];
		return [];
	};
}

export const issueSettingsSchema: FeatureSettingsSchema = {
	feature: "issue",
	title: "Issue",
	settings: [
		number(
			"autopilot.maxParallel",
			"Autopilot",
			2,
			"`/issue-autopilot` が同時に駆動する Work Pi の上限。並列ワーカープールはこの値まで同時に起動し、Work Pi が PR 作成後に自動終了すると空き枠へ次の候補を起動します。",
			positiveInt("autopilot.maxParallel は 1 以上の整数である必要があります"),
		),
		enumeration(
			"orchestration.continueGate",
			"Orchestration",
			"merged",
			GATE_POLICY_VALUES,
			"直列 orchestration (`continueOrchestration`) が Work Pi 終了後に次の子を起動するかを決める継続ゲートポリシー (ADR-0028 IC-247)。`merged`(デフォルト)= PR が merged のみ継続。`on-closed-skip` = PR が closed(非マージ) なら停止、未クローズ/draft は待機。`on-draft-wait` = draft なら待機、open 非 draft は継続候補、closed は停止。",
			gatePolicyValidator,
		),
	],
};
