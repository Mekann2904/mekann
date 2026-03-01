/**
 * @file .pi/lib/resource-tracker.ts の単体テスト
 * @description リソースリーク検出とトラッキングのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// モジュールをインポート
import {
	ResourceTracker,
	withTrackedResource,
	withTrackedResourceSync,
	type TrackedResource,
	type ResourceLeak,
} from "../../lib/resource-tracker.js";

// ============================================================================
// ResourceTracker
// ============================================================================

describe("ResourceTracker", () => {
	let tracker: ResourceTracker;

	beforeEach(() => {
		// テスト間で状態をリセット
		tracker = ResourceTracker.getInstance();
		tracker.clear();
		tracker.setEnabled(true);
	});

	afterEach(() => {
		tracker.clear();
	});

	describe("getInstance", () => {
		it("should_return_singleton_instance", () => {
			// Act
			const instance1 = ResourceTracker.getInstance();
			const instance2 = ResourceTracker.getInstance();

			// Assert
			expect(instance1).toBe(instance2);
		});
	});

	describe("setEnabled", () => {
		it("should_disable_tracking_when_false", () => {
			// Arrange
			tracker.setEnabled(false);

			// Act
			const id = tracker.track("test");

			// Assert
			expect(id).toBe(-1);
			expect(tracker.getLeakCount()).toBe(0);
		});

		it("should_enable_tracking_when_true", () => {
			// Arrange
			tracker.setEnabled(true);

			// Act
			const id = tracker.track("test");

			// Assert
			expect(id).toBeGreaterThanOrEqual(0);
			expect(tracker.getLeakCount()).toBe(1);
		});
	});

	describe("track", () => {
		it("should_return_unique_ids", () => {
			// Act
			const id1 = tracker.track("type1");
			const id2 = tracker.track("type2");
			const id3 = tracker.track("type3");

			// Assert
			expect(id1).not.toBe(id2);
			expect(id2).not.toBe(id3);
		});

		it("should_record_resource_type", () => {
			// Act
			tracker.track("file_descriptor");

			// Assert
			const leaks = tracker.getLeaks();
			expect(leaks[0]?.type).toBe("file_descriptor");
		});

		it("should_record_metadata", () => {
			// Arrange
			const metadata = { path: "/test/file.txt" };

			// Act
			tracker.track("file_descriptor", metadata);

			// Assert
			const leaks = tracker.getLeaks();
			expect(leaks[0]?.metadata).toEqual(metadata);
		});

		it("should_record_stack_trace", () => {
			// Act
			tracker.track("test");

			// Assert
			const leaks = tracker.getLeaks();
			expect(leaks[0]?.stackTrace).toBeDefined();
			expect(leaks[0]?.stackTrace.length).toBeGreaterThan(0);
		});

		it("should_record_opened_at", () => {
			// Arrange
			const before = new Date();

			// Act
			tracker.track("test");

			// Assert
			const leaks = tracker.getLeaks();
			expect(leaks[0]?.openedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
		});
	});

	describe("release", () => {
		it("should_remove_tracked_resource", () => {
			// Arrange
			const id = tracker.track("test");

			// Act
			tracker.release(id);

			// Assert
			expect(tracker.getLeakCount()).toBe(0);
		});

		it("should_throw_on_double_release", () => {
			// Arrange
			const id = tracker.track("test");
			tracker.release(id);

			// Act & Assert
			expect(() => tracker.release(id)).toThrow("Double-free or invalid release");
		});

		it("should_throw_on_invalid_id", () => {
			// Act & Assert
			expect(() => tracker.release(99999)).toThrow("Double-free or invalid release");
		});

		it("should_not_throw_on_negative_id_when_disabled", () => {
			// Arrange
			tracker.setEnabled(false);

			// Act & Assert: エラーがスローされない
			expect(() => tracker.release(-1)).not.toThrow();
		});
	});

	describe("getLeaks", () => {
		it("should_return_empty_array_when_no_leaks", () => {
			// Act
			const leaks = tracker.getLeaks();

			// Assert
			expect(leaks).toEqual([]);
		});

		it("should_return_all_leaks", () => {
			// Arrange
			tracker.track("type1");
			tracker.track("type2");

			// Act
			const leaks = tracker.getLeaks();

			// Assert
			expect(leaks).toHaveLength(2);
		});

		it("should_filter_by_min_age", async () => {
			// Arrange
			tracker.track("old");
			await new Promise(resolve => setTimeout(resolve, 50));
			tracker.track("new");

			// Act
			const leaks = tracker.getLeaks(100); // 100ms以上経過

			// Assert: 新しいリソースは除外される
			expect(leaks.length).toBeLessThanOrEqual(1);
		});

		it("should_include_age_ms", async () => {
			// Arrange
			tracker.track("test");
			await new Promise(resolve => setTimeout(resolve, 10));

			// Act
			const leaks = tracker.getLeaks();

			// Assert
			expect(leaks[0]?.ageMs).toBeGreaterThanOrEqual(10);
		});
	});

	describe("getLeakCount", () => {
		it("should_return_zero_initially", () => {
			// Act & Assert
			expect(tracker.getLeakCount()).toBe(0);
		});

		it("should_increment_on_track", () => {
			// Act
			tracker.track("test");

			// Assert
			expect(tracker.getLeakCount()).toBe(1);
		});

		it("should_decrement_on_release", () => {
			// Arrange
			const id = tracker.track("test");

			// Act
			tracker.release(id);

			// Assert
			expect(tracker.getLeakCount()).toBe(0);
		});
	});

	describe("getLeakCountByType", () => {
		it("should_count_by_type", () => {
			// Arrange
			tracker.track("type1");
			tracker.track("type1");
			tracker.track("type2");

			// Act
			const counts = tracker.getLeakCountByType();

			// Assert
			expect(counts.get("type1")).toBe(2);
			expect(counts.get("type2")).toBe(1);
		});
	});

	describe("clear", () => {
		it("should_remove_all_resources", () => {
			// Arrange
			tracker.track("type1");
			tracker.track("type2");

			// Act
			tracker.clear();

			// Assert
			expect(tracker.getLeakCount()).toBe(0);
		});

		it("should_reset_id_counter", () => {
			// Arrange
			tracker.track("test");
			tracker.clear();

			// Act
			const id = tracker.track("test");

			// Assert: IDが0から再開
			expect(id).toBe(0);
		});
	});

	describe("getLeakSummary", () => {
		it("should_return_no_leaks_message", () => {
			// Act
			const summary = tracker.getLeakSummary();

			// Assert
			expect(summary).toContain("No resource leaks");
		});

		it("should_include_leak_count", () => {
			// Arrange
			tracker.track("type1");
			tracker.track("type2");

			// Act
			const summary = tracker.getLeakSummary();

			// Assert
			expect(summary).toContain("2 total");
		});

		it("should_include_type_breakdown", () => {
			// Arrange
			tracker.track("file_descriptor");
			tracker.track("file_descriptor");

			// Act
			const summary = tracker.getLeakSummary();

			// Assert
			expect(summary).toContain("file_descriptor: 2");
		});
	});
});

// ============================================================================
// withTrackedResource
// ============================================================================

describe("withTrackedResource", () => {
	let tracker: ResourceTracker;

	beforeEach(() => {
		tracker = ResourceTracker.getInstance();
		tracker.clear();
		tracker.setEnabled(true);
	});

	afterEach(() => {
		tracker.clear();
	});

	it("should_track_and_release_resource", async () => {
		// Arrange
		const openFn = vi.fn().mockResolvedValue(42);
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const fn = vi.fn().mockResolvedValue("result");

		// Act
		const result = await withTrackedResource(openFn, closeFn, fn);

		// Assert
		expect(result).toBe("result");
		expect(openFn).toHaveBeenCalled();
		expect(closeFn).toHaveBeenCalledWith(42);
		expect(fn).toHaveBeenCalledWith(42);
		expect(tracker.getLeakCount()).toBe(0);
	});

	it("should_release_on_error", async () => {
		// Arrange
		const openFn = vi.fn().mockResolvedValue(42);
		const closeFn = vi.fn().mockResolvedValue(undefined);
		const fn = vi.fn().mockRejectedValue(new Error("test error"));

		// Act & Assert
		await expect(withTrackedResource(openFn, closeFn, fn)).rejects.toThrow("test error");
		expect(closeFn).toHaveBeenCalledWith(42);
		expect(tracker.getLeakCount()).toBe(0);
	});
});

// ============================================================================
// withTrackedResourceSync
// ============================================================================

describe("withTrackedResourceSync", () => {
	let tracker: ResourceTracker;

	beforeEach(() => {
		tracker = ResourceTracker.getInstance();
		tracker.clear();
		tracker.setEnabled(true);
	});

	afterEach(() => {
		tracker.clear();
	});

	it("should_track_and_release_resource", () => {
		// Arrange
		const openFn = vi.fn().mockReturnValue(42);
		const closeFn = vi.fn();
		const fn = vi.fn().mockReturnValue("result");

		// Act
		const result = withTrackedResourceSync(openFn, closeFn, fn);

		// Assert
		expect(result).toBe("result");
		expect(openFn).toHaveBeenCalled();
		expect(closeFn).toHaveBeenCalledWith(42);
		expect(fn).toHaveBeenCalledWith(42);
		expect(tracker.getLeakCount()).toBe(0);
	});

	it("should_release_on_error", () => {
		// Arrange
		const openFn = vi.fn().mockReturnValue(42);
		const closeFn = vi.fn();
		const fn = vi.fn().mockImplementation(() => {
			throw new Error("test error");
		});

		// Act & Assert
		expect(() => withTrackedResourceSync(openFn, closeFn, fn)).toThrow("test error");
		expect(closeFn).toHaveBeenCalledWith(42);
		expect(tracker.getLeakCount()).toBe(0);
	});
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
	let tracker: ResourceTracker;

	beforeEach(() => {
		tracker = ResourceTracker.getInstance();
		tracker.clear();
		tracker.setEnabled(true);
	});

	afterEach(() => {
		tracker.clear();
	});

	it("should_handle_many_resources", () => {
		// Arrange
		const ids: number[] = [];

		// Act
		for (let i = 0; i < 1000; i++) {
			ids.push(tracker.track("test"));
		}

		// Assert
		expect(tracker.getLeakCount()).toBe(1000);

		// Cleanup
		for (const id of ids) {
			tracker.release(id);
		}
		expect(tracker.getLeakCount()).toBe(0);
	});

	it("should_handle_empty_type", () => {
		// Act
		const id = tracker.track("");

		// Assert
		expect(id).toBeGreaterThanOrEqual(0);
		expect(tracker.getLeaks()[0]?.type).toBe("");
	});

	it("should_handle_special_characters_in_type", () => {
		// Act
		const id = tracker.track("type/with:special*chars");

		// Assert
		expect(id).toBeGreaterThanOrEqual(0);
	});
});
