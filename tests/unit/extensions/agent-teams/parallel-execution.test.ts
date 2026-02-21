/**
 * parallel-execution.tsの単体テスト
 * テスト対象: buildMemberParallelCandidates, buildTeamAndMemberParallelCandidates,
 *            resolveTeamParallelCapacity
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  buildMemberParallelCandidates,
  buildTeamAndMemberParallelCandidates,
  resolveTeamParallelCapacity,
  type TeamParallelCapacityCandidate,
  type TeamParallelCapacityResolution,
} from "@ext/agent-teams/parallel-execution";

// Mock agent-runtime
const mockReserveRuntimeCapacity = vi.fn();
const mockTryReserveRuntimeCapacity = vi.fn();

vi.mock("@ext/agent-runtime", () => ({
  reserveRuntimeCapacity: (...args: unknown[]) => mockReserveRuntimeCapacity(...args),
  tryReserveRuntimeCapacity: (...args: unknown[]) => mockTryReserveRuntimeCapacity(...args),
}));

describe("parallel-execution.ts - buildMemberParallelCandidates", () => {
  it("メンバー並列度1の候補を生成する", () => {
    const result = buildMemberParallelCandidates(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      teamParallelism: 1,
      memberParallelism: 1,
      additionalRequests: 1,
      additionalLlm: 1,
    });
  });

  it("メンバー並列度3の候補を生成する", () => {
    const result = buildMemberParallelCandidates(3);
    expect(result).toHaveLength(3);
    expect(result[0].memberParallelism).toBe(3);
    expect(result[1].memberParallelism).toBe(2);
    expect(result[2].memberParallelism).toBe(1);
    expect(result[0].additionalLlm).toBe(3);
    expect(result[1].additionalLlm).toBe(2);
    expect(result[2].additionalLlm).toBe(1);
  });

  it("小数は切り捨てて候補を生成する", () => {
    const result = buildMemberParallelCandidates(2.7);
    expect(result).toHaveLength(2);
    expect(result[0].memberParallelism).toBe(2);
    expect(result[1].memberParallelism).toBe(1);
  });

  it("0以下の並列度は1として扱う", () => {
    const result1 = buildMemberParallelCandidates(0);
    expect(result1).toHaveLength(1);
    expect(result1[0].memberParallelism).toBe(1);

    const result2 = buildMemberParallelCandidates(-1);
    expect(result2).toHaveLength(1);
    expect(result2[0].memberParallelism).toBe(1);
  });

  it("すべての候補はteamParallelism=1である", () => {
    const result = buildMemberParallelCandidates(5);
    for (const candidate of result) {
      expect(candidate.teamParallelism).toBe(1);
      expect(candidate.additionalRequests).toBe(1);
    }
  });
});

describe("parallel-execution.ts - buildTeamAndMemberParallelCandidates", () => {
  it("チーム並列度1、メンバー並列度1の候補を生成する", () => {
    const result = buildTeamAndMemberParallelCandidates(1, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      teamParallelism: 1,
      memberParallelism: 1,
      additionalRequests: 1,
      additionalLlm: 1,
    });
  });

  it("チーム並列度2、メンバー並列度3の候補を生成する", () => {
    const result = buildTeamAndMemberParallelCandidates(2, 3);
    expect(result).toHaveLength(6);
    // チーム×メンバーの組み合わせ
    expect(result[0]).toEqual({ teamParallelism: 2, memberParallelism: 3, additionalRequests: 2, additionalLlm: 6 });
    expect(result[5]).toEqual({ teamParallelism: 1, memberParallelism: 1, additionalRequests: 1, additionalLlm: 1 });
  });

  it("小数は切り捨てて候補を生成する", () => {
    const result = buildTeamAndMemberParallelCandidates(2.7, 2.3);
    expect(result).toHaveLength(4); // 2 * 2
    for (const candidate of result) {
      expect(candidate.teamParallelism).toBeLessThanOrEqual(2);
      expect(candidate.memberParallelism).toBeLessThanOrEqual(2);
    }
  });

  it("additionalRequestsはteamParallelismと等しい", () => {
    const result = buildTeamAndMemberParallelCandidates(3, 2);
    for (const candidate of result) {
      expect(candidate.additionalRequests).toBe(candidate.teamParallelism);
    }
  });

  it("additionalLlmはteamParallelism * memberParallelismである", () => {
    const result = buildTeamAndMemberParallelCandidates(3, 2);
    for (const candidate of result) {
      expect(candidate.additionalLlm).toBe(candidate.teamParallelism * candidate.memberParallelism);
    }
  });

  it("候補は並列度の降順でソートされる", () => {
    const result = buildTeamAndMemberParallelCandidates(3, 2);
    // 最初の候補は最大の並列度
    expect(result[0]).toEqual({ teamParallelism: 3, memberParallelism: 2, additionalRequests: 3, additionalLlm: 6 });
    // 最後の候補は最小の並列度
    expect(result[result.length - 1]).toEqual({ teamParallelism: 1, memberParallelism: 1, additionalRequests: 1, additionalLlm: 1 });
  });

  it("プロパティベーステスト: 候補の整合性を検証する", () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 }), fc.nat({ max: 10 }), (teamParallelism, memberParallelism) => {
        const result = buildTeamAndMemberParallelCandidates(teamParallelism, memberParallelism);

        // 候補数の検証
        const expectedTeam = Math.max(1, teamParallelism);
        const expectedMember = Math.max(1, memberParallelism);
        expect(result.length).toBe(expectedTeam * expectedMember);

        // 各候補の整合性検証
        for (const candidate of result) {
          expect(candidate.teamParallelism).toBeGreaterThanOrEqual(1);
          expect(candidate.teamParallelism).toBeLessThanOrEqual(expectedTeam);
          expect(candidate.memberParallelism).toBeGreaterThanOrEqual(1);
          expect(candidate.memberParallelism).toBeLessThanOrEqual(expectedMember);
          expect(candidate.additionalRequests).toBe(candidate.teamParallelism);
          expect(candidate.additionalLlm).toBe(candidate.teamParallelism * candidate.memberParallelism);
        }
      })
    );
  });
});

describe("parallel-execution.ts - resolveTeamParallelCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルトのmock設定
    mockTryReserveRuntimeCapacity.mockReturnValue({
      allowed: true,
      projectedRequests: 1,
      projectedLlm: 1,
      reservation: { id: "lease-1", release: vi.fn() },
    });
    mockReserveRuntimeCapacity.mockResolvedValue({
      allowed: true,
      waitedMs: 0,
      timedOut: false,
      aborted: false,
      attempts: 1,
      projectedRequests: 1,
      projectedLlm: 1,
      reservation: { id: "lease-1", release: vi.fn() },
    });
  });

  describe("即時予約成功", () => {
    it("最初の候補で容量を確保できる", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 5,
        projectedLlm: 5,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      const candidates = buildTeamAndMemberParallelCandidates(2, 2);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(true);
      expect(result.appliedTeamParallelism).toBe(2);
      expect(result.appliedMemberParallelism).toBe(2);
      expect(result.reduced).toBe(false);
      expect(result.waitedMs).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.reservation).toBeDefined();
    });

    it("2番目の候補で容量を確保できる", async () => {
      mockTryReserveRuntimeCapacity
        .mockReturnValueOnce({
          allowed: false,
          projectedRequests: 4,
          projectedLlm: 8,
        })
        .mockReturnValueOnce({
          allowed: true,
          projectedRequests: 3,
          projectedLlm: 3,
          reservation: { id: "lease-1", release: vi.fn() },
        });

      const candidates = buildTeamAndMemberParallelCandidates(2, 2);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(true);
      // 2番目の候補は (teamParallelism=2, memberParallelism=1) かもしれない
      expect(result.reduced).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.reservation).toBeDefined();
    });
  });

  describe("待機して容量を確保", () => {
    it("即時予約に失敗した後、待機して成功する", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: false,
        projectedRequests: 1,
        projectedLlm: 1,
      });
      mockReserveRuntimeCapacity.mockResolvedValue({
        allowed: true,
        waitedMs: 500,
        timedOut: false,
        aborted: false,
        attempts: 3,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      const candidates = buildTeamAndMemberParallelCandidates(2, 2);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(true);
      expect(result.waitedMs).toBe(500);
      expect(result.timedOut).toBe(false);
      expect(result.attempts).toBeGreaterThan(1);
      expect(result.reservation).toBeDefined();
    });
  });

  describe("容量確保失敗", () => {
    it("即時予約も待機予約も失敗する", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: false,
        projectedRequests: 1,
        projectedLlm: 1,
      });
      mockReserveRuntimeCapacity.mockResolvedValue({
        allowed: false,
        waitedMs: 1000,
        timedOut: true,
        aborted: false,
        attempts: 10,
        projectedRequests: 1,
        projectedLlm: 1,
        reasons: ["capacity exceeded"],
      });

      const candidates = buildTeamAndMemberParallelCandidates(2, 2);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.reduced).toBe(true);
      expect(result.reasons).toContain("capacity exceeded");
      expect(result.reservation).toBeUndefined();
    });

    it("タイムアウト時にaborted=trueで返す", async () => {
      const abortController = new AbortController();

      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: false,
        projectedRequests: 1,
        projectedLlm: 1,
      });
      mockReserveRuntimeCapacity.mockImplementation(async () => {
        // 即座に中止をシミュレート
        return {
          allowed: false,
          waitedMs: 0,
          timedOut: false,
          aborted: true,
          attempts: 0,
          projectedRequests: 1,
          projectedLlm: 1,
          reasons: ["aborted"],
        };
      });

      const candidates = buildTeamAndMemberParallelCandidates(2, 2);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
        signal: abortController.signal,
      });

      expect(result.allowed).toBe(false);
      expect(result.aborted).toBe(true);
    });
  });

  describe("空の候補リスト", () => {
    it("空の候補リストはデフォルト候補を使用する", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2,
        requestedMemberParallelism: 2,
        candidates: [],
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(true);
      expect(result.appliedTeamParallelism).toBe(1);
      expect(result.appliedMemberParallelism).toBe(1);
    });
  });

  describe("境界条件", () => {
    it("0以下の並列度は1として扱う", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 0,
        requestedMemberParallelism: 0,
        candidates: [],
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.allowed).toBe(true);
      expect(result.appliedTeamParallelism).toBe(1);
      expect(result.appliedMemberParallelism).toBe(1);
    });

    it("小数は切り捨てて扱う", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      const candidates = buildTeamAndMemberParallelCandidates(2.7, 2.3);
      const result = await resolveTeamParallelCapacity({
        requestedTeamParallelism: 2.7,
        requestedMemberParallelism: 2.3,
        candidates,
        maxWaitMs: 1000,
        pollIntervalMs: 100,
      });

      expect(result.requestedTeamParallelism).toBe(2);
      expect(result.requestedMemberParallelism).toBe(2);
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の並列度で有効な結果を返す", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      await fc.assert(
        fc.asyncProperty(fc.nat({ max: 10 }), fc.nat({ max: 10 }), async (teamParallelism, memberParallelism) => {
          const candidates = buildTeamAndMemberParallelCandidates(teamParallelism, memberParallelism);
          const result = await resolveTeamParallelCapacity({
            requestedTeamParallelism: teamParallelism,
            requestedMemberParallelism: memberParallelism,
            candidates,
            maxWaitMs: 100,
            pollIntervalMs: 10,
          });

          expect(result).toHaveProperty("allowed");
          expect(result).toHaveProperty("requestedTeamParallelism");
          expect(result).toHaveProperty("requestedMemberParallelism");
          expect(result).toHaveProperty("appliedTeamParallelism");
          expect(result).toHaveProperty("appliedMemberParallelism");
          expect(result).toHaveProperty("reduced");
          expect(result).toHaveProperty("waitedMs");
          expect(result).toHaveProperty("timedOut");
          expect(result).toHaveProperty("aborted");
          expect(result).toHaveProperty("attempts");
          expect(typeof result.allowed).toBe("boolean");
          expect(typeof result.appliedTeamParallelism).toBe("number");
          expect(typeof result.appliedMemberParallelism).toBe("number");
          expect(typeof result.reduced).toBe("boolean");
          expect(typeof result.waitedMs).toBe("number");
          expect(typeof result.timedOut).toBe("boolean");
          expect(typeof result.aborted).toBe("boolean");
          expect(typeof result.attempts).toBe("number");
        })
      );
    });

    it("applied値はrequested値以下である", async () => {
      mockTryReserveRuntimeCapacity.mockReturnValue({
        allowed: true,
        projectedRequests: 1,
        projectedLlm: 1,
        reservation: { id: "lease-1", release: vi.fn() },
      });

      await fc.assert(
        fc.asyncProperty(fc.nat({ max: 10 }), fc.nat({ max: 10 }), async (teamParallelism, memberParallelism) => {
          const candidates = buildTeamAndMemberParallelCandidates(teamParallelism, memberParallelism);
          const result = await resolveTeamParallelCapacity({
            requestedTeamParallelism: teamParallelism,
            requestedMemberParallelism: memberParallelism,
            candidates,
            maxWaitMs: 100,
            pollIntervalMs: 10,
          });

          expect(result.appliedTeamParallelism).toBeLessThanOrEqual(result.requestedTeamParallelism);
          expect(result.appliedMemberParallelism).toBeLessThanOrEqual(result.requestedMemberParallelism);
        })
      );
    });
  });
});
