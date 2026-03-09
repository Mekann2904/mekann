/**
 * @abdd.meta
 * @path .pi/tests/lib/long-running-supervisor.test.ts
 * @role Test suite for long-running session isolation and context management
 * @why Verify that new pi instances do not inherit context from old sessions
 * @related ../../lib/long-running-supervisor.ts
 * @public_api Tests for isRelevantSession and createLongRunningReplay
 * @invariants Tests should not depend on external state
 * @side_effects None expected (all state is internal)
 * @failure_modes None expected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginLongRunningSession,
  createLongRunningReplay,
  finalizeLongRunningSession,
  type LongRunningSessionState,
} from "../../lib/long-running-supervisor";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Helper to create a temp directory for test sessions
function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lr-test-"));
  fs.mkdirSync(path.join(dir, ".pi", "long-running", "sessions"), { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Helper to create a session state
function createSession(
  id: string,
  overrides: Partial<LongRunningSessionState> = {}
): LongRunningSessionState {
  const now = new Date().toISOString();
  return {
    id,
    cwd: "/test",
    ownerPid: process.pid,
    ownerInstanceId: `test-instance-${id}`,
    startedAt: now,
    updatedAt: now,
    status: "active",
    plan: {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    },
    journalPath: `/test/.pi/long-running/sessions/${id}/journal.jsonl`,
    checkpointPath: `/test/.pi/long-running/sessions/${id}/checkpoint.json`,
    ...overrides,
  };
}

describe("long-running-supervisor session isolation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe("createLongRunningReplay", () => {
    it("should return null session for completed sessions (clean_shutdown)", async () => {
      // Create a completed session
      const session = createSession("test-clean-shutdown", {
        cwd: tempDir,
        status: "clean_shutdown",
      });

      // Save the session
      const sessionPath = path.join(
        tempDir,
        ".pi",
        "long-running",
        "sessions",
        session.id,
        "session.json"
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(session));

      // Update index
      const indexPath = path.join(tempDir, ".pi", "long-running", "index.json");
      fs.writeFileSync(
        indexPath,
        JSON.stringify({
          activeSessionId: session.id,
          latestSessionId: session.id,
          sessionIds: [session.id],
        })
      );

      const replay = createLongRunningReplay(tempDir);
      expect(replay.session).toBeNull();
    });

    it("should return null session for superseded sessions", async () => {
      const session = createSession("test-superseded", {
        cwd: tempDir,
        status: "superseded",
      });

      const sessionPath = path.join(
        tempDir,
        ".pi",
        "long-running",
        "sessions",
        session.id,
        "session.json"
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(session));

      const indexPath = path.join(tempDir, ".pi", "long-running", "index.json");
      fs.writeFileSync(
        indexPath,
        JSON.stringify({
          activeSessionId: session.id,
          latestSessionId: session.id,
          sessionIds: [session.id],
        })
      );

      const replay = createLongRunningReplay(tempDir);
      expect(replay.session).toBeNull();
    });

    it("should return null session for stale sessions (TTL expired)", async () => {
      // Create a session updated 15 minutes ago (past 10-minute TTL)
      const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const session = createSession("test-stale", {
        cwd: tempDir,
        updatedAt: staleTime,
        status: "active",
      });

      const sessionPath = path.join(
        tempDir,
        ".pi",
        "long-running",
        "sessions",
        session.id,
        "session.json"
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(session));

      const indexPath = path.join(tempDir, ".pi", "long-running", "index.json");
      fs.writeFileSync(
        indexPath,
        JSON.stringify({
          activeSessionId: session.id,
          latestSessionId: session.id,
          sessionIds: [session.id],
        })
      );

      const replay = createLongRunningReplay(tempDir);
      expect(replay.session).toBeNull();
    });

    it("should return null session for sessions from different instances", async () => {
      const session = createSession("test-other-instance", {
        cwd: tempDir,
        ownerInstanceId: "different-instance-id",
        status: "active",
      });

      const sessionPath = path.join(
        tempDir,
        ".pi",
        "long-running",
        "sessions",
        session.id,
        "session.json"
      );
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(session));

      const indexPath = path.join(tempDir, ".pi", "long-running", "index.json");
      fs.writeFileSync(
        indexPath,
        JSON.stringify({
          activeSessionId: session.id,
          latestSessionId: session.id,
          sessionIds: [session.id],
        })
      );

      const replay = createLongRunningReplay(tempDir);
      expect(replay.session).toBeNull();
    });

    it("should return session for own instance with active status", async () => {
      // This test verifies that a session created by the current process
      // is still returned correctly
      const result = await beginLongRunningSession({
        cwd: tempDir,
        task: "Test task for current instance",
      });

      expect(result.session).toBeDefined();
      expect(result.session.status).toBe("active");

      const replay = createLongRunningReplay(tempDir);
      expect(replay.session).toBeDefined();
      expect(replay.session?.id).toBe(result.session.id);

      // Cleanup
      finalizeLongRunningSession(tempDir, result.session.id, "clean_shutdown");
    });

    it("should return session for crashed sessions from own instance", async () => {
      // First create a session
      const result = await beginLongRunningSession({
        cwd: tempDir,
        task: "Test crashed session",
      });

      // Manually mark it as crashed
      const sessionPath = path.join(
        tempDir,
        ".pi",
        "long-running",
        "sessions",
        result.session.id,
        "session.json"
      );
      const crashedSession = {
        ...result.session,
        status: "crashed" as const,
      };
      fs.writeFileSync(sessionPath, JSON.stringify(crashedSession));

      const replay = createLongRunningReplay(tempDir);
      // Crashed sessions from own instance should be returned for recovery
      expect(replay.session).toBeDefined();
      expect(replay.session?.status).toBe("crashed");
    });
  });
});
