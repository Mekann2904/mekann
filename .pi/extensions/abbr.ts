/**
 * @abdd.meta
 * path: .pi/extensions/abbr.ts
 * role: 略語（Abbreviation）の定義、永続化、および入力時の自動展開を行う拡張機能
 * why: ユーザーが短いコマンドエイリアスを入力するだけで、事前に登録された長いコマンドを自動的に補完・展開するため
 * related: @mariozechner/pi-coding-agent, @mariozechner/pi-tui, @mariozechner/pi-ai, node:fs
 * public_api: export interface Abbreviation
 * invariants: 略語名は一意である必要がある、CONFIG_FILEはJSON形式である
 * side_effects: ~/.pi/abbr.json へのファイル書き込み、piInstanceのエントリ更新
 * failure_modes: 設定ファイルの読み書き権限がない、JSONパースエラー、piInstanceが設定される前の永続化呼び出し
 * @abdd.explain
 * overview: Fish shellライクな略語展開機能を提供し、入力された短い文字列をコマンド送信前に定義済みの文字列へ置換する
 * what_it_does:
 *   - ~/.pi/abbr.jsonへの略語データのロードと保存
 *   - /abbr add/list/erase/rename/query コマンドによる定義管理
 *   - 入力フィールドでの略語検出と展開処理
 *   - ExtensionAPIへの状態同期
 * why_it_exists:
 *   - 頻繁に使用する長いコマンドや定型入力を短縮し、操作効率を向上させるため
 *   - シェルのエイリアス機能のようにインタラクティブな入力補完を実現するため
 * scope:
 *   in: ユーザー入力文字列、/abbrコマンド引数、設定ファイル
 *   out: エージェントへ送信される展開後の文字列、TUI表示、設定ファイル更新
 */

/**
 * Abbreviation (abbr) Extension
 *
 * Fish shell-like abbreviation support for pi.
 * Expands short aliases (e.g., "gaa") to full commands (e.g., "git add .").
 *
 * Usage:
 *   /abbr add <name> <expansion>    - Add an abbreviation
 *   /abbr list                      - List all abbreviations
 *   /abbr erase <name>              - Remove an abbreviation
 *   /abbr rename <old> <new>        - Rename an abbreviation
 *   /abbr query <name>              - Check if abbreviation exists
 *
 * When you type an abbreviation name followed by a space in the input field,
 * it will be replaced with its expansion before being sent to the agent.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";


// Configuration file path (global)
const CONFIG_DIR = path.join(os.homedir(), ".pi");
const CONFIG_FILE = path.join(CONFIG_DIR, "abbr.json");

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * @summary 略語情報定義
 * @param name - 略語名
 * @param expansion - 展開後テキスト
 * @param regex - マッチ正規表現
 * @param pattern - パターン文字列
 * @param position - 位置情報
 * @returns {Abbreviation}
 */
export interface Abbreviation {
	name: string;
	expansion: string;
	regex?: boolean;
	pattern?: string;
	position?: "command" | "anywhere";
}

interface AbbrState {
	abbreviations: Abbreviation[];
}

interface AbbrDetails {
	action: "list" | "add" | "erase" | "rename" | "query";
	abbreviations: Abbreviation[];
	result?: string;
	error?: string;
}

const AbbrParams = Type.Object({
	action: StringEnum(["list", "add", "erase", "rename", "query"] as const),
	name: Type.Optional(Type.String({ description: "Abbreviation name" })),
	expansion: Type.Optional(Type.String({ description: "Expansion string" })),
	newName: Type.Optional(Type.String({ description: "New name (for rename)" })),
});

// State
const abbreviations: Map<string, Abbreviation> = new Map();
let piInstance: ExtensionAPI | null = null;

// Load abbreviations from config file
function loadFromFile(): void {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			const data = fs.readFileSync(CONFIG_FILE, "utf-8");
			const parsed = JSON.parse(data) as { abbreviations: Abbreviation[] };
			abbreviations.clear();
			for (const abbr of parsed.abbreviations) {
				abbreviations.set(abbr.name, abbr);
			}
		}
	} catch (error) {
		console.error("Failed to load abbreviations:", error);
	}
}

// Save abbreviations to config file
function saveToFile(): void {
	try {
		const data = JSON.stringify(
			{ abbreviations: Array.from(abbreviations.values()) },
			null,
			2,
		);
		fs.writeFileSync(CONFIG_FILE, data, "utf-8");
	} catch (error) {
		console.error("Failed to save abbreviations:", error);
	}
}

// Persist current state (must be called after piInstance is set)
function persistState() {
	saveToFile();
	if (piInstance) {
		piInstance.appendEntry<AbbrState>("abbr-state", {
			abbreviations: Array.from(abbreviations.values()),
		});
	}
}

/**
 * 略語の展開における循環参照を検出する
 * @param name - 追加する略語名
 * @param expansion - 展開後のテキスト
 * @param visited - 訪問済み略語名のセット（再帰用）
 * @returns 循環がある場合はtrue
 */
function hasCircularReference(name: string, expansion: string, visited: Set<string> = new Set()): boolean {
	if (visited.has(name)) return true;
	visited.add(name);

	// 展開後のテキストの最初の単ードをチェック
	const firstWord = expansion.trim().split(/\s/)[0];
	const nestedAbbr = abbreviations.get(firstWord);

	if (nestedAbbr) {
		// ネストされた略語がある場合、再帰的にチェック
		if (hasCircularReference(firstWord, nestedAbbr.expansion, visited)) {
			return true;
		}
	}

	return false;
}

// Find abbreviation matching input at start
function findExpansion(input: string): { expanded: string; original: string } | null {
	const trimmed = input.trim();
	const firstWord = trimmed.split(/\s/)[0];

	// Check for exact match
	const abbr = abbreviations.get(firstWord);
	if (abbr) {
		// For command position, only expand if it's the first word
		if (abbr.position === "anywhere" || abbr.position === undefined || abbr.position === "command") {
			// Replace first occurrence
			const regex = new RegExp(`^${escapeRegex(firstWord)}(\\s|$)`);
			const expanded = trimmed.replace(regex, abbr.expansion + "$1");
			return { expanded, original: firstWord };
		}
	}

	// Check regex patterns
	for (const abbr of abbreviations.values()) {
		if (abbr.regex && abbr.pattern) {
			const regex = new RegExp(`^(${abbr.pattern})(\\s|$)`);
			const match = trimmed.match(regex);
			if (match) {
				const expanded = trimmed.replace(regex, abbr.expansion + "$2");
				return { expanded, original: match[1] };
			}
		}
	}

	return null;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Remove surrounding quotes from a string
function stripQuotes(str: string): string {
	if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
		return str.slice(1, -1);
	}
	return str;
}

// Reconstruct state from session
function reconstructState(ctx: ExtensionContext) {
	abbreviations.clear();

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "abbr-state") {
			const data = entry.data as AbbrState | undefined;
			if (data?.abbreviations) {
				for (const abbr of data.abbreviations) {
					abbreviations.set(abbr.name, abbr);
				}
			}
		}
	}

	// Also check tool results for backward compatibility
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "abbr") {
			const details = entry.message.details as AbbrDetails | undefined;
			if (details?.abbreviations) {
				for (const abbr of details.abbreviations) {
					abbreviations.set(abbr.name, abbr);
				}
			}
		}
	}
}

// UI component for listing abbreviations
/**
 * 略語一覧を表示するUIコンポーネント
 *
 * 指定された幅に基づいて文字列の配列を生成します。
 * キャッシュが利用可能で、幅が変更されていない場合はキャッシュされた行を返します。
 *
 * @param width - 行を生成するための幅
 * @returns 生成された文字列の配列
 * @example
 * const abbrList = new AbbrListComponent(theme, onClose);
 * const lines = abbrList.render(80);
 */
class AbbrListComponent {
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(theme: Theme, onClose: () => void) {
		this.theme = theme;
		this.onClose = onClose;
	}

	/**
	 * @summary 入力処理
	 * @param data - 入力データ
	 * @returns {void}
	 */
	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
			this.onClose();
		}
	}

	/**
	 * @summary リストを描画
	 * @param width - 描画幅
	 * @returns 描画文字列配列
	 */
	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		lines.push("");
/**
		 * キャッシュを無効化します。
		 *
		 * このメソッドは、キャッシュされた幅と行を未定義に設定します。
		 *
		 * @returns なし
		 */
		const title = th.fg("accent", " Abbreviations ");
		const headerLine =
			th.fg("borderMuted", "─".repeat(2)) + title + th.fg("borderMuted", "─".repeat(Math.max(0, width - 18)));
		lines.push(truncateToWidth(headerLine, width));
		lines.push("");

		const abbrs = Array.from(abbreviations.values());

		if (abbrs.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No abbreviations yet.")}`, width));
			lines.push("");
			lines.push(truncateToWidth(`  ${th.fg("muted", "Use /abbr add <name> <expansion> to add one.")}`, width));
		} else {
			for (const abbr of abbrs) {
				const name = th.fg("accent", abbr.name);
				const arrow = th.fg("borderMuted", " → ");
				const exp = th.fg("muted", abbr.expansion);
				lines.push(truncateToWidth(`  ${name}${arrow}${exp}`, width));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	/**
	 * @summary キャッシュを無効化する
	 * @returns {void} 戻り値なし
	 */
	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
	if (isInitialized) return;
	isInitialized = true;

	// Store pi instance for persistState
	piInstance = pi;

	// Restore state on session events
	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// Register the abbr tool for LLM
	pi.registerTool({
		name: "abbr",
		label: "Abbr",
		description: "Manage abbreviations. Actions: list, add (name, expansion), erase (name), rename (name, newName), query (name)",
		parameters: AbbrParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "list": {
					const abbrs = Array.from(abbreviations.values());
					const result = abbrs.length
						? abbrs.map((a) => `${a.name} → ${a.expansion}`).join("\n")
						: "No abbreviations";
					return {
						content: [{ type: "text", text: result }],
						details: { action: "list", abbreviations: [...abbrs] } as AbbrDetails,
					};
				}

				case "add": {
					if (!params.name || !params.expansion) {
						return {
							content: [{ type: "text", text: "Error: name and expansion required" }],
							details: {
								action: "add",
								abbreviations: [],
								error: "name and expansion required",
							} as AbbrDetails,
						};
					}
					// 循環参照の検出
					if (hasCircularReference(params.name, params.expansion)) {
						return {
							content: [{ type: "text", text: `Error: circular reference detected - "${params.name}" would create an infinite expansion loop` }],
							details: {
								action: "add",
								abbreviations: Array.from(abbreviations.values()),
								error: "circular reference detected",
							} as AbbrDetails,
						};
					}
					const abbr: Abbreviation = {
						name: params.name,
						expansion: params.expansion,
					};
					abbreviations.set(params.name, abbr);
					persistState();
					return {
						content: [{ type: "text", text: `Added abbreviation: ${params.name} → ${params.expansion}` }],
						details: { action: "add", abbreviations: Array.from(abbreviations.values()) } as AbbrDetails,
					};
				}

				case "erase": {
					if (!params.name) {
						return {
							content: [{ type: "text", text: "Error: name required" }],
							details: { action: "erase", abbreviations: [], error: "name required" } as AbbrDetails,
						};
					}
					if (abbreviations.delete(params.name)) {
						persistState();
						return {
							content: [{ type: "text", text: `Erased abbreviation: ${params.name}` }],
							details: { action: "erase", abbreviations: Array.from(abbreviations.values()) } as AbbrDetails,
						};
					}
					return {
						content: [{ type: "text", text: `Abbreviation not found: ${params.name}` }],
						details: {
							action: "erase",
							abbreviations: Array.from(abbreviations.values()),
							error: "not found",
						} as AbbrDetails,
					};
				}

				case "rename": {
					if (!params.name || !params.newName) {
						return {
							content: [{ type: "text", text: "Error: name and newName required" }],
							details: {
								action: "rename",
								abbreviations: [],
								error: "name and newName required",
							} as AbbrDetails,
						};
					}
					const abbr = abbreviations.get(params.name);
					if (!abbr) {
						return {
							content: [{ type: "text", text: `Abbreviation not found: ${params.name}` }],
							details: {
								action: "rename",
								abbreviations: Array.from(abbreviations.values()),
								error: "not found",
							} as AbbrDetails,
						};
					}
					abbreviations.delete(params.name);
					abbr.name = params.newName;
					abbreviations.set(params.newName, abbr);
					persistState();
					return {
						content: [{ type: "text", text: `Renamed: ${params.name} → ${params.newName}` }],
						details: { action: "rename", abbreviations: Array.from(abbreviations.values()) } as AbbrDetails,
					};
				}

				case "query": {
					if (!params.name) {
						return {
							content: [{ type: "text", text: "Error: name required" }],
							details: { action: "query", abbreviations: [], error: "name required" } as AbbrDetails,
						};
					}
					const abbr = abbreviations.get(params.name);
					return {
						content: [{ type: "text", text: abbr ? `Yes: ${abbr.expansion}` : "No" }],
						details: { action: "query", abbreviations: Array.from(abbreviations.values()) } as AbbrDetails,
					};
				}

				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: { action: "list", abbreviations: [], error: "unknown action" } as AbbrDetails,
					};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("abbr ")) + theme.fg("muted", args.action);
			if (args.name) text += ` ${theme.fg("accent", args.name)}`;
			if (args.expansion) text += ` ${theme.fg("dim", `"${args.expansion}"`)}`;
			if (args.newName) text += ` ${theme.fg("muted", "→")} ${theme.fg("accent", args.newName)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AbbrDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			const text = result.content[0];
			const msg = text?.type === "text" ? text.text : "";
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
		},
	});

	// Register /abbr command for users
	pi.registerCommand("abbr", {
		description: "Manage abbreviations (add, list, erase, rename, query)",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "list";

			switch (subcommand) {
				case "list": {
					if (!ctx.hasUI) {
						const abbrs = Array.from(abbreviations.values());
						if (abbrs.length === 0) {
							ctx.ui.notify("No abbreviations", "info");
						} else {
							for (const abbr of abbrs) {
								ctx.ui.notify(`${abbr.name} → ${abbr.expansion}`, "info");
							}
						}
						return;
					}

					await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
						return new AbbrListComponent(theme, () => done());
					});
					break;
				}

				case "add": {
					if (parts.length < 3) {
						ctx.ui.notify("Usage: /abbr add <name> <expansion>", "warning");
						return;
					}
					const name = parts[1];
					let expansion = parts.slice(2).join(" ");
					// Strip surrounding quotes if present
					expansion = stripQuotes(expansion);
					// 循環参照の検出
					if (hasCircularReference(name, expansion)) {
						ctx.ui.notify(`Error: circular reference detected - "${name}" would create an infinite expansion loop`, "error");
						return;
					}
					abbreviations.set(name, { name, expansion });
					persistState();
					ctx.ui.notify(`Added: ${name} → ${expansion}`, "success");
					break;
				}

				case "erase":
				case "delete":
				case "remove": {
					if (parts.length < 2) {
						ctx.ui.notify("Usage: /abbr erase <name>", "warning");
						return;
					}
					const name = parts[1];
					if (abbreviations.delete(name)) {
						persistState();
						ctx.ui.notify(`Erased: ${name}`, "success");
					} else {
						ctx.ui.notify(`Not found: ${name}`, "error");
					}
					break;
				}

				case "rename": {
					if (parts.length < 3) {
						ctx.ui.notify("Usage: /abbr rename <old> <new>", "warning");
						return;
					}
					const oldName = parts[1];
					const newName = parts[2];
					const abbr = abbreviations.get(oldName);
					if (!abbr) {
						ctx.ui.notify(`Not found: ${oldName}`, "error");
						return;
					}
					abbreviations.delete(oldName);
					abbr.name = newName;
					abbreviations.set(newName, abbr);
					persistState();
					ctx.ui.notify(`Renamed: ${oldName} → ${newName}`, "success");
					break;
				}

				case "query":
				case "check": {
					if (parts.length < 2) {
						ctx.ui.notify("Usage: /abbr query <name>", "warning");
						return;
					}
					const name = parts[1];
					const abbr = abbreviations.get(name);
					if (abbr) {
						ctx.ui.notify(`${name} → ${abbr.expansion}`, "info");
					} else {
						ctx.ui.notify(`Not found: ${name}`, "info");
					}
					break;
				}

				default: {
					if (abbreviations.has(subcommand)) {
						// User typed an abbreviation name directly, show its expansion
						const abbr = abbreviations.get(subcommand)!;
						ctx.ui.notify(`${subcommand} → ${abbr.expansion}`, "info");
					} else {
						ctx.ui.notify(
							"Usage: /abbr [list|add|erase|rename|query] [args...]",
							"warning",
						);
					}
				}
			}
		},
		getArgumentCompletions: (prefix) => {
			const cmds = ["list", "add", "erase", "rename", "query"];
			const filtered = cmds.filter((c) => c.startsWith(prefix));
			if (filtered.length > 0) {
				return filtered.map((c) => ({ value: c, label: c }));
			}
			// Also complete abbreviation names
			const abbrNames = Array.from(abbreviations.keys()).filter((n) => n.startsWith(prefix));
			if (abbrNames.length > 0) {
				return abbrNames.map((n) => ({ value: n, label: n }));
			}
			return null;
		},
	});

	// Transform input to expand abbreviations
	pi.on("input", async (event, ctx) => {
		const input = event.text.trim();

		// Skip extension-injected messages
		if (event.source === "extension") {
			return { action: "continue" };
		}

		// Skip commands (starting with /)
		if (input.startsWith("/")) {
			return { action: "continue" };
		}

		// Try to expand abbreviation
		const expansionResult = findExpansion(input);
		if (expansionResult) {
			const { expanded, original } = expansionResult;
			const abbr = abbreviations.get(original);

			// Get the part after the abbreviation
			const remainingPart = input.slice(original.length).trim();

			// Build the final expanded text
			let finalExpanded = expanded;
			if (remainingPart) {
				finalExpanded = expanded + " " + remainingPart;
			}

			// Set editor text to expanded version and show notification
			ctx.ui.setEditorText(finalExpanded);
			ctx.ui.notify(`Expanded: ${original} → ${abbr?.expansion}`, "info");

			// Block the input from being sent - user needs to press Enter again
			return { action: "handled" };
		}

		return { action: "continue" };
	});

	// Add some default abbreviations on first load (if no config file exists)
	pi.on("session_start", async (_event, ctx) => {
		// Load from file first
		loadFromFile();

		// Add defaults only if config file doesn't exist or is empty
		if (!fs.existsSync(CONFIG_FILE) || abbreviations.size === 0) {
			const defaults: Abbreviation[] = [
				{ name: "g", expansion: "git" },
				{ name: "ga", expansion: "git add" },
				{ name: "gaa", expansion: "git add --all" },
				{ name: "gapa", expansion: "git add --patch" },
				{ name: "gau", expansion: "git add --update" },
				{ name: "gav", expansion: "git add --verbose" },
				{ name: "gap", expansion: "git apply" },
				{ name: "gapt", expansion: "git apply --3way" },
				{ name: "gb", expansion: "git branch" },
				{ name: "gba", expansion: "git branch -a" },
				{ name: "gbd", expansion: "git branch -d" },
				{ name: "gbD", expansion: "git branch -D" },
				{ name: "gbl", expansion: "git blame -b -w" },
				{ name: "gbnm", expansion: "git branch --no-merged" },
				{ name: "gbr", expansion: "git branch --remote" },
				{ name: "gbs", expansion: "git bisect" },
				{ name: "gbsb", expansion: "git bisect bad" },
				{ name: "gbsg", expansion: "git bisect good" },
				{ name: "gbsr", expansion: "git bisect reset" },
				{ name: "gbss", expansion: "git bisect start" },
				{ name: "gc", expansion: "git commit -v" },
				{ name: "gc!", expansion: "git commit -v --amend" },
				{ name: "gcn!", expansion: "git commit -v --no-edit --amend" },
				{ name: "gca", expansion: "git commit -v -a" },
				{ name: "gca!", expansion: "git commit -v -a --amend" },
				{ name: "gcan!", expansion: "git commit -v -a --no-edit --amend" },
				{ name: "gcans!", expansion: "git commit -v -a -s --no-edit --amend" },
				{ name: "gcam", expansion: "git commit -a -m" },
				{ name: "gcas", expansion: "git commit -a -s" },
				{ name: "gcasm", expansion: "git commit -a -s -m" },
				{ name: "gcsm", expansion: "git commit -s -m" },
				{ name: "gcb", expansion: "git checkout -b" },
				{ name: "gcf", expansion: "git config --list" },
				{ name: "gcl", expansion: "git clone --recurse-submodules" },
				{ name: "gclean", expansion: "git clean -id" },
				{ name: "gpristine", expansion: "git reset --hard && git clean -dffx" },
				{ name: "gcmsg", expansion: "git commit -m" },
				{ name: "gco", expansion: "git checkout" },
				{ name: "gcor", expansion: "git checkout --recurse-submodules" },
				{ name: "gcount", expansion: "git shortlog -sn" },
				{ name: "gcp", expansion: "git cherry-pick" },
				{ name: "gcpa", expansion: "git cherry-pick --abort" },
				{ name: "gcpc", expansion: "git cherry-pick --continue" },
				{ name: "gcs", expansion: "git commit -S" },
				{ name: "gd", expansion: "git diff" },
				{ name: "gdca", expansion: "git diff --cached" },
				{ name: "gdcw", expansion: "git diff --cached --word-diff" },
				{ name: "gdct", expansion: "git describe --tags $(git rev-list --tags --max-count=1)" },
				{ name: "gds", expansion: "git diff --staged" },
				{ name: "gdt", expansion: "git diff-tree --no-commit-id --name-only -r" },
				{ name: "gdnolock", expansion: 'git diff $@ ":(exclude)package-lock.json" ":(exclude)*.lock"' },
				{ name: "gdv", expansion: "git diff -w $@ | view -" },
				{ name: "gdw", expansion: "git diff --word-diff" },
				{ name: "gf", expansion: "git fetch" },
				{ name: "gfa", expansion: "git fetch --all --prune" },
				{ name: "gfg", expansion: "git ls-files | grep" },
				{ name: "gfo", expansion: "git fetch origin" },
				{ name: "gg", expansion: "git gui citool" },
				{ name: "gga", expansion: "git gui citool --amend" },
				{ name: "gpnp", expansion: "ggl && ggp" },
				{ name: "ghh", expansion: "git help" },
				{ name: "gignore", expansion: "git update-index --assume-unchanged" },
				{ name: "gignored", expansion: "git ls-files -v | grep '^[[:lower:]]'" },
				{ name: "gk", expansion: "gitk --all --branches" },
				{ name: "gke", expansion: "gitk --all $(git log -g --pretty=%h)" },
				{ name: "gl", expansion: "git pull" },
				{ name: "glg", expansion: "git log --stat" },
				{ name: "glgp", expansion: "git log --stat -p" },
				{ name: "glgg", expansion: "git log --graph" },
				{ name: "glgga", expansion: "git log --graph --decorate --all" },
				{ name: "glgm", expansion: "git log --graph --max-count=10" },
				{ name: "glo", expansion: "git log --oneline --decorate" },
				{ name: "glol", expansion: 'git log --graph --pretty=\'%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset\'' },
				{ name: "glols", expansion: 'git log --graph --pretty=\'%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset\' --stat' },
				{ name: "glod", expansion: 'git log --graph --pretty=\'%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset\'' },
				{ name: "glods", expansion: 'git log --graph --pretty=\'%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset\' --date=short' },
				{ name: "glola", expansion: 'git log --graph --pretty=\'%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset\' --all' },
				{ name: "glog", expansion: "git log --oneline --decorate --graph" },
				{ name: "gloga", expansion: "git log --oneline --decorate --graph --all" },
				{ name: "glp", expansion: "git log --pretty=<format>" },
				{ name: "gm", expansion: "git merge" },
				{ name: "gmtl", expansion: "git mergetool --no-prompt" },
				{ name: "gmtlvim", expansion: "git mergetool --no-prompt --tool=vimdiff" },
				{ name: "gma", expansion: "git merge --abort" },
				{ name: "gp", expansion: "git push" },
				{ name: "gpd", expansion: "git push --dry-run" },
				{ name: "gpf", expansion: "git push --force-with-lease" },
				{ name: "gpf!", expansion: "git push --force" },
				{ name: "gpoat", expansion: "git push origin --all && git push origin --tags" },
				{ name: "gpr", expansion: "git pull --rebase" },
				{ name: "gpu", expansion: "git push upstream" },
				{ name: "gpv", expansion: "git push -v" },
				{ name: "gr", expansion: "git remote" },
				{ name: "gra", expansion: "git remote add" },
				{ name: "grb", expansion: "git rebase" },
				{ name: "grba", expansion: "git rebase --abort" },
				{ name: "grbc", expansion: "git rebase --continue" },
				{ name: "grbi", expansion: "git rebase -i" },
				{ name: "grbo", expansion: "git rebase --onto" },
				{ name: "grbs", expansion: "git rebase --skip" },
				{ name: "grev", expansion: "git revert" },
				{ name: "grh", expansion: "git reset --" },
				{ name: "grhh", expansion: "git reset --hard" },
				{ name: "grm", expansion: "git rm" },
				{ name: "grmc", expansion: "git rm --cached" },
				{ name: "grmv", expansion: "git remote rename" },
				{ name: "grrm", expansion: "git remote remove" },
				{ name: "grs", expansion: "git restore" },
				{ name: "grset", expansion: "git remote set-url" },
				{ name: "grss", expansion: "git restore --source" },
				{ name: "grst", expansion: "git restore --staged" },
				{ name: "gru", expansion: "git reset --" },
				{ name: "grup", expansion: "git remote update" },
				{ name: "grv", expansion: "git remote -v" },
				{ name: "gsb", expansion: "git status -sb" },
				{ name: "gsd", expansion: "git svn dcommit" },
				{ name: "gsh", expansion: "git show" },
				{ name: "gsi", expansion: "git submodule init" },
				{ name: "gsps", expansion: "git show --pretty=short --show-signature" },
				{ name: "gsr", expansion: "git svn rebase" },
				{ name: "gss", expansion: "git status -s" },
				{ name: "gst", expansion: "git status" },
				{ name: "gsta", expansion: "git stash push" },
				{ name: "gstaa", expansion: "git stash apply" },
				{ name: "gstc", expansion: "git stash clear" },
				{ name: "gstd", expansion: "git stash drop" },
				{ name: "gstl", expansion: "git stash list" },
				{ name: "gstp", expansion: "git stash pop" },
				{ name: "gsts", expansion: "git stash show --text" },
				{ name: "gstu", expansion: "git stash --include-untracked" },
				{ name: "gstall", expansion: "git stash --all" },
				{ name: "gsu", expansion: "git submodule update" },
				{ name: "gsw", expansion: "git switch" },
				{ name: "gswc", expansion: "git switch -c" },
				{ name: "gswm", expansion: "git switch main" },
				{ name: "gswd", expansion: "git switch develop" },
				{ name: "gts", expansion: "git tag -s" },
				{ name: "gtv", expansion: "git tag | sort -V" },
				{ name: "gunignore", expansion: "git update-index --no-assume-unchanged" },
				{ name: "gunwip", expansion: 'git log -n 1 | grep -q -c "--wip--" && git reset HEAD~1' },
				{ name: "gup", expansion: "git pull --rebase" },
				{ name: "gupv", expansion: "git pull --rebase -v" },
				{ name: "gupa", expansion: "git pull --rebase --autostash" },
				{ name: "gupav", expansion: "git pull --rebase --autostash -v" },
				{ name: "gam", expansion: "git am" },
				{ name: "gamc", expansion: "git am --continue" },
				{ name: "gams", expansion: "git am --skip" },
				{ name: "gama", expansion: "git am --abort" },
				{ name: "gamscp", expansion: "git am --show-current-patch" },
			];
			for (const abbr of defaults) {
				abbreviations.set(abbr.name, abbr);
			}
			persistState();
			ctx.ui.notify(`Loaded ${defaults.length} default Git abbreviations. Use /abbr list to see them.`, "info");
		} else {
			ctx.ui.notify(`Loaded ${abbreviations.size} abbreviations from config. Use /abbr list to see them.`, "info");
		}
	});
}
