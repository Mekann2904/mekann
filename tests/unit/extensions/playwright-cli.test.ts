/**
 * path: tests/unit/extensions/playwright-cli.test.ts
 * role: playwright-cli 拡張の引数構築と出力整形の単体テスト
 * why: コマンド構築とオプション処理の退行を防ぐため
 * related: .pi/extensions/playwright-cli.ts, package.json, tests/unit/extensions/github-agent.test.ts
 */

import { describe, expect, it } from "vitest";
import { buildPlaywrightCliArgs } from "../../../.pi/extensions/playwright-cli.js";

describe("playwright-cli extension", () => {
  describe("buildPlaywrightCliArgs", () => {
    it("command only", () => {
      const args = buildPlaywrightCliArgs({ command: "list" });
      expect(args).toEqual(["list"]);
    });

    it("session and config", () => {
      const args = buildPlaywrightCliArgs({
        command: "open",
        args: ["https://example.com", "--headed"],
        session: "todo-app",
        config: ".playwright/cli.config.json",
      });

      expect(args).toEqual([
        "-s=todo-app",
        "--config",
        ".playwright/cli.config.json",
        "open",
        "https://example.com",
        "--headed",
      ]);
    });

    it("empty args are ignored", () => {
      const args = buildPlaywrightCliArgs({
        command: "snapshot",
        args: [],
      });

      expect(args).toEqual(["snapshot"]);
    });
  });
});
