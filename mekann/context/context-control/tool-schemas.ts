import { state, type ToolSchemaRecord } from "./state.js";

export interface ToolSchemaSnapshot {
  tools: ToolSchemaRecord[];
  totalBytes: number;
}

function normalizeSchemaBytes(schemaBytes: number): number {
  // NaN/±Infinity/negative inputs would corrupt the running total and make the
  // aggregate meaningless, so clamp to a finite non-negative value before it
  // reaches the running total or the record.
  return Number.isFinite(schemaBytes) && schemaBytes >= 0 ? schemaBytes : 0;
}

export function recordToolSchemaCurrent(name: string, schemaBytes: number): void {
  const bytes = normalizeSchemaBytes(schemaBytes);
  const now = Date.now();
  const previous = state.tools.get(name);
  if (previous) state.toolSchemaTotalBytes -= previous.schemaBytes;
  state.tools.set(name, {
    name,
    schemaBytes: bytes,
    registeredAt: previous?.registeredAt ?? now,
    lastUpdatedAt: now,
  });
  state.toolSchemaTotalBytes += bytes;
}

export function getToolSchemaSnapshot(): ToolSchemaSnapshot {
  return { tools: [...state.tools.values()], totalBytes: state.toolSchemaTotalBytes };
}
