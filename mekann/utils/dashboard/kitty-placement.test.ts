import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scheduleKittyPlacements } from "./kitty-placement.js";
import type { DashboardPositionedImage } from "./rendering-pipeline.js";

// Mock image-pipeline to avoid actual Kitty rendering
vi.mock("./image-pipeline.js", () => ({
	renderKittyImage: vi.fn(),
}));

import { renderKittyImage } from "./image-pipeline.js";

const mockRenderKittyImage = vi.mocked(renderKittyImage);

describe("scheduleKittyPlacements", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockRenderKittyImage.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not place images immediately", () => {
		const placements: DashboardPositionedImage[] = [
			{
				kind: "avatar",
				path: "/tmp/avatar.png",
				columns: 20,
				rows: 8,
				startRow: 0,
				startCol: 1,
			},
		];

		scheduleKittyPlacements(placements);
		expect(mockRenderKittyImage).not.toHaveBeenCalled();
	});

	it("places images after the delay", () => {
		const placements: DashboardPositionedImage[] = [
			{
				kind: "avatar",
				path: "/tmp/avatar.png",
				columns: 20,
				rows: 8,
				startRow: 0,
				startCol: 1,
			},
			{
				kind: "contributionGraph",
				path: "/tmp/graph.png",
				columns: 140,
				rows: 10,
				startRow: 15,
				startCol: 1,
			},
		];

		scheduleKittyPlacements(placements);
		vi.advanceTimersByTime(100);

		expect(mockRenderKittyImage).toHaveBeenCalledTimes(2);
		expect(mockRenderKittyImage).toHaveBeenCalledWith(
			{ ok: true, path: "/tmp/avatar.png", columns: 20, rows: 8 },
			{ x: 1, y: 0 },
		);
		expect(mockRenderKittyImage).toHaveBeenCalledWith(
			{ ok: true, path: "/tmp/graph.png", columns: 140, rows: 10 },
			{ x: 1, y: 15 },
		);
	});

	it("cancellation prevents placement", () => {
		const placements: DashboardPositionedImage[] = [
			{
				kind: "avatar",
				path: "/tmp/avatar.png",
				columns: 20,
				rows: 8,
				startRow: 0,
				startCol: 1,
			},
		];

		const cancel = scheduleKittyPlacements(placements);
		cancel();
		vi.advanceTimersByTime(100);

		expect(mockRenderKittyImage).not.toHaveBeenCalled();
	});

	it("handles empty placements gracefully", () => {
		const cancel = scheduleKittyPlacements([]);
		vi.advanceTimersByTime(100);
		expect(mockRenderKittyImage).not.toHaveBeenCalled();
		cancel();
	});
});
