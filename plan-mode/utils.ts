/**
 * Plan Mode — ユーティリティ関数
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

// Re-export from policy-core — single source of truth for command intent classification.
// isSafeCommand is a UX guard, NOT a security boundary.
export { classifyCommandIntent, isPlanReadOnlyCommandIntent, isSafeCommand, type CommandIntent, type CommandIntentKind } from "../policy-core/commandIntent.js";

// Re-export tool list from policy-core.
export { PLAN_MODE_TOOLS } from "../policy-core/modes.js";

export function buildBlockReason(toolName: string, input: Record<string, unknown>, blockCount: number): string {
	const H = "【プランモード・読み取り専用】";
	const toolLabel = ({ edit: "ファイル編集", write: "ファイル作成/上書き" } as Record<string, string>)[toolName] || toolName;

	if (blockCount >= 3) {
		return `${H}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n代わりに <proposed_plan> ブロックで実装計画を出力してください。`;
	}
	if (blockCount >= 2) {
		return `${H}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、最終的に <proposed_plan> ブロックで結果を出力してください。`;
	}

	return `${H}\n${toolLabel}「${typeof input?.path === "string" ? input.path : "unknown"}」はブロックされました。\nプランモードではファイル変更は一切禁止。\n代わりに変更内容をテキストで報告してください。`;
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

export function extractProposedPlan(message: string): string | undefined {
	const match = message.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/);
	return match?.[1]?.trim() || undefined;
}

/** <proposed_plan> ブロックを短いプレースホルダーに置換（context hook 用）。 */
export function compactOldProposedPlansInText(text: string): string {
	return text.replace(/<proposed_plan>\s*[\s\S]*?\s*<\/proposed_plan>/g, "<proposed_plan>[omitted: superseded plan]</proposed_plan>");
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

/** Configuration file shape stored at ~/.pi/agent/plan-mode.json */
export interface PlanModeConfig { version: 1; models: { main?: ModelRef; plan?: ModelRef; }; thinking: { main?: ThinkingLevel; plan?: ThinkingLevel; }; }

export function createDefaultConfig(): PlanModeConfig {
	return { version: 1, models: {}, thinking: {} };
}

export function normalizeConfig(raw: Record<string, unknown>): PlanModeConfig {
	const t = raw.thinking;
	const thinking: PlanModeConfig["thinking"] = {};
	if (t && typeof t === "object") {
		const ti = t as Record<string, unknown>;
		if (isThinkingLevel(ti.main)) thinking.main = ti.main;
		if (isThinkingLevel(ti.plan)) thinking.plan = ti.plan;
	}
	return { version: 1, models: (raw.models && typeof raw.models === "object") ? raw.models as PlanModeConfig["models"] : {}, thinking };
}

/** "provider/modelId" 文字列を ModelRef にパース（最初の / で分割）。 */
export function parseModelRef(input: string): ModelRef | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return undefined;
	return { provider: trimmed.slice(0, slashIndex), modelId: trimmed.slice(slashIndex + 1) };
}

/** Format a ModelRef as "provider/modelId". */
export function formatModelRef(ref?: ModelRef): string {
	if (!ref) return "(not set)";
	return `${ref.provider}/${ref.modelId}`;
}

/** Compare two ModelRef values for equality. */
export function sameModelRef(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.provider === b.provider && a.modelId === b.modelId;
}

/** ~/.pi/agent/plan-mode.json へのパス（explicitPath で上書き可能）。 */
export function getConfigPath(explicitPath?: string): string {
	if (explicitPath) return explicitPath;
	return join(homedir(), ".pi", "agent", "plan-mode.json");
}

/** Load config from disk, returning a default config on missing/invalid file. */
export function loadModelConfig(explicitPath?: string): PlanModeConfig {
	const configPath = getConfigPath(explicitPath);
	if (!existsSync(configPath)) return createDefaultConfig();
	try {
		const raw = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && parsed.version === 1) return normalizeConfig(parsed);
	} catch {
		// fall through to default
	}
	return createDefaultConfig();
}

/** 設定を write-then-rename で原子的に保存。 */
export function saveModelConfig(config: PlanModeConfig, explicitPath?: string): void {
	const configPath = getConfigPath(explicitPath);
	const dir = dirname(configPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${configPath}.tmp`;
	const json = JSON.stringify(config, null, 2) + "\n";
	writeFileSync(tmp, json, "utf-8");
	try {
		renameSync(tmp, configPath);
	} catch {
		// renameSync may fail across partitions; fall back to direct write
		writeFileSync(configPath, json, "utf-8");
	}
}

/** 特定モードの config field を更新して保存。undefined でクリア。 */
export function updateConfigField<T>(
	config: PlanModeConfig,
	section: "models" | "thinking",
	mode: "main" | "plan",
	value: T | undefined,
	path?: string,
): void {
	if (value) (config[section] as Record<string, T>)[mode] = value; else delete (config[section] as Record<string, T>)[mode];
	saveModelConfig(config, path);
}


