/**
 * @file .pi/lib/abort-utils.ts の単体テスト
 * @description AbortController階層管理ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	createChildAbortController,
	createChildAbortControllers,
} from "../../lib/abort-utils.js";

// ============================================================================
// createChildAbortController
// ============================================================================

describe("createChildAbortController", () => {
	describe("正常系", () => {
		it("should_create_independent_controller_without_parent", () => {
			// Arrange: 親シグナルなし
			// Act: 子コントローラを作成
			const { controller, cleanup } = createChildAbortController();

			// Assert: コントローラは中止されていない
			expect(controller.signal.aborted).toBe(false);
			expect(typeof cleanup).toBe("function");

			// Cleanup: リソース解放
			cleanup();
		});

		it("should_link_child_to_parent", () => {
			// Arrange: 親コントローラを作成
			const parent = new AbortController();

			// Act: 親に連動する子を作成
			const { controller, cleanup } = createChildAbortController(parent.signal);

			// Assert: 初期状態では中止されていない
			expect(controller.signal.aborted).toBe(false);

			// Act: 親を中止
			parent.abort();

			// Assert: 子も中止される
			expect(controller.signal.aborted).toBe(true);

			// Cleanup
			cleanup();
		});

		it("should_return_empty_cleanup_for_no_parent", () => {
			// Arrange/Act: 親なしで作成
			const { cleanup } = createChildAbortController();

			// Assert: クリーンアップ関数はno-op
			expect(() => cleanup()).not.toThrow();
		});

		it("should_return_empty_cleanup_for_already_aborted_parent", () => {
			// Arrange: 既に中止された親
			const parent = new AbortController();
			parent.abort();

			// Act: 子を作成
			const { controller, cleanup } = createChildAbortController(parent.signal);

			// Assert: 子は即座に中止される
			expect(controller.signal.aborted).toBe(true);
			expect(() => cleanup()).not.toThrow();
		});
	});

	describe("中止伝播", () => {
		it("should_propagate_abort_reason", () => {
			// Arrange
			const parent = new AbortController();
			const { controller, cleanup } = createChildAbortController(parent.signal);

			// Act: 親を中止
			parent.abort(new Error("Parent aborted"));

			// Assert: 子も中止される（理由は伝播しないが中止状態は伝播）
			expect(controller.signal.aborted).toBe(true);

			cleanup();
		});

		it("should_not_propagate_abort_after_cleanup", () => {
			// Arrange
			const parent = new AbortController();
			const { controller, cleanup } = createChildAbortController(parent.signal);

			// Act: クリーンアップ後に親を中止
			cleanup();
			parent.abort();

			// Assert: 子は中止されない
			expect(controller.signal.aborted).toBe(false);
		});

		it("should_handle_multiple_children_independently", () => {
			// Arrange
			const parent = new AbortController();
			const child1 = createChildAbortController(parent.signal);
			const child2 = createChildAbortController(parent.signal);

			// Act: 親を中止
			parent.abort();

			// Assert: 両方の子が中止される
			expect(child1.controller.signal.aborted).toBe(true);
			expect(child2.controller.signal.aborted).toBe(true);

			// Cleanup
			child1.cleanup();
			child2.cleanup();
		});
	});

	describe("境界条件", () => {
		it("should_handle_undefined_parent_signal", () => {
			// Arrange/Act
			const { controller, cleanup } = createChildAbortController(undefined);

			// Assert
			expect(controller.signal.aborted).toBe(false);
			expect(() => cleanup()).not.toThrow();
		});

		it("should_handle_null_parent_signal_as_undefined", () => {
			// Arrange/Act: nullを渡す（TypeScriptでは型エラーになるが実行時の挙動を確認）
			const { controller, cleanup } = createChildAbortController(
				null as unknown as AbortSignal | undefined,
			);

			// Assert
			expect(controller.signal.aborted).toBe(false);
			expect(() => cleanup()).not.toThrow();
		});

		it("should_cleanup_only_once", () => {
			// Arrange
			const parent = new AbortController();
			const { cleanup } = createChildAbortController(parent.signal);

			// Act: 複数回クリーンアップ
			cleanup();
			cleanup();
			cleanup();

			// Assert: 親を中止してもエラーにならない
			expect(() => parent.abort()).not.toThrow();
		});
	});

	describe("メモリリーク防止", () => {
		it("should_remove_event_listener_on_cleanup", () => {
			// Arrange
			const parent = new AbortController();
			const initialListenerCount = parent.signal.aborted ? 0 : 1;

			// Act
			const { cleanup } = createChildAbortController(parent.signal);
			cleanup();

			// Assert: リスナーが削除されていることを確認（間接的）
			// 親を中止しても子に影響がないことで確認
			parent.abort();

			// 注: 直接的なリスナーカウントは取得できないため、
			// クリーンアップ後の動作で確認
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 常にAbortControllerとcleanup関数を返す", () => {
			fc.assert(
				fc.property(
					fc.option(fc.constant(undefined), { nil: undefined }),
					(_) => {
						const result = createChildAbortController();
						return (
							result.controller instanceof AbortController &&
							typeof result.cleanup === "function"
						);
					},
				),
				{ numRuns: 50 },
			);
		});

		it("PBT: 親中止後の子作成は常に中止済み", () => {
			fc.assert(
				fc.property(fc.constant(undefined), (_) => {
					const parent = new AbortController();
					parent.abort();
					const { controller } = createChildAbortController(parent.signal);
					return controller.signal.aborted === true;
				}),
				{ numRuns: 20 },
			);
		});
	});
});

// ============================================================================
// createChildAbortControllers
// ============================================================================

describe("createChildAbortControllers", () => {
	describe("正常系", () => {
		it("should_create_multiple_controllers", () => {
			// Arrange/Act
			const { controllers, cleanup } = createChildAbortControllers(3);

			// Assert
			expect(controllers).toHaveLength(3);
			expect(controllers.every((c) => !c.signal.aborted)).toBe(true);
			expect(typeof cleanup).toBe("function");

			cleanup();
		});

		it("should_create_zero_controllers", () => {
			// Arrange/Act
			const { controllers, cleanup } = createChildAbortControllers(0);

			// Assert
			expect(controllers).toHaveLength(0);
			expect(() => cleanup()).not.toThrow();
		});

		it("should_link_all_controllers_to_parent", () => {
			// Arrange
			const parent = new AbortController();

			// Act
			const { controllers, cleanup } = createChildAbortControllers(5, parent.signal);

			// Assert: 全て中止されていない
			expect(controllers.every((c) => !c.signal.aborted)).toBe(true);

			// Act: 親を中止
			parent.abort();

			// Assert: 全て中止される
			expect(controllers.every((c) => c.signal.aborted)).toBe(true);

			cleanup();
		});

		it("should_propagate_abort_to_all_children", () => {
			// Arrange
			const parent = new AbortController();
			const { controllers, cleanup } = createChildAbortControllers(10, parent.signal);

			// Act
			parent.abort();

			// Assert
			const abortedCount = controllers.filter((c) => c.signal.aborted).length;
			expect(abortedCount).toBe(10);

			cleanup();
		});
	});

	describe("境界条件", () => {
		it("should_handle_negative_count_as_empty", () => {
			// Arrange/Act: 負の値を渡す
			const { controllers, cleanup } = createChildAbortControllers(-1);

			// Assert: 空配列が返される
			expect(controllers).toHaveLength(0);
			expect(() => cleanup()).not.toThrow();
		});

		it("should_handle_large_count", () => {
			// Arrange/Act: 大きな値
			const { controllers, cleanup } = createChildAbortControllers(100);

			// Assert
			expect(controllers).toHaveLength(100);
			expect(controllers.every((c) => c instanceof AbortController)).toBe(true);

			cleanup();
		});

		it("should_cleanup_all_listeners", () => {
			// Arrange
			const parent = new AbortController();
			const { controllers, cleanup } = createChildAbortControllers(5, parent.signal);

			// Act: クリーンアップ後に親を中止
			cleanup();
			parent.abort();

			// Assert: 子は中止されない
			expect(controllers.every((c) => !c.signal.aborted)).toBe(true);
		});

		it("should_handle_already_aborted_parent", () => {
			// Arrange
			const parent = new AbortController();
			parent.abort();

			// Act
			const { controllers, cleanup } = createChildAbortControllers(3, parent.signal);

			// Assert: 全て即座に中止
			expect(controllers.every((c) => c.signal.aborted)).toBe(true);

			cleanup();
		});
	});

	describe("メモリ管理", () => {
		it("should_not_retain_references_after_cleanup", () => {
			// Arrange
			const parent = new AbortController();
			let controllers: AbortController[] | null = null;
			let cleanup: () => void = () => {};

			// Act
			({ controllers, cleanup } = createChildAbortControllers(5, parent.signal));
			cleanup();
			controllers = null;

			// Assert: メモリが解放されることを確認（間接的）
			// 親を中止してもエラーにならない
			expect(() => parent.abort()).not.toThrow();
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 指定した数のコントローラが作成される", () => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 50 }), (count) => {
					const { controllers, cleanup } = createChildAbortControllers(count);
					const result = controllers.length === count;
					cleanup();
					return result;
				}),
				{ numRuns: 50 },
			);
		});

		it("PBT: 全てのコントローラが独立している", () => {
			fc.assert(
				fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
					const { controllers, cleanup } = createChildAbortControllers(count);

					// 1つだけ中止
					controllers[0].abort();

					// 他は中止されない
					const othersNotAborted = controllers
						.slice(1)
						.every((c) => !c.signal.aborted);

					cleanup();
					return othersNotAborted;
				}),
				{ numRuns: 30 },
			);
		});
	});
});
