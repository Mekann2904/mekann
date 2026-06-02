import { state, type ToolSchemaRecord } from "../context-tracker/state.js";

export interface ToolSchemaSnapshot {
  tools: ToolSchemaRecord[];
  totalBytes: number;
}

export function recordToolSchemaCurrent(name: string, schemaBytes: number): void {
  const previous = state.tools.get(name);
  if (previous) state.toolSchemaTotalBytes -= previous.schemaBytes;
  state.tools.set(name, { name, schemaBytes, registeredAt: previous?.registeredAt ?? Date.now() });
  state.toolSchemaTotalBytes += schemaBytes;
}

export function getToolSchemaSnapshot(): ToolSchemaSnapshot {
  return { tools: [...state.tools.values()], totalBytes: state.toolSchemaTotalBytes };
}
