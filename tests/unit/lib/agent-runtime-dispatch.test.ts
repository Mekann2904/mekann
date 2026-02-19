/**
 * path: tests/unit/lib/agent-runtime-dispatch.test.ts
 * role: Runtime dispatch permitの基本挙動を検証するテスト
 * why: queue turnとcapacity reservationの一体取得が壊れないことを担保するため
 * related: .pi/extensions/agent-runtime.ts, tests/unit/lib/task-scheduler.test.ts
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  acquireRuntimeDispatchPermit,
  getRuntimeSnapshot,
  resetRuntimeTransientState,
} from "../../../.pi/extensions/agent-runtime";

describe("acquireRuntimeDispatchPermit", () => {
  beforeEach(() => {
    resetRuntimeTransientState();
  });

  it("permit_取得とrelease_カウンタが戻る", async () => {
    const permit = await acquireRuntimeDispatchPermit({
      toolName: "agent_team_run",
      candidate: { additionalRequests: 1, additionalLlm: 1 },
      source: "scheduled",
      maxWaitMs: 1000,
      pollIntervalMs: 10,
    });

    expect(permit.allowed).toBe(true);
    expect(permit.lease).toBeDefined();

    const afterAcquire = getRuntimeSnapshot();
    expect(afterAcquire.activeOrchestrations).toBe(1);

    permit.lease?.consume();
    permit.lease?.release();

    const afterRelease = getRuntimeSnapshot();
    expect(afterRelease.activeOrchestrations).toBe(0);
    expect(afterRelease.activeReservations).toBe(0);
  });

  it("permit_永続上限超過_即拒否", async () => {
    const snapshot = getRuntimeSnapshot();
    const permit = await acquireRuntimeDispatchPermit({
      toolName: "agent_team_run_parallel",
      candidate: {
        additionalRequests: snapshot.limits.maxTotalActiveRequests + 1000,
        additionalLlm: 1,
      },
      source: "scheduled",
      maxWaitMs: 1000,
      pollIntervalMs: 10,
    });

    expect(permit.allowed).toBe(false);
    expect(permit.timedOut).toBe(false);
    expect(permit.reasons.length).toBeGreaterThan(0);
  });
});

