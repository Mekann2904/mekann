/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/config.ts
 * @role Centralized configuration for web-ui server
 * @why Single source of truth for all configuration values
 * @related unified-server.ts, index.ts
 * @public_api getConfig, getPort
 * @invariants Environment variables override defaults
 * @side_effects Reads process.env
 * @failure_modes Invalid port number
 *
 * @abdd.explain
 * @overview Configuration management with environment variable support
 * @what_it_does Provides server port, shared directory paths, timeouts
 * @why_it_exists Centralizes all configuration in one place
 * @scope(in) Environment variables (PI_WEB_UI_*)
 * @scope(out) Configuration object
 */

import { homedir } from "os";
import { join } from "path";

/**
 * Server configuration interface
 */
export interface ServerConfig {
  /** Server port number */
  port: number;
  /** Shared storage directory */
  sharedDir: string;
  /** Instance heartbeat timeout (ms) */
  heartbeatTimeout: number;
  /** Context history cleanup interval (ms) */
  cleanupInterval: number;
  /** SSE heartbeat interval (ms) */
  sseHeartbeatInterval: number;
  /** UL task cleanup interval (ms) */
  ulTaskCleanupInterval: number;
  /** Auto-start web UI on pi launch */
  autoStart: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<ServerConfig, "port" | "autoStart"> = {
  sharedDir: join(homedir(), ".pi-shared"),
  heartbeatTimeout: 60000, // 60 seconds
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  sseHeartbeatInterval: 30000, // 30 seconds
  ulTaskCleanupInterval: 5 * 60 * 1000, // 5 minutes
};

/**
 * Get server port from environment or default
 * Priority: PI_WEB_UI_PORT env var > DEFAULT_PORT
 */
export function getPort(): number {
  const envPort = process.env.PI_WEB_UI_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.warn(`[web-ui] Invalid PI_WEB_UI_PORT: ${envPort}, using default 3000`);
      return 3000;
    }
    return port;
  }
  return 3000;
}

/**
 * Get auto-start setting from environment
 * Priority: PI_WEB_UI_AUTO_START env var > true (default)
 */
export function getAutoStart(): boolean {
  const envAutoStart = process.env.PI_WEB_UI_AUTO_START;
  if (envAutoStart === "false" || envAutoStart === "0") {
    return false;
  }
  return true;
}

/**
 * Get full server configuration
 */
export function getConfig(): ServerConfig {
  return {
    ...DEFAULT_CONFIG,
    port: getPort(),
    autoStart: getAutoStart(),
  };
}
