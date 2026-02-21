/**
 * Tests for communication-history.ts
 */

import { describe, it, expect } from "vitest";
import {
  createCommunicationHistoryStore,
  defaultSelectionStrategy,
  adaptiveSelectionStrategy,
  DEFAULT_MAX_PARTNERS,
} from "../../../.pi/extensions/agent-teams/communication-history";

describe("communication-history", () => {
  describe("createCommunicationHistoryStore", () => {
    it("should create empty store", () => {
      const store = createCommunicationHistoryStore();
      expect(store.getAll()).toEqual([]);
      expect(store.getMostRecentRound()).toBe(-1);
    });

    it("should add entries", () => {
      const store = createCommunicationHistoryStore();
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: ["build", "review"],
        coverage: 0.8,
        specificity: 0.6,
        stanceSummary: { agree: 1, disagree: 0, neutral: 1, unknown: 0 },
      });

      expect(store.getAll()).toHaveLength(1);
    });

    it("should get entries by member", () => {
      const store = createCommunicationHistoryStore();
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: ["build"],
        coverage: 0.5,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 1 },
      });
      
      store.add({
        round: 1,
        memberId: "research",
        referencedPartnerIds: ["build", "review"],
        coverage: 0.8,
        specificity: 0.7,
        stanceSummary: { agree: 1, disagree: 0, neutral: 1, unknown: 0 },
      });
      
      store.add({
        round: 0,
        memberId: "build",
        referencedPartnerIds: ["research"],
        coverage: 0.5,
        specificity: 0.5,
        stanceSummary: { agree: 1, disagree: 0, neutral: 0, unknown: 0 },
      });

      const researchEntries = store.getByMember("research");
      expect(researchEntries).toHaveLength(2);
      
      const buildEntries = store.getByMember("build");
      expect(buildEntries).toHaveLength(1);
    });

    it("should get entries by round", () => {
      const store = createCommunicationHistoryStore();
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: [],
        coverage: 0,
        specificity: 0,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 0 },
      });
      
      store.add({
        round: 0,
        memberId: "build",
        referencedPartnerIds: [],
        coverage: 0,
        specificity: 0,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 0 },
      });
      
      store.add({
        round: 1,
        memberId: "research",
        referencedPartnerIds: ["build"],
        coverage: 0.5,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 1, unknown: 0 },
      });

      expect(store.getByRound(0)).toHaveLength(2);
      expect(store.getByRound(1)).toHaveLength(1);
      expect(store.getByRound(2)).toHaveLength(0);
    });

    it("should get most recent round", () => {
      const store = createCommunicationHistoryStore();
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: [],
        coverage: 0,
        specificity: 0,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 0 },
      });
      
      expect(store.getMostRecentRound()).toBe(0);
      
      store.add({
        round: 2,
        memberId: "build",
        referencedPartnerIds: [],
        coverage: 0,
        specificity: 0,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 0 },
      });
      
      expect(store.getMostRecentRound()).toBe(2);
    });

    it("should get unreferenced partner ids", () => {
      const store = createCommunicationHistoryStore();
      const partnerIds = ["build", "review", "test"];
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: ["build"],
        coverage: 0.33,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 1, unknown: 0 },
      });

      const unreferenced = store.getUnreferencedPartnerIds("research", partnerIds);
      expect(unreferenced).toContain("review");
      expect(unreferenced).toContain("test");
      expect(unreferenced).not.toContain("build");
    });

    it("should track references across multiple rounds", () => {
      const store = createCommunicationHistoryStore();
      const partnerIds = ["build", "review"];
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: ["build"],
        coverage: 0.5,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 1, unknown: 0 },
      });
      
      store.add({
        round: 1,
        memberId: "research",
        referencedPartnerIds: ["review"],
        coverage: 0.5,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 1, unknown: 0 },
      });

      const unreferenced = store.getUnreferencedPartnerIds("research", partnerIds);
      expect(unreferenced).toHaveLength(0);
    });

    it("should clear store", () => {
      const store = createCommunicationHistoryStore();
      
      store.add({
        round: 0,
        memberId: "research",
        referencedPartnerIds: [],
        coverage: 0,
        specificity: 0,
        stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 0 },
      });
      
      expect(store.getAll()).toHaveLength(1);
      
      store.clear();
      
      expect(store.getAll()).toHaveLength(0);
      expect(store.getMostRecentRound()).toBe(-1);
    });
  });

  describe("defaultSelectionStrategy", () => {
    it("should select first N candidates", () => {
      const store = createCommunicationHistoryStore();
      const candidates = ["a", "b", "c", "d", "e"];
      
      const selected = defaultSelectionStrategy.select("test", candidates, store, 0);
      
      expect(selected.length).toBe(DEFAULT_MAX_PARTNERS);
      expect(selected).toEqual(["a", "b", "c"]);
    });

    it("should handle fewer candidates than max", () => {
      const store = createCommunicationHistoryStore();
      const candidates = ["a", "b"];
      
      const selected = defaultSelectionStrategy.select("test", candidates, store, 0);
      
      expect(selected).toEqual(["a", "b"]);
    });

    it("should handle empty candidates", () => {
      const store = createCommunicationHistoryStore();
      
      const selected = defaultSelectionStrategy.select("test", [], store, 0);
      
      expect(selected).toEqual([]);
    });
  });

  describe("adaptiveSelectionStrategy", () => {
    it("should prioritize unreferenced partners in later rounds", () => {
      const store = createCommunicationHistoryStore();
      const candidates = ["a", "b", "c"];
      
      store.add({
        round: 0,
        memberId: "test",
        referencedPartnerIds: ["a"],
        coverage: 0.33,
        specificity: 0.5,
        stanceSummary: { agree: 0, disagree: 0, neutral: 1, unknown: 0 },
      });

      const selected = adaptiveSelectionStrategy.select("test", candidates, store, 1);
      
      expect(selected[0]).toBe("b");
      expect(selected[1]).toBe("c");
      expect(selected).toContain("a");
    });

    it("should use default selection in round 0", () => {
      const store = createCommunicationHistoryStore();
      const candidates = ["a", "b", "c", "d"];
      
      const selected = adaptiveSelectionStrategy.select("test", candidates, store, 0);
      
      expect(selected.length).toBe(DEFAULT_MAX_PARTNERS);
    });
  });
});
