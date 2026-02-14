/**
 * Process utilities for graceful shutdown handling.
 * Provides shared constants for process termination timeouts.
 */

/**
 * Graceful shutdown delay before force-killing a process.
 * After SIGTERM, wait this many ms before sending SIGKILL.
 */
export const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;
