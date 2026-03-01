/**
 * @abdd.meta
 * @path .pi/tests/lib/runtime-sessions.test.ts
 * @role Test suite for runtime session management
 * @why Verify session lifecycle, event emissions, and query APIs
 * @related ../../lib/runtime-sessions.ts
 * @public_api Tests for addSession, updateSession, removeSession, getActiveSessions, getSessionByTaskId, onSessionEvent
 * @invariants Tests clean up sessions after each test
 * @side_effects None (tests are isolated)
 * @failure_modes Tests handle missing sessions gracefully
 *
 * @abdd.explain
 * @overview Comprehensive test suite for runtime session management
 * @what_it_does Tests session CRUD operations, event system, and statistics
 * @why_it_exists Ensures reliable session tracking for Web UI Kanban board
 * @scope(in) Session operations from runtime-sessions.ts
 * @scope(out) Test results and coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addSession,
  updateSession,
  removeSession,
  getSession,
  getActiveSessions,
  getSessionByTaskId,
  getSessionsByAgentId,
  getSessionsByType,
  getSessionStats,
  cleanupCompletedSessions,
  clearAllSessions,
  onSessionEvent,
  generateSessionId,
  type RuntimeSession,
  type SessionEvent,
} from "../../lib/runtime-sessions";

describe("runtime-sessions", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe("generateSessionId", () => {
    it("should generate unique session IDs", () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session-\d+-\d+$/);
      expect(id2).toMatch(/^session-\d+-\d+$/);
    });

    it("should generate session IDs with timestamp", () => {
      const before = Date.now();
      const id = generateSessionId();
      const after = Date.now();

      const match = id.match(/^session-(\d+)-(\d+)$/);
      expect(match).not.toBeNull();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("addSession", () => {
    it("should add a subagent session", () => {
      const session: RuntimeSession = {
        id: "test-session-1",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      const result = addSession(session);

      expect(result).toEqual(session);
      expect(getSession("test-session-1")).toEqual(session);
    });

    it("should add an agent-team session with teammates", () => {
      const session: RuntimeSession = {
        id: "test-team-1",
        type: "agent-team",
        agentId: "test-team",
        teamId: "team-1",
        teammateCount: 3,
        status: "starting",
        startedAt: Date.now(),
      };

      const result = addSession(session);

      expect(result).toEqual(session);
      expect(getSession("test-team-1")).toEqual(session);
    });

    it("should add session with task information", () => {
      const session: RuntimeSession = {
        id: "test-session-task",
        type: "subagent",
        agentId: "researcher",
        taskId: "TASK-123",
        taskTitle: "Implement feature X",
        taskDescription: "Full task description here",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const retrieved = getSession("test-session-task");

      expect(retrieved?.taskId).toBe("TASK-123");
      expect(retrieved?.taskTitle).toBe("Implement feature X");
      expect(retrieved?.taskDescription).toBe("Full task description here");
    });

    it("should emit session_added event", () => {
      const listener = vi.fn();
      onSessionEvent(listener);

      const session: RuntimeSession = {
        id: "test-event",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "session_added",
          data: session,
        })
      );
    });
  });

  describe("updateSession", () => {
    it("should update session status", () => {
      const session: RuntimeSession = {
        id: "test-update",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const updated = updateSession("test-update", { status: "completed", completedAt: Date.now() });

      expect(updated?.status).toBe("completed");
      expect(updated?.completedAt).toBeDefined();
    });

    it("should update session progress", () => {
      const session: RuntimeSession = {
        id: "test-progress",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const updated = updateSession("test-progress", { progress: 50, message: "Halfway done" });

      expect(updated?.progress).toBe(50);
      expect(updated?.message).toBe("Halfway done");
    });

    it("should return undefined for non-existent session", () => {
      const result = updateSession("non-existent", { status: "completed" });
      expect(result).toBeUndefined();
    });

    it("should emit session_updated event", () => {
      const listener = vi.fn();
      onSessionEvent(listener);

      const session: RuntimeSession = {
        id: "test-update-event",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      listener.mockClear();

      updateSession("test-update-event", { status: "completed" });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "session_updated",
          data: expect.objectContaining({ status: "completed" }),
        })
      );
    });

    it("should preserve unmodified fields", () => {
      const session: RuntimeSession = {
        id: "test-preserve",
        type: "subagent",
        agentId: "researcher",
        taskId: "TASK-456",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const updated = updateSession("test-preserve", { progress: 75 });

      expect(updated?.agentId).toBe("researcher");
      expect(updated?.taskId).toBe("TASK-456");
      expect(updated?.progress).toBe(75);
    });
  });

  describe("removeSession", () => {
    it("should remove an existing session", () => {
      const session: RuntimeSession = {
        id: "test-remove",
        type: "subagent",
        agentId: "implementer",
        status: "completed",
        startedAt: Date.now(),
      };

      addSession(session);
      const result = removeSession("test-remove");

      expect(result).toBe(true);
      expect(getSession("test-remove")).toBeUndefined();
    });

    it("should return false for non-existent session", () => {
      const result = removeSession("non-existent");
      expect(result).toBe(false);
    });

    it("should emit session_removed event", () => {
      const listener = vi.fn();
      onSessionEvent(listener);

      const session: RuntimeSession = {
        id: "test-remove-event",
        type: "subagent",
        agentId: "implementer",
        status: "completed",
        startedAt: Date.now(),
      };

      addSession(session);
      listener.mockClear();

      removeSession("test-remove-event");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "session_removed",
          data: { id: "test-remove-event" },
        })
      );
    });
  });

  describe("getSession", () => {
    it("should retrieve an existing session", () => {
      const session: RuntimeSession = {
        id: "test-get",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const result = getSession("test-get");

      expect(result).toEqual(session);
    });

    it("should return undefined for non-existent session", () => {
      const result = getSession("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("getActiveSessions", () => {
    it("should return all active sessions", () => {
      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "a1", status: "running", startedAt: Date.now() },
        { id: "s2", type: "agent-team", agentId: "a2", status: "starting", startedAt: Date.now() },
        { id: "s3", type: "subagent", agentId: "a3", status: "completed", startedAt: Date.now() },
      ];

      sessions.forEach(addSession);
      const result = getActiveSessions();

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3"].sort());
    });

    it("should return empty array when no sessions", () => {
      const result = getActiveSessions();
      expect(result).toEqual([]);
    });
  });

  describe("getSessionByTaskId", () => {
    it("should find session by task ID", () => {
      const session: RuntimeSession = {
        id: "test-task",
        type: "subagent",
        agentId: "implementer",
        taskId: "TASK-789",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      const result = getSessionByTaskId("TASK-789");

      expect(result).toEqual(session);
    });

    it("should return undefined when no session has the task ID", () => {
      const result = getSessionByTaskId("TASK-NONEXISTENT");
      expect(result).toBeUndefined();
    });
  });

  describe("getSessionsByAgentId", () => {
    it("should find all sessions for an agent", () => {
      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "researcher", status: "running", startedAt: Date.now() },
        { id: "s2", type: "subagent", agentId: "researcher", status: "completed", startedAt: Date.now() },
        { id: "s3", type: "subagent", agentId: "implementer", status: "running", startedAt: Date.now() },
      ];

      sessions.forEach(addSession);
      const result = getSessionsByAgentId("researcher");

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.agentId === "researcher")).toBe(true);
    });

    it("should return empty array when no sessions found", () => {
      const result = getSessionsByAgentId("non-existent-agent");
      expect(result).toEqual([]);
    });
  });

  describe("getSessionsByType", () => {
    it("should find all sessions of a specific type", () => {
      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "a1", status: "running", startedAt: Date.now() },
        { id: "s2", type: "agent-team", agentId: "a2", status: "running", startedAt: Date.now() },
        { id: "s3", type: "subagent", agentId: "a3", status: "running", startedAt: Date.now() },
      ];

      sessions.forEach(addSession);

      const subagentSessions = getSessionsByType("subagent");
      const teamSessions = getSessionsByType("agent-team");

      expect(subagentSessions).toHaveLength(2);
      expect(teamSessions).toHaveLength(1);
    });

    it("should return empty array when no sessions of type", () => {
      const result = getSessionsByType("subagent");
      expect(result).toEqual([]);
    });
  });

  describe("getSessionStats", () => {
    it("should return correct statistics", () => {
      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "a1", status: "starting", startedAt: Date.now() },
        { id: "s2", type: "subagent", agentId: "a2", status: "running", startedAt: Date.now() },
        { id: "s3", type: "subagent", agentId: "a3", status: "running", startedAt: Date.now() },
        { id: "s4", type: "subagent", agentId: "a4", status: "completed", startedAt: Date.now() },
        { id: "s5", type: "subagent", agentId: "a5", status: "failed", startedAt: Date.now() },
      ];

      sessions.forEach(addSession);
      const stats = getSessionStats();

      expect(stats.total).toBe(5);
      expect(stats.starting).toBe(1);
      expect(stats.running).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it("should return zero stats when no sessions", () => {
      const stats = getSessionStats();

      expect(stats.total).toBe(0);
      expect(stats.starting).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe("cleanupCompletedSessions", () => {
    it("should remove old completed sessions", () => {
      const now = Date.now();
      const oldTime = now - 10 * 60 * 1000; // 10 minutes ago

      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "a1", status: "completed", startedAt: oldTime, completedAt: oldTime },
        { id: "s2", type: "subagent", agentId: "a2", status: "completed", startedAt: now, completedAt: now },
        { id: "s3", type: "subagent", agentId: "a3", status: "running", startedAt: oldTime },
      ];

      sessions.forEach(addSession);

      const removed = cleanupCompletedSessions(5 * 60 * 1000);

      expect(removed).toBe(1);
      expect(getSession("s1")).toBeUndefined();
      expect(getSession("s2")).toBeDefined();
      expect(getSession("s3")).toBeDefined();
    });

    it("should remove old failed sessions", () => {
      const now = Date.now();
      const oldTime = now - 10 * 60 * 1000;

      const session: RuntimeSession = {
        id: "failed-old",
        type: "subagent",
        agentId: "a1",
        status: "failed",
        startedAt: oldTime,
        completedAt: oldTime,
      };

      addSession(session);
      const removed = cleanupCompletedSessions(5 * 60 * 1000);

      expect(removed).toBe(1);
      expect(getSession("failed-old")).toBeUndefined();
    });

    it("should emit sessions_cleaned event when sessions removed", () => {
      const listener = vi.fn();
      onSessionEvent(listener);

      const now = Date.now();
      const oldTime = now - 10 * 60 * 1000;

      const session: RuntimeSession = {
        id: "old-completed",
        type: "subagent",
        agentId: "a1",
        status: "completed",
        startedAt: oldTime,
        completedAt: oldTime,
      };

      addSession(session);
      listener.mockClear();

      cleanupCompletedSessions(5 * 60 * 1000);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sessions_cleaned",
          data: { removed: 1 },
        })
      );
    });

    it("should not emit event when no sessions removed", () => {
      const listener = vi.fn();
      onSessionEvent(listener);

      cleanupCompletedSessions(5 * 60 * 1000);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should use default max age when not specified", () => {
      const now = Date.now();
      const fourMinutesAgo = now - 4 * 60 * 1000;

      const session: RuntimeSession = {
        id: "recent-completed",
        type: "subagent",
        agentId: "a1",
        status: "completed",
        startedAt: fourMinutesAgo,
        completedAt: fourMinutesAgo,
      };

      addSession(session);
      const removed = cleanupCompletedSessions();

      expect(removed).toBe(0);
      expect(getSession("recent-completed")).toBeDefined();
    });
  });

  describe("onSessionEvent", () => {
    it("should receive all session events", () => {
      const events: SessionEvent[] = [];
      const unsubscribe = onSessionEvent((event) => events.push(event));

      const session: RuntimeSession = {
        id: "test-events",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      updateSession("test-events", { progress: 50 });
      removeSession("test-events");

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe("session_added");
      expect(events[1].type).toBe("session_updated");
      expect(events[2].type).toBe("session_removed");

      unsubscribe();
    });

    it("should support multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      onSessionEvent(listener1);
      onSessionEvent(listener2);

      const session: RuntimeSession = {
        id: "test-multi",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("should unsubscribe correctly", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionEvent(listener);

      const session: RuntimeSession = {
        id: "test-unsub",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      addSession(session);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      updateSession("test-unsub", { progress: 50 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should handle listener errors gracefully", () => {
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      onSessionEvent(errorListener);
      onSessionEvent(normalListener);

      const session: RuntimeSession = {
        id: "test-error",
        type: "subagent",
        agentId: "implementer",
        status: "running",
        startedAt: Date.now(),
      };

      // Should not throw
      expect(() => addSession(session)).not.toThrow();

      // Both listeners should be called
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe("clearAllSessions", () => {
    it("should remove all sessions", () => {
      const sessions: RuntimeSession[] = [
        { id: "s1", type: "subagent", agentId: "a1", status: "running", startedAt: Date.now() },
        { id: "s2", type: "subagent", agentId: "a2", status: "running", startedAt: Date.now() },
        { id: "s3", type: "subagent", agentId: "a3", status: "running", startedAt: Date.now() },
      ];

      sessions.forEach(addSession);
      expect(getActiveSessions()).toHaveLength(3);

      clearAllSessions();
      expect(getActiveSessions()).toHaveLength(0);
    });
  });

  describe("session lifecycle (E2E scenario)", () => {
    it("should handle complete session lifecycle", () => {
      const events: SessionEvent[] = [];
      onSessionEvent((e) => events.push(e));

      // 1. Create session
      const session: RuntimeSession = {
        id: "lifecycle-test",
        type: "subagent",
        agentId: "implementer",
        taskId: "TASK-LIFECYCLE",
        taskTitle: "Implement feature",
        status: "starting",
        startedAt: Date.now(),
      };

      addSession(session);

      // 2. Update to running
      updateSession("lifecycle-test", { status: "running", progress: 0 });

      // 3. Progress updates
      updateSession("lifecycle-test", { progress: 25, message: "First step done" });
      updateSession("lifecycle-test", { progress: 50, message: "Halfway" });
      updateSession("lifecycle-test", { progress: 75, message: "Almost done" });

      // 4. Complete
      updateSession("lifecycle-test", {
        status: "completed",
        progress: 100,
        message: "Done",
        completedAt: Date.now(),
      });

      // 5. Verify final state
      const final = getSession("lifecycle-test");
      expect(final?.status).toBe("completed");
      expect(final?.progress).toBe(100);

      // 6. Verify events
      // Note: addSession triggers both session_added and session_updated events
      // 4 updateSession calls + initial add = 5-6 events depending on implementation
      expect(events.length).toBeGreaterThanOrEqual(5);
      expect(events[0].type).toBe("session_added");
      expect(events[events.length - 1].type).toBe("session_updated");
    });

    it("should handle failed session lifecycle", () => {
      const session: RuntimeSession = {
        id: "failed-lifecycle",
        type: "subagent",
        agentId: "researcher",
        status: "starting",
        startedAt: Date.now(),
      };

      addSession(session);
      updateSession("failed-lifecycle", { status: "running", progress: 30 });
      updateSession("failed-lifecycle", {
        status: "failed",
        message: "Error occurred",
        completedAt: Date.now(),
      });

      const final = getSession("failed-lifecycle");
      expect(final?.status).toBe("failed");
      expect(final?.progress).toBe(30);
    });

    it("should handle agent-team session with teammates", () => {
      const session: RuntimeSession = {
        id: "team-lifecycle",
        type: "agent-team",
        agentId: "test-team",
        teamId: "team-1",
        teammateCount: 3,
        taskId: "TEAM-TASK-1",
        status: "starting",
        startedAt: Date.now(),
      };

      addSession(session);

      updateSession("team-lifecycle", {
        status: "running",
        progress: 10,
      });

      updateSession("team-lifecycle", {
        status: "completed",
        progress: 100,
        completedAt: Date.now(),
      });

      const stats = getSessionStats();
      expect(stats.completed).toBe(1);
    });
  });
});
