/**
 * Re-export runtime-sessions from shared library
 * @deprecated Import directly from "../../../lib/runtime-sessions.js" instead
 */

export {
  generateSessionId,
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
  type RuntimeSession,
  type RuntimeSessionType,
  type RuntimeSessionStatus,
  type SessionStats,
  type SessionEventType,
  type SessionEvent,
} from "../../../lib/runtime-sessions.js";
