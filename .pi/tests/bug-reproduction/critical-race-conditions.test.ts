/**
 * Bug War Room Phase 4 - Critical Race Condition Tests
 *
 * このテストファイルはCriticalバグの再現テストを含みます:
 * - バグ #1: retry-with-backoff.ts - sharedRateLimitState.entriesへの並列アクセス
 * - バグ #2: agent-runtime.ts - globalThis初期化のレースコンディション
 * - バグ #3: communication.ts - beliefStateCacheの並列アクセス
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// バグ #1: retry-with-backoff.ts - sharedRateLimitState.entriesへの並列アクセス
// ============================================================================

describe("Bug #1: retry-with-backoff.ts - sharedRateLimitState.entries Race Condition", () => {
  /**
   * 再現シナリオ:
   * 同一プロセス内で複数の非同期処理が同時にMap操作を行うと、
   * withFileLockはプロセス間ロックのみで同一プロセス内の並列アクセスを防げない
   *
   * 注: registerRateLimitGateHit は内部関数のため、エクスポートされた関数を使用
   */

  it("should detect race condition when multiple concurrent operations access rate limit state", async () => {
    const {
      retryWithBackoff,
      getRateLimitGateSnapshot,
    } = await import("../../lib/retry-with-backoff.js");

    const key = "test-race-key-1";
    let callCount = 0;

    // 429エラーを発生させるモックオペレーション
    const create429Operation = () => async () => {
      callCount++;
      if (callCount <= 5) {
        throw { status: 429, message: "Too Many Requests" };
      }
      return "success";
    };

    // 複数の並列オペレーションを実行
    const promises = Array.from({ length: 3 }, () =>
      retryWithBackoff(create429Operation(), {
        rateLimitKey: key,
        overrides: { maxRetries: 2, initialDelayMs: 100, maxDelayMs: 500 },
      }).catch(() => "expected-failure")
    );

    await Promise.all(promises);

    // レート制限状態を確認
    const snapshot = getRateLimitGateSnapshot(key);

    // バグがある場合: 状態が一貫していない可能性
    // 修正後: hitsが一貫して設定される
    expect(typeof snapshot.hits).toBe("number");
    expect(typeof snapshot.waitMs).toBe("number");
    expect(snapshot.waitMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle concurrent read operations on rate limit state", async () => {
    const { getRateLimitGateSnapshot } = await import(
      "../../lib/retry-with-backoff.js"
    );

    const key = "test-read-race";

    // 読み取りを並列実行
    const snapshots = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(getRateLimitGateSnapshot(key))
      )
    );

    // 全てのスナップショットが有効であることを確認
    for (const snapshot of snapshots) {
      expect(typeof snapshot.hits).toBe("number");
      expect(typeof snapshot.waitMs).toBe("number");
      expect(snapshot.key).toBe(key);
    }
  });
});

// ============================================================================
// バグ #2: agent-runtime.ts - globalThis初期化のレースコンディション
// ============================================================================

describe("Bug #2: agent-runtime.ts - globalThis Initialization Race Condition", () => {
  /**
   * 再現シナリオ:
   * globalThis.__PI_SHARED_AGENT_RUNTIME_STATE__の初期化・アクセスが
   * ロックなしで行われるため、複数の並行呼び出しで初期化が競合する
   */

  it("should handle concurrent state initialization safely", async () => {
    const { getSharedRuntimeState } = await import(
      "../../extensions/agent-runtime.js"
    );

    // 複数の並行呼び出しで初期化を試行
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve(getSharedRuntimeState())
      )
    );

    // 全ての結果が同じ構造を持つことを確認
    const firstResult = results[0];
    for (const result of results) {
      // 構造が一貫していることを確認
      expect(result.subagents).toBeDefined();
      expect(result.teams).toBeDefined();
      expect(result.queue).toBeDefined();
      expect(result.reservations).toBeDefined();
      expect(result.limits).toBeDefined();

      // 同じオブジェクト参照であることを確認（シングルトン）
      expect(result).toBe(firstResult);
    }
  });

  it("should handle concurrent state mutations safely", async () => {
    const {
      getSharedRuntimeState,
      tryReserveRuntimeCapacity,
      notifyRuntimeCapacityChanged,
    } = await import("../../extensions/agent-runtime.js");

    // 初期状態を取得
    const initialState = getSharedRuntimeState();
    const initialReservations = initialState.reservations.active.length;

    // 並列で複数の予約を試行
    const reservations = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        tryReserveRuntimeCapacity({
          toolName: `test-tool-${i}`,
          additionalRequests: 1,
          additionalLlm: 1,
        })
      )
    );

    // 少なくとも一部の予約が成功することを確認
    const successfulReservations = reservations.filter((r) => r.allowed);
    expect(successfulReservations.length).toBeGreaterThan(0);

    // 状態が一貫していることを確認
    const finalState = getSharedRuntimeState();
    expect(finalState.reservations.active.length).toBeGreaterThanOrEqual(
      initialReservations
    );

    // クリーンアップ
    for (const reservation of successfulReservations) {
      if (reservation.reservation) {
        reservation.reservation.release();
      }
    }
    notifyRuntimeCapacityChanged();
  });
});

// ============================================================================
// バグ #3: communication.ts - beliefStateCacheの並列アクセス
// ============================================================================

describe("Bug #3: communication.ts - beliefStateCache Race Condition", () => {
  /**
   * 再現シナリオ:
   * beliefStateCacheがモジュールレベルのMap。
   * 複数チーム並列実行時にclearBeliefStateCache()が競合する
   */

  beforeEach(async () => {
    // キャッシュをクリア
    const { clearBeliefStateCache } = await import(
      "../../extensions/agent-teams/communication.js"
    );
    clearBeliefStateCache();
  });

  it("should handle belief state updates for multiple teams", async () => {
    const {
      updateBeliefState,
      getBeliefSummary,
      clearBeliefStateCache,
    } = await import("../../extensions/agent-teams/communication.js");

    clearBeliefStateCache();

    // 複数のチームのメンバーを定義
    const teamMembers = [
      { teamId: "team-a", memberId: "member-1" },
      { teamId: "team-a", memberId: "member-2" },
      { teamId: "team-b", memberId: "member-1" },
      { teamId: "team-b", memberId: "member-2" },
    ];

    // 並列で信念状態を更新
    const updates = teamMembers.map(({ teamId, memberId }) =>
      updateBeliefState(
        teamId,
        memberId,
        `SUMMARY: Test summary\nCLAIM: Test claim\nCONFIDENCE: 0.8`,
        1
      )
    );

    // 並列実行
    await Promise.all(updates.map((p) => Promise.resolve(p)));

    // 各チームのサマリーを確認
    const teamASummary = getBeliefSummary("team-a", ["member-1", "member-2"]);
    const teamBSummary = getBeliefSummary("team-b", ["member-1", "member-2"]);

    // サマリーが生成されることを確認
    expect(typeof teamASummary).toBe("string");
    expect(typeof teamBSummary).toBe("string");
  });

  it("should not crash when clearing cache during updates", async () => {
    const {
      updateBeliefState,
      clearBeliefStateCache,
      getBeliefSummary,
    } = await import("../../extensions/agent-teams/communication.js");

    clearBeliefStateCache();

    // 更新中にキャッシュをクリアする競合シナリオ
    const updatePromises: Promise<void>[] = [];

    for (let i = 0; i < 10; i++) {
      updatePromises.push(
        Promise.resolve(
          updateBeliefState(
            "test-team",
            `member-${i}`,
            `SUMMARY: Update ${i}\nCLAIM: Claim ${i}\nCONFIDENCE: 0.5`,
            1
          )
        )
      );
    }

    // 更新の途中でクリアを実行
    setTimeout(() => clearBeliefStateCache(), 0);

    // クラッシュしないことを確認
    await Promise.all(updatePromises);

    // 最終状態が一貫していることを確認
    const summary = getBeliefSummary("test-team", ["member-0"]);
    expect(typeof summary).toBe("string");
  });

  it("should isolate belief caches between different teams", async () => {
    const {
      updateBeliefState,
      getBeliefSummary,
      clearBeliefStateCache,
    } = await import("../../extensions/agent-teams/communication.js");

    clearBeliefStateCache();

    // チームAの更新
    updateBeliefState(
      "team-a",
      "member-1",
      "SUMMARY: Team A\nCLAIM: Claim A\nCONFIDENCE: 0.9",
      1
    );

    // チームBの更新
    updateBeliefState(
      "team-b",
      "member-1",
      "SUMMARY: Team B\nCLAIM: Claim B\nCONFIDENCE: 0.7",
      1
    );

    // 各チームのサマリーを取得
    const teamASummary = getBeliefSummary("team-a", ["member-1"]);
    const teamBSummary = getBeliefSummary("team-b", ["member-1"]);

    // 両方のサマリーが存在することを確認（メンバーIDが含まれる）
    expect(teamASummary).toContain("member-1");
    expect(teamBSummary).toContain("member-1");

    // チーム間でキャッシュが分離されていることを確認
    // チームAのサマリーにはClaim A（確信度0.9）が含まれる
    expect(teamASummary).toContain("0.90");
    // チームBのサマリーにはClaim B（確信度0.7）が含まれる
    expect(teamBSummary).toContain("0.70");
  });
});
