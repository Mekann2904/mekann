/**
 * Plan Mode — ユーティリティ関数
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const DESTRUCTIVE_PATTERNS = [
	/\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred)\b/i,
	/(^|[^<])(?:>>|>(?!>))/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\bnpm\s+audit\b.*(?:\bfix\b|--fix\b)/i,
	/\b(yarn|pnpm)\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bgit\s+diff\b.*--output\b/i,
	/\bfind\b.*\s+(?:-delete|-exec\b|-execdir\b|-ok\b|-fls\b|-fprint\b|-fprint0\b|-fprintf)\b/i,
	/\bsed\b.*-i\b/i,
	/\b(sudo|su)\b/i,
	/\b(kill|pkill|killall)\b/i,
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

	if (SHELL_META_PATTERNS.some((p) => p.test(stripped))) {
		return false;
	}

	return !DESTRUCTIVE_PATTERNS.some((p) => p.test(stripped))
		&& SAFE_PATTERNS.some((p) => p.test(stripped));
}

export function buildBlockReason(
	toolName: string,
	input: Record<string, unknown>,
	blockCount: number,
): string {
	const H = "【プランモード・読み取り専用】";
	const toolLabel = ({ edit: "ファイル編集", write: "ファイル作成/上書き" } as Record<string, string>)[toolName] || toolName;
	const inputDesc = typeof input?.path === "string" ? input.path : "unknown";

	if (blockCount >= 3) {
		return `${H}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n代わりに <proposed_plan> ブロックで実装計画を出力してください。`;
	}
	if (blockCount >= 2) {
		return `${H}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、最終的に <proposed_plan> ブロックで結果を出力してください。`;
	}

	return `${H}\n${toolLabel}「${inputDesc}」はブロックされました。\nプランモードではファイル変更は一切禁止。\n代わりに変更内容をテキストで報告してください。`;
}

export function sanitizePlanTools(tools: string[]): string[] {
	return tools.filter((t) => t !== "edit" && t !== "write");
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

	if (vars) {
		for (const [key, value] of Object.entries(vars)) {
			content = content.replaceAll(`\${${key}}`, value);
		}
	}

	return content;
}

export function extractProposedPlan(message: string): string | undefined {
	const match = message.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/);
	return match?.[1]?.trim() || undefined;
}
