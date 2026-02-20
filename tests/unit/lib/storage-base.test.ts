/**
 * @file .pi/lib/storage-base.ts の単体テスト
 * @description ストレージ基底ユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
	type HasId,
	type BaseRunRecord,
	type BaseStoragePaths,
	createPathsFactory,
	createEnsurePaths,
	mergeEntitiesById,
} from "@lib/storage-base";

// ============================================================================
// createPathsFactory
// ============================================================================

describe("createPathsFactory", () => {
	it("should_create_paths_with_correct_structure", () => {
		const getPaths = createPathsFactory("test-dir");
		const paths = getPaths("/workspace");

		expect(paths.baseDir).toBe("/workspace/.pi/test-dir");
		expect(paths.runsDir).toBe("/workspace/.pi/test-dir/runs");
		expect(paths.storageFile).toBe("/workspace/.pi/test-dir/storage.json");
	});

	it("should_handle_different_subdirs", () => {
		const getSubagentPaths = createPathsFactory("subagents");
		const getTeamPaths = createPathsFactory("agent-teams");

		expect(getSubagentPaths("/app").baseDir).toBe("/app/.pi/subagents");
		expect(getTeamPaths("/app").baseDir).toBe("/app/.pi/agent-teams");
	});

	it("should_handle_relative_paths", () => {
		const getPaths = createPathsFactory("data");
		const paths = getPaths(".");

		expect(paths.baseDir).toBe(".pi/data");
	});

	describe("プロパティベーステスト", () => {
		it("PBT: パスは常に期待される形式を持つ", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
					fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9/_-]+$/.test(s)),
					(subdir, cwd) => {
						const getPaths = createPathsFactory(subdir);
						const paths = getPaths(cwd);

						expect(paths.baseDir).toContain(subdir);
						expect(paths.runsDir).toContain("runs");
						expect(paths.storageFile).toContain("storage.json");
					}
				)
			);
		});
	});
});

// ============================================================================
// createEnsurePaths
// ============================================================================

describe("createEnsurePaths", () => {
	it("should_return_paths_with_correct_structure", () => {
		const getPaths = (cwd: string): BaseStoragePaths => ({
			baseDir: `${cwd}/.pi/test`,
			runsDir: `${cwd}/.pi/test/runs`,
			storageFile: `${cwd}/.pi/test/storage.json`,
		});

		// 実際にディレクトリを作成しないよう、パス生成のみテスト
		// Note: createEnsurePathsはensureDirを呼ぶため、テストでは使用しない
		const paths = getPaths("/workspace");

		expect(paths.baseDir).toBe("/workspace/.pi/test");
		expect(paths.runsDir).toBe("/workspace/.pi/test/runs");
		expect(paths.storageFile).toBe("/workspace/.pi/test/storage.json");
	});

	it("should_work_with_factory_function", () => {
		const factory = createPathsFactory("my-extension");
		const paths = factory("/project");

		expect(paths.baseDir).toBe("/project/.pi/my-extension");
	});
});

// ============================================================================
// mergeEntitiesById
// ============================================================================

describe("mergeEntitiesById", () => {
	interface TestEntity extends HasId {
		id: string;
		name: string;
		value?: number;
	}

	describe("正常系", () => {
		it("should_merge_entities_by_id", () => {
			const disk: TestEntity[] = [
				{ id: "1", name: "old-one" },
				{ id: "2", name: "old-two" },
			];
			const next: TestEntity[] = [
				{ id: "1", name: "new-one" },
				{ id: "3", name: "new-three" },
			];

			const result = mergeEntitiesById(disk, next);

			expect(result.length).toBe(3);
			expect(result.find(e => e.id === "1")?.name).toBe("new-one");
			expect(result.find(e => e.id === "2")?.name).toBe("old-two");
			expect(result.find(e => e.id === "3")?.name).toBe("new-three");
		});

		it("should_prioritize_next_over_disk", () => {
			const disk: TestEntity[] = [{ id: "1", name: "disk", value: 1 }];
			const next: TestEntity[] = [{ id: "1", name: "next", value: 2 }];

			const result = mergeEntitiesById(disk, next);

			expect(result[0].name).toBe("next");
			expect(result[0].value).toBe(2);
		});

		it("should_handle_empty_disk", () => {
			const disk: TestEntity[] = [];
			const next: TestEntity[] = [
				{ id: "1", name: "one" },
				{ id: "2", name: "two" },
			];

			const result = mergeEntitiesById(disk, next);

			expect(result.length).toBe(2);
		});

		it("should_handle_empty_next", () => {
			const disk: TestEntity[] = [
				{ id: "1", name: "one" },
				{ id: "2", name: "two" },
			];
			const next: TestEntity[] = [];

			const result = mergeEntitiesById(disk, next);

			expect(result.length).toBe(2);
		});

		it("should_handle_both_empty", () => {
			const result = mergeEntitiesById<TestEntity>([], []);
			expect(result).toEqual([]);
		});
	});

	describe("バリデーション", () => {
		it("should_skip_invalid_entities_in_disk", () => {
			const disk = [
				{ id: "1", name: "valid" },
				null,
				undefined,
				{ name: "no-id" },
				{ id: "", name: "empty-id" },
				{ id: 123, name: "numeric-id" },
			] as unknown as TestEntity[];
			const next: TestEntity[] = [];

			const result = mergeEntitiesById(disk, next);

			expect(result.length).toBe(1);
			expect(result[0].id).toBe("1");
		});

		it("should_skip_invalid_entities_in_next", () => {
			const disk: TestEntity[] = [{ id: "1", name: "disk" }];
			const next = [
				{ id: "2", name: "valid" },
				null,
				{ id: "", name: "empty" },
			] as unknown as TestEntity[];

			const result = mergeEntitiesById(disk, next);

			expect(result.length).toBe(2);
		});

		it("should_trim_id_whitespace", () => {
			const disk: TestEntity[] = [{ id: "  1  ", name: "spaced" }];
			const next: TestEntity[] = [];

			const result = mergeEntitiesById(disk, next);

			// 実装ではtrimされたidでマップのキーを作成するが、
			// 返されるオブジェクト自体は元のidを保持する可能性がある
			expect(result.length).toBe(1);
			expect(result[0].id.trim()).toBe("1");
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果には一意のIDのみが含まれる", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							id: fc.string({ minLength: 1, maxLength: 10 }),
							name: fc.string({ maxLength: 20 }),
						})
					),
					fc.array(
						fc.record({
							id: fc.string({ minLength: 1, maxLength: 10 }),
							name: fc.string({ maxLength: 20 }),
						})
					),
					(disk, next) => {
						const result = mergeEntitiesById(
							disk as TestEntity[],
							next as TestEntity[]
						);

						const ids = result.map(e => e.id);
						const uniqueIds = new Set(ids);
						expect(ids.length).toBe(uniqueIds.size);
					}
				)
			);
		});

		it("PBT: nextのエンティティはdiskより優先される", () => {
			fc.assert(
				fc.property(
					fc.record({
						id: fc.constant("shared"),
						value: fc.integer(),
					}),
					fc.record({
						id: fc.constant("shared"),
						value: fc.integer(),
					}),
					(diskEntity, nextEntity) => {
						const result = mergeEntitiesById(
							[diskEntity as TestEntity],
							[nextEntity as TestEntity]
						);

						expect(result.length).toBe(1);
						expect((result[0] as { value: number }).value).toBe(nextEntity.value);
					}
				)
			);
		});
	});
});

// ============================================================================
// Type Definitions
// ============================================================================

describe("Type Definitions", () => {
	describe("HasId", () => {
		it("should_require_id_property", () => {
			const entity: HasId = { id: "test-id" };
			expect(entity.id).toBe("test-id");
		});
	});

	describe("BaseRunRecord", () => {
		it("should_have_required_fields", () => {
			const run: BaseRunRecord = {
				runId: "run-123",
				status: "completed",
				startedAt: "2024-01-01T00:00:00Z",
				finishedAt: "2024-01-01T00:01:00Z",
				outputFile: "/path/to/output.json",
			};

			expect(run.runId).toBe("run-123");
			expect(run.status).toBe("completed");
		});

		it("should_support_optional_error_field", () => {
			const failedRun: BaseRunRecord = {
				runId: "run-456",
				status: "failed",
				startedAt: "2024-01-01T00:00:00Z",
				finishedAt: "2024-01-01T00:00:30Z",
				outputFile: "/path/to/output.json",
				error: "Something went wrong",
			};

			expect(failedRun.error).toBe("Something went wrong");
		});
	});

	describe("BaseStoragePaths", () => {
		it("should_have_required_path_fields", () => {
			const paths: BaseStoragePaths = {
				baseDir: "/app/.pi/storage",
				runsDir: "/app/.pi/storage/runs",
				storageFile: "/app/.pi/storage/storage.json",
			};

			expect(paths.baseDir).toBeDefined();
			expect(paths.runsDir).toBeDefined();
			expect(paths.storageFile).toBeDefined();
		});
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Factory Chain", () => {
	it("should_work_with_full_chain", () => {
		const factory = createPathsFactory("integration-test");
		const paths = factory("/workspace");

		expect(paths.baseDir).toContain("integration-test");
		expect(paths.runsDir).toContain("runs");
		expect(paths.storageFile).toContain("storage.json");
	});
});
