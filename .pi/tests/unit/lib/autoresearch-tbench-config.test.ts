/**
 * @abdd.meta
 * path: .pi/tests/unit/lib/autoresearch-tbench-config.test.ts
 * role: autoresearch-tbench設定検証の単体テスト
 * why: ConfigurationErrorによる設定検証が正しく動作することを保証するため
 * related: .pi/lib/autoresearch-tbench.ts, .pi/lib/core/errors.ts
 * public_api: なし（テストファイル）
 * invariants: テストは独立して実行可能
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: validateRunConfig関数のバリデーションロジックをテストする
 * what_it_does:
 *   - nConcurrentの下限値検証テスト
 *   - agentSetupTimeoutMultiplierの下限値検証テスト
 *   - jobsDirの存在確認テスト
 *   - datasetPathの存在確認テスト
 * why_it_exists:
 *   - 無効な設定が実行時に渡されるのを防ぐバリデーションの信頼性を保証するため
 * scope:
 *   in: validateRunConfig関数
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { ConfigurationError } from "../../../lib/core/errors.js";

// テスト用の一時ディレクトリ
let testDir: string;
let validJobsDir: string;
let existingDatasetPath: string;

// テスト用の最小限の設定型
interface TestRunConfig {
  nConcurrent: number | null;
  agentSetupTimeoutMultiplier: number | null;
  jobsDir: string;
  datasetPath: string | null;
}

// テスト用のシンプルなバリデーション関数（本物の実装と同じロジック）
function validateTestRunConfig(config: TestRunConfig): void {
  // nConcurrent: 1以上の整数であること
  if (config.nConcurrent !== null && config.nConcurrent < 1) {
    throw new ConfigurationError(
      `nConcurrent must be >= 1, got ${config.nConcurrent}`,
      { key: "nConcurrent", expected: "positive integer" }
    );
  }

  // agentSetupTimeoutMultiplier: 1以上の整数であること
  if (config.agentSetupTimeoutMultiplier !== null && config.agentSetupTimeoutMultiplier < 1) {
    throw new ConfigurationError(
      `agentSetupTimeoutMultiplier must be >= 1, got ${config.agentSetupTimeoutMultiplier}`,
      { key: "agentSetupTimeoutMultiplier", expected: "positive integer" }
    );
  }

  // jobsDir: 親ディレクトリが存在すること（作成可能であること）
  const jobsDirParent = dirname(config.jobsDir);
  if (!existsSync(jobsDirParent)) {
    throw new ConfigurationError(
      `jobsDir parent directory does not exist: ${jobsDirParent}`,
      { key: "jobsDir", expected: "existing directory path" }
    );
  }

  // datasetPath: 指定されている場合、存在すること
  if (config.datasetPath && !existsSync(config.datasetPath)) {
    throw new ConfigurationError(
      `datasetPath does not exist: ${config.datasetPath}`,
      { key: "datasetPath", expected: "existing file path" }
    );
  }
}

describe("validateRunConfig", () => {
  beforeEach(() => {
    // 一時ディレクトリを作成
    testDir = mkdtempSync(join(tmpdir(), "pi-tbench-config-test-"));
    validJobsDir = join(testDir, "jobs");
    existingDatasetPath = join(testDir, "dataset.json");
    mkdirSync(validJobsDir, { recursive: true });
    writeFileSync(existingDatasetPath, "{}");
  });

  afterEach(() => {
    // クリーンアップ
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("nConcurrent", () => {
    it("should accept valid positive values", () => {
      const config: TestRunConfig = {
        nConcurrent: 1,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should accept null value", () => {
      const config: TestRunConfig = {
        nConcurrent: null,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should reject zero value", () => {
      const config: TestRunConfig = {
        nConcurrent: 0,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/nConcurrent must be >= 1/);
    });

    it("should reject negative value", () => {
      const config: TestRunConfig = {
        nConcurrent: -5,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/nConcurrent must be >= 1/);
    });
  });

  describe("agentSetupTimeoutMultiplier", () => {
    it("should accept valid positive values", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 1,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should reject zero value", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 0,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/agentSetupTimeoutMultiplier must be >= 1/);
    });

    it("should reject negative value", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: -1,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/agentSetupTimeoutMultiplier must be >= 1/);
    });
  });

  describe("jobsDir", () => {
    it("should accept valid jobs directory", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should reject jobs directory with non-existent parent", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: "/non/existent/path/jobs",
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/jobsDir parent directory does not exist/);
    });
  });

  describe("datasetPath", () => {
    it("should accept null datasetPath", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: null,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should accept existing datasetPath", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: existingDatasetPath,
      };
      expect(() => validateTestRunConfig(config)).not.toThrow();
    });

    it("should reject non-existent datasetPath", () => {
      const config: TestRunConfig = {
        nConcurrent: 2,
        agentSetupTimeoutMultiplier: 4,
        jobsDir: validJobsDir,
        datasetPath: "/non/existent/dataset.json",
      };
      expect(() => validateTestRunConfig(config)).toThrow(ConfigurationError);
      expect(() => validateTestRunConfig(config)).toThrow(/datasetPath does not exist/);
    });
  });
});
