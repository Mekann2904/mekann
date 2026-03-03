/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/server-utils.ts
 * @role Server utility functions for web-ui server
 * @why Centralize helper functions used by server.ts
 * @related server.ts, routes/*.ts
 * @public_api cleanupDeadOwnerUlWorkflowTasks, loadAndConnectMcpServers
 * @invariants None
 * @side_effects Reads/writes UL workflow task files, connects MCP servers
 * @failure_modes File system errors, MCP connection failures
 *
 * @abdd.explain
 * @overview Utility functions for server startup and maintenance
 * @what_it_does Cleans up dead UL tasks, auto-connects MCP servers
 * @why_it_exists Separates utility logic from server initialization
 * @scope(in) Instance registry, MCP config
 * @scope(out) Deleted UL tasks, connected MCP servers
 */

import path from "path";
import fs from "fs";
import { InstanceRegistry } from "./instance-registry.js";
import { invalidateCache } from "./ul-workflow-reader.js";
import type { McpAuthProvider } from "../../../lib/mcp/types.js";

/**
 * @summary MCP server configuration from mcp-servers.json
 */
interface McpServerConfig {
  id: string;
  url: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  transportType?: 'auto' | 'streamable-http' | 'sse' | 'stdio' | 'websocket';
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    headerName?: string;
  };
  headers?: Record<string, string>;
}

/**
 * @summary ownerInstanceIdからPIDを抽出
 * @param ownerInstanceId - "{sessionId}-{pid}"形式のインスタンスID
 * @returns PID（抽出失敗時はnull）
 */
function extractPidFromOwnerInstanceId(ownerInstanceId: string | undefined): number | null {
  if (!ownerInstanceId) return null;
  const match = ownerInstanceId.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * @summary 非アクティブなインスタンスが所有するULタスクを削除
 * @description InstanceRegistryのハートビート情報と照合し、60秒以上応答のない
 *              インスタンスが所有するタスクを削除する
 * @returns 削除されたタスク数
 */
export function cleanupDeadOwnerUlWorkflowTasks(): number {
  const activeInstances = InstanceRegistry.getAll();
  const activePids = new Set(activeInstances.map((i) => i.pid));

  const ulTasksDir = path.join(process.cwd(), ".pi", "ul-workflow", "tasks");

  if (!fs.existsSync(ulTasksDir)) {
    return 0;
  }

  // 完了状態のフェーズ
  const terminalPhases = new Set(["completed", "aborted"]);

  let deletedCount = 0;

  try {
    const taskDirs = fs.readdirSync(ulTasksDir)
      .filter((name) => fs.statSync(path.join(ulTasksDir, name)).isDirectory());

    for (const taskId of taskDirs) {
      const statusPath = path.join(ulTasksDir, taskId, "status.json");

      if (!fs.existsSync(statusPath)) {
        continue;
      }

      try {
        const statusRaw = fs.readFileSync(statusPath, "utf-8");
        const status = JSON.parse(statusRaw);
        const ownerPid = extractPidFromOwnerInstanceId(status.ownerInstanceId);
        const phase = status.phase || "unknown";

        // 削除条件1: 完了済み + ownerInstanceIdがnull（古いタスク）
        if (!ownerPid) {
          if (terminalPhases.has(phase)) {
            const taskDir = path.join(ulTasksDir, taskId);
            fs.rmSync(taskDir, { recursive: true, force: true });
            deletedCount++;
            console.log(`[web-ui] Cleaned up UL task ${taskId} (completed with no owner)`);
          }
          continue;
        }

        // 削除条件2: アクティブでないインスタンスが所有している
        if (activePids.has(ownerPid)) {
          continue;
        }

        const taskDir = path.join(ulTasksDir, taskId);
        fs.rmSync(taskDir, { recursive: true, force: true });
        deletedCount++;
        console.log(`[web-ui] Cleaned up UL task ${taskId} (owner PID ${ownerPid} is inactive)`);
      } catch {
        // 個別のタスク削除エラーは無視
      }
    }

    if (deletedCount > 0) {
      // キャッシュを無効化
      invalidateCache();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[web-ui] Failed to cleanup UL tasks: ${errorMessage}`);
  }

  return deletedCount;
}

function normalizeMcpAuth(auth?: McpServerConfig["auth"]): McpAuthProvider | undefined {
  if (!auth) return undefined;
  if (auth.type === "bearer" && auth.token) {
    return { type: "bearer", token: auth.token };
  }
  if (auth.type === "basic" && auth.username && auth.password) {
    return { type: "basic", username: auth.username, password: auth.password };
  }
  if (auth.type === "api-key" && auth.apiKey) {
    return { type: "api-key", apiKey: auth.apiKey, headerName: auth.headerName };
  }
  return undefined;
}

/**
 * @summary Load MCP server configuration and auto-connect enabled servers
 */
export async function loadAndConnectMcpServers(): Promise<void> {
  const configPath = path.join(process.cwd(), '.pi', 'mcp-servers.json');

  try {
    if (!fs.existsSync(configPath)) {
      return;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as { servers: McpServerConfig[] };

    if (!config.servers || !Array.isArray(config.servers)) {
      return;
    }

    const { mcpManager } = await import("../../../lib/mcp/connection-manager.js");

    for (const server of config.servers) {
      if (server.enabled === false) {
        continue;
      }

      try {
        await mcpManager.connect({
          id: server.id,
          url: server.url,
          transportType: server.transportType ?? 'auto',
          auth: normalizeMcpAuth(server.auth),
          headers: server.headers,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[web-ui] Failed to connect MCP server ${server.id}: ${errorMessage}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[web-ui] Failed to load MCP config: ${errorMessage}`);
  }
}
