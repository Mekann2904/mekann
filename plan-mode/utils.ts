/**
 * Utility functions for plan mode.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

// --- Bash command safety ---

const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*git\s+submodule\s+(status|summary)/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*eza\b/,
];

// 安全なリダイレクト（stderr 抑制、/dev/null 出力）をストリップ
const SAFE_REDIRECT_PATTERN = /\s*2>\/dev\/null\b|\s*2>&1\b|\s*>\/dev\/null\b/g;

export function isSafeCommand(command: string): boolean {
	// リダイレクトを除去してから安全性を判定
	const stripped = command.replace(SAFE_REDIRECT_PATTERN, "");
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(stripped));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(stripped));
	return !isDestructive && isSafe;
}

// --- Plan extraction ---

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 80) {
		cleaned = `${cleaned.slice(0, 77)}...`;
	}
	return cleaned;
}

/**
 * extractTodoItems — \"Plan:\" ヘッダーまたは <proposed_plan> ブロックから
 * 実装ステップを抽出する。
 *
 * 対応フォーマット:
 * 1. 従来の \"Plan:\" + 番号付きリスト
 * 2. <proposed_plan> ブロック内の実装項目
 *    - \"Key Changes\" / \"Implementation Changes\" セクションの箇条書き
 *    - 番号付きリスト
 */
export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];

	// --- パターン1: <proposed_plan> ブロック ---
	const proposedPlanMatch = message.match(/<proposed_plan>\s*\n([\s\S]*?)\n\s*<\/proposed_plan>/);
	if (proposedPlanMatch) {
		const planContent = proposedPlanMatch[1];
		extractItemsFromSection(planContent, items);
	}

	// --- パターン2: 従来の \"Plan:\" ヘッダー ---
	if (items.length === 0) {
		const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
		if (headerMatch) {
			const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
			extractNumberedItems(planSection, items);
		}
	}

	return items;
}

/**
 * <proposed_plan> 内のコンテンツから実装項目を抽出。
 * 実装関連セクション（Key Changes, Implementation Changes, Test Plan 等）の
 * 箇条書き (- / * ) と番号付きリストを対象とする。
 */
function extractItemsFromSection(content: string, items: TodoItem[]): void {
	const lines = content.split("\n");
	let inImplementationSection = false;
	let anySectionHeaderFound = false;

	// 英語・日本語のセクションヘッダーキーワード
	const IMPL_SECTION_RE =
		/key\s*changes|implementation|changes|test\s*plan|steps|task|action/i;
	const IMPL_SECTION_JA_RE =
		/主要な変更|実装の変更|変更点|テスト計画|テスト|手順|ステップ|タスク/i;

	for (const line of lines) {
		const trimmed = line.trim();

		// セクションヘッダー検出 (## or ###)
		const headerMatch = trimmed.match(/^#{1,4}\s+(.+)/);
		if (headerMatch) {
			const headerText = headerMatch[1];
			anySectionHeaderFound = true;
			inImplementationSection =
				IMPL_SECTION_RE.test(headerText) || IMPL_SECTION_JA_RE.test(headerText);
			continue;
		}

		if (!inImplementationSection) continue;

		// 箇条書き (- / * ) からステップ抽出
		const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
		if (bulletMatch) {
			const text = bulletMatch[1]
				.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
				.replace(/`([^`]+)`/g, "$1")
				.trim();
			if (text.length > 5) {
				const cleaned = cleanStepText(text);
				if (cleaned.length > 3) {
					items.push({ step: items.length + 1, text: cleaned, completed: false });
				}
			}
			continue;
		}

		// 番号付きリスト (1. / 2. ) からステップ抽出
		const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
		if (numberedMatch) {
			const text = numberedMatch[2]
				.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
				.replace(/`([^`]+)`/g, "$1")
				.trim();
			if (text.length > 5) {
				const cleaned = cleanStepText(text);
				if (cleaned.length > 3) {
					items.push({ step: items.length + 1, text: cleaned, completed: false });
				}
			}
		}
	}

	// フォールバック: セクションヘッダーが1つもマッチしなかった場合、
	// ブロック内の全箇条書き・番号付きリストを抽出する
	if (items.length === 0 && !anySectionHeaderFound) {
		for (const line of lines) {
			const trimmed = line.trim();

			const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
			if (bulletMatch) {
				const text = bulletMatch[1]
					.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
					.replace(/`([^`]+)`/g, "$1")
					.trim();
				if (text.length > 5) {
					const cleaned = cleanStepText(text);
					if (cleaned.length > 3) {
						items.push({ step: items.length + 1, text: cleaned, completed: false });
					}
				}
				continue;
			}

			const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
			if (numberedMatch) {
				const text = numberedMatch[2]
					.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
					.replace(/`([^`]+)`/g, "$1")
					.trim();
				if (text.length > 5) {
					const cleaned = cleanStepText(text);
					if (cleaned.length > 3) {
						items.push({ step: items.length + 1, text: cleaned, completed: false });
					}
				}
			}
		}
	}
}

/**
 * 従来の \"Plan:\" 番号付きリストからステップ抽出。
 */
function extractNumberedItems(planSection: string, items: TodoItem[]): void {
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}

// --- Block reason generation ---

export const WRITING_TOOL_NAMES: Record<string, string> = {
	edit: "ファイル編集",
	write: "ファイル作成/上書き",
};

export const BLOCK_REASON_HEADER = "【プランモード・読み取り専用】";

export function buildBlockReason(
	toolName: string,
	input: Record<string, unknown>,
	blockCount: number,
): string {
	const toolLabel = WRITING_TOOL_NAMES[toolName] || toolName;
	const inputDesc = typeof input.path === "string" ? input.path : "unknown";

	if (blockCount >= 3) {
		return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n代わりに <proposed_plan> ブロックで実装計画を出力してください。`;
	}
	if (blockCount >= 2) {
		return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、最終的に <proposed_plan> ブロックで結果を出力してください。`;
	}

	return `${BLOCK_REASON_HEADER}\n${toolLabel}「${inputDesc}」はブロックされました。\nプランモードではファイル変更は一切禁止。\n代わりに変更内容をテキストで報告してください。`;
}

// --- Todo hashing ---

export function hashTodoItems(items: TodoItem[]): string {
	const content = items.map((t) => `${t.step}:${t.text}`).join("\n");
	return hashContent(content);
}

// --- Content hashing ---

export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

// --- Prompt loading ---

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
			content = content.replaceAll(`\$\{${key}\}`, value);
		}
	}

	return content;
}
