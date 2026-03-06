/**
 * path: tests/unit/extensions/abdd-ast-safety.test.ts
 * what: ABDD AST 解析が計算プロパティ名で落ちないことを検証する
 * why: UL から分離しても ABDD 単体で安定動作させるため
 * related: .pi/extensions/abdd.ts, tests/unit/extensions/abdd.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ASTDivergenceDetector } from "../../../.pi/extensions/abdd";

describe("ASTDivergenceDetector", () => {
  it("computed method names in dependency code do not throw", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "abdd-ast-safety-"));
    const filePath = path.join(dir, "computed-method.ts");

    writeFileSync(
      filePath,
      [
        "const dynamicName = Symbol('dynamic');",
        "class Example {",
        "  [dynamicName](): void {",
        "    return;",
        "  }",
        "}",
      ].join("\n"),
      "utf-8",
    );

    try {
      const detector = new ASTDivergenceDetector();
      expect(() => detector.analyzeFile(filePath)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
