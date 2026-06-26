import { describe, expect, it } from "vitest";
import { outputGateArtifactId } from "./planner.js";

describe("outputGateArtifactId (IC-177 regex sync with #144)", () => {
  it("matches legacy 2-segment og_ artifact ids (og_<time>_<counter>)", () => {
    expect(outputGateArtifactId("see og_8m2wz_z for details")).toBe("og_8m2wz_z");
  });

  it("matches 3-segment og_ artifact ids (og_<time>_<counter>_<rand>)", () => {
    expect(outputGateArtifactId("output-gate:og_8m2wz_z_a1b2c3")).toBe("og_8m2wz_z_a1b2c3");
  });

  it("extracts the id from a realistic message-breakdown target string", () => {
    const target = "[output-gate] bash og_abc123_7_9f8e7d (100000 bytes)";
    expect(outputGateArtifactId(target)).toBe("og_abc123_7_9f8e7d");
  });

  it("returns undefined when no artifact id is present", () => {
    expect(outputGateArtifactId("no artifact here")).toBeUndefined();
  });

  it("does not match a different prefix", () => {
    expect(outputGateArtifactId("ctx_8m2wz_z_a1b2c3")).toBeUndefined();
  });
});
