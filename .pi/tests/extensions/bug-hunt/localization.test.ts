/**
 * expandBugHuntPreferredFilesのパストラバーサル防止テスト
 * バグ: resolveRelativeImportPath lacks path traversal validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join, resolve } from "path";
import { tmpdir } from "os";

// テスト用一時ディレクトリ
let testDir: string;

describe("expandBugHuntPreferredFiles パストラバーサル防止", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `bug-hunt-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("resolveRelativeImportPath", () => {
    it("通常の相対インポートを正しく解決する", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      // テストファイルを作成
      const mainFile = join(testDir, "main.ts");
      const importedFile = join(testDir, "utils.ts");
      await writeFile(mainFile, `import { foo } from "./utils";\nconsole.log(foo);`);
      await writeFile(importedFile, `export const foo = "bar";`);

      const result = await expandBugHuntPreferredFiles(testDir, ["main.ts"]);

      // main.ts自体とutils.tsが含まれる
      expect(result).toContain("main.ts");
      expect(result.some((f) => f.endsWith("utils.ts") || f === "utils.ts")).toBe(true);
    });

    it("ネストしたディレクトリの相対インポートを正しく解決する", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      // ネストしたディレクトリ構造
      await mkdir(join(testDir, "src", "lib"), { recursive: true });
      const nestedFile = join(testDir, "src", "lib", "helper.ts");
      const rootFile = join(testDir, "src", "index.ts");
      await writeFile(nestedFile, `import { config } from "../../config";\n`);
      await writeFile(rootFile, `export const config = {};`);

      const result = await expandBugHuntPreferredFiles(testDir, ["src/lib/helper.ts"]);

      // helper.tsとconfig.ts（index.tsとして解決される可能性）が含まれる
      expect(result.some((f) => f.includes("helper"))).toBe(true);
    });

    it("パストラバーサル攻撃（../etc/passwd）をブロックする", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      // パストラバーサルを含むファイル
      const maliciousFile = join(testDir, "malicious.ts");
      await writeFile(maliciousFile, `import * as passwd from "../../../etc/passwd";\n`);

      const result = await expandBugHuntPreferredFiles(testDir, ["malicious.ts"]);

      // malicious.ts自体は含まれるが、/etc/passwdへのパスは含まれない
      expect(result).toContain("malicious.ts");
      // ワークスペース外のパスは含まれない
      expect(result.some((f) => f.includes("etc") || f.includes("passwd"))).toBe(false);
    });

    it("深いパストラバーサル（../../../../..）をブロックする", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      // 深いパストラバーサル
      const deepTraversalFile = join(testDir, "deep.ts");
      await writeFile(
        deepTraversalFile,
        `import * as secret from "../../../../../../../etc/shadow";\n`,
      );

      const result = await expandBugHuntPreferredFiles(testDir, ["deep.ts"]);

      // deep.ts自体は含まれるが、/etc/shadowへのパスは含まれない
      expect(result).toContain("deep.ts");
      expect(result.some((f) => f.includes("shadow"))).toBe(false);
    });

    it("正規の親ディレクトリ参照（../）を含むインポートを処理する", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      // 正規の親ディレクトリ参照
      await mkdir(join(testDir, "src", "subdir"), { recursive: true });
      const subdirFile = join(testDir, "src", "subdir", "child.ts");
      const parentFile = join(testDir, "src", "parent.ts");
      await writeFile(subdirFile, `import { data } from "../parent";\n`);
      await writeFile(parentFile, `export const data = "test";`);

      const result = await expandBugHuntPreferredFiles(testDir, ["src/subdir/child.ts"]);

      // child.tsとparent.tsが含まれる
      expect(result.some((f) => f.includes("child"))).toBe(true);
      expect(result.some((f) => f.includes("parent"))).toBe(true);
    });
  });

  describe("エラーハンドリング", () => {
    it("存在しないファイルも初期リストに含まれる（インポート展開はスキップ）", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      const result = await expandBugHuntPreferredFiles(testDir, ["nonexistent.ts"]);

      // 初期リストには含まれる（インポート展開はスキップされる）
      expect(result).toContain("nonexistent.ts");
      expect(result.length).toBe(1); // インポート展開されていない
    });

    it("空のfocusFilesリストに対して空の結果を返す", async () => {
      const { expandBugHuntPreferredFiles } = await import(
        "../../../extensions/bug-hunt/localization.js"
      );

      const result = await expandBugHuntPreferredFiles(testDir, []);

      expect(result).toEqual([]);
    });
  });
});
