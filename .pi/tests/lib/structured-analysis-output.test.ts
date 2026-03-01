/**
 * @file .pi/lib/structured-analysis-output.ts の単体テスト
 * @description LLM構造化出力フォーマットのパーサーと変換関数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	parseAnalysisJson,
	parsePremiseAnalysisJson,
	extractAnalysisJson,
	DEFAULT_ANALYSIS,
	PROMPT_ANALYSIS_FORMAT,
	PROMPT_PREMISE_FORMAT,
	excellencePursuitToLabel,
	meaningfulGrowthToLabel,
	worldCreatedToLabel,
	thinkingModeToLabel,
	type AnalysisJson,
	type PremiseAnalysisJson,
} from "../../lib/structured-analysis-output.js";

describe("DEFAULT_ANALYSIS", () => {
	describe("正常系", () => {
		it("should have all required fields", () => {
			expect(DEFAULT_ANALYSIS.deconstruction).toBeDefined();
			expect(DEFAULT_ANALYSIS.schizoAnalysis).toBeDefined();
			expect(DEFAULT_ANALYSIS.eudaimonia).toBeDefined();
			expect(DEFAULT_ANALYSIS.utopiaDystopia).toBeDefined();
			expect(DEFAULT_ANALYSIS.philosophyOfThought).toBeDefined();
			expect(DEFAULT_ANALYSIS.taxonomy).toBeDefined();
			expect(DEFAULT_ANALYSIS.logic).toBeDefined();
		});

		it("should have valid default eudaimonia values", () => {
			expect(DEFAULT_ANALYSIS.eudaimonia.excellencePursuit).toBe("task_completion");
			expect(DEFAULT_ANALYSIS.eudaimonia.pleasureTrap).toBe(false);
			expect(DEFAULT_ANALYSIS.eudaimonia.meaningfulGrowth).toBe("deepening");
			expect(DEFAULT_ANALYSIS.eudaimonia.stoicAutonomy).toBe(0.5);
		});

		it("should have valid default taxonomy values", () => {
			expect(DEFAULT_ANALYSIS.taxonomy.currentMode).toBe("white");
			expect(DEFAULT_ANALYSIS.taxonomy.recommendedMode).toBe("green");
			expect(DEFAULT_ANALYSIS.taxonomy.missingModes).toEqual([]);
		});
	});
});

describe("parseAnalysisJson", () => {
	describe("正常系", () => {
		it("should parse valid JSON output", () => {
			// Arrange
			const output = `
\`\`\`json
ANALYSIS_JSON: {
	"deconstruction": {
		"binary_oppositions": ["good/bad"],
		"exclusions": ["neutral"]
	},
	"eudaimonia": {
		"excellence_pursuit": "quality",
		"pleasure_trap": true,
		"meaningful_growth": "learning",
		"stoic_autonomy": 0.8
	}
}
\`\`\`
`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toContain("good/bad");
			expect(result.deconstruction.exclusions).toContain("neutral");
			expect(result.eudaimonia.excellencePursuit).toBe("quality");
			expect(result.eudaimonia.pleasureTrap).toBe(true);
			expect(result.eudaimonia.meaningfulGrowth).toBe("learning");
			expect(result.eudaimonia.stoicAutonomy).toBe(0.8);
		});

		it("should parse inline JSON format", () => {
			// Arrange
			const output = `ANALYSIS_JSON: {"deconstruction": {"binary_oppositions": ["test"]}}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toContain("test");
		});

		it("should parse JSON without marker", () => {
			// Arrange
			const output = `{"deconstruction": {"binary_oppositions": ["standalone"]}}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toContain("standalone");
		});

		it("should handle camelCase field names", () => {
			// Arrange
			const output = `{
	"deconstruction": {
		"binaryOppositions": ["camel-case"]
	},
	"schizoAnalysis": {
		"desireProductions": ["desire"]
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toContain("camel-case");
			expect(result.schizoAnalysis.desireProductions).toContain("desire");
		});

		it("should normalize scores to 0-1 range", () => {
			// Arrange
			const output = `{
	"eudaimonia": {
		"stoic_autonomy": 1.5
	},
	"utopia_dystopia": {
		"last_man_tendency": -0.5
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.eudaimonia.stoicAutonomy).toBe(1);
			expect(result.utopiaDystopia.lastManTendency).toBe(0);
		});

		it("should parse boolean string values", () => {
			// Arrange
			const output = `{
	"eudaimonia": {
		"pleasure_trap": "true"
	},
	"philosophy_of_thought": {
		"is_thinking": "yes"
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.eudaimonia.pleasureTrap).toBe(true);
			expect(result.philosophyOfThought.isThinking).toBe(true);
		});
	});

	describe("境界条件", () => {
		it("should return default for invalid JSON", () => {
			// Arrange
			const output = "This is not JSON at all";

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result).toEqual(DEFAULT_ANALYSIS);
		});

		it("should return default for empty string", () => {
			// Arrange
			const output = "";

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result).toEqual(DEFAULT_ANALYSIS);
		});

		it("should handle null in JSON", () => {
			// Arrange
			const output = `{"deconstruction": null}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction).toEqual(DEFAULT_ANALYSIS.deconstruction);
		});

		it("should handle invalid enum values", () => {
			// Arrange
			const output = `{
	"eudaimonia": {
		"excellence_pursuit": "invalid_value"
	},
	"taxonomy": {
		"current_mode": "purple"
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.eudaimonia.excellencePursuit).toBe("task_completion");
			expect(result.taxonomy.currentMode).toBe("white");
		});

		it("should handle array fields with non-string items", () => {
			// Arrange
			const output = `{
	"deconstruction": {
		"binary_oppositions": ["valid", 123, null, {"obj": true}]
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toEqual(["valid"]);
		});

		it("should handle numeric strings for scores", () => {
			// Arrange
			const output = `{
	"eudaimonia": {
		"stoic_autonomy": "0.7"
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.eudaimonia.stoicAutonomy).toBe(0.7);
		});
	});
});

describe("parsePremiseAnalysisJson", () => {
	describe("正常系", () => {
		it("should parse valid premise analysis", () => {
			// Arrange
			const output = `
\`\`\`json
PREMISE_ANALYSIS: {
	"premise_type": {
		"type": "epistemic",
		"confidence": 0.9
	},
	"applicable_methods": ["nietzschean-inversion", "deleuzian-differentiation"]
}
\`\`\`
`;

			// Act
			const result = parsePremiseAnalysisJson(output);

			// Assert
			expect(result.premiseType.type).toBe("epistemic");
			expect(result.premiseType.confidence).toBe(0.9);
			expect(result.applicableMethods).toContain("nietzschean-inversion");
		});

		it("should parse all premise types", () => {
			// Arrange
			const premiseTypes = ["epistemic", "normative", "ontological", "methodological", "contextual", "implicit"];

			for (const type of premiseTypes) {
				const output = `{"premise_type": {"type": "${type}"}}`;

				// Act
				const result = parsePremiseAnalysisJson(output);

				// Assert
				expect(result.premiseType.type).toBe(type);
			}
		});

		it("should handle camelCase field names", () => {
			// Arrange
			const output = `{
	"premiseType": {
		"type": "normative",
		"confidence": 0.75
	},
	"applicableMethods": ["method1"]
}`;

			// Act
			const result = parsePremiseAnalysisJson(output);

			// Assert
			expect(result.premiseType.type).toBe("normative");
			expect(result.applicableMethods).toContain("method1");
		});
	});

	describe("境界条件", () => {
		it("should return default for invalid JSON", () => {
			// Arrange
			const output = "not json";

			// Act
			const result = parsePremiseAnalysisJson(output);

			// Assert
			expect(result.premiseType.type).toBe("implicit");
			expect(result.premiseType.confidence).toBe(0.5);
			expect(result.applicableMethods).toEqual([]);
		});

		it("should handle invalid premise type", () => {
			// Arrange
			const output = `{"premise_type": {"type": "invalid"}}`;

			// Act
			const result = parsePremiseAnalysisJson(output);

			// Assert
			expect(result.premiseType.type).toBe("implicit");
		});

		it("should handle confidence out of range", () => {
			// Arrange
			const output = `{"premise_type": {"confidence": 2.5}}`;

			// Act
			const result = parsePremiseAnalysisJson(output);

			// Assert
			expect(result.premiseType.confidence).toBe(1);
		});
	});
});

describe("extractAnalysisJson", () => {
	describe("正常系", () => {
		it("should extract JSON from code block", () => {
			// Arrange
			const output = `
Some text before
\`\`\`json
ANALYSIS_JSON: {"key": "value"}
\`\`\`
Some text after
`;

			// Act
			const result = extractAnalysisJson(output);

			// Assert
			expect(result).toBe('{"key": "value"}');
		});

		it("should return null when no JSON found", () => {
			// Arrange
			const output = "No JSON here";

			// Act
			const result = extractAnalysisJson(output);

			// Assert
			expect(result).toBeNull();
		});

		it("should extract first JSON object when no marker", () => {
			// Arrange
			const output = 'Text {"first": "json"} more text';

			// Act
			const result = extractAnalysisJson(output);

			// Assert
			expect(result).toBe('{"first": "json"}');
		});
	});
});

describe("PROMPT_FORMAT constants", () => {
	describe("正常系", () => {
		it("should have non-empty PROMPT_ANALYSIS_FORMAT", () => {
			expect(PROMPT_ANALYSIS_FORMAT.length).toBeGreaterThan(0);
			expect(PROMPT_ANALYSIS_FORMAT).toContain("ANALYSIS_JSON");
		});

		it("should have non-empty PROMPT_PREMISE_FORMAT", () => {
			expect(PROMPT_PREMISE_FORMAT.length).toBeGreaterThan(0);
			expect(PROMPT_PREMISE_FORMAT).toContain("PREMISE_ANALYSIS");
		});
	});
});

describe("Label conversion functions", () => {
	describe("excellencePursuitToLabel", () => {
		it("should convert quality to Japanese label", () => {
			expect(excellencePursuitToLabel("quality")).toContain("品質");
		});

		it("should convert efficiency to Japanese label", () => {
			expect(excellencePursuitToLabel("efficiency")).toContain("効率");
		});

		it("should convert task_completion to Japanese label", () => {
			expect(excellencePursuitToLabel("task_completion")).toContain("完了");
		});
	});

	describe("meaningfulGrowthToLabel", () => {
		it("should convert learning to Japanese label", () => {
			expect(meaningfulGrowthToLabel("learning")).toContain("学習");
		});

		it("should convert discovery to Japanese label", () => {
			expect(meaningfulGrowthToLabel("discovery")).toContain("発見");
		});

		it("should convert deepening to Japanese label", () => {
			expect(meaningfulGrowthToLabel("deepening")).toContain("深化");
		});
	});

	describe("worldCreatedToLabel", () => {
		it("should convert automated_efficient to Japanese label", () => {
			expect(worldCreatedToLabel("automated_efficient")).toContain("自動化");
		});

		it("should convert collaborative to Japanese label", () => {
			expect(worldCreatedToLabel("collaborative")).toContain("協調");
		});

		it("should convert task_execution to Japanese label", () => {
			expect(worldCreatedToLabel("task_execution")).toContain("実行");
		});
	});

	describe("thinkingModeToLabel", () => {
		it("should convert white mode to Japanese label", () => {
			expect(thinkingModeToLabel("white")).toContain("事実");
		});

		it("should convert red mode to Japanese label", () => {
			expect(thinkingModeToLabel("red")).toContain("感情");
		});

		it("should convert black mode to Japanese label", () => {
			expect(thinkingModeToLabel("black")).toContain("批判");
		});

		it("should convert yellow mode to Japanese label", () => {
			expect(thinkingModeToLabel("yellow")).toContain("楽観");
		});

		it("should convert green mode to Japanese label", () => {
			expect(thinkingModeToLabel("green")).toContain("創造");
		});

		it("should convert blue mode to Japanese label", () => {
			expect(thinkingModeToLabel("blue")).toContain("プロセス");
		});

		it("should return original value for unknown mode", () => {
			expect(thinkingModeToLabel("unknown")).toBe("unknown");
		});
	});
});

describe("Complex parsing scenarios", () => {
	describe("正常系", () => {
		it("should parse complete analysis JSON", () => {
			// Arrange
			const output = `
\`\`\`json
ANALYSIS_JSON: {
	"deconstruction": {
		"binary_oppositions": ["subject/object", "mind/body"],
		"exclusions": ["neutral states"]
	},
	"schizo_analysis": {
		"desire_productions": ["growth desire"],
		"inner_fascism_signs": ["rigid thinking"]
	},
	"eudaimonia": {
		"excellence_pursuit": "quality",
		"pleasure_trap": false,
		"meaningful_growth": "discovery",
		"stoic_autonomy": 0.75
	},
	"utopia_dystopia": {
		"world_created": "collaborative",
		"totalitarian_risks": ["surveillance"],
		"power_dynamics": ["horizontal"],
		"last_man_tendency": 0.2
	},
	"philosophy_of_thought": {
		"is_thinking": true,
		"metacognition_level": 0.8,
		"autopilot_signs": []
	},
	"taxonomy": {
		"current_mode": "green",
		"recommended_mode": "black",
		"missing_modes": ["red"]
	},
	"logic": {
		"fallacies": ["strawman"],
		"valid_inferences": ["deduction"],
		"invalid_inferences": []
	}
}
\`\`\`
`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toHaveLength(2);
			expect(result.schizoAnalysis.desireProductions).toContain("growth desire");
			expect(result.eudaimonia.excellencePursuit).toBe("quality");
			expect(result.utopiaDystopia.worldCreated).toBe("collaborative");
			expect(result.philosophyOfThought.isThinking).toBe(true);
			expect(result.taxonomy.currentMode).toBe("green");
			expect(result.logic.fallacies).toContain("strawman");
		});

		it("should handle partial JSON with defaults", () => {
			// Arrange
			const output = `{
	"deconstruction": {
		"binary_oppositions": ["only-this"]
	}
}`;

			// Act
			const result = parseAnalysisJson(output);

			// Assert
			expect(result.deconstruction.binaryOppositions).toContain("only-this");
			expect(result.eudaimonia).toEqual(DEFAULT_ANALYSIS.eudaimonia);
			expect(result.logic).toEqual(DEFAULT_ANALYSIS.logic);
		});
	});
});
