/**
 * @file .pi/extensions/question.ts の単体テスト
 * @description ユーザーへの対話的質問UI拡張のテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// モック: pi SDK依存を分離
vi.mock("@mariozechner/pi-tui", () => ({
	Text: vi.fn((text: string) => ({ text })),
	truncateToWidth: vi.fn((s: string) => s),
	wrapTextWithAnsi: vi.fn((s: string) => [s]),
	CURSOR_MARKER: "\x1b[7m",
	matchesKey: vi.fn((data: string, key: string) => data === key),
	Key: {
		enter: "enter",
		escape: "escape",
		up: "up",
		down: "down",
		left: "left",
		right: "right",
		backspace: "backspace",
		home: "home",
		end: "end",
		delete: "delete",
		shift: vi.fn((key: string) => `shift+${key}`),
	},
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("QuestionOption型", () => {
	interface QuestionOption {
		label: string;
		description?: string;
	}

	describe("基本構造", () => {
		it("should_create_option_with_label_only", () => {
			const option: QuestionOption = {
				label: "Yes",
			};

			expect(option.label).toBe("Yes");
			expect(option.description).toBeUndefined();
		});

		it("should_create_option_with_description", () => {
			const option: QuestionOption = {
				label: "Option A",
				description: "This is option A",
			};

			expect(option.label).toBe("Option A");
			expect(option.description).toBe("This is option A");
		});
	});
});

describe("QuestionInfo型", () => {
	interface QuestionInfo {
		question: string;
		header: string;
		options: Array<{ label: string; description?: string }>;
		multiple?: boolean;
		custom?: boolean;
	}

	describe("基本構造", () => {
		it("should_create_simple_question", () => {
			const info: QuestionInfo = {
				question: "Do you want to continue?",
				header: "Confirm",
				options: [
					{ label: "Yes" },
					{ label: "No" },
				],
			};

			expect(info.question).toBe("Do you want to continue?");
			expect(info.header).toBe("Confirm");
			expect(info.options).toHaveLength(2);
			expect(info.multiple).toBeUndefined();
			expect(info.custom).toBeUndefined();
		});

		it("should_create_multiple_select_question", () => {
			const info: QuestionInfo = {
				question: "Select features",
				header: "Features",
				options: [
					{ label: "Feature A" },
					{ label: "Feature B" },
				],
				multiple: true,
			};

			expect(info.multiple).toBe(true);
		});

		it("should_create_question_with_custom_input", () => {
			const info: QuestionInfo = {
				question: "Choose or enter",
				header: "Choice",
				options: [{ label: "Option A" }],
				custom: true,
			};

			expect(info.custom).toBe(true);
		});
	});
});

describe("Answer型", () => {
	type Answer = string[];

	describe("回答形式", () => {
		it("should_be_string_array", () => {
			const answer: Answer = ["Yes"];
			expect(Array.isArray(answer)).toBe(true);
			expect(answer[0]).toBe("Yes");
		});

		it("should_allow_multiple_selections", () => {
			const answer: Answer = ["Feature A", "Feature B", "Feature C"];
			expect(answer).toHaveLength(3);
		});

		it("should_allow_empty_array_for_cancellation", () => {
			const answer: Answer = [];
			expect(answer).toHaveLength(0);
		});

		it("should_allow_custom_text", () => {
			const answer: Answer = ["This is my custom input"];
			expect(answer[0]).toContain("custom");
		});
	});
});

// ============================================================================
// createRendererヘルパー関数のテスト
// ============================================================================

describe("createRenderer", () => {
	function createRenderer<TState>(
		initialState: TState,
		renderFn: (state: TState, width: number) => string[]
	) {
		let state = initialState;
		let cached: string[] | undefined;

		return {
			getState: () => state,
			setState: (update: Partial<TState>) => {
				state = { ...state, ...update };
				cached = undefined;
			},
			render: (width: number) => {
				if (!cached) cached = renderFn(state, width);
				return cached;
			},
			invalidate: () => {
				cached = undefined;
			},
		};
	}

	describe("状態管理", () => {
		it("should_initialize_with_state", () => {
			const renderer = createRenderer({ cursor: 0 }, (state) => [`cursor: ${state.cursor}`]);

			expect(renderer.getState().cursor).toBe(0);
		});

		it("should_update_state", () => {
			const renderer = createRenderer({ cursor: 0 }, (state) => [`cursor: ${state.cursor}`]);

			renderer.setState({ cursor: 5 });

			expect(renderer.getState().cursor).toBe(5);
		});

		it("should_invalidate_cache", () => {
			let renderCount = 0;
			const renderer = createRenderer({ cursor: 0 }, (state) => {
				renderCount++;
				return [`cursor: ${state.cursor}`];
			});

			renderer.render(80);
			renderer.render(80); // キャッシュされる
			expect(renderCount).toBe(1);

			renderer.invalidate();
			renderer.render(80); // 再描画
			expect(renderCount).toBe(2);
		});
	});

	describe("描画結果", () => {
		it("should_return_string_array", () => {
			const renderer = createRenderer({ text: "test" }, (state) => [state.text]);

			const result = renderer.render(80);

			expect(Array.isArray(result)).toBe(true);
			expect(result[0]).toBe("test");
		});
	});
});

// ============================================================================
// 入力処理のテスト
// ============================================================================

describe("入力処理", () => {
	describe("カーソル移動", () => {
		function moveCursor(current: number, direction: "up" | "down", max: number): number {
			if (direction === "up") {
				return Math.max(0, current - 1);
			}
			return Math.min(max, current + 1);
		}

		it("should_move_cursor_up", () => {
			expect(moveCursor(2, "up", 5)).toBe(1);
			expect(moveCursor(0, "up", 5)).toBe(0); // 境界
		});

		it("should_move_cursor_down", () => {
			expect(moveCursor(2, "down", 5)).toBe(3);
			expect(moveCursor(5, "down", 5)).toBe(5); // 境界
		});

		it("PBT: カーソルは常に範囲内", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 100 }),
					fc.constantFrom("up", "down"),
					fc.integer({ min: 0, max: 100 }),
					(current, direction, max) => {
						// Ensure current is within bounds initially
						const safeCurrent = Math.min(current, max);
						const result = moveCursor(safeCurrent, direction, max);
						return result >= 0 && result <= max;
					}
				)
			);
		});
	});

	describe("複数選択のトグル", () => {
		function toggleSelection(selected: Set<number>, index: number): Set<number> {
			const newSet = new Set(selected);
			if (newSet.has(index)) {
				newSet.delete(index);
			} else {
				newSet.add(index);
			}
			return newSet;
		}

		it("should_add_to_selection", () => {
			const selected = new Set<number>();
			const result = toggleSelection(selected, 0);

			expect(result.has(0)).toBe(true);
		});

		it("should_remove_from_selection", () => {
			const selected = new Set<number>([0, 1, 2]);
			const result = toggleSelection(selected, 1);

			expect(result.has(1)).toBe(false);
			expect(result.has(0)).toBe(true);
			expect(result.has(2)).toBe(true);
		});

		it("should_toggle_selection", () => {
			let selected = new Set<number>();

			selected = toggleSelection(selected, 0);
			expect(selected.has(0)).toBe(true);

			selected = toggleSelection(selected, 0);
			expect(selected.has(0)).toBe(false);
		});
	});
});

// ============================================================================
// カスタム入力モードのテスト
// ============================================================================

describe("カスタム入力モード", () => {
	describe("テキスト編集", () => {
		function insertText(current: string, cursor: number, char: string): { text: string; cursor: number } {
			const before = current.slice(0, cursor);
			const after = current.slice(cursor);
			return {
				text: before + char + after,
				cursor: cursor + char.length,
			};
		}

		function deleteChar(current: string, cursor: number): { text: string; cursor: number } {
			if (cursor <= 0) return { text: current, cursor };
			const before = current.slice(0, cursor - 1);
			const after = current.slice(cursor);
			return {
				text: before + after,
				cursor: cursor - 1,
			};
		}

		it("should_insert_character_at_cursor", () => {
			const result = insertText("hello", 2, "X");
			expect(result.text).toBe("heXllo");
			expect(result.cursor).toBe(3);
		});

		it("should_delete_character_before_cursor", () => {
			const result = deleteChar("hello", 2);
			expect(result.text).toBe("hllo");
			expect(result.cursor).toBe(1);
		});

		it("should_not_delete_at_start", () => {
			const result = deleteChar("hello", 0);
			expect(result.text).toBe("hello");
			expect(result.cursor).toBe(0);
		});

		it("PBT: 挿入後のカーソル位置は正しい", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 0, maxLength: 50 }),
					fc.integer({ min: 0, max: 50 }),
					fc.string({ minLength: 1, maxLength: 5 }),
					(text, cursor, char) => {
						const safeCursor = Math.min(cursor, text.length);
						const result = insertText(text, safeCursor, char);
						return result.cursor === safeCursor + char.length;
					}
				)
			);
		});
	});
});

// ============================================================================
// バレルエクスポート確認テスト
// ============================================================================

describe("バレルエクスポート確認", () => {
	it("should_have_default_export_as_function", async () => {
		const questionModule = await import("../../../.pi/extensions/question");
		expect(questionModule.default).toBeDefined();
		expect(typeof questionModule.default).toBe("function");
		expect(questionModule.default.length).toBe(1); // pi引数を1つ取る
	});
});

// ============================================================================
// 確認画面のテスト
// ============================================================================

describe("確認画面", () => {
	type ConfirmAction = { type: "confirm" } | { type: "edit"; questionIndex: number } | { type: "cancel" };

	describe("アクション判定", () => {
		it("should_create_confirm_action", () => {
			const action: ConfirmAction = { type: "confirm" };
			expect(action.type).toBe("confirm");
		});

		it("should_create_cancel_action", () => {
			const action: ConfirmAction = { type: "cancel" };
			expect(action.type).toBe("cancel");
		});

		it("should_create_edit_action", () => {
			const action: ConfirmAction = { type: "edit", questionIndex: 2 };
			expect(action.type).toBe("edit");
			expect((action as { questionIndex: number }).questionIndex).toBe(2);
		});
	});
});
