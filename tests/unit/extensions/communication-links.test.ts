/**
 * Tests for communication-links.ts
 */

import { describe, it, expect } from "vitest";
import {
  createCommunicationLinksMap,
  deterministicShuffle,
  shouldPreferAnchorMember,
  MAX_COMMUNICATION_PARTNERS,
  type TeamMemberLike,
} from "../../../.pi/extensions/agent-teams/communication-links";

describe("communication-links", () => {
  describe("shouldPreferAnchorMember", () => {
    it("should identify anchor members by id", () => {
      expect(shouldPreferAnchorMember({ id: "review" })).toBe(true);
      expect(shouldPreferAnchorMember({ id: "judge" })).toBe(true);
      expect(shouldPreferAnchorMember({ id: "validator" })).toBe(true);
      expect(shouldPreferAnchorMember({ id: "anchor-01" })).toBe(true);
    });

    it("should identify anchor members by role", () => {
      expect(shouldPreferAnchorMember({ id: "m1", role: "Reviewer" })).toBe(true);
      expect(shouldPreferAnchorMember({ id: "m2", role: "Judge" })).toBe(true);
    });

    it("should return false for non-anchor members", () => {
      expect(shouldPreferAnchorMember({ id: "research" })).toBe(false);
      expect(shouldPreferAnchorMember({ id: "build" })).toBe(false);
    });
  });

  describe("deterministicShuffle", () => {
    it("should be deterministic for same seed", () => {
      const arr = ["a", "b", "c", "d", "e"];
      const result1 = deterministicShuffle(arr, 42);
      const result2 = deterministicShuffle(arr, 42);
      expect(result1).toEqual(result2);
    });

    it("should produce different results for different seeds", () => {
      const arr = ["a", "b", "c", "d", "e"];
      const result1 = deterministicShuffle(arr, 42);
      const result2 = deterministicShuffle(arr, 43);
      expect(result1).not.toEqual(result2);
    });

    it("should not modify original array", () => {
      const arr = ["a", "b", "c"];
      deterministicShuffle(arr, 42);
      expect(arr).toEqual(["a", "b", "c"]);
    });
  });

  describe("createCommunicationLinksMap", () => {
    const createMembers = (ids: string[]): TeamMemberLike[] =>
      ids.map(id => ({ id, role: id }));

    it("should handle single member", () => {
      const members = createMembers(["only"]);
      const links = createCommunicationLinksMap(members);
      expect(links.get("only")).toEqual([]);
    });

    it("should handle two members", () => {
      const members = createMembers(["a", "b"]);
      const links = createCommunicationLinksMap(members);
      expect(links.get("a")).toContain("b");
      expect(links.get("b")).toContain("a");
    });

    it("should be deterministic for same input", () => {
      const members = createMembers(["research", "build", "review"]);
      const links1 = createCommunicationLinksMap(members, { seed: 42, round: 0 });
      const links2 = createCommunicationLinksMap(members, { seed: 42, round: 0 });
      expect(links1).toEqual(links2);
    });

    it("should rotate partners by round", () => {
      const members = createMembers(["a", "b", "c", "d", "e"]);
      const links0 = createCommunicationLinksMap(members, { seed: 42, round: 0 });
      const links1 = createCommunicationLinksMap(members, { seed: 42, round: 1 });
      expect(links0).not.toEqual(links1);
    });

    it("should always include anchors within limit", () => {
      const members = createMembers(["research", "build", "review"]);
      for (let round = 0; round < 5; round++) {
        const links = createCommunicationLinksMap(members, { seed: 42, round });
        for (const [id, partners] of links) {
          if (id !== "review") {
            expect(partners).toContain("review");
          }
        }
      }
    });

    it("should limit partners to MAX_COMMUNICATION_PARTNERS", () => {
      const members = createMembers(["a", "b", "c", "d", "e", "f"]);
      const links = createCommunicationLinksMap(members, { seed: 42 });
      for (const [, partners] of links) {
        expect(partners.length).toBeLessThanOrEqual(MAX_COMMUNICATION_PARTNERS);
      }
    });

    it("should not include self in partners", () => {
      const members = createMembers(["a", "b", "c"]);
      const links = createCommunicationLinksMap(members);
      for (const [id, partners] of links) {
        expect(partners).not.toContain(id);
      }
    });

    it("should produce same result without options (default seed=0)", () => {
      const members = createMembers(["a", "b", "c"]);
      const links1 = createCommunicationLinksMap(members);
      const links2 = createCommunicationLinksMap(members, { seed: 0, round: 0 });
      expect(links1).toEqual(links2);
    });
  });
});
