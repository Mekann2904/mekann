/**
 * @file tests/unit/lib/global-error-handler.test.ts
 * @description .pi/lib/global-error-handler.ts の単体テスト
 * @testFramework vitest
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setupGlobalErrorHandlers,
  teardownGlobalErrorHandlers,
} from "../../../.pi/lib/global-error-handler.js";

describe("global-error-handler", () => {
  afterEach(() => {
    teardownGlobalErrorHandlers();
    vi.restoreAllMocks();
  });

  it("Unhandled stop reason: abort は uncaughtException でも exit しない", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    setupGlobalErrorHandlers({ exitOnUncaught: true, exitCode: 9 });

    const handler = process.listeners("uncaughtException").at(-1) as
      | ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void)
      | undefined;

    expect(handler).toBeTypeOf("function");
    handler?.(new Error("Unhandled stop reason: abort"), "uncaughtException");

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("通常の uncaughtException は既存どおり exit する", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    setupGlobalErrorHandlers({ exitOnUncaught: true, exitCode: 7 });

    const handler = process.listeners("uncaughtException").at(-1) as
      | ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void)
      | undefined;

    expect(handler).toBeTypeOf("function");
    handler?.(new Error("fatal"), "uncaughtException");

    expect(exitSpy).toHaveBeenCalledWith(7);
  });

  it("Unhandled stop reason: abort の unhandledRejection を安全に無視する", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    setupGlobalErrorHandlers({ exitOnUncaught: true });

    const handler = process.listeners("unhandledRejection").at(-1) as
      | ((reason: unknown, promise: Promise<unknown>) => void)
      | undefined;

    expect(handler).toBeTypeOf("function");
    expect(() => handler?.(new Error("Unhandled stop reason: abort"), Promise.resolve())).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
