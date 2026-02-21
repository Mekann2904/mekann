/**
 * Tests for communication-id.ts
 */

import { describe, it, expect } from "vitest";
import {
  isSafeId,
  generateCommId,
  resolveUniqueCommIds,
  createCommIdMaps,
  stringToSeed,
  combineSeed,
} from "../../../.pi/extensions/agent-teams/communication-id";

describe("communication-id", () => {
  describe("isSafeId", () => {
    it("should return true for safe IDs", () => {
      expect(isSafeId("research")).toBe(true);
      expect(isSafeId("build-01")).toBe(true);
      expect(isSafeId("review_member")).toBe(true);
      expect(isSafeId("ABC123")).toBe(true);
    });

    it("should return false for unsafe IDs", () => {
      expect(isSafeId("reviewer!")).toBe(false);
      expect(isSafeId("member id")).toBe(false);
      expect(isSafeId("日本語")).toBe(false);
    });
  });

  describe("generateCommId", () => {
    it("should return safe IDs as-is", () => {
      expect(generateCommId("research")).toBe("research");
      expect(generateCommId("build-01")).toBe("build-01");
    });

    it("should generate stable commId for unsafe IDs", () => {
      const id1 = generateCommId("unsafe!id", "salt");
      const id2 = generateCommId("unsafe!id", "salt");
      expect(id1).toBe(id2);
      expect(id1.length).toBe(8);
    });

    it("should generate different commIds for different salts", () => {
      const id1 = generateCommId("unsafe!id", "salt1");
      const id2 = generateCommId("unsafe!id", "salt2");
      expect(id1).not.toBe(id2);
    });
  });

  describe("resolveUniqueCommIds", () => {
    it("should return safe IDs as-is", () => {
      const members = [{ id: "research" }, { id: "build" }];
      const entries = resolveUniqueCommIds(members);
      expect(entries).toEqual([
        { memberId: "research", commId: "research" },
        { memberId: "build", commId: "build" },
      ]);
    });

    it("should generate unique commIds for unsafe IDs", () => {
      const members = [{ id: "unsafe!1" }, { id: "unsafe!2" }];
      const entries = resolveUniqueCommIds(members);
      const commIds = entries.map(e => e.commId);
      expect(new Set(commIds).size).toBe(2);
    });

    it("should handle collision by extending length", () => {
      const members = Array(10).fill(null).map((_, i) => ({ id: `test!${i}` }));
      const entries = resolveUniqueCommIds(members);
      const commIds = entries.map(e => e.commId);
      expect(new Set(commIds).size).toBe(10);
    });
  });

  describe("createCommIdMaps", () => {
    it("should create bidirectional maps", () => {
      const entries = [
        { memberId: "research", commId: "rs" },
        { memberId: "build", commId: "bd" },
      ];
      const { memberIdToCommId, commIdToMemberId } = createCommIdMaps(entries);
      
      expect(memberIdToCommId.get("research")).toBe("rs");
      expect(commIdToMemberId.get("bd")).toBe("build");
    });
  });

  describe("stringToSeed", () => {
    it("should generate stable seeds", () => {
      const seed1 = stringToSeed("test");
      const seed2 = stringToSeed("test");
      expect(seed1).toBe(seed2);
    });

    it("should generate different seeds for different strings", () => {
      const seed1 = stringToSeed("test1");
      const seed2 = stringToSeed("test2");
      expect(seed1).not.toBe(seed2);
    });
  });

  describe("combineSeed", () => {
    it("should generate stable combined seeds", () => {
      const seed1 = combineSeed(42, "member1", 0);
      const seed2 = combineSeed(42, "member1", 0);
      expect(seed1).toBe(seed2);
    });

    it("should generate different seeds for different rounds", () => {
      const seed0 = combineSeed(42, "member1", 0);
      const seed1 = combineSeed(42, "member1", 1);
      expect(seed0).not.toBe(seed1);
    });
  });
});
