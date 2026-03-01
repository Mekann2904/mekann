/**
 * @file .pi/lib/thinking-process.ts の単体テスト
 * @description 思考プロセスの状態管理と段階的進行のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	selectThinkingMode,
	advancePhase,
	thinkDeeper,
	getThinkingModeDescription,
	getThinkingPhaseDescription,
	createThinkingContext,
	addThinkingStep,
	switchThinkingMode,
	analyzeConfidenceTrend,
	getAllThinkingModes,
	getAllThinkingPhases,
	getModePhaseCompatibility,
	type ThinkingMode,
	type ThinkingPhase,
	type ThinkingContext,
	type ThinkingStep,
} from "../../lib/thinking-process.js";

describe("selectThinkingMode", () => {
	describe("正常系", () => {
		it("should select creative mode for problem-discovery phase", () => {
			// Arrange
			const context: Partial<ThinkingContext> = {
				phase: "problem-discovery",
			};

			// Act
			const mode = selectThinkingMode(context);

			// Assert
			expect(mode).toBe("creative");
		});

		it("should select analytical mode for problem-formulation phase", () => {
			// Arrange
			const context: Partial<ThinkingContext> = {
				phase: "problem-formulation",
			};

			// Act
			const mode = selectThinkingMode(context);

			// Assert
			expect(mode).toBe("analytical");
		});

		it("should select practical mode for strategy-development phase", () => {
			// Arrange
			const context: Partial<ThinkingContext> = {
				phase: "strategy-development",
			};

			// Act
			const mode = selectThinkingMode(context);

			// Assert
			expect(mode).toBe("practical");
		});

		it("should select critical mode for solution-evaluation phase", () => {
			// Arrange
			const context: Partial<ThinkingContext> = {
				phase: "solution-evaluation",
			};

			// Act
			const mode = selectThinkingMode(context);

			// Assert
			expect(mode).toBe("critical");
		});

		it("should select mode based on task keywords", () => {
			// Arrange & Act & Assert
			expect(selectThinkingMode({ task: "新規設計を行う" })).toBe("creative");
			expect(selectThinkingMode({ task: "データ分析を実施" })).toBe("analytical");
			expect(selectThinkingMode({ task: "コードレビュー" })).toBe("critical");
			expect(selectThinkingMode({ task: "機能を実装" })).toBe("practical");
			expect(selectThinkingMode({ task: "合意形成を図る" })).toBe("social");
			expect(selectThinkingMode({ task: "倫理的配慮" })).toBe("emotional");
		});

		it("should return analytical as default", () => {
			// Arrange
			const context: Partial<ThinkingContext> = {};

			// Act
			const mode = selectThinkingMode(context);

			// Assert
			expect(mode).toBe("analytical");
		});
	});

	describe("履歴ベースの選択", () => {
		it("should select least used mode based on history", () => {
			// Arrange
			const history: ThinkingStep[] = [
				{ mode: "creative", phase: "problem-discovery", thought: "t1", confidence: 0.5, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t2", confidence: 0.6, timestamp: new Date() },
				{ mode: "analytical", phase: "problem-discovery", thought: "t3", confidence: 0.7, timestamp: new Date() },
			];
			const context: Partial<ThinkingContext> = { history };

			// Act
			const mode = selectThinkingMode(context);

			// Assert - Should select a mode other than creative (used twice)
			expect(mode).not.toBe("creative");
		});
	});
});

describe("advancePhase", () => {
	describe("正常系", () => {
		it("should advance from problem-discovery to problem-formulation", () => {
			expect(advancePhase("problem-discovery")).toBe("problem-formulation");
		});

		it("should advance from problem-formulation to strategy-development", () => {
			expect(advancePhase("problem-formulation")).toBe("strategy-development");
		});

		it("should advance from strategy-development to solution-evaluation", () => {
			expect(advancePhase("strategy-development")).toBe("solution-evaluation");
		});

		it("should stay at solution-evaluation (final phase)", () => {
			expect(advancePhase("solution-evaluation")).toBe("solution-evaluation");
		});
	});
});

describe("thinkDeeper", () => {
	describe("正常系", () => {
		it("should return array of thinking steps", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "Initial analysis";

			// Act
			const steps = thinkDeeper(initialThought, context);

			// Assert
			expect(Array.isArray(steps)).toBe(true);
			expect(steps.length).toBeGreaterThan(0);
		});

		it("should respect targetDepth option", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "Initial thought";

			// Act
			const steps = thinkDeeper(initialThought, context, { targetDepth: 2 });

			// Assert
			expect(steps.length).toBe(2);
		});

		it("should limit depth to 5", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "Initial thought";

			// Act
			const steps = thinkDeeper(initialThought, context, { targetDepth: 10 });

			// Assert
			expect(steps.length).toBeLessThanOrEqual(5);
		});

		it("should respect maxIterations option", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "Initial thought";

			// Act
			const steps = thinkDeeper(initialThought, context, {
				targetDepth: 5,
				maxIterations: 2,
			});

			// Assert
			expect(steps.length).toBeLessThanOrEqual(2);
		});

		it("should switch mode on stagnation when enabled", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "A"; // Very short to trigger stagnation

			// Act
			const steps = thinkDeeper(initialThought, context, {
				targetDepth: 3,
				enableModeSwitch: true,
				stagnationThreshold: 0.5,
			});

			// Assert
			expect(steps.length).toBeGreaterThan(0);
			// Mode may switch during deep thinking
		});

		it("should not switch mode when disabled", () => {
			// Arrange
			const initialMode: ThinkingMode = "critical";
			const context = createThinkingContext("Test task", { mode: initialMode });
			const initialThought = "Initial thought";

			// Act
			const steps = thinkDeeper(initialThought, context, {
				targetDepth: 2,
				enableModeSwitch: false,
			});

			// Assert
			expect(steps.every((s) => s.mode === initialMode)).toBe(true);
		});

		it("should produce steps with correct structure", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const initialThought = "Initial thought";

			// Act
			const steps = thinkDeeper(initialThought, context, { targetDepth: 1 });

			// Assert
			const step = steps[0];
			expect(step.mode).toBeDefined();
			expect(step.phase).toBeDefined();
			expect(step.thought).toBeDefined();
			expect(step.confidence).toBeGreaterThanOrEqual(0);
			expect(step.confidence).toBeLessThanOrEqual(1);
			expect(step.timestamp).toBeInstanceOf(Date);
		});
	});
});

describe("getThinkingModeDescription", () => {
	describe("正常系", () => {
		it("should return description for creative mode", () => {
			const desc = getThinkingModeDescription("creative");
			expect(typeof desc).toBe("string");
			expect(desc.length).toBeGreaterThan(0);
		});

		it("should return description for all modes", () => {
			const modes: ThinkingMode[] = ["creative", "analytical", "critical", "practical", "social", "emotional"];

			for (const mode of modes) {
				expect(getThinkingModeDescription(mode).length).toBeGreaterThan(0);
			}
		});
	});
});

describe("getThinkingPhaseDescription", () => {
	describe("正常系", () => {
		it("should return description for problem-discovery phase", () => {
			const desc = getThinkingPhaseDescription("problem-discovery");
			expect(typeof desc).toBe("string");
			expect(desc.length).toBeGreaterThan(0);
		});

		it("should return description for all phases", () => {
			const phases: ThinkingPhase[] = ["problem-discovery", "problem-formulation", "strategy-development", "solution-evaluation"];

			for (const phase of phases) {
				expect(getThinkingPhaseDescription(phase).length).toBeGreaterThan(0);
			}
		});
	});
});

describe("createThinkingContext", () => {
	describe("正常系", () => {
		it("should create context with required fields", () => {
			// Arrange & Act
			const context = createThinkingContext("Test task");

			// Assert
			expect(context.task).toBe("Test task");
			expect(context.phase).toBe("problem-discovery");
			expect(context.currentMode).toBeDefined();
			expect(context.history).toEqual([]);
			expect(context.constraints).toEqual([]);
		});

		it("should accept custom phase", () => {
			// Arrange & Act
			const context = createThinkingContext("Test task", { phase: "solution-evaluation" });

			// Assert
			expect(context.phase).toBe("solution-evaluation");
		});

		it("should accept custom mode", () => {
			// Arrange & Act
			const context = createThinkingContext("Test task", { mode: "emotional" });

			// Assert
			expect(context.currentMode).toBe("emotional");
		});

		it("should accept constraints", () => {
			// Arrange & Act
			const context = createThinkingContext("Test task", {
				constraints: ["constraint1", "constraint2"],
			});

			// Assert
			expect(context.constraints).toHaveLength(2);
			expect(context.constraints).toContain("constraint1");
		});

		it("should select mode based on phase when mode not specified", () => {
			// Arrange & Act
			const context = createThinkingContext("Test task", { phase: "strategy-development" });

			// Assert
			expect(context.currentMode).toBe("practical");
		});
	});
});

describe("addThinkingStep", () => {
	describe("正常系", () => {
		it("should add step to history", () => {
			// Arrange
			const context = createThinkingContext("Test task");
			const thought = "New thinking step";

			// Act
			const updatedContext = addThinkingStep(context, thought);

			// Assert
			expect(updatedContext.history.length).toBe(1);
			expect(updatedContext.history[0].thought).toBe(thought);
		});

		it("should preserve existing history", () => {
			// Arrange
			let context = createThinkingContext("Test task");
			context = addThinkingStep(context, "First thought");
			context = addThinkingStep(context, "Second thought");

			// Act
			const updatedContext = addThinkingStep(context, "Third thought");

			// Assert
			expect(updatedContext.history.length).toBe(3);
		});

		it("should use default confidence when not specified", () => {
			// Arrange
			const context = createThinkingContext("Test task");

			// Act
			const updatedContext = addThinkingStep(context, "Thought");

			// Assert
			expect(updatedContext.history[0].confidence).toBe(0.5);
		});

		it("should accept custom confidence", () => {
			// Arrange
			const context = createThinkingContext("Test task");

			// Act
			const updatedContext = addThinkingStep(context, "Thought", 0.8);

			// Assert
			expect(updatedContext.history[0].confidence).toBe(0.8);
		});

		it("should clamp confidence to 0-1 range", () => {
			// Arrange
			const context = createThinkingContext("Test task");

			// Act
			const highContext = addThinkingStep(context, "High", 1.5);
			const lowContext = addThinkingStep(highContext, "Low", -0.5);

			// Assert
			expect(highContext.history[0].confidence).toBe(1);
			expect(lowContext.history[1].confidence).toBe(0);
		});

		it("should not mutate original context", () => {
			// Arrange
			const context = createThinkingContext("Test task");

			// Act
			addThinkingStep(context, "New thought");

			// Assert
			expect(context.history.length).toBe(0);
		});
	});
});

describe("switchThinkingMode", () => {
	describe("正常系", () => {
		it("should switch to new mode", () => {
			// Arrange
			const context = createThinkingContext("Test task", { mode: "creative" });

			// Act
			const updatedContext = switchThinkingMode(context, "critical");

			// Assert
			expect(updatedContext.currentMode).toBe("critical");
		});

		it("should preserve other context fields", () => {
			// Arrange
			const context = createThinkingContext("Test task", {
				phase: "strategy-development",
				constraints: ["c1"],
			});
			const updatedContext = addThinkingStep(context, "History");

			// Act
			const switchedContext = switchThinkingMode(updatedContext, "social");

			// Assert
			expect(switchedContext.task).toBe("Test task");
			expect(switchedContext.phase).toBe("strategy-development");
			expect(switchedContext.constraints).toEqual(["c1"]);
			expect(switchedContext.history.length).toBe(1);
		});

		it("should not mutate original context", () => {
			// Arrange
			const context = createThinkingContext("Test task", { mode: "creative" });

			// Act
			switchThinkingMode(context, "critical");

			// Assert
			expect(context.currentMode).toBe("creative");
		});
	});
});

describe("analyzeConfidenceTrend", () => {
	describe("正常系", () => {
		it("should return stable for empty history", () => {
			// Arrange & Act
			const analysis = analyzeConfidenceTrend([]);

			// Assert
			expect(analysis.trend).toBe("stable");
			expect(analysis.averageConfidence).toBe(0);
			expect(analysis.maxConfidence).toBe(0);
			expect(analysis.minConfidence).toBe(0);
		});

		it("should compute correct statistics", () => {
			// Arrange
			const history: ThinkingStep[] = [
				{ mode: "creative", phase: "problem-discovery", thought: "t1", confidence: 0.5, timestamp: new Date() },
				{ mode: "analytical", phase: "problem-discovery", thought: "t2", confidence: 0.7, timestamp: new Date() },
				{ mode: "critical", phase: "problem-discovery", thought: "t3", confidence: 0.9, timestamp: new Date() },
			];

			// Act
			const analysis = analyzeConfidenceTrend(history);

			// Assert
			expect(analysis.averageConfidence).toBeCloseTo(0.7, 1);
			expect(analysis.maxConfidence).toBe(0.9);
			expect(analysis.minConfidence).toBe(0.5);
		});

		it("should detect improving trend", () => {
			// Arrange
			const history: ThinkingStep[] = [
				{ mode: "creative", phase: "problem-discovery", thought: "t1", confidence: 0.3, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t2", confidence: 0.4, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t3", confidence: 0.5, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t4", confidence: 0.8, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t5", confidence: 0.85, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t6", confidence: 0.9, timestamp: new Date() },
			];

			// Act
			const analysis = analyzeConfidenceTrend(history);

			// Assert
			expect(analysis.trend).toBe("improving");
		});

		it("should detect declining trend", () => {
			// Arrange
			const history: ThinkingStep[] = [
				{ mode: "creative", phase: "problem-discovery", thought: "t1", confidence: 0.9, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t2", confidence: 0.85, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t3", confidence: 0.8, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t4", confidence: 0.5, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t5", confidence: 0.4, timestamp: new Date() },
				{ mode: "critical", phase: "solution-evaluation", thought: "t6", confidence: 0.3, timestamp: new Date() },
			];

			// Act
			const analysis = analyzeConfidenceTrend(history);

			// Assert
			expect(analysis.trend).toBe("declining");
		});

		it("should detect stable trend", () => {
			// Arrange
			const history: ThinkingStep[] = [
				{ mode: "creative", phase: "problem-discovery", thought: "t1", confidence: 0.6, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t2", confidence: 0.62, timestamp: new Date() },
				{ mode: "creative", phase: "problem-discovery", thought: "t3", confidence: 0.58, timestamp: new Date() },
			];

			// Act
			const analysis = analyzeConfidenceTrend(history);

			// Assert
			expect(analysis.trend).toBe("stable");
		});
	});
});

describe("getAllThinkingModes", () => {
	describe("正常系", () => {
		it("should return all 6 thinking modes", () => {
			const modes = getAllThinkingModes();
			expect(modes.length).toBe(6);
			expect(modes).toContain("creative");
			expect(modes).toContain("analytical");
			expect(modes).toContain("critical");
			expect(modes).toContain("practical");
			expect(modes).toContain("social");
			expect(modes).toContain("emotional");
		});
	});
});

describe("getAllThinkingPhases", () => {
	describe("正常系", () => {
		it("should return all 4 thinking phases", () => {
			const phases = getAllThinkingPhases();
			expect(phases.length).toBe(4);
			expect(phases).toContain("problem-discovery");
			expect(phases).toContain("problem-formulation");
			expect(phases).toContain("strategy-development");
			expect(phases).toContain("solution-evaluation");
		});

		it("should return phases in order", () => {
			const phases = getAllThinkingPhases();
			expect(phases[0]).toBe("problem-discovery");
			expect(phases[3]).toBe("solution-evaluation");
		});
	});
});

describe("getModePhaseCompatibility", () => {
	describe("正常系", () => {
		it("should return compatibility score between 0 and 1", () => {
			const score = getModePhaseCompatibility("creative", "problem-discovery");
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		});

		it("should return high compatibility for creative/problem-discovery", () => {
			const score = getModePhaseCompatibility("creative", "problem-discovery");
			expect(score).toBe(0.9);
		});

		it("should return high compatibility for analytical/problem-formulation", () => {
			const score = getModePhaseCompatibility("analytical", "problem-formulation");
			expect(score).toBe(0.9);
		});

		it("should return high compatibility for practical/strategy-development", () => {
			const score = getModePhaseCompatibility("practical", "strategy-development");
			expect(score).toBe(0.9);
		});

		it("should return high compatibility for critical/solution-evaluation", () => {
			const score = getModePhaseCompatibility("critical", "solution-evaluation");
			expect(score).toBe(0.9);
		});

		it("should return all combinations", () => {
			const modes = getAllThinkingModes();
			const phases = getAllThinkingPhases();

			for (const mode of modes) {
				for (const phase of phases) {
					const score = getModePhaseCompatibility(mode, phase);
					expect(typeof score).toBe("number");
					expect(score).toBeGreaterThanOrEqual(0);
					expect(score).toBeLessThanOrEqual(1);
				}
			}
		});
	});
});

describe("ThinkingContext and ThinkingStep types", () => {
	describe("正常系", () => {
		it("should create valid ThinkingContext", () => {
			const context: ThinkingContext = {
				task: "Test task",
				phase: "problem-discovery",
				currentMode: "creative",
				history: [],
				constraints: ["constraint1"],
			};

			expect(context.task).toBe("Test task");
			expect(context.phase).toBe("problem-discovery");
			expect(context.currentMode).toBe("creative");
			expect(context.history).toEqual([]);
			expect(context.constraints).toHaveLength(1);
		});

		it("should create valid ThinkingStep", () => {
			const step: ThinkingStep = {
				mode: "analytical",
				phase: "problem-formulation",
				thought: "Deep analysis",
				confidence: 0.75,
				timestamp: new Date(),
			};

			expect(step.mode).toBe("analytical");
			expect(step.phase).toBe("problem-formulation");
			expect(step.thought).toBe("Deep analysis");
			expect(step.confidence).toBe(0.75);
			expect(step.timestamp).toBeInstanceOf(Date);
		});
	});
});
