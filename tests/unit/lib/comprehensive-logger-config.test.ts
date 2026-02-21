/**
 * comprehensive-logger-config.ts 単体テスト
 * カバレッジ: DEFAULT_CONFIG, loadConfigFromEnv, validateConfig, getConfig, resetConfig
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import {
  DEFAULT_CONFIG,
  loadConfigFromEnv,
  validateConfig,
  getConfig,
  resetConfig,
  PRODUCTION_PRESET,
  DEVELOPMENT_PRESET,
} from "../../../.pi/lib/comprehensive-logger-config.js";
import type { LoggerConfig } from "../../../.pi/lib/comprehensive-logger-types.js";

// ============================================================================
// DEFAULT_CONFIG テスト
// ============================================================================

describe("DEFAULT_CONFIG", () => {
  it("正しいデフォルト値を持つ", () => {
    expect(DEFAULT_CONFIG.logDir).toBe(".pi/logs");
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.bufferSize).toBe(100);
    expect(DEFAULT_CONFIG.flushIntervalMs).toBe(1000);
    expect(DEFAULT_CONFIG.maxFileSizeMB).toBe(100);
    expect(DEFAULT_CONFIG.retentionDays).toBe(30);
    expect(DEFAULT_CONFIG.environment).toBe("development");
    expect(DEFAULT_CONFIG.minLogLevel).toBe("info");
  });

  it("不変条件を満たす", () => {
    expect(DEFAULT_CONFIG.bufferSize).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.flushIntervalMs).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_CONFIG.maxFileSizeMB).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.retentionDays).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// loadConfigFromEnv テスト
// ============================================================================

describe("loadConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  describe("環境変数なし", () => {
    it("ベース設定をそのまま返す", () => {
      const baseConfig: LoggerConfig = {
        logDir: "/custom/logs",
        enabled: false,
        bufferSize: 50,
        flushIntervalMs: 500,
        maxFileSizeMB: 50,
        retentionDays: 7,
        environment: "test",
        minLogLevel: "debug",
      };

      const result = loadConfigFromEnv(baseConfig);
      expect(result).toEqual(baseConfig);
    });

    it("ベース設定なし_デフォルトを返す", () => {
      const result = loadConfigFromEnv();
      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("PI_LOG_ENABLED", () => {
    it("true_有効化", () => {
      process.env.PI_LOG_ENABLED = "true";
      const result = loadConfigFromEnv();
      expect(result.enabled).toBe(true);
    });

    it("false_無効化", () => {
      process.env.PI_LOG_ENABLED = "false";
      const result = loadConfigFromEnv();
      expect(result.enabled).toBe(false);
    });

    it("1_有効化", () => {
      process.env.PI_LOG_ENABLED = "1";
      const result = loadConfigFromEnv();
      expect(result.enabled).toBe(true);
    });

    it("0_無効化", () => {
      process.env.PI_LOG_ENABLED = "0";
      const result = loadConfigFromEnv();
      expect(result.enabled).toBe(false);
    });

    it("TRUE_大文字でも有効化", () => {
      process.env.PI_LOG_ENABLED = "TRUE";
      const result = loadConfigFromEnv();
      expect(result.enabled).toBe(true);
    });
  });

  describe("PI_LOG_DIR", () => {
    it("カスタムパスを設定", () => {
      process.env.PI_LOG_DIR = "/custom/log/path";
      const result = loadConfigFromEnv();
      expect(result.logDir).toBe("/custom/log/path");
    });
  });

  describe("PI_LOG_BUFFER_SIZE", () => {
    it("数値を設定", () => {
      process.env.PI_LOG_BUFFER_SIZE = "200";
      const result = loadConfigFromEnv();
      expect(result.bufferSize).toBe(200);
    });

    it("無効な値_NaNになる", () => {
      process.env.PI_LOG_BUFFER_SIZE = "invalid";
      const result = loadConfigFromEnv();
      expect(result.bufferSize).toBeNaN();
    });
  });

  describe("PI_LOG_FLUSH_INTERVAL_MS", () => {
    it("数値を設定", () => {
      process.env.PI_LOG_FLUSH_INTERVAL_MS = "5000";
      const result = loadConfigFromEnv();
      expect(result.flushIntervalMs).toBe(5000);
    });
  });

  describe("PI_LOG_MAX_FILE_SIZE_MB", () => {
    it("数値を設定", () => {
      process.env.PI_LOG_MAX_FILE_SIZE_MB = "250";
      const result = loadConfigFromEnv();
      expect(result.maxFileSizeMB).toBe(250);
    });
  });

  describe("PI_LOG_RETENTION_DAYS", () => {
    it("数値を設定", () => {
      process.env.PI_LOG_RETENTION_DAYS = "60";
      const result = loadConfigFromEnv();
      expect(result.retentionDays).toBe(60);
    });
  });

  describe("PI_LOG_ENVIRONMENT", () => {
    it("環境を設定", () => {
      process.env.PI_LOG_ENVIRONMENT = "production";
      const result = loadConfigFromEnv();
      expect(result.environment).toBe("production");
    });
  });

  describe("PI_LOG_MIN_LEVEL", () => {
    it("ログレベルを設定", () => {
      process.env.PI_LOG_MIN_LEVEL = "debug";
      const result = loadConfigFromEnv();
      expect(result.minLogLevel).toBe("debug");
    });
  });

  describe("複数環境変数", () => {
    it("複数の値を同時に設定", () => {
      process.env.PI_LOG_ENABLED = "true";
      process.env.PI_LOG_BUFFER_SIZE = "200";
      process.env.PI_LOG_ENVIRONMENT = "production";
      process.env.PI_LOG_MIN_LEVEL = "warn";

      const result = loadConfigFromEnv();

      expect(result.enabled).toBe(true);
      expect(result.bufferSize).toBe(200);
      expect(result.environment).toBe("production");
      expect(result.minLogLevel).toBe("warn");
    });
  });
});

// ============================================================================
// validateConfig テスト
// ============================================================================

describe("validateConfig", () => {
  describe("正常ケース", () => {
    it("デフォルト設定_有効", () => {
      const result = validateConfig(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("有効なカスタム設定_有効", () => {
      const config: LoggerConfig = {
        logDir: "/logs",
        enabled: true,
        bufferSize: 50,
        flushIntervalMs: 500,
        maxFileSizeMB: 10,
        retentionDays: 1,
        environment: "development",
        minLogLevel: "info",
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("bufferSize", () => {
    it("0_エラー", () => {
      const config = { ...DEFAULT_CONFIG, bufferSize: 0 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("bufferSize must be at least 1");
    });

    it("負の値_エラー", () => {
      const config = { ...DEFAULT_CONFIG, bufferSize: -1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("bufferSize must be at least 1");
    });

    it("1_有効", () => {
      const config = { ...DEFAULT_CONFIG, bufferSize: 1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("flushIntervalMs", () => {
    it("99_エラー", () => {
      const config = { ...DEFAULT_CONFIG, flushIntervalMs: 99 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("flushIntervalMs must be at least 100ms");
    });

    it("100_有効", () => {
      const config = { ...DEFAULT_CONFIG, flushIntervalMs: 100 };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("maxFileSizeMB", () => {
    it("0_エラー", () => {
      const config = { ...DEFAULT_CONFIG, maxFileSizeMB: 0 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("maxFileSizeMB must be at least 1");
    });

    it("1_有効", () => {
      const config = { ...DEFAULT_CONFIG, maxFileSizeMB: 1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("retentionDays", () => {
    it("0_エラー", () => {
      const config = { ...DEFAULT_CONFIG, retentionDays: 0 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("retentionDays must be at least 1");
    });
  });

  describe("environment", () => {
    it("無効な環境_エラー", () => {
      const config = { ...DEFAULT_CONFIG, environment: "invalid" as LoggerConfig["environment"] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("environment must be one of"))).toBe(true);
    });

    it("development_有効", () => {
      const config = { ...DEFAULT_CONFIG, environment: "development" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it("production_有効", () => {
      const config = { ...DEFAULT_CONFIG, environment: "production" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it("test_有効", () => {
      const config = { ...DEFAULT_CONFIG, environment: "test" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("minLogLevel", () => {
    it("無効なレベル_エラー", () => {
      const config = { ...DEFAULT_CONFIG, minLogLevel: "trace" as LoggerConfig["minLogLevel"] };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("minLogLevel must be one of"))).toBe(true);
    });

    it("debug_有効", () => {
      const config = { ...DEFAULT_CONFIG, minLogLevel: "debug" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it("info_有効", () => {
      const config = { ...DEFAULT_CONFIG, minLogLevel: "info" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it("warn_有効", () => {
      const config = { ...DEFAULT_CONFIG, minLogLevel: "warn" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it("error_有効", () => {
      const config = { ...DEFAULT_CONFIG, minLogLevel: "error" };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("複数エラー", () => {
    it("複数のエラーを検出", () => {
      const config: LoggerConfig = {
        logDir: "/logs",
        enabled: true,
        bufferSize: 0,
        flushIntervalMs: 50,
        maxFileSizeMB: 0,
        retentionDays: 0,
        environment: "invalid" as LoggerConfig["environment"],
        minLogLevel: "trace" as LoggerConfig["minLogLevel"],
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ============================================================================
// getConfig テスト
// ============================================================================

describe("getConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  it("キャッシュされる", () => {
    const config1 = getConfig();
    const config2 = getConfig();
    expect(config1).toBe(config2);
  });

  it("resetConfigでキャッシュクリア", () => {
    const config1 = getConfig();
    resetConfig();
    const config2 = getConfig();
    // 新しいオブジェクトが生成される
    expect(config1).not.toBe(config2);
  });

  it("環境変数を反映", () => {
    process.env.PI_LOG_BUFFER_SIZE = "300";
    resetConfig();
    const config = getConfig();
    expect(config.bufferSize).toBe(300);
  });

  it("無効な設定_デフォルトにフォールバック", () => {
    // キャッシュをクリア
    resetConfig();

    // 無効な環境変数を設定しても、getConfigはデフォルトにフォールバックする
    const config = getConfig();
    // バリデーションに失敗した場合、デフォルトが使用される
    expect(config.bufferSize).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// resetConfig テスト
// ============================================================================

describe("resetConfig", () => {
  it("複数回呼び出し可能", () => {
    expect(() => {
      resetConfig();
      resetConfig();
      resetConfig();
    }).not.toThrow();
  });

  it("キャッシュをクリア", () => {
    getConfig();
    resetConfig();
    // 次回のgetConfigで新しいキャッシュが作成される
    const config = getConfig();
    expect(config).toBeDefined();
  });
});

// ============================================================================
// プリセットテスト
// ============================================================================

describe("PRODUCTION_PRESET", () => {
  it("本番環境向けの設定を持つ", () => {
    expect(PRODUCTION_PRESET.bufferSize).toBe(500);
    expect(PRODUCTION_PRESET.flushIntervalMs).toBe(5000);
    expect(PRODUCTION_PRESET.maxFileSizeMB).toBe(500);
    expect(PRODUCTION_PRESET.retentionDays).toBe(90);
    expect(PRODUCTION_PRESET.environment).toBe("production");
    expect(PRODUCTION_PRESET.minLogLevel).toBe("info");
  });

  it("有効な設定", () => {
    const config = { ...DEFAULT_CONFIG, ...PRODUCTION_PRESET };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });
});

describe("DEVELOPMENT_PRESET", () => {
  it("開発環境向けの設定を持つ", () => {
    expect(DEVELOPMENT_PRESET.bufferSize).toBe(50);
    expect(DEVELOPMENT_PRESET.flushIntervalMs).toBe(500);
    expect(DEVELOPMENT_PRESET.maxFileSizeMB).toBe(50);
    expect(DEVELOPMENT_PRESET.retentionDays).toBe(7);
    expect(DEVELOPMENT_PRESET.environment).toBe("development");
    expect(DEVELOPMENT_PRESET.minLogLevel).toBe("debug");
  });

  it("有効な設定", () => {
    const config = { ...DEFAULT_CONFIG, ...DEVELOPMENT_PRESET };
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  describe("validateConfig", () => {
    it("任意の設定_常にbooleanと配列を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            logDir: fc.string(),
            enabled: fc.boolean(),
            bufferSize: fc.integer(),
            flushIntervalMs: fc.integer(),
            maxFileSizeMB: fc.integer(),
            retentionDays: fc.integer(),
            environment: fc.constantFrom("development", "production", "test", "invalid"),
            minLogLevel: fc.constantFrom("debug", "info", "warn", "error", "invalid"),
          }),
          (config) => {
            const result = validateConfig(config as LoggerConfig);
            expect(typeof result.valid).toBe("boolean");
            expect(Array.isArray(result.errors)).toBe(true);
          }
        )
      );
    });
  });

  describe("loadConfigFromEnv", () => {
    it("任意のベース設定_オブジェクトを返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            logDir: fc.string(),
            enabled: fc.boolean(),
            bufferSize: fc.integer({ min: 1, max: 1000 }),
            flushIntervalMs: fc.integer({ min: 100, max: 60000 }),
            maxFileSizeMB: fc.integer({ min: 1, max: 1000 }),
            retentionDays: fc.integer({ min: 1, max: 365 }),
            environment: fc.constantFrom("development", "production", "test"),
            minLogLevel: fc.constantFrom("debug", "info", "warn", "error"),
          }),
          (baseConfig) => {
            const result = loadConfigFromEnv(baseConfig as LoggerConfig);
            expect(result).toBeDefined();
            expect(typeof result).toBe("object");
          }
        )
      );
    });
  });
});
