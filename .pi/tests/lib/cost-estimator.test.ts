/**
 * @abdd.meta
 * path: .pi/tests/lib/cost-estimator.test.ts
 * role: cost-estimator.tsの単体テスト
 * why: タスクスケジューリングのコスト推定精度を保証するため
 * related: .pi/lib/cost-estimator.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * @abdd.explain
 * overview: コスト推定器の単体テスト
 * what_it_does:
 *   - 推定ロジックの正確性を検証
 *   - 履歴記録と統計計算をテスト
 *   - シングルトン管理をテスト
 * why_it_exists:
 *   - コスト推定の品質保証
 *   - スケジューリング精度の確保
 * scope:
 *   in: CostEstimatorクラス、estimate、recordExecution、getStats等
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	CostEstimator,
	getCostEstimator,
	createCostEstimator,
	resetCostEstimator,
	type CostEstimatorConfig,
	type ExecutionHistoryEntry,
} from "../../lib/cost-estimator.js";

// TaskSourceをモック化
vi.mock("../../lib/coordination/task-scheduler.js", () => ({
	TaskSource: {},
}));

describe("cost-estimator", () => {
	beforeEach(() => {
		resetCostEstimator();
	});

	afterEach(() => {
		resetCostEstimator();
		vi.restoreAllMocks();
	});

	describe("Default values", () => {
		it("should_use_correct_default_values_in_estimator", () => {
			// Arrange
			const estimator = new CostEstimator();

			// Act - デフォルト推定値を確認
			const result = estimator.estimate("subagent_run");

			// Assert
			expect(result.method).toBe("default");
			expect(result.estimatedDurationMs).toBe(30_000);
			expect(result.estimatedTokens).toBe(4000);
		});
	});

	describe("CostEstimator", () => {
		describe("constructor", () => {
			it("should_use_default_config_when_not_provided", () => {
				// Act
				const estimator = new CostEstimator();

				// Assert
				expect(estimator).toBeDefined();
			});

			it("should_merge_custom_config_with_defaults", () => {
				// Arrange
				const customConfig: Partial<CostEstimatorConfig> = {
					minHistoricalExecutions: 10,
				};

				// Act
				const estimator = new CostEstimator(customConfig);

				// Assert
				expect(estimator).toBeDefined();
			});
		});

		describe("estimate", () => {
			it("should_return_default_estimate_for_unknown_source", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				const result = estimator.estimate("unknown_source" as any);

				// Assert
				expect(result.method).toBe("default");
				expect(result.confidence).toBe(0.3);
				expect(result.estimatedDurationMs).toBe(60_000);
				expect(result.estimatedTokens).toBe(10_000);
			});

			it("should_return_default_estimate_for_subagent_run", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				const result = estimator.estimate("subagent_run");

				// Assert
				expect(result.method).toBe("default");
				expect(result.estimatedDurationMs).toBe(30_000);
				expect(result.estimatedTokens).toBe(4000);
				expect(result.confidence).toBe(0.5);
			});

			it("should_return_default_estimate_for_agent_team_run", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				const result = estimator.estimate("agent_team_run");

				// Assert
				expect(result.method).toBe("default");
				expect(result.estimatedDurationMs).toBe(60_000);
				expect(result.estimatedTokens).toBe(12_000);
				expect(result.confidence).toBe(0.5);
			});

			it("should_use_historical_data_when_available", () => {
				// Arrange
				const estimator = new CostEstimator({ minHistoricalExecutions: 2 });

				// 履歴を記録
				const entries: ExecutionHistoryEntry[] = [
					{
						source: "subagent_run",
						provider: "test",
						model: "test-model",
						actualDurationMs: 20_000,
						actualTokens: 3000,
						success: true,
						timestamp: Date.now(),
					},
					{
						source: "subagent_run",
						provider: "test",
						model: "test-model",
						actualDurationMs: 30_000,
						actualTokens: 4000,
						success: true,
						timestamp: Date.now(),
					},
				];

				entries.forEach((e) => estimator.recordExecution(e));

				// Act
				const result = estimator.estimate("subagent_run");

				// Assert
				expect(result.method).toBe("historical");
				expect(result.estimatedDurationMs).toBe(25_000); // (20000 + 30000) / 2
				expect(result.estimatedTokens).toBe(3500); // (3000 + 4000) / 2
				expect(result.confidence).toBeGreaterThan(0.5);
			});

			it("should_include_provider_and_model_in_estimate", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				const result = estimator.estimate(
					"subagent_run",
					"openai",
					"gpt-4",
					"Test task"
				);

				// Assert
				expect(result).toBeDefined();
			});
		});

		describe("recordExecution", () => {
			it("should_record_execution_entry", () => {
				// Arrange
				const estimator = new CostEstimator();
				const entry: ExecutionHistoryEntry = {
					source: "subagent_run",
					provider: "test",
					model: "test-model",
					actualDurationMs: 25_000,
					actualTokens: 3500,
					success: true,
					timestamp: Date.now(),
				};

				// Act
				estimator.recordExecution(entry);

				// Assert
				const stats = estimator.getStats("subagent_run");
				expect(stats).toBeDefined();
				expect(stats?.executionCount).toBe(1);
				expect(stats?.avgDurationMs).toBe(25_000);
				expect(stats?.avgTokens).toBe(3500);
			});

			it("should_limit_history_to_max_size", () => {
				// Arrange
				const estimator = new CostEstimator({ maxHistoryPerSource: 5 });

				// Act - 10個のエントリを記録
				for (let i = 0; i < 10; i++) {
					estimator.recordExecution({
						source: "subagent_run",
						provider: "test",
						model: "test-model",
						actualDurationMs: 10_000 + i * 1000,
						actualTokens: 1000 + i * 100,
						success: true,
						timestamp: Date.now() + i,
					});
				}

				// Assert - 最新5件のみ保持
				const stats = estimator.getStats("subagent_run");
				expect(stats?.executionCount).toBe(5);
				// 最新5件の平均: (15000 + 16000 + 17000 + 18000 + 19000) / 5 = 17000
				expect(stats?.avgDurationMs).toBe(17_000);
			});

			it("should_calculate_success_rate_correctly", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act - 3成功、2失敗
				for (let i = 0; i < 5; i++) {
					estimator.recordExecution({
						source: "subagent_run",
						provider: "test",
						model: "test-model",
						actualDurationMs: 20_000,
						actualTokens: 3000,
						success: i < 3,
						timestamp: Date.now(),
					});
				}

				// Assert
				const stats = estimator.getStats("subagent_run");
				expect(stats?.successRate).toBe(0.6); // 3/5
			});

			it("should_track_min_and_max_duration", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				[15_000, 30_000, 20_000, 25_000].forEach((duration) => {
					estimator.recordExecution({
						source: "subagent_run",
						provider: "test",
						model: "test-model",
						actualDurationMs: duration,
						actualTokens: 3000,
						success: true,
						timestamp: Date.now(),
					});
				});

				// Assert
				const stats = estimator.getStats("subagent_run");
				expect(stats?.minDurationMs).toBe(15_000);
				expect(stats?.maxDurationMs).toBe(30_000);
			});
		});

		describe("getStats", () => {
			it("should_return_undefined_for_no_history", () => {
				// Arrange
				const estimator = new CostEstimator();

				// Act
				const stats = estimator.getStats("subagent_run");

				// Assert
				expect(stats).toBeUndefined();
			});

			it("should_cache_statistics", () => {
				// Arrange
				const estimator = new CostEstimator();
				estimator.recordExecution({
					source: "subagent_run",
					provider: "test",
					model: "test-model",
					actualDurationMs: 20_000,
					actualTokens: 3000,
					success: true,
					timestamp: Date.now(),
				});

				// Act
				const stats1 = estimator.getStats("subagent_run");
				const stats2 = estimator.getStats("subagent_run");

				// Assert
				expect(stats1).toBe(stats2); // 同じオブジェクト参照
			});

			it("should_invalidate_cache_on_new_entry", () => {
				// Arrange
				const estimator = new CostEstimator();
				estimator.recordExecution({
					source: "subagent_run",
					provider: "test",
					model: "test-model",
					actualDurationMs: 20_000,
					actualTokens: 3000,
					success: true,
					timestamp: Date.now(),
				});

				const stats1 = estimator.getStats("subagent_run");

				// Act - 新しいエントリを追加
				estimator.recordExecution({
					source: "subagent_run",
					provider: "test",
					model: "test-model",
					actualDurationMs: 40_000,
					actualTokens: 6000,
					success: true,
					timestamp: Date.now(),
				});

				const stats2 = estimator.getStats("subagent_run");

				// Assert
				expect(stats1?.executionCount).toBe(1);
				expect(stats2?.executionCount).toBe(2);
				expect(stats1).not.toBe(stats2); // キャッシュが無効化された
			});
		});

		describe("clear", () => {
			it("should_clear_all_history_and_cache", () => {
				// Arrange
				const estimator = new CostEstimator();
				estimator.recordExecution({
					source: "subagent_run",
					provider: "test",
					model: "test-model",
					actualDurationMs: 20_000,
					actualTokens: 3000,
					success: true,
					timestamp: Date.now(),
				});

				// Act
				estimator.clear();

				// Assert
				const stats = estimator.getStats("subagent_run");
				expect(stats).toBeUndefined();
			});
		});

		describe("getDefaultEstimate", () => {
			it("should_return_default_for_known_source", () => {
				// Act
				const result = CostEstimator.getDefaultEstimate("subagent_run");

				// Assert
				expect(result.durationMs).toBe(30_000);
				expect(result.tokens).toBe(4000);
			});

			it("should_return_conservative_default_for_unknown_source", () => {
				// Act
				const result = CostEstimator.getDefaultEstimate("unknown" as any);

				// Assert
				expect(result.durationMs).toBe(60_000);
				expect(result.tokens).toBe(10_000);
			});
		});
	});

	describe("Singleton functions", () => {
		describe("getCostEstimator", () => {
			it("should_return_singleton_instance", () => {
				// Act
				const instance1 = getCostEstimator();
				const instance2 = getCostEstimator();

				// Assert
				expect(instance1).toBe(instance2);
			});
		});

		describe("createCostEstimator", () => {
			it("should_create_new_instance_with_custom_config", () => {
				// Arrange
				const config: Partial<CostEstimatorConfig> = {
					minHistoricalExecutions: 10,
				};

				// Act
				const estimator = createCostEstimator(config);

				// Assert
				expect(estimator).toBeDefined();
				expect(estimator).not.toBe(getCostEstimator());
			});

			it("should_create_new_instance_without_config", () => {
				// Act
				const estimator = createCostEstimator();

				// Assert
				expect(estimator).toBeDefined();
			});
		});

		describe("resetCostEstimator", () => {
			it("should_reset_singleton_instance", () => {
				// Arrange
				const instance1 = getCostEstimator();

				// Act
				resetCostEstimator();
				const instance2 = getCostEstimator();

				// Assert
				expect(instance1).not.toBe(instance2);
			});
		});
	});
});
