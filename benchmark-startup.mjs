#!/usr/bin/env node
/**
 * Mekann extension startup benchmark.
 * Measures: static-import → extension-factory-call → session_start handlers
 *
 * Usage: node benchmark-startup.mjs
 * Output: METRIC total_ms=<number>
 */
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

// Use tsx loader for TypeScript imports
const require = createRequire(import.meta.url);

// ── Phase 1: Static import ──────────────────────────────────────
const t0 = performance.now();
const mod = await import("./mekann/index.ts");
const t1 = performance.now();
const importMs = t1 - t0;

// ── Phase 2: Extension factory call ─────────────────────────────
const events = new Map();
const tools = [];
const commands = [];

const mockPi = {
  registerTool(def) { tools.push(def.name); },
  registerCommand(name, def) { commands.push(name); },
  registerFlag(name, def) {},
  on(event, handler) {
    if (!events.has(event)) events.set(event, []);
    events.get(event).push(handler);
  },
  getFlag() { return undefined; },
  events: { emit() {} },
  sendMessage() {},
  sendUserMessage() {},
  appendEntry() {},
};

const t2 = performance.now();
await mod.default(mockPi);
const t3 = performance.now();
const factoryMs = t3 - t2;

// ── Phase 3: session_start handlers ─────────────────────────────
const mockCtx = {
  cwd: process.cwd(),
  sessionManager: {
    getSessionId: () => "bench-session",
    getBranch: () => [],
    isPersisted: () => true,
  },
  hasUI: false,
  ui: { setWidget() {}, notify() {} },
};

const t4 = performance.now();
const sessionStartHandlers = events.get("session_start") || [];
for (const handler of sessionStartHandlers) {
  try { await handler({}, mockCtx); } catch {}
}
const t5 = performance.now();
const sessionStartMs = t5 - t4;

// ── Results ─────────────────────────────────────────────────────
const totalMs = t5 - t0;

console.log(`Import:       ${importMs.toFixed(1)} ms`);
console.log(`Factory:      ${factoryMs.toFixed(1)} ms`);
console.log(`SessionStart: ${sessionStartMs.toFixed(1)} ms`);
console.log(`Total:        ${totalMs.toFixed(1)} ms`);
console.log(`Tools:        ${tools.length}`);
console.log(`Commands:     ${commands.length}`);
console.log(`Event types:  ${[...events.keys()].join(", ")}`);
console.log(`METRIC total_ms=${totalMs.toFixed(1)}`);
