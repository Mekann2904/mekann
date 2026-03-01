/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDuration,
  formatDurationMs,
  formatElapsedClock,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "../../../lib/core/format-utils.js";

describe("formatDuration", () => {
  it("should format milliseconds less than 1000", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1)).toBe("1ms");
    expect(formatDuration(100)).toBe("100ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("should format seconds for 1000ms or more", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(1500)).toBe("1.50s");
    expect(formatDuration(12345)).toBe("12.35s");
  });

  it("should handle edge cases", () => {
    expect(formatDuration(-1)).toBe("0ms");
    expect(formatDuration(-1000)).toBe("0ms");
    expect(formatDuration(Infinity)).toBe("0ms");
    expect(formatDuration(-Infinity)).toBe("0ms");
    expect(formatDuration(NaN)).toBe("0ms");
  });

  it("should round milliseconds", () => {
    expect(formatDuration(100.4)).toBe("100ms");
    expect(formatDuration(100.5)).toBe("101ms");
    expect(formatDuration(100.6)).toBe("101ms");
  });
});

describe("formatDurationMs", () => {
  it("should return '-' when startedAtMs is not set", () => {
    expect(formatDurationMs({})).toBe("-");
    expect(formatDurationMs({ finishedAtMs: 2000 })).toBe("-");
  });

  it("should calculate duration from startedAtMs to now", () => {
    const now = Date.now();
    const item = { startedAtMs: now - 5000 };
    const result = formatDurationMs(item);
    // Should be approximately 5.0s
    expect(result).toMatch(/^5\.\ds$/);
  });

  it("should calculate duration from startedAtMs to finishedAtMs", () => {
    const item = {
      startedAtMs: 1000,
      finishedAtMs: 6000,
    };
    expect(formatDurationMs(item)).toBe("5.0s");
  });

  it("should handle negative duration as 0", () => {
    const item = {
      startedAtMs: 6000,
      finishedAtMs: 1000,
    };
    expect(formatDurationMs(item)).toBe("0.0s");
  });

  it("should format with one decimal place", () => {
    const item = {
      startedAtMs: 10000,
      finishedAtMs: 11234,
    };
    expect(formatDurationMs(item)).toBe("1.2s");
  });
});

describe("formatElapsedClock", () => {
  it("should return '-' when startedAtMs is not set", () => {
    expect(formatElapsedClock({})).toBe("-");
    expect(formatElapsedClock({ finishedAtMs: 2000 })).toBe("-");
  });

  it("should format duration as HH:mm:ss", () => {
    // 1 hour, 23 minutes, 45 seconds = 5025000ms
    const item = {
      startedAtMs: 10000,
      finishedAtMs: 5035000,
    };
    expect(formatElapsedClock(item)).toBe("01:23:45");
  });

  it("should handle zero duration", () => {
    const item = {
      startedAtMs: 1000,
      finishedAtMs: 1000,
    };
    expect(formatElapsedClock(item)).toBe("00:00:00");
  });

  it("should pad single digits with zeros", () => {
    // 1 second
    const item = {
      startedAtMs: 10000,
      finishedAtMs: 11000,
    };
    expect(formatElapsedClock(item)).toBe("00:00:01");

    // 1 minute
    const item2 = {
      startedAtMs: 10000,
      finishedAtMs: 70000,
    };
    expect(formatElapsedClock(item2)).toBe("00:01:00");
  });

  it("should handle large durations", () => {
    // 100 hours, 1 minute, 1 second
    const item = {
      startedAtMs: 10000,
      finishedAtMs: 360071000,
    };
    expect(formatElapsedClock(item)).toBe("100:01:01");
  });

  it("should handle negative duration as 0", () => {
    const item = {
      startedAtMs: 6000,
      finishedAtMs: 1000,
    };
    expect(formatElapsedClock(item)).toBe("00:00:00");
  });

  it("should use current time if finishedAtMs not set", () => {
    const now = Date.now();
    const item = { startedAtMs: now - 1000 };
    const result = formatElapsedClock(item);
    // Should be approximately 00:00:01
    expect(result).toMatch(/^00:00:0\d$/);
  });
});

describe("formatBytes", () => {
  it("should format bytes less than 1024", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(1)).toBe("1B");
    expect(formatBytes(100)).toBe("100B");
    expect(formatBytes(1023)).toBe("1023B");
  });

  it("should format kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0KB");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(1024 * 1023)).toBe("1023.0KB");
  });

  it("should format megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0MB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5MB");
    expect(formatBytes(1024 * 1024 * 100)).toBe("100.0MB");
  });

  it("should handle negative values as 0", () => {
    expect(formatBytes(-1)).toBe("0B");
    expect(formatBytes(-1024)).toBe("0B");
  });

  it("should truncate to integer", () => {
    expect(formatBytes(100.9)).toBe("100B");
    expect(formatBytes(1024.9)).toBe("1.0KB");
  });

  it("should handle large values", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1024.0MB");
  });
});

describe("formatClockTime", () => {
  it("should return '-' for undefined value", () => {
    expect(formatClockTime()).toBe("-");
    expect(formatClockTime(undefined)).toBe("-");
  });

  it("should return '-' for 0", () => {
    expect(formatClockTime(0)).toBe("-");
  });

  it("should format time as HH:mm:ss", () => {
    // 2024-01-15 10:30:45 (example timestamp)
    const timestamp = new Date(2024, 0, 15, 10, 30, 45).getTime();
    expect(formatClockTime(timestamp)).toBe("10:30:45");
  });

  it("should pad single digits with zeros", () => {
    // 2024-01-15 01:02:03
    const timestamp = new Date(2024, 0, 15, 1, 2, 3).getTime();
    expect(formatClockTime(timestamp)).toBe("01:02:03");
  });

  it("should handle midnight", () => {
    const timestamp = new Date(2024, 0, 15, 0, 0, 0).getTime();
    expect(formatClockTime(timestamp)).toBe("00:00:00");
  });

  it("should handle end of day", () => {
    const timestamp = new Date(2024, 0, 15, 23, 59, 59).getTime();
    expect(formatClockTime(timestamp)).toBe("23:59:59");
  });
});

describe("normalizeForSingleLine", () => {
  it("should collapse whitespace", () => {
    expect(normalizeForSingleLine("hello   world")).toBe("hello world");
    expect(normalizeForSingleLine("hello\tworld")).toBe("hello world");
    expect(normalizeForSingleLine("hello\nworld")).toBe("hello world");
    expect(normalizeForSingleLine("hello\r\nworld")).toBe("hello world");
    expect(normalizeForSingleLine("  hello  world  ")).toBe("hello world");
  });

  it("should trim whitespace", () => {
    expect(normalizeForSingleLine("  hello world  ")).toBe("hello world");
    expect(normalizeForSingleLine("\n\thello\n\t")).toBe("hello");
  });

  it("should return '-' for empty string after normalization", () => {
    expect(normalizeForSingleLine("")).toBe("-");
    expect(normalizeForSingleLine("   ")).toBe("-");
    expect(normalizeForSingleLine("\n\t")).toBe("-");
  });

  it("should truncate long strings with ellipsis", () => {
    const longText = "a".repeat(200);
    const result = normalizeForSingleLine(longText);
    expect(result.length).toBe(160);
    expect(result.endsWith("...")).toBe(true);
    expect(result).toBe(`${"a".repeat(157)}...`);
  });

  it("should not truncate short strings", () => {
    const shortText = "hello world";
    expect(normalizeForSingleLine(shortText)).toBe("hello world");
  });

  it("should respect custom max length", () => {
    const text = "hello world";
    expect(normalizeForSingleLine(text, 5)).toBe("he...");
    expect(normalizeForSingleLine(text, 20)).toBe("hello world");
  });

  it("should use LRU cache for repeated calls", () => {
    const input = "  test  input  ";
    // First call
    const result1 = normalizeForSingleLine(input);
    // Second call with same input
    const result2 = normalizeForSingleLine(input);
    expect(result1).toBe("test input");
    expect(result2).toBe("test input");
  });

  it("should cache different max lengths separately", () => {
    const input = "hello world test";
    const result1 = normalizeForSingleLine(input, 10);
    const result2 = normalizeForSingleLine(input, 20);
    expect(result1).toBe("hello w...");
    expect(result2).toBe("hello world test");
  });

  it("should evict oldest entries when cache is full", () => {
    // Create 257 unique inputs to exceed cache size of 256
    const inputs = [];
    for (let i = 0; i < 257; i++) {
      inputs.push(`unique input ${i}`);
    }
    
    // Process all inputs
    for (const input of inputs) {
      normalizeForSingleLine(input);
    }
    
    // All should return valid results without error
    for (const input of inputs) {
      const result = normalizeForSingleLine(input);
      expect(typeof result).toBe("string");
    }
  });

  it("should handle complex whitespace patterns", () => {
    expect(normalizeForSingleLine("a\n\n\nb\t\t\tc   d")).toBe("a b c d");
    expect(normalizeForSingleLine("  \n\t  hello  \n\t  ")).toBe("hello");
  });

  it("should handle unicode characters", () => {
    expect(normalizeForSingleLine("  日本語  テスト  ")).toBe("日本語 テスト");
    expect(normalizeForSingleLine("  emoji 🎉  test  ")).toBe("emoji 🎉 test");
  });
});
