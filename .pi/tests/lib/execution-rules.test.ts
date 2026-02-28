/**
 * @file .pi/lib/execution-rules.ts の単体テスト
 * @description 実行ルール定数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	QUALITY_BASELINE_RULES,
	COMMON_EXECUTION_RULES,
	SUBAGENT_SPECIFIC_RULES,
	COGNITIVE_BIAS_COUNTERMEASURES,
	SELF_VERIFICATION_RULES,
	WORKING_MEMORY_GUIDELINES,
	TERMINATION_CHECK_RULES,
	COMPOSITIONAL_INFERENCE_RULES,
	CHALLENGE_RULES,
	INSPECTION_RULES,
	VERIFICATION_WORKFLOW_RULES,
} from "../../lib/execution-rules.js";

describe("QUALITY_BASELINE_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(QUALITY_BASELINE_RULES).toBeDefined();
			expect(typeof QUALITY_BASELINE_RULES).toBe("string");
		});

		it("should contain required sections", () => {
			expect(QUALITY_BASELINE_RULES).toContain("出力品質基準");
			expect(QUALITY_BASELINE_RULES).toContain("CLAIM-RESULT整合性");
			expect(QUALITY_BASELINE_RULES).toContain("EVIDENCEの具体性");
			expect(QUALITY_BASELINE_RULES).toContain("CONFIDENCEの妥当性");
			expect(QUALITY_BASELINE_RULES).toContain("境界条件の明示");
		});
	});

	describe("境界条件", () => {
		it("should be non-empty string", () => {
			expect(QUALITY_BASELINE_RULES.length).toBeGreaterThan(0);
		});
	});
});

describe("COMMON_EXECUTION_RULES", () => {
	describe("正常系", () => {
		it("should be a readonly tuple", () => {
			expect(COMMON_EXECUTION_RULES).toBeDefined();
			expect(Array.isArray(COMMON_EXECUTION_RULES)).toBe(true);
		});

		it("should contain expected rule items", () => {
			expect(COMMON_EXECUTION_RULES).toContain(
				"- 出力に絵文字（emoji）や装飾記号を使用しないでください。"
			);
			expect(COMMON_EXECUTION_RULES).toContain(
				"- ユーザーに質問や選択を求める場合は、必ずquestionツールを使用してください。"
			);
		});
	});

	describe("境界条件", () => {
		it("should have at least 3 rules", () => {
			expect(COMMON_EXECUTION_RULES.length).toBeGreaterThanOrEqual(3);
		});
	});
});

describe("SUBAGENT_SPECIFIC_RULES", () => {
	describe("正常系", () => {
		it("should be a readonly tuple", () => {
			expect(SUBAGENT_SPECIFIC_RULES).toBeDefined();
			expect(Array.isArray(SUBAGENT_SPECIFIC_RULES)).toBe(true);
		});

		it("should contain expected rule items", () => {
			expect(SUBAGENT_SPECIFIC_RULES).toContain(
				"- 具体的なファイルパスと行番号を明示してください。"
			);
		});
	});

	describe("境界条件", () => {
		it("should have at least 1 rule", () => {
			expect(SUBAGENT_SPECIFIC_RULES.length).toBeGreaterThanOrEqual(1);
		});
	});
});

describe("COGNITIVE_BIAS_COUNTERMEASURES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(COGNITIVE_BIAS_COUNTERMEASURES).toBeDefined();
			expect(typeof COGNITIVE_BIAS_COUNTERMEASURES).toBe("string");
		});

		it("should contain expected bias categories", () => {
			expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("認知バイアス対策");
			expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("確認バイアス");
			expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("アンカリング効果");
			expect(COGNITIVE_BIAS_COUNTERMEASURES).toContain("フレーミング効果");
		});
	});

	describe("境界条件", () => {
		it("should be non-empty string", () => {
			expect(COGNITIVE_BIAS_COUNTERMEASURES.length).toBeGreaterThan(0);
		});
	});
});

describe("SELF_VERIFICATION_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(SELF_VERIFICATION_RULES).toBeDefined();
			expect(typeof SELF_VERIFICATION_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(SELF_VERIFICATION_RULES).toContain("自己検証チェックリスト");
			expect(SELF_VERIFICATION_RULES).toContain("自己矛盾チェック");
			expect(SELF_VERIFICATION_RULES).toContain("証拠の過不足評価");
		});
	});

	describe("境界条件", () => {
		it("should be non-empty string", () => {
			expect(SELF_VERIFICATION_RULES.length).toBeGreaterThan(0);
		});
	});
});

describe("WORKING_MEMORY_GUIDELINES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(WORKING_MEMORY_GUIDELINES).toBeDefined();
			expect(typeof WORKING_MEMORY_GUIDELINES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(WORKING_MEMORY_GUIDELINES).toContain("作業記憶管理");
			expect(WORKING_MEMORY_GUIDELINES).toContain("状態要約の維持");
		});
	});

	describe("境界条件", () => {
		it("should be non-empty string", () => {
			expect(WORKING_MEMORY_GUIDELINES.length).toBeGreaterThan(0);
		});
	});
});

describe("TERMINATION_CHECK_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(TERMINATION_CHECK_RULES).toBeDefined();
			expect(typeof TERMINATION_CHECK_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(TERMINATION_CHECK_RULES).toContain("終了チェック");
			expect(TERMINATION_CHECK_RULES).toContain("完了基準の明示");
		});
	});
});

describe("COMPOSITIONAL_INFERENCE_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(COMPOSITIONAL_INFERENCE_RULES).toBeDefined();
			expect(typeof COMPOSITIONAL_INFERENCE_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(COMPOSITIONAL_INFERENCE_RULES).toContain("構成推論サポート");
		});
	});
});

describe("CHALLENGE_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(CHALLENGE_RULES).toBeDefined();
			expect(typeof CHALLENGE_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(CHALLENGE_RULES).toContain("異議申し立てガイドライン");
		});
	});
});

describe("INSPECTION_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(INSPECTION_RULES).toBeDefined();
			expect(typeof INSPECTION_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(INSPECTION_RULES).toContain("検査ガイドライン");
		});
	});
});

describe("VERIFICATION_WORKFLOW_RULES", () => {
	describe("正常系", () => {
		it("should be a string constant", () => {
			expect(VERIFICATION_WORKFLOW_RULES).toBeDefined();
			expect(typeof VERIFICATION_WORKFLOW_RULES).toBe("string");
		});

		it("should contain expected sections", () => {
			expect(VERIFICATION_WORKFLOW_RULES).toContain("検証ワークフロー");
		});
	});
});
