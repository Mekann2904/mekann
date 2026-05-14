/**
 * Plan Mode — ユーティリティ関数
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

export const SAFE_PLAN_TOOLS = new Set(["read", "grep", "find", "ls"]);

const DESTRUCTIVE_PATTERNS = [
	/\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred)\b/i,
	/(^|[^<])(?:>>|>(?!>))/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish|audit\b.*(?:\bfix\b|--fix\b))/i,
	/\b(yarn|pnpm)\s+(add|remove|install|publish)/i,
	/\b(pip|brew)\s+(install|uninstall|upgrade)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bgit\s+diff\b.*--output\b/i,
	/\bfind\b.*\s+(?:-delete|-exec\b|-execdir\b|-ok\b|-fls\b|-fprint\b|-fprint0\b|-fprintf)\b/i,
	/\bsed\b.*-i\b/i,
	/\b(sudo|su|kill|pkill|killall)\b/i,
	/\b(reboot|shutdown)\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
	/^\s*(cat|head|tail|less|more|grep|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|cal|uptime|ps|top|htop|free)\b/,
	/^\s*find\b(?!.*\b(?:-delete|-exec|-execdir|-ok|-fls|-fprint|-fprintf)\b)/i,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-\S+|submodule\s+(?:status|summary))/i,
	/^\s*(npm|yarn)\s+(list|ls|view|info|search|outdated|audit|why)/i,
	/^\s*(node|python)\s+--version/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*(jq|awk|rg|fd|bat|eza)\b/,
	/^\s*sed\s+-n/i,
];

const SHELL_META_PATTERNS = [
	/&&|\|\|/,
	/[;|`]/,
	/\$\(/,
	/<\(/,
	/(^|[^&])&([^&]|$)/,
	/[\r\n]/,
];

const SAFE_REDIRECT_PATTERN = /\s*2>\/dev\/null\b|\s*2>&1\b|\s*>\/dev\/null\b/g;

export function isSafeCommand(command: string): boolean {
	const stripped = command.replace(SAFE_REDIRECT_PATTERN, "");
	return !SHELL_META_PATTERNS.some((p) => p.test(stripped))
		&& !DESTRUCTIVE_PATTERNS.some((p) => p.test(stripped))
		&& SAFE_PATTERNS.some((p) => p.test(stripped));
}

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

/**
 * Replace all `<proposed_plan>...</proposed_plan>` blocks with a short placeholder.
 * Used by the `context` hook to prevent old plan content from consuming LLM context.
 *
 * @param keep - when true, the latest plan is kept intact (caller responsibility)
 * @param text - the text to compact
 */
export function compactOldProposedPlansInText(text: string, keep: boolean): string {
	if (keep) return text;

	return text.replace(
		/<proposed_plan>\s*[\s\S]*?\s*<\/proposed_plan>/g,
		"<proposed_plan>[omitted: superseded plan]</proposed_plan>",
	);
}

// ─── Thinking level ───────────────────────────────────────────────

/** Pi thinking levels. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const VALID_THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh"]);

/** Check if a value is a valid ThinkingLevel. */
export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && VALID_THINKING_LEVELS.has(value);
}

/** Format a ThinkingLevel for display. */
export function formatThinkingLevel(level?: ThinkingLevel | null): string {
	if (!level) return "(unset)";
	return level;
}

// ─── Model preference persistence ───────────────────────────────────

/** Provider + modelId pair identifying a specific model. */
export interface ModelRef {
	provider: string;
	modelId: string;
}

/** Configuration file shape stored at ~/.pi/agent/plan-mode.json */
export interface PlanModeConfig {
	version: 1;
	models: {
		main?: ModelRef;
		plan?: ModelRef;
	};
	thinking: {
		main?: ThinkingLevel;
		plan?: ThinkingLevel;
	};
}

export function createDefaultConfig(): PlanModeConfig {
	return { version: 1, models: {}, thinking: {} };
}

/** Normalize a loaded config: ensure models/thinking objects exist, strip invalid thinking values. */
export function normalizeConfig(raw: Record<string, unknown>): PlanModeConfig {
	const config: PlanModeConfig = {
		version: 1,
		models: (raw.models && typeof raw.models === "object") ? raw.models as PlanModeConfig["models"] : {},
		thinking: {},
	};
	const t = raw.thinking;
	if (t && typeof t === "object") {
		const ti = t as Record<string, unknown>;
		if (isThinkingLevel(ti.main)) config.thinking.main = ti.main;
		if (isThinkingLevel(ti.plan)) config.thinking.plan = ti.plan;
	}
	return config;
}

/**
 * Parse a "provider/modelId" string into a ModelRef.
 * The first `/` separates provider from modelId, so modelIds containing `/`
 * (e.g. "openrouter/anthropic/claude-3.5-sonnet") are handled correctly.
 */
export function parseModelRef(input: string): ModelRef | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return undefined;
	return {
		provider: trimmed.slice(0, slashIndex),
		modelId: trimmed.slice(slashIndex + 1),
	};
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

/**
 * Resolve the path to ~/.pi/agent/plan-mode.json.
 * Accepts an explicit override for testing.
 */
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

/**
 * Save config to disk using write-then-rename for atomicity.
 * Creates the parent directory if it doesn't exist.
 */
export function saveModelConfig(config: PlanModeConfig, explicitPath?: string): void {
	const configPath = getConfigPath(explicitPath);
	const dir = dirname(configPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const tmp = `${configPath}.tmp`;
	writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf-8");
	try {
		renameSync(tmp, configPath);
	} catch {
		// renameSync may fail across partitions; fall back to direct write
		writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
	}
}

/**
 * Update a specific mode's model reference in the config and persist it.
 * Pass `undefined` for `ref` to clear that mode's setting.
 */
export function updateModelConfig(
	config: PlanModeConfig,
	mode: "main" | "plan",
	ref: ModelRef | undefined,
	path?: string,
): void {
	if (ref) {
		config.models[mode] = ref;
	} else {
		delete config.models[mode];
	}
	saveModelConfig(config, path);
}

/**
 * Update a specific mode's thinking level in the config and persist it.
 * Pass `undefined` for `level` to clear that mode's setting.
 */
export function updateThinkingConfig(
	config: PlanModeConfig,
	mode: "main" | "plan",
	level: ThinkingLevel | undefined,
	path?: string,
): void {
	if (level) {
		config.thinking[mode] = level;
	} else {
		delete config.thinking[mode];
	}
	saveModelConfig(config, path);
}
