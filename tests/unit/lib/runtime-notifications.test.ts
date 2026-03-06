/**
 * @file .pi/lib/agent/runtime-notifications.ts の単体テスト
 * @description ランタイム通知の生成と整形を検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../../../.pi/lib/agent/runtime-notifications.js";

describe("runtime-notifications", () => {
  it("空メッセージは通知を作らない", () => {
    expect(createRuntimeNotification("startup", "   ")).toBeUndefined();
  });

  it("ttl を含む通知を作る", () => {
    expect(createRuntimeNotification("startup", "Use cheap probes first", "warning", 1)).toEqual({
      source: "startup",
      message: "Use cheap probes first",
      severity: "warning",
      ttlTurns: 1,
    });
  });

  it("複数通知をブロックへ整形する", () => {
    const block = formatRuntimeNotificationBlock([
      createRuntimeNotification("startup", "Use cheap probes first", "info", 1)!,
      createRuntimeNotification("plan-mode", "Edits are discouraged in this turn", "warning")!,
    ]);

    expect(block).toContain("# Runtime Notifications");
    expect(block).toContain("[info] startup ttl=1");
    expect(block).toContain("[warning] plan-mode");
    expect(block).toContain("Use cheap probes first");
  });
});
