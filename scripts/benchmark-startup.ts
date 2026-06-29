/**
 * Mekann extension startup benchmark.
 * Measures: static-import → extension-factory-call → session_start handlers
 *
 * Usage: npx tsx scripts/benchmark-startup.ts
 * Output: METRIC total_ms=<number>
 */
import { performance } from "node:perf_hooks";

async function main() {
  // ── Phase 1: Static import ──────────────────────────────────────
  const t0 = performance.now();
  const mod = await import("../mekann/index.ts");
  const t1 = performance.now();
  const importMs = t1 - t0;

  // ── Phase 2: Extension factory call ─────────────────────────────
  const events = new Map<string, Array<(event: any, ctx: any) => Promise<void>>>();
  const tools: string[] = [];
  const commands: string[] = [];
  const mockEventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<void>>>();

  const noop = () => {};
  const mockPi: any = {
    registerTool(def: any) { tools.push(def.name); },
    registerCommand(name: string, _def: any) { commands.push(name); },
    registerFlag(_name: string, _def: any) {},
    registerShortcut() {},
    on(event: string, handler: any) {
      if (!events.has(event)) events.set(event, []);
      events.get(event)!.push(handler);
    },
    getFlag() { return undefined; },
    getActiveTools() { return []; },
    getTools() { return []; },
    setThinkingLevel() {},
    getThinkingLevel() { return undefined; },
    setActiveTools() {},
    setModel() {},
    events: {
      emit: noop,
      on(e: string, h: any) {
        if (!mockEventHandlers.has(e)) mockEventHandlers.set(e, []);
        mockEventHandlers.get(e)!.push(h);
      },
    },
    sendMessage: noop,
    sendUserMessage: noop,
    appendEntry: noop,
  };

  const t2 = performance.now();
  await (mod as any).default(mockPi);
  const t3 = performance.now();
  const factoryMs = t3 - t2;

  // ── Phase 3: session_start handlers ─────────────────────────────
  const mockCtx: any = {
    cwd: process.cwd(),
    sessionManager: {
      getSessionId: () => "bench-session",
      getBranch: () => [],
      isPersisted: () => true,
    },
    hasUI: false,
    ui: { setWidget() {}, notify() {} },
    shutdown() {},
    isIdle() { return true; },
    abort() {},
    getContextUsage() { return { tokens: 0, percent: 0 }; },
    getSystemPrompt() { return ""; },
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
}

main().catch((e) => { console.error(e); process.exit(1); });
