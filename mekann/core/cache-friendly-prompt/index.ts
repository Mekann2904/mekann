import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendCacheFriendlyLog } from "./logs.js";
import { canonicalizeText, collectPromptFragments, estimateTokens, extractTextFromProviderPayload, hashFragment, inspectFinalPayloadText, inspectStablePrefix, listPromptProviders, renderPromptFragments, sha256, type PromptFragmentHash, type PromptInspectionWarning, type RunKeySource } from "../prompt-core/index.js";

export type CacheFriendlyPromptConfig = { /** @deprecated stablePrefixHash is stable-only; base system is tracked by baseSystemHash/providerPrefixHash. */ includeBaseSystemPromptInStableHash?: boolean; logRequests: boolean; notifyOnWarnings: boolean; };
const DEFAULT_CONFIG: CacheFriendlyPromptConfig = { logRequests: true, notifyOnWarnings: false };
type LastState = {
  runKey: string;
  runKeySource: RunKeySource;
  requestId?: string;
  snapshotSource: "before_agent_start";
  createdAt: string;
  baseSystemHash?: string;
  stablePrefixHash: string;
  semiStableHash?: string;
  featureCacheablePrefixHash?: string;
  providerPrefixHash?: string;
  stablePrefixChars: number;
  stablePrefixTokenEstimate?: number;
  semiStableChars?: number;
  semiStableTokenEstimate?: number;
  featureCacheablePrefixChars?: number;
  featureCacheablePrefixTokenEstimate?: number;
  providerPrefixChars?: number;
  providerPrefixTokenEstimate?: number;
  injectedStableFragmentHashes: PromptFragmentHash[];
  injectedSemiStableFragmentHashes: PromptFragmentHash[];
  injectedWarnings: PromptInspectionWarning[];
  latestDynamicFragmentHashes?: PromptFragmentHash[];
  latestDynamicCollectedAt?: string;
};
const stateByRun = new Map<string, LastState>();
const stateByRequestId = new Map<string, LastState>();
const MAX_RUN_STATES = 128;
const DYNAMIC_CONTEXT_MAX_CHARS = 12_000;
function truncateDynamicContext(text: string): string {
  if (text.length <= DYNAMIC_CONTEXT_MAX_CHARS) return text;
  const omitted = text.length - DYNAMIC_CONTEXT_MAX_CHARS;
  return `${text.slice(0, DYNAMIC_CONTEXT_MAX_CHARS)}\n\n[cache-friendly-prompt: omitted ${omitted} trailing chars from dynamic context]`;
}
function rememberRunState(key: string, state: LastState): void {
  const previous = stateByRun.get(key);
  if (previous?.requestId && previous.requestId !== state.requestId) stateByRequestId.delete(previous.requestId);
  stateByRun.delete(key);
  stateByRun.set(key, state);
  if (state.requestId) stateByRequestId.set(state.requestId, state);
  while (stateByRun.size > MAX_RUN_STATES) {
    const oldest = stateByRun.keys().next().value;
    if (oldest === undefined) break;
    const oldState = stateByRun.get(oldest);
    stateByRun.delete(oldest);
    if (oldState?.requestId) stateByRequestId.delete(oldState.requestId);
  }
}
function contextCwd(event: any, ctx: any): string { return event?.systemPromptOptions?.cwd ?? ctx?.cwd ?? process.cwd(); }
function modelProvider(ctx: any): string | undefined { return ctx?.model?.provider; }
function modelId(ctx: any): string | undefined { return ctx?.model?.id; }
function pickString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}
function requestIdOf(event: any, ctx: any): string | undefined {
  return pickString(event?.requestId, event?.request_id, event?.id, event?.message?.requestId, event?.message?.request_id, event?.response?.requestId, event?.response?.id, ctx?.requestId, ctx?.request_id);
}
function runKeyWithSource(event: any, ctx: any): { runKey: string; runKeySource: RunKeySource } {
  const candidates: Array<[RunKeySource, unknown]> = [
    ["sessionId", event?.sessionId ?? ctx?.sessionId],
    ["conversationId", event?.conversationId ?? ctx?.conversationId],
    ["session.id", event?.session?.id ?? ctx?.session?.id],
    ["runId", event?.runId ?? ctx?.runId],
    ["cwd", ctx?.cwd ?? event?.systemPromptOptions?.cwd],
  ];
  for (const [source, value] of candidates) {
    const key = pickString(value);
    if (key) return { runKey: key, runKeySource: source };
  }
  return { runKey: "default", runKeySource: "default" };
}
function joinPromptPartsRaw(parts: Array<string | undefined | null>): string { return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n\n"); }
function joinPromptPartsCanonical(parts: Array<string | undefined | null>): string { return parts.map((p) => typeof p === "string" ? canonicalizeText(p) : "").filter(Boolean).join("\n\n"); }
function mergeWarnings(a: PromptInspectionWarning[], b: PromptInspectionWarning[]): PromptInspectionWarning[] {
  const seen = new Set<string>();
  const out: PromptInspectionWarning[] = [];
  for (const w of [...a, ...b]) {
    const key = `${w.severity}:${w.code}:${w.fragmentId ?? ""}:${w.source ?? ""}:${w.message}`;
    if (!seen.has(key)) { seen.add(key); out.push(w); }
  }
  return out;
}
function effectivePrefixWarnings(fragmentWarnings: PromptInspectionWarning[], effectiveProviderPrefixText: string): PromptInspectionWarning[] {
  return mergeWarnings(fragmentWarnings.filter((w) => w.code !== "SHORT_STABLE_PREFIX"), inspectStablePrefix(effectiveProviderPrefixText));
}
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "object" && part && (part as any).type === "text" && typeof (part as any).text === "string" ? (part as any).text : "").join("\n");
}
function fragmentMarkerPrefix(f: PromptFragmentHash): string { return `<!-- fragment:${f.source}:${f.id}:${f.kind}:${f.stability}:`; }
function messageContainsDynamicMarker(messages: unknown[]): boolean {
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const msg = message as { customType?: unknown; content?: unknown };
    return msg.customType === "cache-friendly-dynamic-context" || contentText(msg.content).includes("<!-- prompt-fragments:Dynamic turn context -->");
  });
}

export default function cacheFriendlyPromptExtension(pi: ExtensionAPI, config?: Partial<CacheFriendlyPromptConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const fragments = await collectPromptFragments({ cwd: contextCwd(event, ctx), provider: modelProvider(ctx), model: modelId(ctx) });
    const rendered = renderPromptFragments(fragments);
    const baseSystemText = typeof event.systemPrompt === "string" ? event.systemPrompt : "";
    const featureCacheablePrefixText = joinPromptPartsCanonical([rendered.stableText, rendered.semiStableText]);
    const providerPrefixText = joinPromptPartsRaw([baseSystemText, rendered.stableText, rendered.semiStableText]);
    const { runKey, runKeySource } = runKeyWithSource(event, ctx);
    const requestId = requestIdOf(event, ctx);
    const state: LastState = {
      runKey,
      runKeySource,
      requestId,
      snapshotSource: "before_agent_start",
      createdAt: new Date().toISOString(),
      baseSystemHash: baseSystemText ? sha256(canonicalizeText(baseSystemText)) : undefined,
      stablePrefixHash: sha256(canonicalizeText(rendered.stableText)),
      semiStableHash: rendered.semiStableText ? sha256(canonicalizeText(rendered.semiStableText)) : undefined,
      featureCacheablePrefixHash: sha256(featureCacheablePrefixText),
      providerPrefixHash: sha256(providerPrefixText),
      stablePrefixChars: rendered.stableText.length,
      stablePrefixTokenEstimate: estimateTokens(rendered.stableText),
      semiStableChars: rendered.semiStableText ? rendered.semiStableText.length : undefined,
      semiStableTokenEstimate: rendered.semiStableText ? estimateTokens(rendered.semiStableText) : undefined,
      featureCacheablePrefixChars: featureCacheablePrefixText.length,
      featureCacheablePrefixTokenEstimate: estimateTokens(featureCacheablePrefixText),
      providerPrefixChars: providerPrefixText.length,
      providerPrefixTokenEstimate: estimateTokens(providerPrefixText),
      injectedStableFragmentHashes: rendered.stableFragments.map(hashFragment),
      injectedSemiStableFragmentHashes: rendered.semiStableFragments.map(hashFragment),
      injectedWarnings: effectivePrefixWarnings(rendered.warnings, providerPrefixText),
    };
    rememberRunState(runKey, state);
    return { systemPrompt: [event.systemPrompt, rendered.stableText, rendered.semiStableText].filter(Boolean).join("\n\n") };
  });

  pi.on("context", async (event: any, ctx: any) => {
    const messages = event.messages ?? [];
    if (messageContainsDynamicMarker(messages)) return { messages };
    const fragments = await collectPromptFragments({ cwd: ctx?.cwd ?? process.cwd(), provider: modelProvider(ctx), model: modelId(ctx) });
    const rendered = renderPromptFragments(fragments);
    const { runKey } = runKeyWithSource(event, ctx);
    const prev = stateByRun.get(runKey) ?? stateByRun.get(ctx?.cwd ?? "");
    if (prev) {
      prev.latestDynamicFragmentHashes = rendered.dynamicFragments.map(hashFragment);
      prev.latestDynamicCollectedAt = new Date().toISOString();
      prev.injectedWarnings = mergeWarnings(prev.injectedWarnings, rendered.warnings.filter((w) => w.fragmentId ? rendered.dynamicFragments.some((f) => f.id === w.fragmentId) : false));
      rememberRunState(prev.runKey, prev);
    }
    if (!rendered.dynamicText.trim()) return { messages };
    return { messages: [...messages, { role: "user", customType: "cache-friendly-dynamic-context", content: [{ type: "text", text: truncateDynamicContext(rendered.dynamicText) }] }] };
  });

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    const finalText = extractTextFromProviderPayload(event?.payload);
    const { runKey, runKeySource } = runKeyWithSource(event, ctx);
    const requestId = requestIdOf(event, ctx);
    const lastState = (requestId ? stateByRequestId.get(requestId) : undefined) ?? stateByRun.get(runKey) ?? stateByRun.get(ctx?.cwd ?? "") ?? null;
    const dynamicHashes = lastState?.latestDynamicFragmentHashes ?? [];
    const fragmentHashes = [...(lastState?.injectedStableFragmentHashes ?? []), ...(lastState?.injectedSemiStableFragmentHashes ?? []), ...dynamicHashes];
    const sentDynamicIds = dynamicHashes.filter((f) => finalText.includes(fragmentMarkerPrefix(f))).map((f) => f.id);
    if (sentDynamicIds.length > 0) {
      try { (pi as any).events?.emit?.("cache-friendly-prompt:dynamic-tail-sent", { fragmentIds: sentDynamicIds }); } catch {}
    }
    const warnings = mergeWarnings(lastState?.injectedWarnings ?? [], inspectFinalPayloadText(finalText));
    if (cfg.logRequests) {
      await appendCacheFriendlyLog(ctx?.cwd ?? process.cwd(), {
        timestamp: new Date().toISOString(),
        runKey,
        runKeySource,
        requestId,
        snapshotSource: lastState?.snapshotSource ?? "missing",
        correlationConfidence: requestId && lastState?.requestId === requestId ? "requestId_matched" : lastState ? "runKey_latest" : "missing",
        provider: modelProvider(ctx),
        model: modelId(ctx),
        baseSystemHash: lastState?.baseSystemHash,
        stablePrefixHash: lastState?.stablePrefixHash ?? "",
        stablePrefixChars: lastState?.stablePrefixChars ?? 0,
        stablePrefixTokenEstimate: lastState?.stablePrefixTokenEstimate,
        semiStableHash: lastState?.semiStableHash,
        semiStableChars: lastState?.semiStableChars,
        semiStableTokenEstimate: lastState?.semiStableTokenEstimate,
        featureCacheablePrefixHash: lastState?.featureCacheablePrefixHash,
        featureCacheablePrefixChars: lastState?.featureCacheablePrefixChars,
        featureCacheablePrefixTokenEstimate: lastState?.featureCacheablePrefixTokenEstimate,
        providerPrefixHash: lastState?.providerPrefixHash,
        providerPrefixChars: lastState?.providerPrefixChars,
        providerPrefixTokenEstimate: lastState?.providerPrefixTokenEstimate,
        totalPromptChars: finalText.length,
        totalPromptTokenEstimate: estimateTokens(finalText),
        promptProviderIds: listPromptProviders().map((p) => p.id),
        fragmentHashes,
        injectedStableFragmentHashes: lastState?.injectedStableFragmentHashes ?? [],
        injectedSemiStableFragmentHashes: lastState?.injectedSemiStableFragmentHashes ?? [],
        latestDynamicFragmentHashes: lastState?.latestDynamicFragmentHashes,
        latestDynamicCollectedAt: lastState?.latestDynamicCollectedAt,
        warnings,
      });
    }
    if (cfg.notifyOnWarnings && warnings.some((w) => w.severity === "error")) ctx?.ui?.notify?.("Cache-friendly prompt warnings detected", "warning");
    return undefined;
  });
}
