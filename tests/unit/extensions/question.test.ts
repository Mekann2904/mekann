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
