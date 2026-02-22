/**
 * @abdd.meta
 * @path tests/unit/lib/thinking-modes.test.ts
 * @role 思考モードのテスト
 * @why システムが正しく動作することを保証する
 * @related lib/thinking-modes.ts
 * @public_api なし（テストファイル）
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	ThinkingModeSelector,
	getThinkingModeSelector,
	THINKING_MODES,
	buildModeSwitchPrompt,
	type ThinkingModeType,
} from "../../../.pi/lib/thinking-modes";

describe("ThinkingModeSelector", () => {
	let selector: ThinkingModeSelector;

	beforeEach(() => {
		selector = new ThinkingModeSelector();
	});

	describe("初期化", () => {
		it("デフォルトは実践モード", () => {
			const mode = selector.getCurrentMode();
			expect(mode.type).toBe("practical");
		});

		it("すべての思考モードを取得できる", () => {
			const modes = selector.getAllModes();
			expect(modes.length).toBe(6);
			expect(modes.map((m) => m.type)).toContain("intuitive");
			expect(modes.map((m) => m.type)).toContain("analytical");
			expect(modes.map((m) => m.type)).toContain("creative");
			expect(modes.map((m) => m.type)).toContain("critical");
			expect(modes.map((m) => m.type)).toContain("practical");
			expect(modes.map((m) => m.type)).toContain("metacognitive");
		});
	});

	describe("モードの切替", () => {
		it("思考モードを切り替えることができる", () => {
			selector.switchMode("analytical");
			expect(selector.getCurrentMode().type).toBe("analytical");
		});

		it("切替理由を記録できる", () => {
			selector.switchMode("creative", "新しいアイデアが必要");
			const state = selector.getState();
			expect(state.switchReasons.length).toBe(1);
			expect(state.switchReasons[0].reason).toBe("新しいアイデアが必要");
		});

		it("履歴が記録される", () => {
			selector.switchMode("analytical");
			selector.switchMode("creative");
			selector.switchMode("critical");

			const state = selector.getState();
			expect(state.previousModes.length).toBe(3);
			expect(state.previousModes[0]).toBe("practical");
			expect(state.previousModes[1]).toBe("analytical");
			expect(state.previousModes[2]).toBe("creative");
		});

		it("履歴は最大10件", () => {
			for (let i = 0; i < 15; i++) {
				selector.switchMode("analytical");
				selector.switchMode("creative");
			}

			const state = selector.getState();
			expect(state.previousModes.length).toBe(10);
		});
	});

	describe("モードの提案", () => {
		it("分析タスクには分析モードを提案", () => {
			const suggestions = selector.suggestModesForTask("この問題を分析してください");
			expect(suggestions.some((m) => m.type === "analytical")).toBe(true);
		});

		it("創造タスクには創造モードを提案", () => {
			const suggestions = selector.suggestModesForTask("新しいアイデアを出してください");
			expect(suggestions.some((m) => m.type === "creative")).toBe(true);
		});

		it("批判タスクには批判モードを提案", () => {
			const suggestions = selector.suggestModesForTask("この仮説を批判的に検証してください");
			expect(suggestions.some((m) => m.type === "critical")).toBe(true);
		});

		it("実装タスクには実践モードを提案", () => {
			const suggestions = selector.suggestModesForTask("この機能を実装してください");
			expect(suggestions.some((m) => m.type === "practical")).toBe(true);
		});

		it("探求タスクにはメタ認知モードを提案", () => {
			const suggestions = selector.suggestModesForTask("この問いを深く探求してください");
			expect(suggestions.some((m) => m.type === "metacognitive")).toBe(true);
		});

		it("マッチしない場合は実践モードをデフォルト", () => {
			const suggestions = selector.suggestModesForTask("何かしてください");
			expect(suggestions.some((m) => m.type === "practical")).toBe(true);
		});
	});

	describe("現在のモードの罠", () => {
		it("現在のモードの罠を取得できる", () => {
			selector.switchMode("analytical");
			const traps = selector.getCurrentModeTraps();
			expect(traps.length).toBeGreaterThan(0);
			expect(traps).toContain("分析麻痺（決定を先延ばしにする）");
		});
	});

	describe("メタ認知モード", () => {
		it("メタ認知モードに切り替えることができる", () => {
			selector.enterMetacognitiveMode("思考の観察");
			expect(selector.getCurrentMode().type).toBe("metacognitive");
		});
	});

	describe("統計", () => {
		it("使用統計を取得できる", () => {
			selector.switchMode("analytical");
			selector.switchMode("creative");
			selector.switchMode("analytical");

			const stats = selector.getUsageStatistics();
			expect(stats.totalSwitches).toBe(3);
			expect(stats.modeDistribution.analytical).toBe(2);
			expect(stats.modeDistribution.creative).toBe(1);
		});
	});
});

describe("THINKING_MODES", () => {
	it("すべてのモードに必要なプロパティがある", () => {
		const requiredProps = [
			"type",
			"name",
			"description",
			"suitableFor",
			"notSuitableFor",
			"traps",
			"relatedHats",
			"bloomLevel",
			"systemType",
		];

		for (const [key, mode] of Object.entries(THINKING_MODES)) {
			for (const prop of requiredProps) {
				expect(mode).toHaveProperty(prop);
			}
		}
	});

	it("直観モードはシステム1", () => {
		expect(THINKING_MODES.intuitive.systemType).toBe(1);
	});

	it("分析モードはシステム2", () => {
		expect(THINKING_MODES.analytical.systemType).toBe(2);
	});

	it("創造モードは両方", () => {
		expect(THINKING_MODES.creative.systemType).toBe("both");
	});
});

describe("buildModeSwitchPrompt", () => {
	it("モード切替のプロンプトを生成できる", () => {
		const prompt = buildModeSwitchPrompt("practical", "analytical");

		expect(prompt).toContain("実践モード");
		expect(prompt).toContain("分析モード");
		expect(prompt).toContain("このモードが適している状況");
		expect(prompt).toContain("このモードの「罠」");
	});

	it("「どの思考モードも正しいものではない」ことが含まれる", () => {
		const prompt = buildModeSwitchPrompt("practical", "creative");

		expect(prompt).toContain("どの思考モードも「正しい」ものではありません");
	});
});

describe("シングルトン", () => {
	it("シングルトンインスタンスを取得できる", () => {
		const selector1 = getThinkingModeSelector();
		const selector2 = getThinkingModeSelector();

		expect(selector1).toBe(selector2);
	});
});
