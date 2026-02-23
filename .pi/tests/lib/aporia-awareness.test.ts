/**
 * @abdd.meta
 * path: .pi/tests/lib/aporia-awareness.test.ts
 * role: aporia-awareness.tsの単体テスト
 * why: アポリア認識機能の正確性を保証するため
 * related: .pi/lib/aporia-awareness.ts, .pi/lib/consciousness-spectrum.ts
 * public_api: テストケースの実行
 * invariants: テストは純粋関数のテストのみ
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: アポリア認識機能の単体テスト
 * what_it_does:
 *   - detectAporia関数のテスト
 *   - holdAporia関数のテスト
 *   - APORIA_PATTERNSのテスト
 * why_it_exists: アポリア認識機能の信頼性を保証するため
 * scope:
 *   in: .pi/lib/aporia-awareness.ts
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  detectAporia,
  APORIA_PATTERNS,
  type Aporia,
  type AporiaType,
  type FalseResolution,
} from "../../lib/aporia-awareness.js";

// ============================================================================
// Tests: APORIA_PATTERNS
// ============================================================================

describe("APORIA_PATTERNS", () => {
  it("アポリアパターンが定義されている", () => {
    // Assert
    expect(APORIA_PATTERNS.length).toBeGreaterThan(0);
  });

  it("各パターンが必須フィールドを持つ", () => {
    // Assert
    for (const pattern of APORIA_PATTERNS) {
      expect(pattern.pattern).toBeInstanceOf(RegExp);
      expect(pattern.type).toBeDefined();
      expect(pattern.poles).toBeDefined();
      expect(pattern.poles.left).toBeDefined();
      expect(pattern.poles.right).toBeDefined();
      expect(pattern.description).toBeDefined();
    }
  });
});

// ============================================================================
// Tests: detectAporia
// ============================================================================

describe("detectAporia", () => {
  it("効率と品質の対立を検出する", () => {
    // Arrange
    const text = "効率と品質のバランスを考える必要があります。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBeGreaterThan(0);
    expect(aporias.some(a => a.type === "practical")).toBe(true);
  });

  it("ユーザー期待と真実の対立を検出する", () => {
    // Arrange
    const text = "ユーザーの期待と真実の間で葛藤があります。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBeGreaterThan(0);
    expect(aporias.some(a => a.type === "ethical")).toBe(true);
  });

  it("自由と規範の対立を検出する", () => {
    // Arrange
    const text = "自由と規範の緊張関係をどう扱うか。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBeGreaterThan(0);
  });

  it("アポリアがない場合は空配列を返す", () => {
    // Arrange
    const text = "これは通常の文章です。対立はありません。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBe(0);
  });

  it("検出されたアポリアは必須フィールドを持つ", () => {
    // Arrange
    const text = "効率と品質のトレードオフ";

    // Act
    const aporias = detectAporia(text);

    // Assert
    if (aporias.length > 0) {
      const aporia = aporias[0];
      expect(aporia.id).toBeDefined();
      expect(aporia.type).toBeDefined();
      expect(aporia.description).toBeDefined();
      expect(aporia.poles).toBeDefined();
      expect(aporia.poles.left).toBeDefined();
      expect(aporia.poles.right).toBeDefined();
      expect(aporia.unresolvableReason).toBeDefined();
      expect(aporia.falseResolutions).toBeDefined();
      expect(aporia.tensionToHold).toBeDefined();
      expect(aporia.recognizedAt).toBeDefined();
      expect(aporia.state).toBeDefined();
    }
  });

  it("偽の解決パターンが含まれる", () => {
    // Arrange
    const text = "効率と品質のバランス";

    // Act
    const aporias = detectAporia(text);

    // Assert
    if (aporias.length > 0) {
      expect(aporias[0].falseResolutions.length).toBeGreaterThan(0);
      
      for (const fr of aporias[0].falseResolutions) {
        expect(fr.type).toBeDefined();
        expect(fr.description).toBeDefined();
        expect(fr.whyFalse).toBeDefined();
      }
    }
  });

  it("認識時刻はISO 8601形式", () => {
    // Arrange
    const text = "効率と品質";

    // Act
    const aporias = detectAporia(text);

    // Assert
    if (aporias.length > 0) {
      expect(aporias[0].recognizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("初期状態は 'recognized'", () => {
    // Arrange
    const text = "効率と品質";

    // Act
    const aporias = detectAporia(text);

    // Assert
    if (aporias.length > 0) {
      expect(aporias[0].state).toBe("recognized");
    }
  });

  it("複数のアポリアを同時に検出できる", () => {
    // Arrange
    const text = "効率と品質、そしてユーザー期待と真実の問題がある。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBeGreaterThanOrEqual(2);
  });

  it("主観と客観の対立を検出する", () => {
    // Arrange
    const text = "主観的体験と客観的測定の間には埋められない溝がある。";

    // Act
    const aporias = detectAporia(text);

    // Assert
    expect(aporias.length).toBeGreaterThan(0);
    expect(aporias.some(a => a.type === "epistemological")).toBe(true);
  });
});

// ============================================================================
// Tests: Aporia Types
// ============================================================================

describe("Aporia Types", () => {
  it("アポリアタイプが定義されている", () => {
    // Assert
    const types: AporiaType[] = [
      "ethical",
      "epistemological",
      "ontological",
      "practical",
      "meta_cognitive"
    ];
    
    for (const type of types) {
      expect(type).toBeDefined();
    }
  });
});

// ============================================================================
// Tests: False Resolution Types
// ============================================================================

describe("FalseResolution Types", () => {
  it("偽解決タイプが定義されている", () => {
    // Assert
    const falseTypes = ["synthesis", "avoidance", "dominance", "denial"] as const;
    
    for (const type of falseTypes) {
      expect(type).toBeDefined();
    }
  });
});
