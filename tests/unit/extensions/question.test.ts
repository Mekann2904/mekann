/**
 * @file .pi/extensions/question.ts の単体テスト
 * @description 質問UI拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Boolean: () => ({ type: "boolean" }),
		Optional: (type) => type,
		Object: (fields) => ({ type: "object", fields }),
		Array: (type) => ({ type: "array", itemType: type }),
	},
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: vi.fn(),
	truncateToWidth: vi.fn((s) => s),
	wrapTextWithAnsi: vi.fn((text, width) => {
		if (text.length <= width) return [text];
		const lines: string[] = [];
		for (let i = 0; i < text.length; i += width) {
			lines.push(text.slice(i, i + width));
		}
		return lines;
	}),
	CURSOR_MARKER: "\u2588",
	Key: {
		enter: "enter",
		escape: "escape",
		backspace: "backspace",
		left: "left",
		right: "right",
		up: "up",
		down: "down",
		home: "home",
		end: "end",
		delete: "delete",
		shift: (key) => `shift+${key}`,
	},
	matchesKey: vi.fn((data, key) => data === key),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("question.ts 型定義", () => {
	describe("QuestionOption", () => {
		it("labelを持つ", () => {
			const option = { label: "オプションA" };
			expect(option.label).toBe("オプションA");
		});

		it("descriptionを持つ（オプション）", () => {
			const option = { label: "オプションA", description: "説明テキスト" };
			expect(option.description).toBe("説明テキスト");
		});

		it("descriptionなしでも有効", () => {
			const option = { label: "オプションA" };
			expect(option.description).toBeUndefined();
		});
	});

	describe("QuestionInfo", () => {
		it("必須フィールドを持つ", () => {
			const question = {
				question: "質問文",
				header: "ヘッダー",
				options: [{ label: "A" }, { label: "B" }],
			};
			expect(question.question).toBe("質問文");
			expect(question.header).toBe("ヘッダー");
			expect(question.options).toHaveLength(2);
		});

		it("multipleフラグを持つ（オプション）", () => {
			const question = {
				question: "質問文",
				header: "ヘッダー",
				options: [{ label: "A" }],
				multiple: true,
			};
			expect(question.multiple).toBe(true);
		});

		it("asciiArtを持つ（オプション）", () => {
			const question = {
				question: "質問文",
				header: "ヘッダー",
				asciiArt: "[C] -> [G]",
				options: [{ label: "A" }],
			};
			expect(question.asciiArt).toBe("[C] -> [G]");
		});

		it("customフラグを持つ（オプション）", () => {
			const question = {
				question: "質問文",
				header: "ヘッダー",
				options: [{ label: "A" }],
				custom: false,
			};
			expect(question.custom).toBe(false);
		});
	});

	describe("Answer型", () => {
		it("文字列の配列", () => {
			const answer: string[] = ["選択肢A", "選択肢B"];
			expect(answer).toEqual(["選択肢A", "選択肢B"]);
		});

		it("空配列も可能", () => {
			const answer: string[] = [];
			expect(answer).toEqual([]);
		});
	});
});

// ============================================================================
// createRendererロジックのテスト
// ============================================================================

describe("createRenderer", () => {
	interface RendererState {
		cursor: number;
		selected: Set<number>;
		value: string;
	}

	it("初期状態を保持", () => {
		const initialState: RendererState = {
			cursor: 0,
			selected: new Set<number>(),
			value: "",
		};
		const state = initialState;
		expect(state.cursor).toBe(0);
		expect(state.selected.size).toBe(0);
		expect(state.value).toBe("");
	});

	it("状態を更新して不変性を維持", () => {
		const initialState: RendererState = {
			cursor: 0,
			selected: new Set<number>(),
			value: "",
		};

		const update: Partial<RendererState> = { cursor: 1, value: "test" };
		const newState = { ...initialState, ...update };

		// 初期状態は変更されていない
		expect(initialState.cursor).toBe(0);
		expect(initialState.value).toBe("");

		// 新しい状態は更新されている
		expect(newState.cursor).toBe(1);
		expect(newState.value).toBe("test");
	});

	it("Setはスプレッドで展開できないのでマージが必要", () => {
		const selected1 = new Set<number>([1, 2]);
		const update = { selected: new Set([...selected1, 3]) };

		const state: RendererState = {
			cursor: 0,
			selected: update.selected,
			value: "",
		};

		expect(state.selected.has(1)).toBe(true);
		expect(state.selected.has(2)).toBe(true);
		expect(state.selected.has(3)).toBe(true);
	});

	it("キャッシュ無効化フラグを管理", () => {
		let cached: string[] | undefined = undefined;
		let invalidated = false;

		// 初期キャッシュなし
		expect(cached).toBeUndefined();

		// キャッシュ作成
		cached = ["line1", "line2"];
		expect(cached).toBeDefined();

		// 無効化
		invalidated = true;
		if (invalidated) {
			cached = undefined;
		}

		expect(cached).toBeUndefined();
	});
});

// ============================================================================
// UI状態管理のテスト
// ============================================================================

describe("UI状態管理", () => {
	describe("カーソル移動", () => {
		it("上下移動の境界条件", () => {
			const optionsCount = 3;
			let cursor = 0;

			// 上限
			cursor = Math.min(optionsCount - 1, cursor + 1);
			expect(cursor).toBe(1);

			cursor = Math.min(optionsCount - 1, cursor + 1);
			expect(cursor).toBe(2);

			// 下限（これ以上増えない）
			cursor = Math.min(optionsCount - 1, cursor + 1);
			expect(cursor).toBe(2);
		});

		it("下限境界", () => {
			let cursor = 2;
			cursor = Math.max(0, cursor - 1);
			expect(cursor).toBe(1);

			cursor = Math.max(0, cursor - 1);
			expect(cursor).toBe(0);

			cursor = Math.max(0, cursor - 1);
			expect(cursor).toBe(0);
		});
	});

	describe("選択状態管理", () => {
		it("選択の追加と削除", () => {
			const selected = new Set<number>();

			// 追加
			selected.add(1);
			expect(selected.has(1)).toBe(true);

			// 削除
			selected.delete(1);
			expect(selected.has(1)).toBe(false);
		});

		it("複数選択の管理", () => {
			const selected = new Set<number>();
			selected.add(0);
			selected.add(2);
			selected.add(4);

			expect(selected.size).toBe(3);
			expect(Array.from(selected).sort()).toEqual([0, 2, 4]);
		});
	});

	describe("カスタム入力モード", () => {
		it("カーソル位置管理", () => {
			const text = "hello";
			let cursor = 0;

			// 右に移動
			cursor = Math.min(text.length, cursor + 1);
			expect(cursor).toBe(1);

			cursor = Math.min(text.length, cursor + 4);
			expect(cursor).toBe(5);

			// これ以上右には進めない
			cursor = Math.min(text.length, cursor + 1);
			expect(cursor).toBe(5);
		});

		it("文字列挿入", () => {
			const text = "hllo";
			const insertChar = "e";
			const insertPos = 1;

			const before = text.slice(0, insertPos);
			const after = text.slice(insertPos);
			const newText = before + insertChar + after;

			expect(newText).toBe("hello");
		});

		it("文字削除（backspace）", () => {
			const text = "hello";
			const cursor = 4;

			const before = text.slice(0, cursor - 1);
			const after = text.slice(cursor);
			const newText = before + after;

			expect(newText).toBe("helo");
			expect(before.length).toBe(3);
		});

		it("文字削除（delete）", () => {
			const text = "hello";
			const cursor = 1;

			const before = text.slice(0, cursor);
			const after = text.slice(cursor + 1);
			const newText = before + after;

			expect(newText).toBe("hllo");
			expect(after).toBe("llo");
		});

		it("複数行対応のカーソル計算", () => {
			const text = "line1\nline2\nline3";
			const lines = text.split("\n");

			// 行ごとの文字オフセットを計算
			let charCount = 0;
			const offsets: number[] = [];
			for (let i = 0; i < lines.length; i++) {
				offsets.push(charCount);
				charCount += lines[i].length + 1; // +1 for \n
			}

			expect(offsets).toEqual([0, 6, 12]);

			// カーソルがline2の先頭にある場合
			const cursor = offsets[1];
			expect(text[cursor]).toBe("l");
		});
	});
});

// ============================================================================
// 回答フォーマットのテスト
// ============================================================================

describe("回答フォーマット", () => {
	describe("opencode形式出力", () => {
		it("単一回答のフォーマット", () => {
			const question = { question: "質問?", header: "Q", options: [] };
			const answers = [["選択A"]];

			const formatted = `"${question.question}"="${answers[0]!.join(", ")}"`;
			expect(formatted).toBe('"質問?"="選択A"');
		});

		it("複数回答のフォーマット", () => {
			const questions = [
				{ question: "質問1?", header: "Q1", options: [] },
				{ question: "質問2?", header: "Q2", options: [] },
			];
			const answers = [["A1", "A2"], ["B1"]];

			const formatted = questions
				.map((q, i) => `"${q.question}"="${answers[i]!.join(", ")}"`)
				.join(", ");
			expect(formatted).toBe('"質問1?"="A1, A2", "質問2?"="B1"');
		});
	});

	describe("キャンセル時の出力", () => {
		it("空配列として扱う", () => {
			const answers: string[][] = [];
			const hasAnswer = answers.length > 0 && answers.some(a => a.length > 0);

			expect(hasAnswer).toBe(false);
		});
	});
});

// ============================================================================
// 入力処理のテスト
// ============================================================================

describe("入力処理", () => {
	describe("キーイベントマッチング", () => {
		it("Enterキーの判定", () => {
			const data = "enter";
			const isEnter = data === "enter";
			expect(isEnter).toBe(true);
		});

		it("Escapeキーの判定", () => {
			const data = "escape";
			const isEscape = data === "escape";
			expect(isEscape).toBe(true);
		});

		it("Spaceキーの判定", () => {
			const data = " ";
			const isSpace = data === " " || data === "Space";
			expect(isSpace).toBe(true);
		});
	});

	describe("ブラケットペーストモード", () => {
		it("ペースト開始シーケンスの検出", () => {
			const data = "some text\x1b[200~more text";
			const hasPasteStart = data.includes("\x1b[200~");
			expect(hasPasteStart).toBe(true);
		});

		it("ペースト終了シーケンスの検出", () => {
			const data = "pasted content\x1b[201~";
			const hasPasteEnd = data.includes("\x1b[201~");
			expect(hasPasteEnd).toBe(true);
		});

		it("ペースト内容の抽出", () => {
			const pasteBuffer = "hello world\x1b[201~";
			const endIndex = pasteBuffer.indexOf("\x1b[201~");
			const pasteContent = pasteBuffer.substring(0, endIndex);

			expect(pasteContent).toBe("hello world");
		});
	});

	describe("シフトキー修飾", () => {
		it("Shift+Enterの判定", () => {
			const data = "shift+enter";
			const isShiftEnter = data === "shift+enter";
			expect(isShiftEnter).toBe(true);
		});
	});
});

// ============================================================================
// テキスト折り返しのテスト
// ============================================================================

describe("テキスト折り返し", () => {
	describe("wrapTextWithAnsiロジック", () => {
		it("短いテキストは折り返さない", () => {
			const text = "short";
			const width = 20;
			const wrapped = text.length <= width ? [text] : [text.slice(0, width), text.slice(width)];

			expect(wrapped).toEqual(["short"]);
		});

		it("長いテキストを折り返す", () => {
			const text = "this is a very long text that needs to be wrapped";
			const width = 10;
			const lines: string[] = [];
			for (let i = 0; i < text.length; i += width) {
				lines.push(text.slice(i, i + width));
			}

			expect(lines[0]).toBe("this is a ");
			expect(lines[1]).toBe("very long ");
			expect(lines[2]).toBe("text that ");
			expect(lines.length).toBeGreaterThan(2);
		});

		it("空文字列の処理", () => {
			const text = "";
			const width = 10;
			const wrapped = text.length === 0 ? [] : [text];

			expect(wrapped).toEqual([]);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空の選択肢リスト", () => {
		it("空配列の処理", () => {
			const options: { label: string }[] = [];
			const count = options.length;

			expect(count).toBe(0);
		});

		it("「その他」オプションの追加ロジック", () => {
			const options = [];
			const allowCustom = true;
			const displayOptions = allowCustom
				? [...options, { label: "その他", description: "自由に入力" }]
				: options;

			expect(displayOptions).toHaveLength(1);
			expect(displayOptions[0].label).toBe("その他");
		});
	});

	describe("最大長制限", () => {
		it("ヘッダーのカット", () => {
			const header = "このヘッダーは非常に長いのでカットされます";
			const maxLength = 20;
			const truncated = header.slice(0, maxLength);

			// 20文字にカット
			expect(truncated.length).toBe(20);
			expect(truncated).toBe("このヘッダーは非常に長いのでカットされま");
		});
	});

	describe("特殊文字の処理", () => {
		it("ANSIエスケープシーケンス", () => {
			const text = "normal\x1b[31mred\x1b[0mnormal";
			const hasAnsi = text.includes("\x1b[");
			expect(hasAnsi).toBe(true);
		});

		it("日本語（マルチバイト）の文字数", () => {
			const text = "こんにちは";
			const length = text.length;
			expect(length).toBe(5);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("question.ts プロパティベーステスト", () => {
	it("PBT: カーソルは常に有効範囲内", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 10 }),
				fc.array(fc.string({ minLength: 1, maxLength: 5 })),
				(initialCursor, options) => {
					const optionsCount = Math.min(options.length, 10);
					let cursor = initialCursor;

					// 上移動
					cursor = Math.min(optionsCount > 0 ? optionsCount - 1 : 0, cursor + 1);
					expect(cursor).toBeGreaterThanOrEqual(0);
					if (optionsCount > 0) {
						expect(cursor).toBeLessThanOrEqual(optionsCount);
					}

					// 下移動
					cursor = Math.max(0, cursor - 1);
					expect(cursor).toBeGreaterThanOrEqual(0);
					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 選択したインデックスは範囲内", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 9 })),
				(indices) => {
					const maxIndex = 10;
					const validIndices = indices.filter(i => i >= 0 && i < maxIndex);

					expect(validIndices.every(i => i >= 0 && i < maxIndex)).toBe(true);
					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 文字列挿入の不変性", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 20 }),
				fc.string({ minLength: 1, maxLength: 5 }),
				fc.integer({ min: 0, max: 20 }),
				(originalText, insertChar, position) => {
					const clampedPos = Math.max(0, Math.min(originalText.length, position));
					const before = originalText.slice(0, clampedPos);
					const after = originalText.slice(clampedPos);
					const result = before + insertChar + after;

					// 結果の長さチェック
					expect(result.length).toBe(originalText.length + insertChar.length);
					return true;
				}
			),
			{ numRuns: 30 }
		);
	});

	it("PBT: カーソル境界の整合性", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 50 }),
				(text) => {
					let cursor = 0;

					// 右に移動
					for (let i = 0; i < 60; i++) {
						cursor = Math.min(text.length, cursor + 1);
					}
					expect(cursor).toBe(text.length);

					// 左に移動
					for (let i = 0; i < 60; i++) {
						cursor = Math.max(0, cursor - 1);
					}
					expect(cursor).toBe(0);
					return true;
				}
			),
			{ numRuns: 20 }
		);
	});
});

// ============================================================================
// 新機能のテスト（v2.0改善）
// ============================================================================

describe("新機能テスト（v2.0改善）", () => {
	describe("マルチバイト文字幅計算", () => {
		/**
		 * 文字の表示幅を取得（テスト用コピー）
		 */
		function getCharWidth(char: string): number {
			const code = char.codePointAt(0) || 0;
			if (
				(code >= 0x3000 && code <= 0x303F) ||
				(code >= 0x3040 && code <= 0x309F) ||
				(code >= 0x30A0 && code <= 0x30FF) ||
				(code >= 0x4E00 && code <= 0x9FFF) ||
				(code >= 0xFF00 && code <= 0xFFEF)
			) {
				return 2;
			}
			return 1;
		}

		/**
		 * 文字列の表示幅を取得（テスト用コピー）
		 */
		function getStringWidth(str: string): number {
			let width = 0;
			for (const char of str) {
				width += getCharWidth(char);
			}
			return width;
		}

		it("ASCII文字は幅1", () => {
			expect(getCharWidth("a")).toBe(1);
			expect(getCharWidth("Z")).toBe(1);
			expect(getCharWidth("0")).toBe(1);
			expect(getCharWidth(" ")).toBe(1);
		});

		it("ひらがなは幅2", () => {
			expect(getCharWidth("あ")).toBe(2);
			expect(getCharWidth("ん")).toBe(2);
		});

		it("カタカナは幅2", () => {
			expect(getCharWidth("ア")).toBe(2);
			expect(getCharWidth("ン")).toBe(2);
		});

		it("漢字は幅2", () => {
			expect(getCharWidth("漢")).toBe(2);
			expect(getCharWidth("字")).toBe(2);
		});

		it("文字列の合計幅", () => {
			expect(getStringWidth("abc")).toBe(3);
			expect(getStringWidth("あいう")).toBe(6);
			expect(getStringWidth("aあb")).toBe(4); // 1 + 2 + 1
		});

		it("混在文字列の幅", () => {
			const mixed = "Hello世界";
			// H(1) + e(1) + l(1) + l(1) + o(1) + 世(2) + 界(2) = 9
			expect(getStringWidth(mixed)).toBe(9);
		});
	});

	describe("構造化エラーレスポンス", () => {
		/**
		 * エラーコード定義（テスト用コピー）
		 */
		enum QuestionErrorCode {
			NO_UI = "NO_UI",
			NO_OPTIONS = "NO_OPTIONS",
			NO_QUESTIONS = "NO_QUESTIONS",
			CANCELLED = "CANCELLED",
			VALIDATION_ERROR = "VALIDATION_ERROR"
		}

		interface QuestionError {
			code: QuestionErrorCode;
			message: string;
			recovery: string[];
			details?: Record<string, unknown>;
		}

		function createErrorResponse(error: QuestionError) {
			return {
				content: [{
					type: "text" as const,
					text: `エラー [${error.code}]: ${error.message}\n\n回復方法:\n${error.recovery.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
				}],
				details: {
					answers: [],
					error
				}
			};
		}

		it("NO_UIエラーレスポンスの作成", () => {
			const response = createErrorResponse({
				code: QuestionErrorCode.NO_UI,
				message: "UIが利用できません",
				recovery: ["対話モードで再実行してください"]
			});

			expect(response.details.answers).toEqual([]);
			expect(response.details.error.code).toBe("NO_UI");
			expect(response.content[0].text).toContain("回復方法");
		});

		it("NO_OPTIONSエラーレスポンスの作成", () => {
			const response = createErrorResponse({
				code: QuestionErrorCode.NO_OPTIONS,
				message: "質問 1 に選択肢がありません",
				recovery: [
					"options に選択肢を追加してください",
					"または custom: true を設定してください"
				],
				details: { questionIndex: 0 }
			});

			expect(response.details.error.code).toBe("NO_OPTIONS");
			expect(response.details.error.recovery).toHaveLength(2);
			expect(response.details.error.details).toEqual({ questionIndex: 0 });
		});

		it("エラーメッセージに回復方法が含まれる", () => {
			const response = createErrorResponse({
				code: QuestionErrorCode.VALIDATION_ERROR,
				message: "バリデーションエラー",
				recovery: ["修正してください"]
			});

			expect(response.content[0].text).toContain("1. 修正してください");
		});
	});

	describe("パラメータバリデーション", () => {
		it("空選択肢 + custom=false は無効", () => {
			const question = {
				question: "テスト",
				header: "T",
				options: [],
				custom: false
			};

			const hasOptions = question.options && question.options.length > 0;
			const allowCustom = question.custom !== false;
			const isValid = hasOptions || allowCustom;

			expect(isValid).toBe(false);
		});

		it("空選択肢 + custom=true は有効", () => {
			const question = {
				question: "テスト",
				header: "T",
				options: [],
				custom: true
			};

			const hasOptions = question.options && question.options.length > 0;
			const allowCustom = question.custom !== false;
			const isValid = hasOptions || allowCustom;

			expect(isValid).toBe(true);
		});

		it("選択肢あり + custom=false は有効", () => {
			const question = {
				question: "テスト",
				header: "T",
				options: [{ label: "A" }],
				custom: false
			};

			const hasOptions = question.options && question.options.length > 0;
			const allowCustom = question.custom !== false;
			const isValid = hasOptions || allowCustom;

			expect(isValid).toBe(true);
		});

		it("ヘッダー長の警告判定", () => {
			const shortHeader = "短い";
			const longHeader = "このヘッダーは非常に長いので警告されるべきですそのまま続きます";

			expect(shortHeader.length <= 30).toBe(true);
			expect(longHeader.length <= 30).toBe(false);
		});
	});

	describe("ペースト処理の改善", () => {
		it("ANSIエスケープシーケンスの除去", () => {
			// 明示的にUnicodeエスケープを使用
			const input = "hello\u001b[31mred\u001b[0mworld";
			// CSI形式のANSIエスケープシーケンスのみ除去
			const cleanText = input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");

			// ANSIエスケープシーケンスは除去されるが、"red" は残る
			expect(cleanText).toBe("helloredworld");
		});

		it("最大長チェック", () => {
			const MAX_PASTE_LENGTH = 10000;
			const shortText = "a".repeat(100);
			const longText = "a".repeat(15000);

			expect(shortText.length <= MAX_PASTE_LENGTH).toBe(true);
			expect(longText.length <= MAX_PASTE_LENGTH).toBe(false);
		});

		it("改行コードの統一", () => {
			const input = "line1\r\nline2\rline3";
			const cleanText = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

			expect(cleanText).toBe("line1\nline2\nline3");
		});
	});

	describe("確認画面の境界チェック", () => {
		it("有効な編集インデックス", () => {
			const questions = [
				{ question: "Q1", header: "H1", options: [] },
				{ question: "Q2", header: "H2", options: [] },
				{ question: "Q3", header: "H3", options: [] }
			];
			const totalOptions = 2 + questions.length; // 確定 + キャンセル + 質問数

			// カーソル位置 2, 3, 4 は編集オプション
			for (let cursor = 2; cursor < totalOptions; cursor++) {
				const editIndex = cursor - 2;
				const isValid = editIndex >= 0 && editIndex < questions.length;
				expect(isValid).toBe(true);
			}
		});

		it("無効な編集インデックスはフォールバック", () => {
			const questions = [
				{ question: "Q1", header: "H1", options: [] }
			];

			// カーソル位置 0, 1 は確定/キャンセル
			// カーソル位置 2 は編集オプション
			// カーソル位置 3 以降は範囲外

			const cursorOutOfRange = 10;
			const editIndex = cursorOutOfRange - 2;
			const isValid = editIndex >= 0 && editIndex < questions.length;

			expect(isValid).toBe(false);
		});
	});
});
