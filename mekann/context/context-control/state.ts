import http from "node:http";
import type { StoredContextObservation } from "./observation.js";

export interface ToolSchemaRecord {
  name: string;
  schemaBytes: number;
  /** First registration time for this tool name (ms epoch). */
  registeredAt: number;
  /** Last time the schema bytes were (re)recorded for this tool name (ms epoch). */
  lastUpdatedAt: number;
}

export type ContextMonitorSample = StoredContextObservation;

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

const KEY = Symbol.for("mekann.contextControl.state.v1");

function initState(): ContextMonitorState {
  return { samples: [], tools: new Map(), toolSchemaTotalBytes: 0, nextId: 1, compactionCount: 0, decisions: [] };
}

export const state: ContextMonitorState = (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = initState());
