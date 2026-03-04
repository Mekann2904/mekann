/**
 * @abdd.meta
 * path: .pi/extensions/question.ts
 * role: ユーザーへの質問ツール拡張機能（長文・複数行・表対応版）
 * why: オリジナルのquestionツールが長い質問文を切り捨てる問題を解決するため
 * related: pi-coding-agent/examples/extensions/question.ts, pi-tui
 * public_api: default function (ExtensionAPI)
 * invariants: 質問文は幅に合わせて折り返し表示される
 * side_effects: なし（UI表示のみ）
 * failure_modes: UIがない場合はエラーを返す
 *
 * @abdd.explain
 * overview: ユーザーに質問を提示し、オプションから選択させるTUIツール
 * what_it_does: 質問文を幅に合わせて折り返し、複数行で表示する
 * why_it_exists: 長い質問文やマークダウン形式のテキストを適切に表示するため
 * scope:
 *   in: 質問文、オプションリスト（ラベル・説明付き）
 *   out: ユーザー選択結果
 */

/**
 * Question Tool - Extended version with multi-line support
 * - Wraps long questions and descriptions to fit terminal width
 * - Supports markdown-style text (tables, lists, headers)
 * - Full custom UI: options list + inline editor for "Type something..."
 * - Escape in editor returns to options, Escape in options cancels
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface OptionWithDesc {
	label: string;
	description?: string;
}

type DisplayOption = OptionWithDesc & { isOther?: boolean };

interface QuestionDetails {
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean;
}

// Options with labels and optional descriptions
const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

const QuestionParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	options: Type.Array(OptionSchema, { description: "Options for the user to choose from" }),
	multiple: Type.Optional(Type.Boolean({ description: "Allow multiple selections" })),
});

/**
 * テキストを指定幅で折り返す
 * @param text - 折り返すテキスト
 * @param width - 最大幅
 * @returns 折り返された行の配列
 */
function wrapText(text: string, width: number): string[] {
	if (width <= 0) return [text];

	const lines: string[] = [];
	const paragraphs = text.split("\n");

	for (const paragraph of paragraphs) {
		if (paragraph.trim() === "") {
			lines.push("");
			continue;
		}

		// ANSIエスケープシーケンスを考慮せず、文字数で処理
		// 実際の表示幅とは異なる場合があるが、安全な近似値を使用
		const words = paragraph.split(/(\s+)/);
		let currentLine = "";

		for (const word of words) {
			// 単語が幅を超える場合は強制分割
			if (word.length > width) {
				if (currentLine) {
					lines.push(currentLine);
					currentLine = "";
				}
				// 長い単語を幅で分割
				for (let i = 0; i < word.length; i += width) {
					lines.push(word.slice(i, i + width));
				}
				continue;
			}

			const testLine = currentLine + word;
			// 表示幅を計算（ANSIコードを除いた実際の文字数）
			const visibleLength = testLine.replace(/\x1b\[[0-9;]*m/g, "").length;

			if (visibleLength <= width) {
				currentLine = testLine;
			} else {
				if (currentLine) {
					lines.push(currentLine.trimEnd());
				}
				currentLine = word.trimStart();
			}
		}

		if (currentLine) {
			lines.push(currentLine.trimEnd());
		}
	}

	return lines.length > 0 ? lines : [""];
}

/**
 * テーブル行をパースする
 * @param line - テーブル行
 * @returns セルの配ライン
 */
function parseTableRow(line: string): string[] {
	// | で分割し、空の最初/最後要素を除去
	const cells = line.split("|").map((c) => c.trim());
	if (cells[0] === "") cells.shift();
	if (cells[cells.length - 1] === "") cells.pop();
	return cells;
}

/**
 * マークダウン風テキストを整形して表示用行に変換
 * @param text - 整形するテキスト
 * @param width - 最大幅
 * @param theme - テーマ関数
 * @returns 表示用行の配ライン
 */
function formatMarkdownText(text: string, width: number, theme: ExtensionAPI["ui"]["theme"]): string[] {
	const lines: string[] = [];
	const inputLines = text.split("\n");
	let inTable = false;
	let tableColumns: number[] = [];

	for (let i = 0; i < inputLines.length; i++) {
		const line = inputLines[i];

		// テーブル検出
		if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
			if (!inTable) {
				inTable = true;
				const cells = parseTableRow(line);
				// カラム幅を計算
				tableColumns = cells.map((c) => Math.max(c.length, 3));
			}

			// セパレーター行かチェック
			if (line.match(/^\|[\s\-:|]+\|$/)) {
				continue; // セパレーター行はスキップ
			}

			const cells = parseTableRow(line);
			const cellTexts = cells.map((c, idx) => {
				const colWidth = tableColumns[idx] || 10;
				return c.padEnd(colWidth).slice(0, colWidth);
			});
			lines.push("  " + cellTexts.join(" | "));
			continue;
		}

		// テーブル終了
		if (inTable && (!line.trim().startsWith("|") || !line.trim().endsWith("|"))) {
			inTable = false;
			lines.push("");
		}

		// 見出し
		if (line.startsWith("## ")) {
			lines.push("");
			lines.push(theme.fg("accent", theme.bold(line.slice(3))));
			lines.push(theme.fg("dim", "─".repeat(Math.min(line.length - 3, width))));
			continue;
		}
		if (line.startsWith("# ")) {
			lines.push("");
			lines.push(theme.fg("accent", theme.bold(line.slice(2))));
			lines.push(theme.fg("accent", "═".repeat(Math.min(line.length - 2, width))));
			continue;
		}

		// 箇条書き
		if (line.match(/^[-*]\s/)) {
			const wrappedLines = wrapText(line, width - 2);
			for (let j = 0; j < wrappedLines.length; j++) {
				if (j === 0) {
					lines.push("  " + theme.fg("accent", "•") + " " + wrappedLines[j].slice(2));
				} else {
					lines.push("    " + wrappedLines[j]);
				}
			}
			continue;
		}

		// 空行
		if (line.trim() === "") {
			lines.push("");
			continue;
		}

		// 通常テキスト（折り返し）
		const wrappedLines = wrapText(line, width);
		lines.push(...wrappedLines);
	}

	// テーブルが閉じていない場合は空行を追加
	if (inTable) {
		lines.push("");
	}

	return lines;
}

export default function question(pi: ExtensionAPI) {
	pi.registerTool({
		name: "question",
		label: "Question",
		description: "Ask the user a question and let them pick from options. Use when you need user input to proceed.",
		parameters: QuestionParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (running in non-interactive mode)" }],
					details: {
						question: params.question,
						options: params.options.map((o) => o.label),
						answer: null,
					} as QuestionDetails,
				};
			}

			if (params.options.length === 0) {
				return {
					content: [{ type: "text", text: "Error: No options provided" }],
					details: { question: params.question, options: [], answer: null } as QuestionDetails,
				};
			}

			const allOptions: DisplayOption[] = [...params.options, { label: "Type something.", isOther: true }];

			const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean; index?: number } | null>(
				(tui, theme, _kb, done) => {
					let optionIndex = 0;
					let editMode = false;
					let cachedLines: string[] | undefined;

					const editorTheme: EditorTheme = {
						borderColor: (s) => theme.fg("accent", s),
						selectList: {
							selectedPrefix: (t) => theme.fg("accent", t),
							selectedText: (t) => theme.fg("accent", t),
							description: (t) => theme.fg("muted", t),
							scrollInfo: (t) => theme.fg("dim", t),
							noMatch: (t) => theme.fg("warning", t),
						},
					};
					const editor = new Editor(tui, editorTheme);

					editor.onSubmit = (value) => {
						const trimmed = value.trim();
						if (trimmed) {
							done({ answer: trimmed, wasCustom: true });
						} else {
							editMode = false;
							editor.setText("");
							refresh();
						}
					};

					function refresh() {
						cachedLines = undefined;
						tui.requestRender();
					}

					function handleInput(data: string) {
						if (editMode) {
							if (matchesKey(data, Key.escape)) {
								editMode = false;
								editor.setText("");
								refresh();
								return;
							}
							editor.handleInput(data);
							refresh();
							return;
						}

						if (matchesKey(data, Key.up)) {
							optionIndex = Math.max(0, optionIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
							refresh();
							return;
						}

						if (matchesKey(data, Key.enter)) {
							const selected = allOptions[optionIndex];
							if (selected.isOther) {
								editMode = true;
								refresh();
							} else {
								done({ answer: selected.label, wasCustom: false, index: optionIndex + 1 });
							}
							return;
						}

						if (matchesKey(data, Key.escape)) {
							done(null);
						}
					}

					function render(width: number): string[] {
						if (cachedLines) return cachedLines;

						const lines: string[] = [];
						const add = (s: string) => lines.push(truncateToWidth(s, width));

						add(theme.fg("accent", "─".repeat(width)));

						// 質問文を折り返して表示（マークダウン対応）
						const questionLines = formatMarkdownText(params.question, width - 2, theme);
						for (const line of questionLines) {
							add(" " + line);
						}

						lines.push("");
						add(theme.fg("dim", " Options:"));
						lines.push("");

						for (let i = 0; i < allOptions.length; i++) {
							const opt = allOptions[i];
							const selected = i === optionIndex;
							const isOther = opt.isOther === true;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";

							if (isOther && editMode) {
								add(prefix + theme.fg("accent", `${i + 1}. ${opt.label} ✎`));
							} else if (selected) {
								add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
							} else {
								add(`  ${theme.fg("text", `${i + 1}. ${opt.label}`)}`);
							}

							// 説明文を折り返して表示
							if (opt.description) {
								const descLines = wrapText(opt.description, width - 6);
								for (const descLine of descLines) {
									add(`     ${theme.fg("muted", descLine)}`);
								}
							}
						}

						if (editMode) {
							lines.push("");
							add(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) {
								add(` ${line}`);
							}
						}

						lines.push("");
						if (editMode) {
							add(theme.fg("dim", " Enter to submit • Esc to go back"));
						} else {
							add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc to cancel"));
						}
						add(theme.fg("accent", "─".repeat(width)));

						cachedLines = lines;
						return lines;
					}

					return {
						render,
						invalidate: () => {
							cachedLines = undefined;
						},
						handleInput,
					};
				},
			);

			// Build simple options list for details
			const simpleOptions = params.options.map((o) => o.label);

			if (!result) {
				return {
					content: [{ type: "text", text: "User cancelled the selection" }],
					details: { question: params.question, options: simpleOptions, answer: null } as QuestionDetails,
				};
			}

			if (result.wasCustom) {
				return {
					content: [{ type: "text", text: `User wrote: ${result.answer}` }],
					details: {
						question: params.question,
						options: simpleOptions,
						answer: result.answer,
						wasCustom: true,
					} as QuestionDetails,
				};
			}
			return {
				content: [{ type: "text", text: `User selected: ${result.index}. ${result.answer}` }],
				details: {
					question: params.question,
					options: simpleOptions,
					answer: result.answer,
					wasCustom: false,
				} as QuestionDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("question ")) + theme.fg("muted", args.question);
			const opts = Array.isArray(args.options) ? args.options : [];
			if (opts.length) {
				const labels = opts.map((o: OptionWithDesc) => o.label);
				const numbered = [...labels, "Type something."].map((o, i) => `${i + 1}. ${o}`);
				text += `\n${theme.fg("dim", `  Options: ${numbered.join(", ")}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuestionDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.answer === null) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			if (details.wasCustom) {
				return new Text(
					theme.fg("success", "✓ ") + theme.fg("muted", "(wrote) ") + theme.fg("accent", details.answer),
					0,
					0,
				);
			}
			const idx = details.options.indexOf(details.answer) + 1;
			const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer;
			return new Text(theme.fg("success", "✓ ") + theme.fg("accent", display), 0, 0);
		},
	});
}
