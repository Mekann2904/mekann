/**
 * @abdd.meta
 * path: .pi/tests/lib/performance-profiles.test.ts
 * role: performance-profiles.tsの単体テスト
 * why: タスクタイプに応じたパフォーマンスプロファイル選択の正確性を保証するため
 * related: .pi/lib/performance-profiles.ts, .pi/lib/execution-rules.ts
 * public_api: テストケースの実行
 * invariants: テストは純粋関数のテストのみ
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: パフォーマンスプロファイル管理の単体テスト
 * what_it_does:
 *   - classifyTask関数のテスト
 *   - getProfileForTask関数のテスト
 *   - applyProfile関数のテスト
 *   - PROFILE_PRESETSのテスト
 * why_it_exists: パフォーマンスプロファイル選択の信頼性を保証するため
 * scope:
 *   in: .pi/lib/performance-profiles.ts
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  classifyTask,
  getProfileForTask,
  applyProfile,
  PROFILE_PRESETS,
  type PerformanceProfile,
  type TaskType,
} from "../../lib/performance-profiles.js";

// ============================================================================
// Tests: PROFILE_PRESETS
// ============================================================================

describe("PROFILE_PRESETS", () => {
  it("fast プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.fast).toBeDefined();
    expect(PROFILE_PRESETS.fast.id).toBe("fast");
    expect(PROFILE_PRESETS.fast.verificationLevel).toBe("none");
    expect(PROFILE_PRESETS.fast.metacognitiveDepth).toBe(0);
  });

  it("standard プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.standard).toBeDefined();
    expect(PROFILE_PRESETS.standard.id).toBe("standard");
    expect(PROFILE_PRESETS.standard.verificationLevel).toBe("light");
  });

  it("quality プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.quality).toBeDefined();
    expect(PROFILE_PRESETS.quality.verificationLevel).toBe("standard");
    expect(PROFILE_PRESETS.quality.metacognitiveDepth).toBe(3);
  });

  it("strict プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.strict).toBeDefined();
    expect(PROFILE_PRESETS.strict.verificationLevel).toBe("strict");
    expect(PROFILE_PRESETS.strict.metacognitiveDepth).toBe(5);
    expect(PROFILE_PRESETS.strict.delegationThreshold).toBe("always");
  });

  it("exploratory プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.exploratory).toBeDefined();
    expect(PROFILE_PRESETS.exploratory.priorityRules).toContain("creativity");
  });

  it("creative プロファイルが正しく定義されている", () => {
    // Assert
    expect(PROFILE_PRESETS.creative).toBeDefined();
    expect(PROFILE_PRESETS.creative.priorityRules).toContain("novelty");
  });

  it("全プロファイルが必須フィールドを持つ", () => {
    // Arrange
    const requiredFields = [
      "id", "name", "description", "verificationLevel",
      "delegationThreshold", "metacognitiveDepth", "philosophicalReflection",
      "aporiaHandling", "maxIterations", "timeoutMultiplier", "priorityRules"
    ];

    // Act & Assert
    for (const [key, profile] of Object.entries(PROFILE_PRESETS)) {
      for (const field of requiredFields) {
        expect(profile, `Profile ${key} missing field ${field}`).toHaveProperty(field);
      }
    }
  });
});

// ============================================================================
// Tests: classifyTask
// ============================================================================

describe("classifyTask", () => {
  it("タイポ修正を trivial に分類する", () => {
    // Arrange & Act
    const result = classifyTask("タイポを修正して");

    // Assert
    expect(result.type).toBe("trivial");
    expect(result.recommendedProfile).toBe("fast");
  });

  it("短いタスクを simple に分類する", () => {
    // Arrange & Act
    const result = classifyTask("Add a new function");

    // Assert
    expect(["simple", "moderate"]).toContain(result.type);
  });

  it("リファクタリングを moderate に分類する", () => {
    // Arrange & Act
    const result = classifyTask("リファクタリングしてください");

    // Assert
    expect(result.type).toBe("moderate");
    expect(result.recommendedProfile).toBe("standard");
  });

  it("設計タスクを complex に分類する", () => {
    // Arrange & Act
    const result = classifyTask("アーキテクチャを設計してください");

    // Assert
    expect(["complex", "creative"]).toContain(result.type);
  });

  it("削除タスクを critical に分類する", () => {
    // Arrange & Act
    const result = classifyTask("Delete all files");

    // Assert
    expect(result.type).toBe("critical");
    expect(result.recommendedProfile).toBe("strict");
  });

  it("セキュリティタスクを critical に分類する", () => {
    // Arrange & Act
    const result = classifyTask("Update security settings");

    // Assert
    expect(result.type).toBe("critical");
  });

  it("調査タスクを exploratory に分類する", () => {
    // Arrange & Act
    const result = classifyTask("Why is this happening? Investigate the cause.");

    // Assert
    expect(["exploratory", "complex"]).toContain(result.type);
  });

  it("コンテキストが分類に影響する - isHighRisk", () => {
    // Arrange & Act
    const result = classifyTask("Update config", { isHighRisk: true });

    // Assert
    expect(result.type).toBe("critical");
  });

  it("コンテキストが分類に影響する - fileCount", () => {
    // Arrange & Act
    const result = classifyTask("Update imports", { fileCount: 10 });

    // Assert
    expect(["complex", "moderate", "critical"]).toContain(result.type);
  });

  it("信頼度は0から1の範囲", () => {
    // Arrange & Act
    const result = classifyTask("Some task");

    // Assert
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("分類根拠を含む", () => {
    // Arrange & Act
    const result = classifyTask("タイポを修正して");

    // Assert
    expect(Array.isArray(result.indicators)).toBe(true);
  });
});

// ============================================================================
// Tests: getProfileForTask
// ============================================================================

describe("getProfileForTask", () => {
  it("タイポ修正には fast プロファイルを返す", () => {
    // Arrange & Act
    const profile = getProfileForTask("タイポを修正");

    // Assert
    expect(profile.id).toBe("fast");
  });

  it("リファクタリングには standard プロファイルを返す", () => {
    // Arrange & Act
    const profile = getProfileForTask("リファクタリングしてください");

    // Assert
    expect(profile.id).toBe("standard");
  });

  it("削除タスクには strict プロファイルを返す", () => {
    // Arrange & Act
    const profile = getProfileForTask("Delete the database");

    // Assert
    expect(profile.id).toBe("strict");
  });

  it("オーバーライドプロファイルを適用する", () => {
    // Arrange & Act
    const profile = getProfileForTask("Simple task", {
      overrideProfile: "strict"
    });

    // Assert
    expect(profile.id).toBe("strict");
  });

  it("無効なオーバーライドは無視される", () => {
    // Arrange & Act
    const profile = getProfileForTask("Simple task", {
      overrideProfile: "invalid-profile"
    });

    // Assert
    // デフォルトのプロファイルが返される
    expect(profile).toBeDefined();
    expect(profile.id).not.toBe("invalid-profile");
  });

  it("isHighRisk コンテキストが strict を選択する", () => {
    // Arrange & Act
    const profile = getProfileForTask("Update config", { isHighRisk: true });

    // Assert
    expect(profile.id).toBe("strict");
  });
});

// ============================================================================
// Tests: applyProfile
// ============================================================================

describe("applyProfile", () => {
  it("ベース設定にプロファイルを適用する", () => {
    // Arrange
    const baseConfig = { timeoutMs: 60000, someSetting: "value" };
    const profile = PROFILE_PRESETS.fast;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.profile).toBe(profile);
    expect(result.timeoutMs).toBe(30000); // 60000 * 0.5
    expect(result.someSetting).toBe("value");
  });

  it("strict プロファイルでタイムアウトが倍になる", () => {
    // Arrange
    const baseConfig = { timeoutMs: 60000 };
    const profile = PROFILE_PRESETS.strict;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.timeoutMs).toBe(120000); // 60000 * 2.0
  });

  it("verificationLevel が none の場合は verificationEnabled が false", () => {
    // Arrange
    const baseConfig = {};
    const profile = PROFILE_PRESETS.fast;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.verificationEnabled).toBe(false);
  });

  it("verificationLevel がある場合は verificationEnabled が true", () => {
    // Arrange
    const baseConfig = {};
    const profile = PROFILE_PRESETS.standard;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.verificationEnabled).toBe(true);
  });

  it("metacognitiveDepth が正しく設定される", () => {
    // Arrange
    const baseConfig = {};
    const profile = PROFILE_PRESETS.quality;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.metacognitiveDepth).toBe(3);
  });

  it("maxIterations が正しく設定される", () => {
    // Arrange
    const baseConfig = {};
    const profile = PROFILE_PRESETS.strict;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.maxIterations).toBe(10);
  });

  it("philosophicalReflection が正しく設定される", () => {
    // Arrange
    const baseConfig = {};
    const profile = PROFILE_PRESETS.quality;

    // Act
    const result = applyProfile(profile, baseConfig);

    // Assert
    expect(result.philosophicalReflection).toBe(true);
  });

  it("デフォルトタイムアウトがない場合はエラーにならない", () => {
    // Arrange
    const baseConfig = { someOtherSetting: "value" };
    const profile = PROFILE_PRESETS.standard;

    // Act & Assert - エラーにならないこと
    expect(() => applyProfile(profile, baseConfig)).not.toThrow();
  });
});
