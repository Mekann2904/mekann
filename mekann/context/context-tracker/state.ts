import http from "node:http";

export interface ToolSchemaRecord {
  name: string;
  schemaBytes: number;
  registeredAt: number;
}

export interface ContextMonitorSample {
  id: number;
  at: number;
  cwd?: string;
  sessionId?: string;
  phase: string;
  summary: Record<string, unknown>;
}

export interface ContextMonitorState {
  server?: http.Server;
  port?: number;
  samples: ContextMonitorSample[];
  tools: Map<string, ToolSchemaRecord>;
  toolSchemaTotalBytes: number;
  nextId: number;
  compactionCount: number;
  lastCompactionAt?: number;
  decisions: Array<{ at: number; decision: unknown }>;
}

const KEY = Symbol.for("mekann.contextMonitor.server.v1");

function initState(): ContextMonitorState {
  return { samples: [], tools: new Map(), toolSchemaTotalBytes: 0, nextId: 1, compactionCount: 0, decisions: [] };
}

export const state: ContextMonitorState = (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = initState());
