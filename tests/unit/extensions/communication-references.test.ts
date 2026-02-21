/**
 * Tests for communication-references.ts
 */

import { describe, it, expect } from "vitest";
import {
  detectPartnerReferencesV3,
  extractField,
  type PartnerReferenceResultV3,
} from "../../../.pi/extensions/agent-teams/communication-references";

describe("communication-references", () => {
  const createMaps = (entries: [string, string][]) => {
    const commIdToMemberId = new Map(entries);
    const memberIdToCommId = new Map(entries.map(([c, m]) => [m, c]));
    return { commIdToMemberId, memberIdToCommId };
  };

  const defaultMaps = createMaps([
    ["research", "research"],
    ["build", "build"],
    ["review", "review"],
  ]);

  const defaultPartnerCommIds = ["research", "build", "review"];

  describe("extractField", () => {
    it("should extract field value", () => {
      const output = "SUMMARY: This is a summary\nCLAIM: This is a claim";
      expect(extractField(output, "SUMMARY")).toBe("This is a summary");
      expect(extractField(output, "CLAIM")).toBe("This is a claim");
    });

    it("should return undefined for missing field", () => {
      const output = "SUMMARY: This is a summary";
      expect(extractField(output, "RESULT")).toBeUndefined();
    });

    it("should handle case-insensitive match", () => {
      const output = "summary: lowercase";
      expect(extractField(output, "SUMMARY")).toBe("lowercase");
    });
  });

  describe("detectPartnerReferencesV3", () => {
    describe("structured tokens", () => {
      it("should detect REF(commId)", () => {
        const output = "REF(research) に同意します";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("research");
        expect(result.specificity.structuredCount).toBe(1);
      });

      it("should detect CLAIM(commId:index)", () => {
        const output = "CLAIM(build:0) を参照してください";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("build");
        expect(result.claimReferences).toHaveLength(1);
        expect(result.claimReferences[0].claimId).toBe("build:0");
      });

      it("should detect [commId:index]", () => {
        const output = "[review:0] に基づいて判断します";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("review");
      });

      it("should detect @commId", () => {
        const output = "@research の指摘を確認しました";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("research");
      });
    });

    describe("CITES detection", () => {
      it("should detect CITED line", () => {
        const output = "CITED: REF(research), CLAIM(build:0), @[review]";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.specificity.quoteCount).toBeGreaterThan(0);
      });

      it("should count references in CITED", () => {
        const output = "CITED: REF(research), REF(build), REF(review)";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.specificity.quoteCount).toBe(3);
      });
    });

    describe("legacy detection with boundaries", () => {
      it("should detect ID with word boundaries", () => {
        const output = "researchの調査結果を確認しました";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("research");
      });

      it("should NOT detect partial match", () => {
        const output = "researching the codebase";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).not.toContain("research");
      });

      it("should NOT detect ID in middle of word", () => {
        const output = "xresearch is not a match";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).not.toContain("research");
      });
    });

    describe("coverage and specificity", () => {
      it("should calculate coverage correctly", () => {
        const output = "REF(research) と REF(build) を参照";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.coverage.ratio).toBeCloseTo(2 / 3, 2);
        expect(result.coverage.count).toBe(2);
        expect(result.coverage.total).toBe(3);
      });

      it("should calculate specificity correctly", () => {
        const output = "REF(research) REF(build) REF(review)";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.specificity.ratio).toBe(1);
        expect(result.specificity.structuredCount).toBe(3);
      });

      it("should calculate overall quality", () => {
        const output = "REF(research) REF(build)";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        const expected = (2 / 3) * 0.4 + 1 * 0.6;
        expect(result.overallQuality).toBeCloseTo(expected, 2);
      });
    });

    describe("missing partners", () => {
      it("should identify missing partners", () => {
        const output = "REF(research) のみ参照";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.missingPartners).toContain("build");
        expect(result.missingPartners).toContain("review");
      });
    });

    describe("stance detection", () => {
      it("should detect explicit STANCE with CLAIM reference", () => {
        const output = "STANCE: agree\nCLAIM(research:0) を参照";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.claimReferences.length).toBeGreaterThan(0);
        expect(result.claimReferences[0].stance).toBe("agree");
        expect(result.claimReferences[0].source).toBe("explicit");
      });

      it("should return inferred stance when context is available", () => {
        const output = "CLAIM(research:0) に同意します";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.claimReferences.length).toBeGreaterThan(0);
        expect(result.claimReferences[0].source).toBeOneOf(["inferred", "default"]);
      });

      it("should return unknown stance when no CLAIM reference", () => {
        const output = "REF(research) に同意します";
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.claimReferences.length).toBe(0);
      });
    });

    describe("edge cases", () => {
      it("should handle empty output", () => {
        const result = detectPartnerReferencesV3(
          "",
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toEqual([]);
        expect(result.coverage.ratio).toBe(0);
      });

      it("should handle no partners", () => {
        const result = detectPartnerReferencesV3(
          "some output",
          [],
          new Map(),
          new Map()
        );
        expect(result.referencedPartners).toEqual([]);
        expect(result.coverage.total).toBe(0);
      });

      it("should normalize zenkaku/hankaku", () => {
        const output = "ｒｅｓｅａｒｃｈの結果";  // 全角
        const result = detectPartnerReferencesV3(
          output,
          defaultPartnerCommIds,
          defaultMaps.commIdToMemberId,
          defaultMaps.memberIdToCommId
        );
        expect(result.referencedPartners).toContain("research");
      });
    });
  });
});
