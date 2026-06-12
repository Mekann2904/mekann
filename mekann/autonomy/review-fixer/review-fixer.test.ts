import { describe, it, expect } from "vitest";
import { computeChangedFiles } from "./changedFiles.js";

describe("computeChangedFiles", () => {
  it("detects new files not present in before snapshot", () => {
    const before = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
    ]);
    const after = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/b.ts", "hash-b-v1"],
    ]);
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual(["src/b.ts"]);
  });

  it("detects files with changed content hash (already dirty file modified by child)", () => {
    const before = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/dirty.ts", "hash-dirty-v1"],
    ]);
    const after = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/dirty.ts", "hash-dirty-v2"],
    ]);
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual(["src/dirty.ts"]);
  });

  it("detects files that disappeared (child reverted a dirty file)", () => {
    const before = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/reverted.ts", "hash-rev-v1"],
    ]);
    const after = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
    ]);
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual(["src/reverted.ts"]);
  });

  it("returns empty array when nothing changed", () => {
    const before = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/b.ts", "hash-b-v1"],
    ]);
    const after = new Map<string, string>([
      ["src/a.ts", "hash-a-v1"],
      ["src/b.ts", "hash-b-v1"],
    ]);
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual([]);
  });

  it("handles all three change categories at once", () => {
    const before = new Map<string, string>([
      ["src/unchanged.ts", "hash-u"],
      ["src/modified.ts", "hash-m-v1"],
      ["src/reverted.ts", "hash-r-v1"],
    ]);
    const after = new Map<string, string>([
      ["src/unchanged.ts", "hash-u"],
      ["src/modified.ts", "hash-m-v2"],
      ["src/new.ts", "hash-n-v1"],
    ]);
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual(["src/modified.ts", "src/new.ts", "src/reverted.ts"]);
  });

  it("handles empty snapshots", () => {
    const before = new Map<string, string>();
    const after = new Map<string, string>();
    const changed = computeChangedFiles(before, after);
    expect(changed).toEqual([]);
  });
});
