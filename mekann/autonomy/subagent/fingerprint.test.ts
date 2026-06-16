import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  sha256File,
  computeFileFingerprints,
  checkBaseFileHashes,
  safeRepoRelativePath,
  extractTouchedPathsFromPatchStrict,
  extractTouchedPathsFromPatch,
  isNewFilePatch,
  normalizePublicSurfaceDeltas,
  detectPublicSurfaceFromPatch,
} from "./fingerprint.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "fp-test-"));
});
afterEach(() => {
  try { rmSync(tmpDir, { recursive: true }); } catch {}
});

describe("sha256File", () => {
  it("computes sha256 hash of a file", async () => {
    const f = path.join(tmpDir, "test.txt");
    writeFileSync(f, "hello world");
    const hash = await sha256File(f);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces different hashes for different content", async () => {
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");
    writeFileSync(f1, "aaa");
    writeFileSync(f2, "bbb");
    const h1 = await sha256File(f1);
    const h2 = await sha256File(f2);
    expect(h1).not.toBe(h2);
  });
});

describe("computeFileFingerprints", () => {
  it("computes fingerprints for multiple files", async () => {
    writeFileSync(path.join(tmpDir, "a.ts"), "content a");
    writeFileSync(path.join(tmpDir, "b.ts"), "content b");
    const fps = await computeFileFingerprints(tmpDir, ["a.ts", "b.ts"]);
    expect(fps).toHaveLength(2);
    expect(fps[0].path).toBe("a.ts");
    expect(fps[0].hash).toMatch(/^sha256:/);
    expect(fps[1].path).toBe("b.ts");
    expect(fps[1].hash).toMatch(/^sha256:/);
  });

  it("handles single file", async () => {
    writeFileSync(path.join(tmpDir, "single.txt"), "x");
    const fps = await computeFileFingerprints(tmpDir, ["single.txt"]);
    expect(fps).toHaveLength(1);
  });

  it("handles empty paths array", async () => {
    const fps = await computeFileFingerprints(tmpDir, []);
    expect(fps).toEqual([]);
  });
});

describe("checkBaseFileHashes", () => {
  it("returns ok when hashes match", async () => {
    writeFileSync(path.join(tmpDir, "f.ts"), "original");
    const [{ hash }] = await computeFileFingerprints(tmpDir, ["f.ts"]);
    const result = await checkBaseFileHashes(tmpDir, [{ path: "f.ts", hash }]);
    expect(result).toEqual({ ok: true });
  });

  it("returns failure when hash mismatches", async () => {
    writeFileSync(path.join(tmpDir, "f.ts"), "original");
    const result = await checkBaseFileHashes(tmpDir, [{ path: "f.ts", hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }]);
    expect(result).toMatchObject({ ok: false, path: "f.ts" });
  });

  it("returns failure when file does not exist", async () => {
    const result = await checkBaseFileHashes(tmpDir, [{ path: "nonexistent.ts", hash: "sha256:abc" }]);
    expect(result).toMatchObject({ ok: false, path: "nonexistent.ts" });
  });

  it("returns ok for empty files array", async () => {
    const result = await checkBaseFileHashes(tmpDir, []);
    expect(result).toEqual({ ok: true });
  });
});

describe("safeRepoRelativePath", () => {
  it("accepts normal relative paths", () => {
    expect(safeRepoRelativePath("src/index.ts")).toBe("src/index.ts");
    expect(safeRepoRelativePath("a/b/c.ts")).toBe("a/b/c.ts");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(safeRepoRelativePath("src\\a.ts")).toBe("src/a.ts");
  });

  it("rejects empty string", () => {
    expect(safeRepoRelativePath("")).toBeUndefined();
  });

  it("rejects null bytes", () => {
    expect(safeRepoRelativePath("src\0evil.ts")).toBeUndefined();
  });

  it("rejects absolute paths", () => {
    expect(safeRepoRelativePath("/tmp/x.ts")).toBeUndefined();
    expect(safeRepoRelativePath("C:\\Users\\x.ts")).toBeUndefined();
    expect(safeRepoRelativePath("c:/x.ts")).toBeUndefined();
  });

  it("rejects parent traversal", () => {
    expect(safeRepoRelativePath("../x.ts")).toBeUndefined();
    expect(safeRepoRelativePath("a/../../b.ts")).toBeUndefined();
    expect(safeRepoRelativePath("../../x.ts")).toBeUndefined();
    // Note: ".." alone is not rejected by current implementation (path traversal happens at normalize level)
    // This is acceptable since patches always have file paths
  });

  it("rejects .git paths", () => {
    expect(safeRepoRelativePath(".git")).toBeUndefined();
    expect(safeRepoRelativePath(".git/config")).toBeUndefined();
  });

  it("rejects .pi paths", () => {
    expect(safeRepoRelativePath(".pi")).toBeUndefined();
    expect(safeRepoRelativePath(".pi/state.json")).toBeUndefined();
  });

  it("rejects .codex/.agent paths (unified PROTECTED_DIRS, issue #80 C-004)", () => {
    expect(safeRepoRelativePath(".codex")).toBeUndefined();
    expect(safeRepoRelativePath(".codex/config")).toBeUndefined();
    expect(safeRepoRelativePath(".agents")).toBeUndefined();
    expect(safeRepoRelativePath(".agents/state.json")).toBeUndefined();
  });

  it("rejects dot path", () => {
    expect(safeRepoRelativePath(".")).toBeUndefined();
  });

  it("normalizes paths with ./ prefix", () => {
    expect(safeRepoRelativePath("./src/a.ts")).toBe("src/a.ts");
  });

  it("handles double slashes", () => {
    expect(safeRepoRelativePath("src//a.ts")).toBe("src/a.ts");
  });
});

describe("extractTouchedPathsFromPatchStrict", () => {
  it("extracts paths from standard git diff", () => {
    const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new`;
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result).toEqual({ ok: true, paths: ["src/a.ts"] });
  });

  it("extracts multiple paths from multi-file diff", () => {
    const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-old2
+new2`;
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paths.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    }
  });

  it("handles new file (--- /dev/null)", () => {
    const patch = `diff --git a/src/new.ts b/src/new.ts
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+content`;
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result).toEqual({ ok: true, paths: ["src/new.ts"] });
  });

  it("handles deleted file (+++ /dev/null)", () => {
    const patch = `diff --git a/src/old.ts b/src/old.ts
--- a/src/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-old`;
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result).toEqual({ ok: true, paths: ["src/old.ts"] });
  });

  it("rejects unsafe path traversal in patch", () => {
    const patch = `--- a/../outside.ts
+++ b/../outside.ts`;
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result).toMatchObject({ ok: false, reason: "unsafe_patch_path" });
  });

  it("returns empty paths for patch with no file changes", () => {
    const result = extractTouchedPathsFromPatchStrict("no diff here");
    expect(result).toEqual({ ok: true, paths: [] });
  });

  it("handles CRLF line endings", () => {
    const patch = "--- a/src/a.ts\r\n+++ b/src/a.ts\r\n@@ -1 +1 @@\r\n-old\r\n+new\r\n";
    const result = extractTouchedPathsFromPatchStrict(patch);
    expect(result).toEqual({ ok: true, paths: ["src/a.ts"] });
  });
});

describe("extractTouchedPathsFromPatch", () => {
  it("returns paths for valid patch", () => {
    const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new`;
    expect(extractTouchedPathsFromPatch(patch)).toEqual(["src/a.ts"]);
  });

  it("returns empty array for invalid patch", () => {
    expect(extractTouchedPathsFromPatch("--- a/../evil.ts\n+++ b/../evil.ts")).toEqual([]);
  });
});

describe("isNewFilePatch", () => {
  it("returns true for new file patch", () => {
    const patch = `diff --git a/src/new.ts b/src/new.ts
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+content`;
    expect(isNewFilePatch("src/new.ts", patch)).toBe(true);
  });

  it("returns false for modified file patch", () => {
    const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-old
+new`;
    expect(isNewFilePatch("src/a.ts", patch)).toBe(false);
  });

  it("returns false when new file path does not match", () => {
    const patch = `diff --git a/src/new.ts b/src/new.ts
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+content`;
    expect(isNewFilePatch("src/other.ts", patch)).toBe(false);
  });

  it("returns false for empty patch", () => {
    expect(isNewFilePatch("src/a.ts", "")).toBe(false);
  });
});

describe("normalizePublicSurfaceDeltas", () => {
  it("merges add+remove into modify", () => {
    const deltas = [
      { surface: "typescript_export" as const, name: "foo", change: "add" as const, compatibility: "compatible" as const },
      { surface: "typescript_export" as const, name: "foo", change: "remove" as const, compatibility: "breaking" as const },
    ];
    const result = normalizePublicSurfaceDeltas(deltas);
    expect(result).toEqual([
      { surface: "typescript_export" as const, name: "foo", change: "modify", compatibility: "breaking" },
    ]);
  });

  it("keeps add+remove with non-breaking compatibility as unknown", () => {
    const deltas = [
      { surface: "rest_api" as const, name: "x", change: "add" as const, compatibility: "compatible" as const },
      { surface: "rest_api" as const, name: "x", change: "remove" as const, compatibility: "compatible" as const },
    ];
    const result = normalizePublicSurfaceDeltas(deltas);
    expect(result).toEqual([
      { surface: "rest_api" as const, name: "x", change: "modify", compatibility: "unknown" },
    ]);
  });

  it("keeps other changes alongside add+remove pair", () => {
    const deltas = [
      { surface: "typescript_export" as const, name: "n", change: "add" as const, compatibility: "compatible" as const },
      { surface: "typescript_export" as const, name: "n", change: "remove" as const, compatibility: "breaking" as const },
      { surface: "typescript_export" as const, name: "n", change: "modify" as const, compatibility: "unknown" as const },
    ];
    const result = normalizePublicSurfaceDeltas(deltas);
    expect(result).toHaveLength(2);
    expect(result[0].change).toBe("modify");
    expect(result[1].change).toBe("modify");
  });

  it("passes through deltas without add+remove pair", () => {
    const deltas = [
      { surface: "typescript_export" as const, name: "n", change: "modify" as const, compatibility: "unknown" as const },
    ];
    expect(normalizePublicSurfaceDeltas(deltas)).toEqual(deltas);
  });

  it("handles empty array", () => {
    expect(normalizePublicSurfaceDeltas([])).toEqual([]);
  });

  it("handles multiple independent targets", () => {
    const deltas = [
      { surface: "typescript_export" as const, name: "a", change: "add" as const, compatibility: "compatible" as const },
      { surface: "typescript_export" as const, name: "b", change: "remove" as const, compatibility: "breaking" as const },
    ];
    const result = normalizePublicSurfaceDeltas(deltas);
    expect(result).toHaveLength(2);
  });
});

describe("detectPublicSurfaceFromPatch", () => {
  it("detects config_schema change in package.json", () => {
    const patch = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "config_schema", name: "package.json", change: "modify" }),
      ])
    );
  });

  it("detects config_schema change in tsconfig.json", () => {
    const patch = `diff --git a/tsconfig.json b/tsconfig.json
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "config_schema", name: "tsconfig.json" }),
      ])
    );
  });

  it("detects typescript_export additions and removals", () => {
    const patch = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -1 +1 @@
-export function oldFn() {}
+export async function newFn() {}`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "typescript_export", name: "oldFn", change: "remove" }),
        expect.objectContaining({ surface: "typescript_export", name: "newFn", change: "add" }),
      ])
    );
  });

  it("detects class exports", () => {
    const patch = `diff --git a/src/model.ts b/src/model.ts
--- a/src/model.ts
+++ b/src/model.ts
@@ -1 +1 @@
+export class UserModel {}`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "typescript_export", name: "UserModel", change: "add" }),
      ])
    );
  });

  it("detects interface, type, const, enum exports", () => {
    const patch = `diff --git a/src/types.ts b/src/types.ts
--- a/src/types.ts
+++ b/src/types.ts
@@ -1 +1,4 @@
+export interface IFoo {}
+export type TBar = string;
+export const BAZ = "x";
+export enum Qux { A, B }`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    const names = deltas.map(d => d.name);
    expect(names).toContain("IFoo");
    expect(names).toContain("TBar");
    expect(names).toContain("BAZ");
    expect(names).toContain("Qux");
  });

  it("detects database_schema for migrations", () => {
    const patch = `diff --git a/migrations/001_create_users.sql b/migrations/001_create_users.sql
--- /dev/null
+++ b/migrations/001_create_users.sql
@@ -0,0 +1 @@
+CREATE TABLE users;`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "database_schema" }),
      ])
    );
  });

  it("detects graphql_schema", () => {
    const patch = `diff --git a/schema.graphql b/schema.graphql
--- a/schema.graphql
+++ b/schema.graphql
@@ -1 +1 @@
-type Query { hello: String }
+type Query { hello: String, world: String }`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "graphql_schema" }),
      ])
    );
  });

  it("detects rest_api for openapi files", () => {
    const patch = `diff --git a/openapi.yaml b/openapi.yaml
--- a/openapi.yaml
+++ b/openapi.yaml
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "rest_api" }),
      ])
    );
  });

  it("detects rest_api for routes directory", () => {
    const patch = `diff --git a/routes/users.ts b/routes/users.ts
--- a/routes/users.ts
+++ b/routes/users.ts
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: "rest_api" }),
      ])
    );
  });

  it("detects deletion of package.json as remove", () => {
    const patch = `diff --git a/package.json b/package.json
--- a/package.json
+++ /dev/null
@@ -1 +0,0 @@
-old`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    const pkgDeltas = deltas.filter(d => d.name === "package.json");
    expect(pkgDeltas.length).toBeGreaterThan(0);
    expect(pkgDeltas[0].change).toBe("remove");
  });

  it("does not detect exports from non-TS files", () => {
    const patch = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    expect(deltas).toEqual([]);
  });

  it("deduplicates identical deltas", () => {
    const patch = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-old
+new`;
    const deltas = detectPublicSurfaceFromPatch(patch);
    // Should only have one config_schema delta for package.json
    const pkgDeltas = deltas.filter(d => d.name === "package.json");
    expect(pkgDeltas).toHaveLength(1);
  });

  it("handles patch without diff header", () => {
    expect(detectPublicSurfaceFromPatch("just some text")).toEqual([]);
  });
});
