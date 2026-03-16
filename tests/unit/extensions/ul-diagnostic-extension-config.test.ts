/**
 * @summary ul-diagnostic拡張機能設定検証のテスト
 *
 * このテストは checkExtensionConfiguration() が使用する
 * comprehensive-logger-config の validateConfig() の動作を検証する
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateConfig,
  loadConfigFromEnv,
  DEFAULT_CONFIG,
  resetConfig,
} from "../../../.pi/lib/comprehensive-logger-config.js";
import type { LoggerConfig } from "../../../.pi/lib/comprehensive-logger-types.js";

describe("ul-diagnostic extension config validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe("valid configuration", () => {
    it("should return no issues when config is valid", () => {
      const config = loadConfigFromEnv(DEFAULT_CONFIG);
      const validation = validateConfig(config);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe("invalid minLogLevel", () => {
    it("should detect invalid minLogLevel", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        minLogLevel: "invalid" as "debug" | "info" | "warn" | "error",
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("minLogLevel"))).toBe(true);
    });
  });

  describe("invalid bufferSize", () => {
    it("should detect bufferSize < 1", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        bufferSize: 0,
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("bufferSize"))).toBe(true);
    });

    it("should detect negative bufferSize", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        bufferSize: -10,
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("bufferSize"))).toBe(true);
    });
  });

  describe("invalid environment", () => {
    it("should detect invalid environment value", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        environment: "invalid" as "development" | "production" | "test",
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("environment"))).toBe(true);
    });
  });

  describe("invalid flushIntervalMs", () => {
    it("should detect flushIntervalMs < 100", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        flushIntervalMs: 50,
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("flushIntervalMs"))).toBe(true);
    });
  });

  describe("invalid maxFileSizeMB", () => {
    it("should detect maxFileSizeMB < 1", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        maxFileSizeMB: 0,
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("maxFileSizeMB"))).toBe(true);
    });
  });

  describe("invalid retentionDays", () => {
    it("should detect retentionDays < 1", () => {
      const config: LoggerConfig = {
        ...DEFAULT_CONFIG,
        retentionDays: 0,
      };
      const validation = validateConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("retentionDays"))).toBe(true);
    });
  });

  describe("environment variable loading", () => {
    it("should load config from environment variables", () => {
      process.env.PI_LOG_BUFFER_SIZE = "200";
      process.env.PI_LOG_MIN_LEVEL = "debug";

      resetConfig();
      const config = loadConfigFromEnv(DEFAULT_CONFIG);

      expect(config.bufferSize).toBe(200);
      expect(config.minLogLevel).toBe("debug");

      // クリーンアップ
      delete process.env.PI_LOG_BUFFER_SIZE;
      delete process.env.PI_LOG_MIN_LEVEL;
    });
  });
});
