/**
 * Plan Mode — ユーティリティ関数
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { getPlanModeConfigPath, MEKANN_CONFIG_VERSION } from "../../config.js";

// Re-export from policy-core — single source of truth for command intent classification.
// isSafeCommand is a UX guard, NOT a security boundary.
export { classifyCommandIntent, isPlanReadOnlyCommandIntent, isSafeCommand, type CommandIntent, type CommandIntentKind } from "../policy-core/modes.js";

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
export interface PlanModeConfig { version: typeof MEKANN_CONFIG_VERSION; models: { main?: ModelRef; plan?: ModelRef; }; thinking: { main?: ThinkingLevel; plan?: ThinkingLevel; }; }

export function createDefaultConfig(): PlanModeConfig {
	return { version: MEKANN_CONFIG_VERSION, models: {}, thinking: {} };
}

export function normalizeConfig(raw: Record<string, unknown>): PlanModeConfig {
	const t = raw.thinking;
	const thinking: PlanModeConfig["thinking"] = {};
	if (t && typeof t === "object") {
		const ti = t as Record<string, unknown>;
		if (isThinkingLevel(ti.main)) thinking.main = ti.main;
		if (isThinkingLevel(ti.plan)) thinking.plan = ti.plan;
	}
	return { version: MEKANN_CONFIG_VERSION, models: (raw.models && typeof raw.models === "object") ? raw.models as PlanModeConfig["models"] : {}, thinking };
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

/** ~/.pi/agent/plan-mode.json へのパス（explicitPath で上書き可能）。 */
export function getConfigPath(explicitPath?: string): string {
	return explicitPath ?? getPlanModeConfigPath();
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

/** Sleep synchronously; used only while waiting for the cross-process config lock. */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Cross-process mutex for plan-mode config updates.
 *
 * `mkdir` is atomic on local filesystems, so a lock directory gives us a small
 * dependency-free critical section shared by all pi processes.  Stale locks are
 * reclaimed to avoid a crashed pi permanently blocking config writes.
 */
function withConfigLock<T>(configPath: string, fn: () => T): T {
	const dir = dirname(configPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const lockPath = `${configPath}.lock`;
	const timeoutMs = 5_000;
	const staleMs = 30_000;
	const start = Date.now();

	for (;;) {
		try {
			mkdirSync(lockPath);
		} catch (error) {
			if ((error as { code?: string }).code !== "EEXIST") throw error;

			try {
				if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
					rmSync(lockPath, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if ((statError as { code?: string }).code !== "ENOENT") throw statError;
				continue;
			}

			if (Date.now() - start > timeoutMs) throw new Error(`plan-mode config lock timeout: ${lockPath}`);
			sleepSync(25);
			continue;
		}

		try {
			writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + "\n", "utf-8");
			return fn();
		} finally {
			rmSync(lockPath, { recursive: true, force: true });
		}
	}
}

/** 設定を write-then-rename で原子的に保存（呼び出し側は lock 済み）。 */
function writeModelConfigUnlocked(config: PlanModeConfig, configPath: string): void {
	const tmp = `${configPath}.tmp.${process.pid}.${Date.now()}`;
	const json = JSON.stringify(config, null, 2) + "\n";
	writeFileSync(tmp, json, "utf-8");
	try {
		renameSync(tmp, configPath);
	} catch {
		// renameSync may fail across partitions; fall back to direct write
		writeFileSync(configPath, json, "utf-8");
		rmSync(tmp, { force: true });
	}
}

/** 設定を排他ロック下で write-then-rename により原子的に保存。 */
export function saveModelConfig(config: PlanModeConfig, explicitPath?: string): void {
	const configPath = getConfigPath(explicitPath);
	withConfigLock(configPath, () => writeModelConfigUnlocked(config, configPath));
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
	mode: "main" | "plan",
	value: T | undefined,
	path?: string,
): void {
	const configPath = getConfigPath(path);
	withConfigLock(configPath, () => {
		const latest = loadModelConfig(path);
		config.version = latest.version;
		config.models = { ...latest.models };
		config.thinking = { ...latest.thinking };
		if (value) (config[section] as Record<string, T>)[mode] = value; else delete (config[section] as Record<string, T>)[mode];
		writeModelConfigUnlocked(config, configPath);
	});
}


export type Mode = "main" | "plan";
export function isReadOnlyMode(mode: Mode): boolean {
	return mode === "plan";
}

export function modeLabel(mode: Mode): string {
	return mode === "plan" ? "PLAN MODE" : "";
}

export interface PlanState {
	mode: Mode;
	pendingPlan?: string;
	/** Plan text to inject once into main mode's system prompt, then cleared. */
	implementationPlan?: string;
	savedActiveTools?: string[];
	planPromptHash?: string;
	planPromptDelivered: boolean;
	/** Persisted model preferences for each mode. */
	modelConfig: PlanModeConfig;
	/** Snapshot of the main-mode model before entering plan mode (for fallback restore). */
	savedMainModel?: ModelRef;
	/** Snapshot of the main-mode thinking level before entering plan mode (for fallback restore). */
	savedMainThinking?: ThinkingLevel;
}

export function createInitialState(modelConfig?: PlanModeConfig): PlanState {
	return { mode: "main", planPromptDelivered: false, modelConfig: modelConfig ?? { version: 1, models: {}, thinking: {} } };
}
