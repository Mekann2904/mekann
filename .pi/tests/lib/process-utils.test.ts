/**
 * @jest-environment node
 */
import { describe, it, expect } from "vitest";
import { GRACEFUL_SHUTDOWN_DELAY_MS } from "../../lib/process-utils.js";

describe("process-utils", () => {
  describe("GRACEFUL_SHUTDOWN_DELAY_MS", () => {
    it("should_be_positive_integer", () => {
      // Arrange & Act & Assert
      expect(GRACEFUL_SHUTDOWN_DELAY_MS).toBeGreaterThan(0);
      expect(Number.isInteger(GRACEFUL_SHUTDOWN_DELAY_MS)).toBe(true);
    });

    it("should_be_2000_ms_default", () => {
      // Arrange & Act & Assert
      expect(GRACEFUL_SHUTDOWN_DELAY_MS).toBe(2000);
    });

    it("should_be_reasonable_shutdown_delay", () => {
      // Arrange & Act & Assert
      // Should be between 1-10 seconds for reasonable graceful shutdown
      expect(GRACEFUL_SHUTDOWN_DELAY_MS).toBeGreaterThanOrEqual(1000);
      expect(GRACEFUL_SHUTDOWN_DELAY_MS).toBeLessThanOrEqual(10000);
    });
  });
});
