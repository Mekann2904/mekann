/**
 * @abdd.meta
 * path: .pi/extensions/question.ts
 * role: ユーザーへの質問UIおよび入力制御ロジックの提供
 * why: PIエージェントが対話的にユーザーから情報を収集するための共通インターフェースを確立するため
 * related: @mariozechner/pi-tui, @mariozechner/pi-coding-agent, docs/02-user-guide/02-question.md
 * public_api: askSingleQuestion, createRenderer, types (QuestionInfo, Answer, QuestionCustomController), QuestionErrorCode, createErrorResponse
 * invariants: 選択中のオプション数、カスタム入力の文字列、カーソル位置、ペーストバッファ状態
 * side_effects: なし (純粋なUI描画とイベントハンドリング)
 * failure_modes: 入力値の未解決、キャンセル操作、想定外のキー入力、パラメータ検証エラー
 * @abdd.explain
 * overview: opencode互換のUIライブラリを使用した、対話的質問フォームの実装
 * what_it_does:
 *   - 質問と選択肢を描画し、キーボード操作で選択を受け付ける
 *   - 複数選択およびカスタムテキスト入力モードをサポートする
 *   - テキストの折り返しやカーソル位置計算を含むレンダリングを行う
 *   - マルチバイト文字（日本語など）の表示幅計算に対応
 *   - 構造化エラーレスポンスでLLMがエラーから回復しやすくする
 * why_it_exists:
 *   - エージェントの実行フロー内で、柔軟なユーザー入力を必要とするケースに対応するため
 *   - LLMにとって使いやすいパラメータ設計とエラーハンドリングを提供するため
 * scope:
 *   in: 質問定義 (QuestionInfo), ユーザー入力 (キーイベント)
 *   out: ユーザーの回答 (Answer) または null (キャンセル時) または構造化エラー
 */

/**
 * Question Tool Extension for PI Coding Agent
 *
 * PIエージェントがユーザーに質問するためのインタラクティブUI
 * opencode互換のシンプルで使いやすいインターフェース
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, wrapTextWithAnsi, CURSOR_MARKER } from "@mariozechner/pi-tui";
import { matchesKey, Key } from "@mariozechner/pi-tui";

// ============================================
// 型定義 (opencode互換)
// ============================================

/**
 * デフォルト値の定数
 * LLM向けの明示的なデフォルト値定義
 */
const QUESTION_DEFAULTS = {
	multiple: false,
	custom: true
} as const;

/**
 * エラーコード定義
 * 構造化エラーレスポンス用
 */
enum QuestionErrorCode {
	NO_UI = "NO_UI",
	NO_OPTIONS = "NO_OPTIONS",
	NO_QUESTIONS = "NO_QUESTIONS",
	CANCELLED = "CANCELLED",
	VALIDATION_ERROR = "VALIDATION_ERROR"
}

/**
 * 構造化エラー情報
 */
interface QuestionError {
	code: QuestionErrorCode;
	message: string;
	recovery: string[];
	details?: Record<string, unknown>;
}

/**
 * 構造化エラーレスポンスを作成
 * @param error - エラー情報
 * @returns ツール実行結果
 */
function createErrorResponse(error: QuestionError): { content: { type: "text"; text: string }[]; details: { answers: never[]; error: QuestionError } } {
	return {
		content: [{
			type: "text",
			text: `エラー [${error.code}]: ${error.message}\n\n回復方法:\n${error.recovery.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
		}],
		details: {
			answers: [],
			error
		}
	};
}

/**
 * 質問の選択肢
 */
export interface QuestionOption {
	label: string;
	description?: string;
}

/**
 * 質問情報
 */
export interface QuestionInfo {
	/** 質問テキスト（完全な文章） */
	question: string;
	/** 短いラベル（推奨: 最大30文字） */
	header: string;
	/** 質問と一緒に表示するASCIIアート（任意） */
	asciiArt?: string;
	/** 選択肢一覧 */
	options: QuestionOption[];
	/** 複数選択を許可（デフォルト: false） */
	multiple?: boolean;
	/** 自由記述を許可（デフォルト: true） */
	custom?: boolean;
}

/**
 * 回答（選択されたラベルの配列）
 */
export type Answer = string[];
type QuestionCustomController = {
	render: (w: number) => string[];
	invalidate: () => void;
	handleInput: (data: string) => void;
};

// [Medium Fix] 型安全性向上: any型を置き換えるインターフェース定義
interface QuestionTheme {
	fg: (color: string, text: string) => string;
	bg: (color: string, text: string) => string;
	dim: (text: string) => string;
	bold: (text: string) => string;
	underline: (text: string) => string;
}

interface QuestionTui {
	requestRender: () => void;
}

/**
 * 質問用コンテキスト
 * ExtensionContextから必要なUI機能を抽出
 */
export interface QuestionContext {
	hasUI: boolean;
	ui: {
		custom: <T>(handler: (
			tui: QuestionTui,
			theme: QuestionTheme,
			_kb: unknown,
			done: (value: T) => void
		) => QuestionCustomController) => Promise<T>;
		notify: (message: string, type: string) => void;
	};
}

/**
 * ExtensionContextをQuestionContextとして型キャスト
 * 実行時にはpi SDKのTheme型とQuestionThemeは互換性があるため安全
 * （両者とも同じメソッドシグネチャを持つ）
 */
export function asQuestionContext(ctx: ExtensionContext): QuestionContext {
	return ctx as unknown as QuestionContext;
}

// ============================================
// 文字幅計算ヘルパー（マルチバイト対応）
// ============================================

/**
 * 文字の表示幅を取得
 * CJK文字は幅2、それ以外は幅1
 * @param char - 対象文字
 * @returns 表示幅
 */
function getCharWidth(char: string): number {
	const code = char.codePointAt(0) || 0;
	// CJK統合漢字、ひらがな、カタカナ等の幅2文字字
	if (
		(code >= 0x3000 && code <= 0x303F) ||  // CJK記号・句読点
		(code >= 0x3040 && code <= 0x309F) ||  // ひらがな
		(code >= 0x30A0 && code <= 0x30FF) ||  // カタカナ
		(code >= 0x4E00 && code <= 0x9FFF) ||  // CJK統合漢字
		(code >= 0xFF00 && code <= 0xFFEF)     // 半角・全角形
	) {
		return 2;
	}
	return 1;
}

/**
 * 文字列の表示幅を取得
 * @param str - 対象文字列
 * @returns 表示幅
 */
function getStringWidth(str: string): number {
	let width = 0;
	for (const char of str) {
		width += getCharWidth(char);
	}
	return width;
}

/**
 * 表示幅から文字列を切り詰め
 * @param str - 対象文字列
 * @param maxWidth - 最大表示幅
 * @returns 切り詰められた文字列
 */
function truncateByWidth(str: string, maxWidth: number): string {
	let width = 0;
	let result = "";
	for (const char of str) {
		const charWidth = getCharWidth(char);
		if (width + charWidth > maxWidth) {
			break;
		}
		result += char;
		width += charWidth;
	}
	return result;
}

// ============================================
// UIコンポーネント
// ============================================

function createRenderer<TState>(
	initialState: TState,
	renderFn: (state: TState, width: number, theme: QuestionTheme) => string[]
) {
	let state = initialState;
	let cached: string[] | undefined;

	return {
		getState: () => state,
		setState: (update: Partial<TState>) => {
			state = { ...state, ...update };
			cached = undefined;
		},
		render: (width: number, theme: QuestionTheme) => {
			if (!cached) cached = renderFn(state, width, theme);
			return cached;
		},
		invalidate: () => { cached = undefined; }
	};
}

// ============================================
// 単一質問UI
// ============================================

/**
 * 単一の質問をユーザーに表示して回答を取得する
 * @summary 単一質問UI表示
 * @param question - 質問情報
 * @param ctx - 拡張機能コンテキスト
 * @returns ユーザーの回答（キャンセル時はnull）
 */
export async function askSingleQuestion(
	question: QuestionInfo,
	ctx: QuestionContext
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
		if (question.asciiArt && question.asciiArt.trim().length > 0) {
			lines.push("");
			const artWidth = Math.max(1, width - 1);
			for (const rawLine of question.asciiArt.split("\n")) {
				const line = getStringWidth(rawLine) > artWidth
					? truncateByWidth(rawLine, artWidth)
					: rawLine;
				add(theme.fg("dim", ` ${line}`));
			}
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

	return ctx.ui.custom((tui: QuestionTui, theme: QuestionTheme, _kb: unknown, done: (value: Answer | null) => void): QuestionCustomController => {
		// ブラケットペーストモードのバッファ
		let pasteBuffer = "";
		let isInPaste = false;

		return {
		render: (w: number) => renderer.render(w, theme),
		invalidate: () => renderer.invalidate(),
		handleInput: (data: string) => {
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
						// [H-1 Fix] ペースト内容のサニタイゼーション
						const cleanText = pasteContent
							.replace(/\r\n/g, "\n")
							.replace(/\r/g, "\n")
							.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ""); // ANSIエスケープシーケンス除去

						// [H-1 Fix] 最大長チェック（DoS防止）
						const MAX_PASTE_LENGTH = 10000;
						if (cleanText.length > MAX_PASTE_LENGTH) {
							ctx.ui.notify(
								`ペースト内容が長すぎます（${cleanText.length}文字）。最大${MAX_PASTE_LENGTH}文字までです。`,
								"warning"
							);
						} else {
							const before = state.customInput.slice(0, state.customCursor);
							const after = state.customInput.slice(state.customCursor);
							renderer.setState({
								customInput: before + cleanText + after,
								customCursor: state.customCursor + cleanText.length
							});
							tui.requestRender();
						}
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
					// [High Fix] Escキーでモード変更時にペースト状態をリセット
					isInPaste = false;
					pasteBuffer = "";
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
						// [High Fix] モード変更時にペースト状態をリセット
						isInPaste = false;
						pasteBuffer = "";
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
	ctx: QuestionContext
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

	return ctx.ui.custom((tui: QuestionTui, theme: QuestionTheme, _kb: unknown, done: (value: ConfirmAction) => void): QuestionCustomController => ({
		render: (w: number) => renderer.render(w, theme),
		invalidate: () => renderer.invalidate(),
		handleInput: (data: string) => {
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
					// [C-2 Fix] 境界チェックを強化
					const editIndex = state.cursor - 2;
					if (editIndex >= 0 && editIndex < questions.length) {
						done({ type: "edit", questionIndex: editIndex });
					} else {
						// 範囲外の場合はフォールバック
						// キャンセルとして処理（安全なデフォルト）
						done({ type: "cancel" });
					}
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
		asciiArt: Type.Optional(Type.String({ description: "質問と一緒に表示するASCIIアート（改行可）" })),
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
			// [L-3] UI不在時の構造化エラーレスポンス
			if (!ctx.hasUI) {
				return createErrorResponse({
					code: QuestionErrorCode.NO_UI,
					message: "UIが利用できません（非対話モードで実行中）",
					recovery: [
						"対話モードで再実行してください",
						"または、デフォルト値を使用するようにコードを修正してください"
					]
				});
			}

			// ExtensionContextをQuestionContextに適応（型安全性確保）
			const qctx = asQuestionContext(ctx);

			const questions: QuestionInfo[] = params.questions || [];

			// [L-3] 質問なしの構造化エラーレスポンス
			if (questions.length === 0) {
				return createErrorResponse({
					code: QuestionErrorCode.NO_QUESTIONS,
					message: "質問が提供されていません",
					recovery: [
						"questions配列に少なくとも1つの質問を追加してください",
						"例: { questions: [{ question: \"...\", header: \"...\", options: [{ label: \"はい\" }] }] }"
					]
				});
			}

			// [L-1] パラメータバリデーション強化
			const validationErrors: string[] = [];

			for (let i = 0; i < questions.length; i++) {
				const q = questions[i];
				const hasOptions = q.options && q.options.length > 0;
				const allowCustom = q.custom !== false;

				// [C-1] 空選択肢 + custom=false の検証
				if (!hasOptions && !allowCustom) {
					return createErrorResponse({
						code: QuestionErrorCode.NO_OPTIONS,
						message: `質問 ${i + 1} (${q.header}) に選択肢がなく、自由記述も無効です`,
						recovery: [
							`options に少なくとも1つの選択肢を追加してください: options: [{ label: "はい" }]`,
							`または custom: true を設定して自由記述を許可してください`,
							`例: { question: "${q.question}", header: "${q.header}", options: [], custom: true }`
						],
						details: { questionIndex: i, header: q.header }
					});
				}

				// [L-1] ヘッダー長の警告
				if (q.header && q.header.length > 30) {
					validationErrors.push(
						`質問 ${i + 1}: header は30文字以下を推奨します（現在: ${q.header.length}文字）`
					);
				}

				// [L-1] ラベル長の警告
				if (q.options) {
					for (let j = 0; j < q.options.length; j++) {
						const opt = q.options[j];
						if (opt.label.length > 10) {
							validationErrors.push(
								`質問 ${i + 1} 選択肢 ${j + 1}: label は1-10文字を推奨します（"${opt.label}": ${opt.label.length}文字）`
							);
						}
					}
				}
			}

			// [L-1] バリデーション警告がある場合は通知（処理は継続）
			if (validationErrors.length > 0) {
				qctx.ui.notify(
					`パラメータ警告: ${validationErrors.length}件の推奨事項があります`,
					"warning"
				);
			}

			// 回答を初期化
			const answers: (Answer | null)[] = new Array(questions.length).fill(null);
			let currentIndex = 0;

			// 全質問に回答
			while (currentIndex < questions.length) {
				const answer = await askSingleQuestion(questions[currentIndex], qctx);
				
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
				const action = await showConfirmationScreen(questions, answers as Answer[], qctx);

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
					const newAnswer = await askSingleQuestion(questions[currentIndex], qctx);
					
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
			interface QuestionResult {
				details?: { answers?: string[][] };
			}
			function hasQuestionDetails(value: unknown): value is QuestionResult {
				return typeof value === "object" && value !== null && "details" in value;
			}
			const details = hasQuestionDetails(result) ? result.details : undefined;
			if (!details?.answers || details.answers.length === 0) {
				return new Text(theme.fg("warning", "キャンセル"), 0, 0);
			}
			const answers = details.answers;
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
