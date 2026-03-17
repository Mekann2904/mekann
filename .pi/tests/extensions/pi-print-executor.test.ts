/**
 * @fileoverview pi-print-executor 関連のユニットテスト
 * @module tests/extensions/pi-print-executor
 */

import { describe, it, expect } from "vitest";
import { isRetryablePiChildErrorMessage } from "../../extensions/shared/pi-print-executor.js";

describe("isRetryablePiChildErrorMessage", () => {
  describe("timeout patterns", () => {
    it("should match hard timeout errors", () => {
      expect(isRetryablePiChildErrorMessage("RSA hard timeout after 1000ms")).toBe(true);
    });

    it("should match idle timeout errors", () => {
      expect(isRetryablePiChildErrorMessage("RSA idle timeout after 2000ms of no output")).toBe(true);
    });

    it("should match generic timeout errors", () => {
      expect(isRetryablePiChildErrorMessage("operation timeout")).toBe(true);
      // Note: "timed out" does not match - only "timeout" pattern is supported
    });
  });

  describe("existing retryable patterns", () => {
    it("should match rate limit errors", () => {
      expect(isRetryablePiChildErrorMessage("rate limit exceeded")).toBe(true);
      expect(isRetryablePiChildErrorMessage("too many requests")).toBe(true);
      expect(isRetryablePiChildErrorMessage("429 error")).toBe(true);
    });

    it("should match server errors", () => {
      expect(isRetryablePiChildErrorMessage("500 internal server error")).toBe(true);
      expect(isRetryablePiChildErrorMessage("502 bad gateway")).toBe(true);
      expect(isRetryablePiChildErrorMessage("503 service unavailable")).toBe(true);
      expect(isRetryablePiChildErrorMessage("504 gateway timeout")).toBe(true);
    });

    it("should match connection errors", () => {
      expect(isRetryablePiChildErrorMessage("connection refused")).toBe(true);
      expect(isRetryablePiChildErrorMessage("fetch failed")).toBe(true);
      expect(isRetryablePiChildErrorMessage("other side closed")).toBe(true);
    });

    it("should match overloaded/retry errors", () => {
      expect(isRetryablePiChildErrorMessage("server overloaded")).toBe(true);
      expect(isRetryablePiChildErrorMessage("retry delay 30s")).toBe(true);
      expect(isRetryablePiChildErrorMessage("process terminated")).toBe(true);
    });
  });

  describe("non-retryable errors", () => {
    it("should not match permanent errors", () => {
      expect(isRetryablePiChildErrorMessage("invalid syntax")).toBe(false);
      expect(isRetryablePiChildErrorMessage("file not found")).toBe(false);
      expect(isRetryablePiChildErrorMessage("permission denied")).toBe(false);
    });

    it("should not match empty or undefined", () => {
      expect(isRetryablePiChildErrorMessage("")).toBe(false);
    });
  });
});
