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
	/\bnpm\s+audit\s+(fix|--fix)\b/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bgit\s+diff\b.*--output\b/i,
	/\bfind\b.*\s+(?:-delete|-exec\b|-execdir\b|-ok\b|-fls\b|-fprint\b|-fprintf)\b/i,
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
	/^\s*find\b(?!.*\b(?:-delete|-exec|-execdir|-ok|-fls|-fprint|-fprintf)\b)/i,
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

// Shell metacharacter guard: plan mode で許容しないシェル構文
// TODO: 正規表現ベースの判定は限界がある。
// 変数展開、クォート内メタ文字、glob 等を正しく扱うには
// shell quote aware な tokenizer + コマンド別 allowlist が必要。
// 現状は「既知の穴を塞ぐ」一時対応。
const SHELL_META_PATTERNS = [
	/&&/,                   // command chaining
	/\|\|/,                 // OR chaining
	/;/,                    // sequential execution
	/\|/,                   // pipe
	/`/,                    // backtick substitution
	/\$\(/,                 // command substitution $()
	/<\(/,                  // process substitution <()
	/(^|[^&])&([^&]|$)/,   // single & background execution (not &&)
	/[\r\n]/,              // newline / carriage return (multiple commands)
];

// 安全なリダイレクト（stderr 抑制、/dev/null 出力）をストリップ
const SAFE_REDIRECT_PATTERN = /\s*2>\/dev\/null\b|\s*2>&1\b|\s*>\/dev\/null\b/g;

export function isSafeCommand(command: string): boolean {
	// リダイレクトを除去してから安全性を判定
	const stripped = command.replace(SAFE_REDIRECT_PATTERN, "");

	// Shell metacharacter guard: メタ文字を含む場合は一律ブロック
	if (SHELL_META_PATTERNS.some((p) => p.test(stripped))) {
		return false;
	}

	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(stripped));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(stripped));
	return !isDestructive && isSafe;
}

// --- Plan extraction ---

export interface TodoItem {
	id: string;           // 機械可読 step ID (例: "inspect-current-state")
	step: number;         // 表示順序（1-origin）
	text: string;         // UI 表示用テキスト
	instruction: string;  // 実行用原文（識別子の大小文字を保持）
	acceptance?: string;  // 受け入れ基準
	completed: boolean;
}

/** <plan_steps_json> の各エントリ */
interface PlanStepJson {
	id: string;
	title: string;
	instruction?: string;
	acceptance?: string;
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

	// 大文字化: コード識別子（camelCase, ドット付きファイル名）はそのまま
	if (cleaned.length > 0 && /^[a-z]/.test(cleaned)) {
		const firstWord = cleaned.split(/\s/)[0];
		const isCamelCase = /[a-z][A-Z]/.test(firstWord);
		const isFilename = /\.\w+$/.test(firstWord);
		if (!isCamelCase && !isFilename) {
			cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
		}
	}

	if (cleaned.length > 80) {
		cleaned = `${cleaned.slice(0, 77)}...`;
	}
	return cleaned;
}

/**
 * extractTodoItems — <plan_steps_json>, <proposed_plan>, Plan: の順で
 * 実装ステップを抽出する。
 *
 * 優先順位:
 * 1. <plan_steps_json> ブロック（構造化データ）
 * 2. <proposed_plan> ブロック内の箇条書き・番号付きリスト（フォールバック）
 * 3. 従来の "Plan:" ヘッダー（フォールバック）
 */
export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];

	// --- 優先: <plan_steps_json> ブロック ---
	const jsonMatch = message.match(
		/<plan_steps_json>\s*([\s\S]*?)\s*<\/plan_steps_json>/,
	);
	if (jsonMatch) {
		try {
			const parsed = JSON.parse(jsonMatch[1]);
			if (Array.isArray(parsed)) {
				for (const entry of parsed) {
					const e = entry as Record<string, unknown>;
					if (typeof e.id === "string" && typeof e.title === "string") {
						items.push({
							id: e.id,
							step: items.length + 1,
							text: cleanStepText(e.title),
							instruction: typeof e.instruction === "string" ? e.instruction : e.title,
							acceptance: typeof e.acceptance === "string" ? e.acceptance : undefined,
							completed: false,
						});
					}
				}
				if (items.length > 0) return items;
			}
		} catch {
			// JSON parse 失敗 → フォールバック
		}
	}

	// --- フォールバック1: <proposed_plan> ブロック内 Markdown ---
	const proposedPlanMatch = message.match(
		/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/,
	);
	if (proposedPlanMatch) {
		extractItemsFromSection(proposedPlanMatch[1], items);
	}

	// --- フォールバック2: 従来の "Plan:" ヘッダー ---
	if (items.length === 0) {
		const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
		if (headerMatch) {
			const planSection = message.slice(
				message.indexOf(headerMatch[0]) + headerMatch[0].length,
			);
			extractNumberedItems(planSection, items);
		}
	}

	// フォールバック時: id / instruction のデフォルトを設定
	for (const item of items) {
		if (!item.id) item.id = `step-${item.step}`;
		if (!item.instruction) item.instruction = item.text;
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
			const raw = bulletMatch[1]
				.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
				.replace(/`([^`]+)`/g, "$1")
				.trim();
			if (raw.length > 5) {
				const cleaned = cleanStepText(raw);
				if (cleaned.length > 3) {
					items.push({
						id: "",
						step: items.length + 1,
						text: cleaned,
						instruction: raw,
						completed: false,
					});
				}
			}
			continue;
		}

		// 番号付きリスト (1. / 2. ) からステップ抽出
		const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
		if (numberedMatch) {
			const raw = numberedMatch[2]
				.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
				.replace(/`([^`]+)`/g, "$1")
				.trim();
			if (raw.length > 5) {
				const cleaned = cleanStepText(raw);
				if (cleaned.length > 3) {
					items.push({
						id: "",
						step: items.length + 1,
						text: cleaned,
						instruction: raw,
						completed: false,
					});
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
				const raw = bulletMatch[1]
					.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
					.replace(/`([^`]+)`/g, "$1")
					.trim();
				if (raw.length > 5) {
					const cleaned = cleanStepText(raw);
					if (cleaned.length > 3) {
						items.push({
							id: "",
							step: items.length + 1,
							text: cleaned,
							instruction: raw,
							completed: false,
						});
					}
				}
				continue;
			}

			const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
			if (numberedMatch) {
				const raw = numberedMatch[2]
					.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
					.replace(/`([^`]+)`/g, "$1")
					.trim();
				if (raw.length > 5) {
					const cleaned = cleanStepText(raw);
					if (cleaned.length > 3) {
						items.push({
							id: "",
							step: items.length + 1,
							text: cleaned,
							instruction: raw,
							completed: false,
						});
					}
				}
			}
		}
	}
}

/**
 * 従来の "Plan:" 番号付きリストからステップ抽出。
 */
function extractNumberedItems(planSection: string, items: TodoItem[]): void {
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const raw = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();
		if (raw.length > 5 && !raw.startsWith("`") && !raw.startsWith("/") && !raw.startsWith("-")) {
			const cleaned = cleanStepText(raw);
			if (cleaned.length > 3) {
				items.push({
					id: "",
					step: items.length + 1,
					text: cleaned,
					instruction: raw,
					completed: false,
				});
			}
		}
	}
}

export function extractDoneSteps(message: string): Array<number | string> {
	const steps: Array<number | string> = [];
	for (const match of message.matchAll(/\[DONE:([a-zA-Z0-9_-]+)\]/gi)) {
		const value = match[1];
		if (/^\d+$/.test(value)) {
			steps.push(Number(value));
		} else {
			steps.push(value);
		}
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	let changed = 0;
	for (const step of doneSteps) {
		const item =
			typeof step === "number"
				? items.find((t) => t.step === step)
				: items.find((t) => t.id === step);
		if (item && !item.completed) {
			item.completed = true;
			changed++;
		}
	}
	return changed;
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
	// P0: input が null や path を持たない場合も安全に処理
	const inputDesc = typeof input?.path === "string" ? input.path : "unknown";

	if (blockCount >= 3) {
		return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません。${blockCount}回ブロック済みです。\n今すぐ停止し、分析結果を報告してください。\n絶対に再試行しないでください。\n代わりに <proposed_plan> ブロックで実装計画を出力してください。`;
	}
	if (blockCount >= 2) {
		return `${BLOCK_REASON_HEADER}\n⚠ ${toolLabel}は実行できません（${blockCount}回目のブロック）。\n再度試行しても同じ結果になります。\n読み取り専用の分析を続け、最終的に <proposed_plan> ブロックで結果を出力してください。`;
	}

	return `${BLOCK_REASON_HEADER}\n${toolLabel}「${inputDesc}」はブロックされました。\nプランモードではファイル変更は一切禁止。\n代わりに変更内容をテキストで報告してください。`;
}

// --- Plan quality validation ---

export interface ValidationResult {
	valid: boolean;
	issues: string[];    // hard errors — plan 実行をブロック
	warnings: string[];  // soft warnings — 通知のみ、ブロックしない
}

const ACTION_WORDS_RE =
	/^(update|create|write|read|check|verify|modify|add|remove|delete|install|fix|implement|refactor|test|migrate|configure|setup|build|deploy|analyze|review|document|optimize|extract|integrate|replace|rename|move|split|merge|restructure|change|improve|handle|convert|validate|ensure|set|get|run|execute)/i;
const ACTION_WORDS_JA_RE =
	/[するつくり追加更新修正削除作成実装確認検証テスト移行設定構築分析レビュー導入適用変更改善対応変換抽出検証保証実行移動分割統合再構築]/;

export function validatePlan(items: TodoItem[]): {
	valid: boolean;
	issues: string[];
	warnings: string[];
} {
	const issues: string[] = [];
	const warnings: string[] = [];

	if (items.length < 3) {
		issues.push("ステップ数が少なすぎます（最低3ステップ）。");
	}
	if (items.length > 15) {
		issues.push("ステップ数が多すぎます（最大15ステップ）。大きいステップにまとめるか、複数プランに分割してください。");
	}

	// P1: 重複 ID チェック（hard error）
	const ids = items.map((i) => i.id);
	const seen = new Set<string>();
	const dupes = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) dupes.add(id);
		seen.add(id);
	}
	if (dupes.size > 0) {
		issues.push(`重複するステップID: ${[...dupes].join(", ")}。IDは一意にしてください。`);
	}

	for (let i = 0; i < items.length; i++) {
		const text = items[i].instruction || items[i].text;

		// P1: 空 instruction チェック（hard error）
		if (!items[i].instruction || items[i].instruction.trim().length === 0) {
			issues.push(`ステップ ${i + 1} [${items[i].id}] の instruction が空です。`);
			continue;
		}

		if (text.trim().length <= 5) {
			issues.push(`ステップ ${i + 1} の説明が短すぎます。`);
		} else if (
			!ACTION_WORDS_RE.test(text) &&
			!ACTION_WORDS_JA_RE.test(text)
		) {
			issues.push(
				`ステップ ${i + 1}「${text.slice(0, 30)}」に動作の記述が見つかりません。動詞で始まる具体的なアクションにしてください。`
			);
		}

		// P1: acceptance 欠落（soft warning）
		if (!items[i].acceptance) {
			warnings.push(`ステップ ${i + 1} [${items[i].id}] に acceptance がありません。完了基準を明示すると実行品質が向上します。`);
		}
	}

	return { valid: issues.length === 0, issues, warnings };
}

// --- Todo hashing ---

export function resolveExecutionTools(
	savedActiveTools: string[] | undefined,
	configExecTools: string[] | undefined,
	defaultTools: string[],
): string[] {
	return configExecTools ?? savedActiveTools ?? defaultTools;
}

export function hashTodoItems(items: TodoItem[]): string {
	const content = items.map((t) => `${t.id}:${t.step}:${t.instruction}`).join("\n");
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
