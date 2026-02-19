/**
 * @abdd.meta
 * path: .pi/extensions/question.ts
 * role: ユーザーへの対話的質問UI拡張
 * why: PIエージェントが実行中にユーザーへ入力を要求するためのopencode互換インターフェースを提供するため
 * related: @mariozechner/pi-tui, @mariozechner/pi-coding-agent, @mariozechner/pi-ai
 * public_api: askSingleQuestion, types(QuestionInfo, QuestionOption, Answer)
 * invariants: rendererのstateはimmutablyに更新される, カーソル位置は常に文字列範囲内である
 * side_effects: 標準出力へのUI描画, ユーザー入力待機による処理ブロック
 * failure_modes: 描画幅オーバーフロー, 不正なキー入力による状態破損
 * @abdd.explain
 * overview: エージェントがユーザーへ質問し、選択または自由記述による回答を受け付けるUIコンポーネント実装
 * what_it_does:
 *   - 質問と選択肢リストをTUI上に描画する
 *   - 単一/複数選択およびカスタム自由入力モードを提供する
 *   - キーボード操作によるカーソル移動と決定を処理する
 * why_it_exists:
 *   - opencode仕様に準拠したシンプルな質問インターフェースが必要なため
 *   - ユーザー介入が必要なタスクにおいて決定を収集するため
 * scope:
 *   in: QuestionInfo(質問内容), キーボード入力イベント
 *   out: Answer(ユーザー回答配列), null(キャンセル時)
 */

/**
 * Question Tool Extension for PI Coding Agent
 *
 * PIエージェントがユーザーに質問するためのインタラクティブUI
 * opencode互換のシンプルで使いやすいインターフェース
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, wrapTextWithAnsi, CURSOR_MARKER } from "@mariozechner/pi-tui";
import { matchesKey, Key } from "@mariozechner/pi-tui";

// ============================================
// 型定義 (opencode互換)
// ============================================

interface QuestionOption {
	label: string;
	description?: string;
}

interface QuestionInfo {
	question: string;
	header: string;
	options: QuestionOption[];
	multiple?: boolean;
	custom?: boolean;
}

type Answer = string[];

// ============================================
// UIコンポーネント
// ============================================

function createRenderer<TState>(
	initialState: TState,
	renderFn: (state: TState, width: number, theme: any) => string[]
) {
	let state = initialState;
	let cached: string[] | undefined;

	return {
		getState: () => state,
		setState: (update: Partial<TState>) => {
			state = { ...state, ...update };
			cached = undefined;
		},
		render: (width: number, theme: any) => {
			if (!cached) cached = renderFn(state, width, theme);
			return cached;
		},
		invalidate: () => { cached = undefined; }
	};
}

// ============================================
// 単一質問UI
// ============================================

async function askSingleQuestion(
	question: QuestionInfo,
	ctx: any
): Promise<Answer | null> {
	const options = question.options || [];
	const allowCustom = question.custom !== false;
	const allowMultiple = question.multiple === true;

	// カスタム回答が許可されている場合は「その他」オプションを追加
	const displayOptions = allowCustom
		? [...options, { label: "その他", description: "自由に入力" }]
		: options;

	const renderer = createRenderer({
		cursor: 0,
		selected: new Set<number>(),
		customMode: false,
		customInput: "",
		customCursor: 0
	}, (state, width, theme) => {
		const lines: string[] = [];
		const add = (s: string) => lines.push(truncateToWidth(s, width));
		// カーソル行用（CURSOR_MARKERを含むのでtruncateToWidthしない）
		const addCursorLine = (s: string) => lines.push(s);

		// ヘッダー
		add(theme.fg("accent", "─".repeat(width)));
		add(theme.fg("text", ` ${question.question}`));
		if (question.header !== question.question) {
			add(theme.fg("dim", ` ${question.header}`));
		}
		lines.push("");

		if (state.customMode) {
			// カスタム入力モード
			add(theme.fg("accent", " ✎ 自由記述:"));
			// 複数行対応：入力を行に分割して表示（折り返し対応）
			const inputLines = state.customInput.split("\n");
			// 表示幅（先頭のスペース分を引く）
			const contentWidth = width - 2;
			
			// 各論理行を折り返して表示用の行に変換
			// wrappedLines: 折り返し後の各行の情報
			// { text: string, logicalLine: number, startCol: number, endCol: number }
			const wrappedLines: { text: string; logicalLine: number; startCol: number; endCol: number }[] = [];
			let logicalCharOffset = 0; // 論理テキスト全体での文字オフセット
			
			for (let logicalLineIdx = 0; logicalLineIdx < inputLines.length; logicalLineIdx++) {
				const logicalLine = inputLines[logicalLineIdx];
				if (logicalLine.length === 0) {
					// 空行
					wrappedLines.push({
						text: "",
						logicalLine: logicalLineIdx,
						startCol: 0,
						endCol: 0
					});
				} else {
					// 折り返し処理
					const wrapped = wrapTextWithAnsi(logicalLine, contentWidth);
					let colOffset = 0;
					for (const wrappedLine of wrapped) {
						wrappedLines.push({
							text: wrappedLine,
							logicalLine: logicalLineIdx,
							startCol: colOffset,
							endCol: colOffset + wrappedLine.length
						});
						colOffset += wrappedLine.length;
					}
				}
				logicalCharOffset += logicalLine.length + 1; // +1 for \n
			}
			
			// カーソル位置から、どの折り返し行にいるかを特定
			// まずカーソルがどの論理行のどの位置にあるかを計算
			let cursorLogicalLine = 0;
			let cursorColInLogicalLine = 0;
			let charCount = 0;
			for (let i = 0; i < inputLines.length; i++) {
				if (state.customCursor <= charCount + inputLines[i].length) {
					cursorLogicalLine = i;
					cursorColInLogicalLine = state.customCursor - charCount;
					break;
				}
				charCount += inputLines[i].length + 1;
			}
			
			// 該当する折り返し行を探す
			let cursorWrappedLineIdx = 0;
			let cursorColInWrappedLine = cursorColInLogicalLine;
			for (let i = 0; i < wrappedLines.length; i++) {
				const wl = wrappedLines[i];
				if (wl.logicalLine === cursorLogicalLine) {
					if (cursorColInLogicalLine >= wl.startCol && cursorColInLogicalLine <= wl.endCol) {
						cursorWrappedLineIdx = i;
						cursorColInWrappedLine = cursorColInLogicalLine - wl.startCol;
						break;
					}
				}
			}
			
			// 各折り返し行を表示
			for (let i = 0; i < wrappedLines.length; i++) {
				const wl = wrappedLines[i];
				if (i === cursorWrappedLineIdx) {
					// カーソルがある行
					const beforeCursor = wl.text.slice(0, cursorColInWrappedLine);
					const cursorChar = cursorColInWrappedLine < wl.text.length ? wl.text[cursorColInWrappedLine] : " ";
					const afterCursor = wl.text.slice(cursorColInWrappedLine + 1);
					const cursorDisplay = CURSOR_MARKER + "\x1b[7m" + cursorChar + "\x1b[0m";
					addCursorLine(" " + beforeCursor + cursorDisplay + afterCursor);
				} else {
					add(" " + wl.text);
				}
			}
			
			lines.push("");
			add(theme.fg("dim", " Enter確定 • Shift+Enter改行 • Esc戻る • ←→移動 • ↑↓行移動 • Home/End先頭/末尾 • Del削除"));
		} else {
			// 選択肢モード
			for (let i = 0; i < displayOptions.length; i++) {
				const opt = displayOptions[i];
				const isCursor = i === state.cursor;
				const isSelected = state.selected.has(i);
				const isLast = i === displayOptions.length - 1 && allowCustom;

				let prefix: string;
				if (allowMultiple) {
					const checkbox = isSelected ? "[✓]" : "[ ]";
					prefix = (isCursor ? theme.fg("accent", "> ") : "  ") + theme.fg(isSelected ? "accent" : "dim", checkbox) + " ";
				} else {
					const bullet = isCursor ? ">" : " ";
					prefix = theme.fg(isCursor ? "accent" : "dim", ` ${bullet} `);
				}

				const labelStyle = isCursor || (isSelected && allowMultiple) ? "accent" : isLast ? "dim" : "text";
				add(prefix + theme.fg(labelStyle, opt.label));

				if (opt.description) {
					add(`    ${theme.fg("dim", opt.description)}`);
				}
			}

			lines.push("");
			const selectedCount = state.selected.size;
			if (allowMultiple) {
				const canSubmit = selectedCount > 0;
				add(theme.fg("dim", ` ${canSubmit ? 'Enterで確定' : '1つ以上選択してください'} • Spaceで選択 • ↑↓で移動 • Escでキャンセル`));
			} else {
				add(theme.fg("dim", " ↑↓で移動 • Enterで選択 • Escでキャンセル"));
			}
		}

		add(theme.fg("accent", "─".repeat(width)));
		return lines;
	});

	return ctx.ui.custom<Answer | null>((tui, theme, _kb, done) => {
		// ブラケットペーストモードのバッファ
		let pasteBuffer = "";
		let isInPaste = false;

		return {
		render: (w) => renderer.render(w, theme),
		invalidate: () => renderer.invalidate(),
		handleInput: (data) => {
			const state = renderer.getState();

			// ブラケットペーストモードの処理
			if (data.includes("\x1b[200~")) {
				isInPaste = true;
				pasteBuffer = "";
				data = data.replace("\x1b[200~", "");
			}
			if (isInPaste) {
				pasteBuffer += data;
				const endIndex = pasteBuffer.indexOf("\x1b[201~");
				if (endIndex !== -1) {
					const pasteContent = pasteBuffer.substring(0, endIndex);
					if (pasteContent.length > 0 && state.customMode) {
						// ペースト内容を挿入
						const cleanText = pasteContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
						const before = state.customInput.slice(0, state.customCursor);
						const after = state.customInput.slice(state.customCursor);
						renderer.setState({ 
							customInput: before + cleanText + after,
							customCursor: state.customCursor + cleanText.length
						});
						tui.requestRender();
					}
					isInPaste = false;
					pasteBuffer = "";
					return;
				}
				return;
			}

			if (state.customMode) {
				// カスタム入力モード
				// Shift+Enter → 改行、Enter → 確定（piの標準動作と同じ）
				if (matchesKey(data, Key.shift("enter"))) {
					// Shift+Enter で改行を入力（複数行対応）
					const before = state.customInput.slice(0, state.customCursor);
					const after = state.customInput.slice(state.customCursor);
					renderer.setState({ 
						customInput: before + "\n" + after,
						customCursor: state.customCursor + 1
					});
					tui.requestRender();
				} else if (matchesKey(data, Key.enter)) {
					// Enterで確定
					if (state.customInput.trim()) {
						done([state.customInput.trim()]);
					}
					// 空の場合は何もしない（確定させない）
				} else if (matchesKey(data, Key.escape)) {
					renderer.setState({ customMode: false });
					tui.requestRender();
				} else if (matchesKey(data, Key.backspace)) {
					// カーソル位置で削除
					if (state.customCursor > 0) {
						const before = state.customInput.slice(0, state.customCursor - 1);
						const after = state.customInput.slice(state.customCursor);
						renderer.setState({ 
							customInput: before + after,
							customCursor: state.customCursor - 1
						});
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.left)) {
					// カーソルを左に移動
					if (state.customCursor > 0) {
						renderer.setState({ customCursor: state.customCursor - 1 });
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.right)) {
					// カーソルを右に移動
					if (state.customCursor < state.customInput.length) {
						renderer.setState({ customCursor: state.customCursor + 1 });
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.up)) {
					// 上の行に移動（複数行対応）
					const lines = state.customInput.split("\n");
					let charCount = 0;
					let currentLineIndex = 0;
					let currentCol = 0;
					
					// 現在のカーソル位置の行と列を特定
					for (let i = 0; i < lines.length; i++) {
						if (state.customCursor <= charCount + lines[i].length) {
							currentLineIndex = i;
							currentCol = state.customCursor - charCount;
							break;
						}
						charCount += lines[i].length + 1;
					}
					
					// 上の行に移動
					if (currentLineIndex > 0) {
						const prevLineLength = lines[currentLineIndex - 1].length;
						const newCol = Math.min(currentCol, prevLineLength);
						const newCursor = charCount - lines[currentLineIndex - 1].length - 1 + newCol;
						renderer.setState({ customCursor: Math.max(0, newCursor) });
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.down)) {
					// 下の行に移動（複数行対応）
					const lines = state.customInput.split("\n");
					let charCount = 0;
					let currentLineIndex = 0;
					let currentCol = 0;
					
					// 現在のカーソル位置の行と列を特定
					for (let i = 0; i < lines.length; i++) {
						if (state.customCursor <= charCount + lines[i].length) {
							currentLineIndex = i;
							currentCol = state.customCursor - charCount;
							break;
						}
						charCount += lines[i].length + 1;
					}
					
					// 下の行に移動
					if (currentLineIndex < lines.length - 1) {
						const nextLineLength = lines[currentLineIndex + 1].length;
						const newCol = Math.min(currentCol, nextLineLength);
						const newCursor = charCount + lines[currentLineIndex].length + 1 + newCol;
						renderer.setState({ customCursor: Math.min(state.customInput.length, newCursor) });
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.home)) {
					// カーソルを先頭に移動
					renderer.setState({ customCursor: 0 });
					tui.requestRender();
				} else if (matchesKey(data, Key.end)) {
					// カーソルを末尾に移動
					renderer.setState({ customCursor: state.customInput.length });
					tui.requestRender();
				} else if (matchesKey(data, Key.delete)) {
					// Deleteキー: カーソル位置の次の文字を削除
					if (state.customCursor < state.customInput.length) {
						const before = state.customInput.slice(0, state.customCursor);
						const after = state.customInput.slice(state.customCursor + 1);
						renderer.setState({ 
							customInput: before + after
						});
						tui.requestRender();
					}
				} else {
					// 通常の文字入力（日本語などのマルチバイト対応）
					// 制御文字でない場合は全て入力として受け付ける
					const charCode = data.charCodeAt(0);
					const isPrintable = charCode >= 32 || data.length > 1;
					
					if (isPrintable && !data.startsWith('\x1b')) {
						// カーソル位置に文字を挿入
						const before = state.customInput.slice(0, state.customCursor);
						const after = state.customInput.slice(state.customCursor);
						renderer.setState({ 
							customInput: before + data + after,
							customCursor: state.customCursor + data.length
						});
						tui.requestRender();
					}
				}
			} else {
				// 選択肢モード
				if (matchesKey(data, Key.up)) {
					renderer.setState({ cursor: Math.max(0, state.cursor - 1) });
					tui.requestRender();
				} else if (matchesKey(data, Key.down)) {
					renderer.setState({ cursor: Math.min(displayOptions.length - 1, state.cursor + 1) });
					tui.requestRender();
				} else if (data === " " || data === "Space") {
					if (allowMultiple) {
						const newSelected = new Set(state.selected);
						if (newSelected.has(state.cursor)) {
							newSelected.delete(state.cursor);
						} else {
							newSelected.add(state.cursor);
						}
						renderer.setState({ selected: newSelected });
						tui.requestRender();
					}
				} else if (matchesKey(data, Key.enter)) {
					const isOtherOption = state.cursor === displayOptions.length - 1 && allowCustom;
					
					if (isOtherOption) {
						renderer.setState({ 
							customMode: true,
							customInput: "",
							customCursor: 0
						});
						tui.requestRender();
					} else if (allowMultiple) {
						if (state.selected.size > 0) {
							const answers: string[] = [];
							state.selected.forEach(idx => {
								answers.push(displayOptions[idx].label);
							});
							done(answers);
						}
						// 選択が0個の場合は何もしない（確定させない）
					} else {
						done([displayOptions[state.cursor].label]);
					}
				} else if (matchesKey(data, Key.escape)) {
					done(null);
				}
			}
		}
	}
	});
}

// ============================================
// 確認画面（シンプル版 - 回答内容は表示しない）
// ============================================

type ConfirmAction = { type: "confirm" } | { type: "edit"; questionIndex: number } | { type: "cancel" };

async function showConfirmationScreen(
	questions: QuestionInfo[],
	answers: Answer[],
	ctx: any
): Promise<ConfirmAction> {
	const renderer = createRenderer({ cursor: 0 }, (state, width, theme) => {
		const lines: string[] = [];
		const add = (s: string) => lines.push(truncateToWidth(s, width));

		// シンプルなヘッダー
		add(theme.fg("accent", "─".repeat(width)));
		add(theme.fg("text", " 回答を確定しますか？"));
		add(theme.fg("dim", " 操作を選択してください"));
		lines.push("");

		// 選択肢：確定とキャンセルを隣に表示
		const confirmSelected = state.cursor === 0;
		const cancelSelected = state.cursor === 1;
		
		add(`  ${confirmSelected ? theme.fg("accent", "> ") : "  "}${theme.fg(confirmSelected ? "accent" : "text", "[Y] 確定して送信")}`);
		add(`  ${cancelSelected ? theme.fg("accent", "> ") : "  "}${theme.fg(cancelSelected ? "accent" : "text", "[N] キャンセル")}`);
		
		// 修正オプション（ある場合のみ）
		if (questions.length > 0) {
			lines.push("");
			add(theme.fg("dim", " 修正する場合:"));
			for (let i = 0; i < questions.length && i < 9; i++) {
				const isEditCursor = state.cursor === i + 2;
				const q = questions[i];
				add(`  ${isEditCursor ? theme.fg("accent", "> ") : "  "}${theme.fg(isEditCursor ? "accent" : "text", `[${i + 1}] ${q.header}`)}`);
			}
		}

		lines.push("");
		add(theme.fg("dim", " ↑↓で移動 • Enterで選択"));
		add(theme.fg("accent", "─".repeat(width)));

		return lines;
	});

	const totalOptions = 2 + Math.min(questions.length, 9);

	return ctx.ui.custom<ConfirmAction>((tui, theme, _kb, done) => ({
		render: (w) => renderer.render(w, theme),
		invalidate: () => renderer.invalidate(),
		handleInput: (data) => {
			const state = renderer.getState();

			if (matchesKey(data, Key.up)) {
				renderer.setState({ cursor: Math.max(0, state.cursor - 1) });
				tui.requestRender();
			} else if (matchesKey(data, Key.down)) {
				renderer.setState({ cursor: Math.min(totalOptions - 1, state.cursor + 1) });
				tui.requestRender();
			} else if (matchesKey(data, Key.enter)) {
				if (state.cursor === 0) {
					done({ type: "confirm" });
				} else if (state.cursor === 1) {
					done({ type: "cancel" });
				} else {
					done({ type: "edit", questionIndex: state.cursor - 2 });
				}
			} else if (data === "Y" || data === "y") {
				done({ type: "confirm" });
			} else if (data === "N" || data === "n") {
				done({ type: "cancel" });
			} else if (/^[1-9]$/.test(data)) {
				const index = parseInt(data, 10) - 1;
				if (index >= 0 && index < questions.length) {
					done({ type: "edit", questionIndex: index });
				}
			}
		}
	}));
}

// ============================================
// メイン拡張機能
// ============================================

export default function (pi: ExtensionAPI) {
	const OptionType = Type.Object({
		label: Type.String({ description: "表示テキスト（1-5文字、簡潔に）" }),
		description: Type.Optional(Type.String({ description: "選択肢の説明" }))
	});

	const QuestionType = Type.Object({
		question: Type.String({ description: "質問文（完全な文章）" }),
		header: Type.String({ description: "短いラベル（最大30文字）" }),
		options: Type.Array(OptionType, { description: "選択肢一覧" }),
		multiple: Type.Optional(Type.Boolean({ description: "複数選択を許可" })),
		custom: Type.Optional(Type.Boolean({ description: "自由記述を許可（デフォルト: true）" }))
	});

	pi.registerTool({
		name: "question",
		label: "質問",
		description: "**必須使用**: ユーザーに選択肢から選ばせたり、確認を求める場合は必ずこのツールを使ってください。単一選択、複数選択、自由記述に対応。",
		parameters: Type.Object({
			questions: Type.Array(QuestionType, { description: "質問一覧" })
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text" as const, text: "UIが利用できません（非対話モードで実行中）" }],
					details: { answers: [] }
				};
			}

			const questions: QuestionInfo[] = params.questions || [];
			if (questions.length === 0) {
				return {
					content: [{ type: "text" as const, text: "質問が提供されていません" }],
					details: { answers: [] }
				};
			}

			// 回答を初期化
			const answers: (Answer | null)[] = new Array(questions.length).fill(null);
			let currentIndex = 0;

			// 全質問に回答
			while (currentIndex < questions.length) {
				const answer = await askSingleQuestion(questions[currentIndex], ctx);
				
				if (answer === null) {
					// ユーザーがキャンセル
					return {
						content: [{ type: "text" as const, text: "キャンセルしました" }],
						details: { answers: [] }
					};
				}

				// 空配列チェック - 空の場合はnullとして扱い再入力
				if (answer.length === 0) {
					continue; // 同じ質問を再度表示
				}
				
				answers[currentIndex] = answer;
				currentIndex++;
			}

			// 確認画面を表示
			while (true) {
				const action = await showConfirmationScreen(questions, answers as Answer[], ctx);

				if (action.type === "confirm") {
					// opencode形式で出力
					const formatted = questions.map((q, i) => `"${q.question}"="${answers[i]!.join(", ")}"`).join(", ");

					return {
						content: [{ type: "text" as const, text: `ユーザーの回答: ${formatted}` }],
						details: { answers: answers as Answer[] }
					};
				} else if (action.type === "cancel") {
					return {
						content: [{ type: "text" as const, text: "キャンセルしました" }],
						details: { answers: [] }
					};
				} else if (action.type === "edit") {
					// 特定の質問を再表示
					currentIndex = action.questionIndex;
					const newAnswer = await askSingleQuestion(questions[currentIndex], ctx);
					
					if (newAnswer === null) {
						return {
							content: [{ type: "text" as const, text: "キャンセルしました" }],
							details: { answers: [] }
						};
					}

					// 空配列チェック
					if (newAnswer.length === 0) {
						continue; // 同じ質問を再度表示
					}
					
					answers[currentIndex] = newAnswer;
					// 確認画面を再度表示
				}
			}
		},

		renderCall(args, theme) {
			const count = Array.isArray(args.questions) ? args.questions.length : 0;
			if (count === 0) {
				return new Text(theme.fg("warning", "質問なし"), 0, 0);
			}
			const first = args.questions[0];
			const preview = count === 1 ? first.question : `${count}件の質問`;
			const text = theme.bold("質問 ") + theme.fg("muted", preview);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			if (!result.details || !result.details.answers || result.details.answers.length === 0) {
				return new Text(theme.fg("warning", "キャンセル"), 0, 0);
			}
			const answers = result.details.answers as string[][];
			// 複数回答の場合は各回答を表示
			if (answers.length === 1) {
				// 単一質問の場合は回答内容をそのまま表示
				const answerText = answers[0].join(", ");
				return new Text(theme.fg("success", "✓ ") + theme.fg("accent", answerText), 0, 0);
			} else {
				// 複数質問の場合は各回答を改行で表示
				const lines = answers.map((ans, i) => {
					const answerText = ans.join(", ");
					return theme.fg("dim", `${i + 1}. `) + theme.fg("accent", answerText);
				});
				return new Text(theme.fg("success", "✓ ") + "回答:\n" + lines.join("\n"), 0, 0);
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("質問機能が読み込まれました • 使用例: \"質問して選択させて\"", "info");
	});

	// システムプロンプトにquestionツールの使用を義務付ける指示を追加
	pi.on("before_agent_start", async (event, ctx) => {
		const systemPrompt = event.systemPrompt;
		const questionPrompt = `
---
## CRITICAL: Question Tool Usage (MANDATORY)

You **MUST** use the \`question\` tool for any user selection. NEVER present options as plain text.

### WHEN TO USE \`question\` TOOL (ALWAYS):
- User asks "which one?", "where to start?", "what do you prefer?"
- You have a list of items for user to choose from
- Confirmation before action (yes/no)
- Priority/ranking decisions
- ANY scenario where user needs to make a choice

### STRICT RULES:
1. **NO plain text options**: Never show bulleted/numbered lists as choices
2. **NO "(Y/n)" prompts**: Use question tool for confirmation
3. **ALWAYS interactive**: User choices MUST go through question tool
4. **Immediate action**: As soon as you identify a selection scenario, call question tool

### WRONG EXAMPLES:
- "優先度別の実装順序... 低：設定管理... 教えてください"
  -> This shows options in plain text - WRONG!

- "どれから始めますか？"
  -> Use question tool instead!

- "実行しますか？(Y/n)"
  -> Use question tool!

### RIGHT EXAMPLE:
When user asks "which one to start?", immediately call:
\`question\` with questions array containing each option as a select choice

### DETECTION PATTERNS - Call question tool immediately if:
- User's message ends with "...教えてください" or "...教えて"
- User asks "どれから" (which one), "どれが" (which)
- User says "選んで" (choose), "選択して" (select)
- You are about to show a numbered/bulleted list
- User provides a table/list and asks for a decision

The \`question\` tool is available - USE IT for ALL user selections.
---`;

		return {
			systemPrompt: systemPrompt + questionPrompt
		};
	});
}
