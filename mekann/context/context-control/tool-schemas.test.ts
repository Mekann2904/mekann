import { describe, it, expect, beforeEach } from "vitest";
import { recordToolSchemaCurrent, getToolSchemaSnapshot } from "./tool-schemas.js";
import { state } from "./state.js";

function resetState(): void {
  state.tools.clear();
  state.toolSchemaTotalBytes = 0;
}

describe("recordToolSchemaCurrent", () => {
  beforeEach(() => {
    resetState();
  });

  it("records schema bytes and exposes them via the snapshot", () => {
    recordToolSchemaCurrent("alpha", 128);
    const snap = getToolSchemaSnapshot();
    expect(snap.totalBytes).toBe(128);
    expect(snap.tools).toHaveLength(1);
    expect(snap.tools[0]).toMatchObject({ name: "alpha", schemaBytes: 128 });
  });

  it("initializes registeredAt and lastUpdatedAt together on first record", () => {
    const before = Date.now();
    recordToolSchemaCurrent("alpha", 64);
    const after = Date.now();
    const record = state.tools.get("alpha");
    expect(record?.registeredAt).toBeGreaterThanOrEqual(before);
    expect(record?.registeredAt).toBeLessThanOrEqual(after);
    expect(record?.lastUpdatedAt).toBe(record?.registeredAt);
  });

  it("re-records the same tool name and refreshes lastUpdatedAt while keeping registeredAt", async () => {
    recordToolSchemaCurrent("alpha", 64);
    const firstRecord = state.tools.get("alpha")!;
    expect(firstRecord.registeredAt).toBe(firstRecord.lastUpdatedAt);

    // Advance time so lastUpdatedAt is observably newer.
    await new Promise((resolve) => setTimeout(resolve, 5));
    recordToolSchemaCurrent("alpha", 200);

    const updated = state.tools.get("alpha")!;
    expect(updated.registeredAt).toBe(firstRecord.registeredAt);
    expect(updated.lastUpdatedAt).toBeGreaterThan(firstRecord.lastUpdatedAt);
    expect(updated.schemaBytes).toBe(200);
    // Total reflects only the latest size, not a running sum.
    expect(state.toolSchemaTotalBytes).toBe(200);
    expect(getToolSchemaSnapshot().totalBytes).toBe(200);
  });

  it("normalizes NaN schema bytes to 0 so the running total stays valid", () => {
    recordToolSchemaCurrent("broken", Number.NaN);
    const record = state.tools.get("broken");
    expect(record?.schemaBytes).toBe(0);
    expect(state.toolSchemaTotalBytes).toBe(0);
  });

  it("normalizes Infinity schema bytes to 0 so the running total stays finite", () => {
    recordToolSchemaCurrent("huge", Number.POSITIVE_INFINITY);
    const record = state.tools.get("huge");
    expect(record?.schemaBytes).toBe(0);
    expect(Number.isFinite(state.toolSchemaTotalBytes)).toBe(true);
    expect(state.toolSchemaTotalBytes).toBe(0);
  });

  it("normalizes negative schema bytes to 0", () => {
    recordToolSchemaCurrent("negative", -50);
    const record = state.tools.get("negative");
    expect(record?.schemaBytes).toBe(0);
    expect(state.toolSchemaTotalBytes).toBe(0);
  });

  it("recomputes the running total when a previously-recorded tool is updated with an invalid size", () => {
    recordToolSchemaCurrent("alpha", 100);
    expect(state.toolSchemaTotalBytes).toBe(100);

    recordToolSchemaCurrent("alpha", Number.NaN);
    // previous 100 subtracted, 0 added.
    expect(state.toolSchemaTotalBytes).toBe(0);
    expect(state.tools.get("alpha")?.schemaBytes).toBe(0);
  });
});
