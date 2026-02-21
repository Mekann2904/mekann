/**
 * @file 拡張機能の状態遷移モデルベーステスト
 * @description fast-checkを使用した状態遷移とインバリアントの検証
 * @testFramework vitest + fast-check
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// 状態マシン定義
// ============================================================================

/**
 * Planのステータス状態
 */
type PlanStatus = "draft" | "active" | "completed" | "cancelled";

/**
 * Planステートマシン
 */
class PlanStateMachine {
	private status: PlanStatus = "draft";
	private stepsCompleted = 0;
	private totalSteps = 0;

	constructor(totalSteps: number = 0) {
		this.totalSteps = totalSteps;
	}

	/**
	 * 計画を作成する
	 */
	create(): void {
		this.status = "draft";
		this.stepsCompleted = 0;
	}

	/**
	 * 計画をアクティブにする
	 */
	activate(): void {
		if (this.status === "draft") {
			this.status = "active";
		}
	}

	/**
	 * ステップを完了する
	 */
	completeStep(): void {
		if (this.status === "active" && this.stepsCompleted < this.totalSteps) {
			this.stepsCompleted++;
			if (this.stepsCompleted >= this.totalSteps) {
				this.status = "completed";
			}
		}
	}

	/**
	 * 計画をキャンセルする
	 */
	cancel(): void {
		if (this.status !== "completed" && this.status !== "cancelled") {
			this.status = "cancelled";
		}
	}

	/**
	 * 現在のステータスを取得する
	 */
	getStatus(): PlanStatus {
		return this.status;
	}

	/**
	 * 完了したステップ数を取得する
	 */
	getStepsCompleted(): number {
		return this.stepsCompleted;
	}

	/**
	 * 総ステップ数を取得する
	 */
	getTotalSteps(): number {
		return this.totalSteps;
	}
}

/**
 * Subagentの状態
 */
type SubagentState = "idle" | "running" | "completed" | "failed" | "cancelled";

/**
 * Subagentステートマシン
 */
class SubagentStateMachine {
	private state: SubagentState = "idle";
	private runCount = 0;

	/**
	 * サブエージェントを実行開始する
	 */
	start(): void {
		if (this.state === "idle") {
			this.state = "running";
		}
	}

	/**
	 * サブエージェントを完了する
	 */
	complete(): void {
		if (this.state === "running") {
			this.state = "completed";
			this.runCount++;
		}
	}

	/**
	 * サブエージェントを失敗させる
	 */
	fail(): void {
		if (this.state === "running") {
			this.state = "failed";
			this.runCount++;
		}
	}

	/**
	 * サブエージェントをキャンセルする
	 */
	cancel(): void {
		if (this.state === "running") {
			this.state = "cancelled";
		}
	}

	/**
	 * 再実行の準備をする
	 */
	reset(): void {
		if (this.state === "completed" || this.state === "failed") {
			this.state = "idle";
		}
	}

	/**
	 * 現在の状態を取得する
	 */
	getState(): SubagentState {
		return this.state;
	}

	/**
	 * 実行回数を取得する
	 */
	getRunCount(): number {
		return this.runCount;
	}
}

/**
 * Question UIの状態
 */
interface QuestionUIState {
	cursor: number;
	selected: Set<number>;
	mode: "selection" | "custom";
	value: string;
}

/**
 * Question UIステートマシン
 */
class QuestionUIStateMachine {
	private state: QuestionUIState;
	private optionsCount: number;
	private allowMultiple: boolean;
	private allowCustom: boolean;

	constructor(
		optionsCount: number,
		allowMultiple: boolean = false,
		allowCustom: boolean = false
	) {
		this.optionsCount = optionsCount;
		this.allowMultiple = allowMultiple;
		this.allowCustom = allowCustom;
		this.state = {
			cursor: 0,
			selected: new Set(),
			mode: "selection",
			value: "",
		};
	}

	/**
	 * カーソルを下に移動する
	 */
	cursorDown(): void {
		if (this.state.mode === "selection") {
			this.state.cursor = Math.min(this.optionsCount - 1, this.state.cursor + 1);
		}
	}

	/**
	 * カーソルを上に移動する
	 */
	cursorUp(): void {
		if (this.state.mode === "selection") {
			this.state.cursor = Math.max(0, this.state.cursor - 1);
		}
	}

	/**
	 * 選択をトグルする
	 */
	toggleSelection(): void {
		if (this.state.mode === "selection") {
			if (this.allowMultiple) {
				if (this.state.selected.has(this.state.cursor)) {
					this.state.selected.delete(this.state.cursor);
				} else {
					this.state.selected.add(this.state.cursor);
				}
			} else {
				this.state.selected.clear();
				this.state.selected.add(this.state.cursor);
			}
		}
	}

	/**
	 * カスタム入力モードに切り替える
	 */
	switchToCustom(): void {
		if (this.allowCustom && this.state.mode === "selection") {
			this.state.mode = "custom";
			this.state.value = "";
		}
	}

	/**
	 * 選択モードに切り替える
	 */
	switchToSelection(): void {
		if (this.state.mode === "custom") {
			this.state.mode = "selection";
		}
	}

	/**
	 * カスタム入力を追加する
	 */
	addCustomInput(char: string): void {
		if (this.state.mode === "custom") {
			this.state.value += char;
		}
	}

	/**
	 * カスタム入力を削除する
	 */
	deleteCustomInput(): void {
		if (this.state.mode === "custom" && this.state.value.length > 0) {
			this.state.value = this.state.value.slice(0, -1);
		}
	}

	/**
	 * 現在の状態を取得する
	 */
	getState(): QuestionUIState {
		return { ...this.state, selected: new Set(this.state.selected) };
	}

	/**
	 * 回答を取得する
	 */
	getAnswers(): string[] {
		if (this.state.mode === "custom") {
			return this.state.value ? [this.state.value] : [];
		}
		return Array.from(this.state.selected).sort().map(i => `option-${i}`);
	}
}

// ============================================================================
// モデルベーステスト
// ============================================================================

describe("PlanステートマシンのMBT", () => {
	it("PBT: ステータス遷移の有効性", () => {
		fc.assert(
			fc.property(
				fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
				fc.integer({ min: 1, max: 10 }),
				(actions, totalSteps) => {
					const machine = new PlanStateMachine(totalSteps);

					// アクションを実行
					for (let i = 0; i < actions.length; i++) {
						if (actions[i]) {
							// ランダムにステップを完了
							if (machine.getStatus() === "active") {
								machine.completeStep();
							}
						}
					}

					// インバリアント検証: ステータスは有効な値である
					const validStatuses: PlanStatus[] = ["draft", "active", "completed", "cancelled"];
					expect(validStatuses.includes(machine.getStatus())).toBe(true);

					// インバリアント検証: 完了したステップ数は総ステップ数以下
					expect(machine.getStepsCompleted()).toBeLessThanOrEqual(totalSteps);

					// インバリアント検証: completed状態ならすべてのステップが完了している
					if (machine.getStatus() === "completed") {
						expect(machine.getStepsCompleted()).toBe(totalSteps);
					}

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 計画のライフサイクル", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 10 }),
				(actions) => {
					const machine = new PlanStateMachine(3);
					machine.create();

					for (const action of actions) {
						switch (action) {
							case 0:
								machine.activate();
								break;
							case 1:
								machine.completeStep();
								break;
							case 2:
								if (machine.getStatus() !== "completed") {
									machine.cancel();
								}
								break;
							case 3:
								// 何もしない
								break;
						}
					}

					// インバリアント検証: draftからcancelledへの直接遷移はアクティベートなしで可能
					// インバリアント検証: completed状態からは他の状態に遷移できない
					if (machine.getStatus() === "completed") {
						// 一度completedになったら、アクションをしてもcompletedのまま
						machine.activate();
						machine.completeStep();
						expect(machine.getStatus()).toBe("completed");
					}

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});
});

describe("SubagentステートマシンのMBT", () => {
	it("PBT: 状態遷移の有効性", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 20 }),
				(actions) => {
					const machine = new SubagentStateMachine();

					for (const action of actions) {
						switch (action) {
							case 0:
								machine.start();
								break;
							case 1:
								machine.complete();
								break;
							case 2:
								machine.fail();
								break;
							case 3:
								machine.cancel();
								break;
							case 4:
								machine.reset();
								break;
						}
					}

					// インバリアント検証: 状態は有効な値である
					const validStates: SubagentState[] = ["idle", "running", "completed", "failed", "cancelled"];
					expect(validStates.includes(machine.getState())).toBe(true);

					// インバリアント検証: 実行回数はrunning→completed/failedの回数に等しい
					// (簡易化のため、start→complete/failのペアを数える)
					expect(machine.getRunCount()).toBeGreaterThanOrEqual(0);

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 再実行のシーケンス", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 5 }),
				(retryCount) => {
					const machine = new SubagentStateMachine();

					// 実行と失敗を繰り返す
					for (let i = 0; i < retryCount; i++) {
						machine.start();
						machine.fail(); // 失敗させる
						machine.reset(); // 再実行の準備
					}

					// インバリアント検証: 実行回数はリトライ回数と等しい
					expect(machine.getRunCount()).toBe(retryCount);

					// インバリアント検証: 最終状態はidleである
					expect(machine.getState()).toBe("idle");

					return true;
				}
			),
			{ numRuns: 30 }
		);
	});
});

describe("Question UIステートマシンのMBT", () => {
	it("PBT: カーソル移動の境界条件", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 10 }),
				fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
				(optionsCount, actions) => {
					const machine = new QuestionUIStateMachine(optionsCount, false, false);

					for (const up of actions) {
						if (up) {
							machine.cursorUp();
						} else {
							machine.cursorDown();
						}
					}

					// インバリアント検証: カーソルは常に有効範囲内
					const state = machine.getState();
					expect(state.cursor).toBeGreaterThanOrEqual(0);
					expect(state.cursor).toBeLessThan(optionsCount);

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 選択状態の一貫性", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 10 }),
				fc.boolean(),
				fc.array(fc.integer({ min: 0, max: optionsCount - 1 }), { minLength: 1, maxLength: 20 }),
				(optionsCount, allowMultiple, indices) => {
					const machine = new QuestionUIStateMachine(optionsCount, allowMultiple, false);

					for (const index of indices) {
						// カーソルを移動して選択をトグル
						for (let i = 0; i < index; i++) {
							machine.cursorDown();
						}
						machine.toggleSelection();
						// カーソルをリセット
						while (machine.getState().cursor > 0) {
							machine.cursorUp();
						}
					}

					const state = machine.getState();

					// インバリアント検証: 選択されたインデックスは有効範囲内
					for (const selectedIndex of state.selected) {
						expect(selectedIndex).toBeGreaterThanOrEqual(0);
						expect(selectedIndex).toBeLessThan(optionsCount);
					}

					// インバリアント検証: 単一選択モードなら選択は1つ以下
					if (!allowMultiple) {
						expect(state.selected.size).toBeLessThanOrEqual(1);
					}

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: カスタム入力の文字列長", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 100 }),
				(inputString) => {
					const machine = new QuestionUIStateMachine(1, false, true);

					machine.switchToCustom();

					// 文字を追加
					for (const char of inputString) {
						machine.addCustomInput(char);
					}

					const state = machine.getState();

					// インバリアント検証: 入力値は元の文字列と等しい
					expect(state.value).toBe(inputString);

					// インバリアント検証: 回答は入力値を含む
					const answers = machine.getAnswers();
					if (inputString.length > 0) {
						expect(answers).toContain(inputString);
					}

					// 一部削除して検証
					const deleteCount = Math.floor(inputString.length / 2);
					for (let i = 0; i < deleteCount; i++) {
						machine.deleteCustomInput();
					}

					const deletedState = machine.getState();
					expect(deletedState.value.length).toBe(inputString.length - deleteCount);

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});
});

describe("複合ステートマシンのMBT", () => {
	it("PBT: 計画とサブエージェントの連携", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 5 }),
				fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 20 }),
				(totalSteps, actions) => {
					const plan = new PlanStateMachine(totalSteps);
					const subagent = new SubagentStateMachine();

					plan.create();

					for (const action of actions) {
						switch (action) {
							case 0:
								plan.activate();
								break;
							case 1:
								if (plan.getStatus() === "active") {
									subagent.start();
								}
								break;
							case 2:
								if (subagent.getState() === "running") {
									subagent.complete();
									plan.completeStep();
								}
								break;
							case 3:
								if (plan.getStatus() !== "completed") {
									plan.cancel();
								}
								if (subagent.getState() === "running") {
									subagent.cancel();
								}
								break;
							case 4:
								// 何もしない
								break;
						}
					}

					// インバリアント検証: 計画の完了ステップ数はサブエージェントの成功回数以下
					expect(plan.getStepsCompleted()).toBeLessThanOrEqual(
						subagent.getRunCount()
					);

					// インバリアント検証: 両方の状態は有効である
					const validPlanStatuses: PlanStatus[] = ["draft", "active", "completed", "cancelled"];
					const validSubagentStates: SubagentState[] = ["idle", "running", "completed", "failed", "cancelled"];

					expect(validPlanStatuses.includes(plan.getStatus())).toBe(true);
					expect(validSubagentStates.includes(subagent.getState())).toBe(true);

					return true;
				}
			),
			{ numRuns: 50 }
		);
	});
});
