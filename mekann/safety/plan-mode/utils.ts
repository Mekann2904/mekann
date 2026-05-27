/**
 * Plan Mode — ユーティリティ関数
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { MEKANN_CONFIG_VERSION } from "../../config.js";
import { getGlobalMekannSettingsPath, loadSettings, saveSettingsChecked } from "../../settings/store.js";

// Re-export from policy-core — single source of truth for command intent classification.
// isSafeCommand is a UX guard, NOT a security boundary.
export { classifyCommandIntent, isPlanReadOnlyCommandIntent, isSafeCommand, type CommandIntent, type CommandIntentKind } from "../policy-core/modes.js";

// Re-export tool list from policy-core.
export { READ_ONLY_MODE_TOOLS } from "../policy-core/modes.js";
export function buildBlockReason(toolName: string, input: Record<string, unknown>, blockCount: number): string {
	const H = "【Read-only mode】";
	const toolLabel = ({ edit: "ファイル編集", write: "ファイル作成/上書き" } as Record<string, string>)[toolName] || toolName;

	if (blockCount >= 3) {
		return `${H}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n変更内容をテキストで報告してください。`;
	}
	if (blockCount >= 2) {
		return `${H}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、結果をテキストで報告してください。`;
	}

	return `${H}\n${toolLabel}「${typeof input?.path === "string" ? input.path : "unknown"}」はブロックされました。\nRead-only mode ではファイル変更は一切禁止。\n代わりに変更内容をテキストで報告してください。`;
}

export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function loadPrompt(name: string, vars?: Record<string, string>): string {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	let content: string;
	try {
		content = readFileSync(join(__dirname, "prompts", `${name}.md`), "utf-8");
	} catch {
		throw new Error(`プロンプトファイルが見つかりません: prompts/${name}.md`);
	}
	if (vars) Object.entries(vars).forEach(([k, v]) => { content = content.replaceAll(`\${${k}}`, v); });
	return content;
}

// ─── Thinking level ───────────────────────────────────────────────

/** Pi thinking levels. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** ThinkingLevel values (used by normalizeConfig). */
const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && VALID_THINKING_LEVELS.has(value);
}

// ─── Model preference persistence ───────────────────────────────────

/** Provider + modelId pair identifying a specific model. */
export interface ModelRef { provider: string; modelId: string; }

/** All mode names managed by plan-mode extension. */
export type ModeName = "main" | "plan" | "read_only" | "auto" | "sub";

/** Configuration file shape stored under the `plan-mode` feature in ~/.pi/agent/mekann.json */
export interface PlanModeConfig { version: typeof MEKANN_CONFIG_VERSION; models: { main?: ModelRef; plan?: ModelRef; read_only?: ModelRef; auto?: ModelRef; sub?: ModelRef; }; thinking: { main?: ThinkingLevel; plan?: ThinkingLevel; read_only?: ThinkingLevel; auto?: ThinkingLevel; sub?: ThinkingLevel; }; }

export function createDefaultConfig(): PlanModeConfig {
	return { version: MEKANN_CONFIG_VERSION, models: {}, thinking: {} };
}

function isModelRef(value: unknown): value is ModelRef {
	return !!value && typeof value === "object" &&
		typeof (value as Record<string, unknown>).provider === "string" &&
		typeof (value as Record<string, unknown>).modelId === "string" &&
		(value as Record<string, unknown>).provider !== "" &&
		(value as Record<string, unknown>).modelId !== "";
}

export function normalizeConfig(raw: Record<string, unknown>): PlanModeConfig {
	const models: PlanModeConfig["models"] = {};
	const m = raw.models;
	if (m && typeof m === "object") {
		const mi = m as Record<string, unknown>;
		if (isModelRef(mi.main)) models.main = mi.main;
		if (isModelRef(mi.plan)) models.plan = mi.plan;
		if (isModelRef(mi.read_only)) models.read_only = mi.read_only;
		if (isModelRef(mi.auto)) models.auto = mi.auto;
		if (isModelRef(mi.sub)) models.sub = mi.sub;
	}

	const t = raw.thinking;
	const thinking: PlanModeConfig["thinking"] = {};
	if (t && typeof t === "object") {
		const ti = t as Record<string, unknown>;
		if (isThinkingLevel(ti.main)) thinking.main = ti.main;
		if (isThinkingLevel(ti.plan)) thinking.plan = ti.plan;
		if (isThinkingLevel(ti.read_only)) thinking.read_only = ti.read_only;
		if (isThinkingLevel(ti.auto)) thinking.auto = ti.auto;
		if (isThinkingLevel(ti.sub)) thinking.sub = ti.sub;
	}
	return { version: MEKANN_CONFIG_VERSION, models, thinking };
}

/** "provider/modelId" 文字列を ModelRef にパース（最初の / で分割）。 */
export function parseModelRef(input: string): ModelRef | undefined {
	const t = input.trim(); if (!t) return undefined;
	const i = t.indexOf("/"); if (i <= 0 || i === t.length - 1) return undefined;
	return { provider: t.slice(0, i), modelId: t.slice(i + 1) };
}

/** Format a ModelRef as "provider/modelId". */
export function formatModelRef(ref?: ModelRef): string {
	return ref ? `${ref.provider}/${ref.modelId}` : "(not set)";
}

/** Compare two ModelRef values for equality. */
export function sameModelRef(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
	return a === b ? true : !a || !b ? false : a.provider === b.provider && a.modelId === b.modelId;
}

/** ~/.pi/agent/mekann.json へのパス（explicitPath で上書き可能）。 */
export function getConfigPath(explicitPath?: string): string {
	return explicitPath ?? getGlobalMekannSettingsPath();
}

/** Load config from disk, returning a default config on missing/invalid file. */
export function loadModelConfig(explicitPath?: string): PlanModeConfig {
	const loaded = loadSettings(explicitPath ?? getGlobalMekannSettingsPath());
	const feature = loaded.settings.features["plan-mode"] ?? {};
	return normalizeConfig({ version: 1, models: feature.models, thinking: feature.thinking });
}

/** 設定を Mekann settings file に保存。 */
export function saveModelConfig(config: PlanModeConfig, explicitPath?: string): void {
	const configPath = getConfigPath(explicitPath);
	const loaded = loadSettings(configPath);
	const next = loaded.settings;
	next.features["plan-mode"] = { ...(next.features["plan-mode"] ?? {}), models: config.models, thinking: config.thinking };
	saveSettingsChecked(configPath, next, loaded.hash);
}

/** 特定モードの config field を更新して保存。undefined でクリア。
 *
 * Multiple pi sessions can keep this object in memory for a long time.  Reload
 * the latest on-disk config before applying the requested field update so an
 * unrelated write (e.g. thinking.main) does not resurrect stale model refs from
 * an older session.
 */
export function updateConfigField<T>(
	config: PlanModeConfig,
	section: "models" | "thinking",
	mode: ModeName,
	value: T | undefined,
	path?: string,
): void {
	const latest = loadModelConfig(path);
	config.version = latest.version;
	config.models = { ...latest.models };
	config.thinking = { ...latest.thinking };
	if (value) (config[section] as Record<string, T>)[mode] = value; else delete (config[section] as Record<string, T>)[mode];
	saveModelConfig(config, path);
}


/** @deprecated Use ModeName for config keys, MekannMode for the runtime mode. */
export type Mode = MekannMode;

/** Runtime mode managed by plan-mode extension. */
export type MekannMode = "main" | "plan" | "read_only" | "auto" | "sub";

export function isReadOnlyMode(mode: MekannMode): boolean {
	return mode === "read_only";
}

export function modeLabel(mode: MekannMode): string {
	if (mode === "plan") return "PLAN MODE";
	if (mode === "read_only") return "READ-ONLY MODE";
	return "";
}

export interface PlanState {
	mode: MekannMode;
	savedActiveTools?: string[];
	planPromptHash?: string;
	planPromptDelivered: boolean;
	/** Persisted model preferences for each mode. */
	modelConfig: PlanModeConfig;
	/** Snapshot of the main-mode model before entering a non-main mode (for fallback restore). */
	savedMainModel?: ModelRef;
	/** Snapshot of the main-mode thinking level before entering a non-main mode (for fallback restore). */
	savedMainThinking?: ThinkingLevel;
	/** Mode to restore after leaving plan mode. */
	modeBeforePlan?: Exclude<MekannMode, "plan" | "read_only" | "auto">;
	/** Mode to restore after leaving auto mode. */
	modeBeforeAuto?: Exclude<MekannMode, "plan" | "auto">;
	/** Whether the current plan session emitted an implementation handoff. */
	mainModeHandoffAvailable?: boolean;
}

export function createInitialState(modelConfig?: PlanModeConfig): PlanState {
	return { mode: "main", planPromptDelivered: false, modelConfig: modelConfig ?? createDefaultConfig() };
}
