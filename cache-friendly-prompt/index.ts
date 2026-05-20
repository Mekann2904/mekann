import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendCacheFriendlyLog } from "./logs.js";
import { collectPromptFragments, estimateTokens, extractTextFromProviderPayload, inspectFinalPayloadText, renderPromptFragments, sha256, type PromptFragmentHash, type PromptInspectionWarning } from "../prompt-core/index.js";

export type CacheFriendlyPromptConfig = { includeBaseSystemPromptInStableHash: boolean; logRequests: boolean; notifyOnWarnings: boolean; };
const DEFAULT_CONFIG: CacheFriendlyPromptConfig = { includeBaseSystemPromptInStableHash: true, logRequests: true, notifyOnWarnings: false };
type LastState = { effectiveStablePrefixText: string; effectiveStablePrefixHash: string; fragmentHashes: PromptFragmentHash[]; warnings: PromptInspectionWarning[]; };
let lastState: LastState | null = null;
function contextCwd(event: any, ctx: any): string { return event?.systemPromptOptions?.cwd ?? ctx?.cwd ?? process.cwd(); }
function modelProvider(ctx: any): string | undefined { return ctx?.model?.provider; }
function modelId(ctx: any): string | undefined { return ctx?.model?.id; }
function messageContainsDynamicMarker(messages: unknown[]): boolean { return JSON.stringify(messages).includes("<!-- prompt-fragments:Dynamic turn context -->"); }

export default function cacheFriendlyPromptExtension(pi: ExtensionAPI, config?: Partial<CacheFriendlyPromptConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const fragments = await collectPromptFragments({ cwd: contextCwd(event, ctx), provider: modelProvider(ctx), model: modelId(ctx) });
    const rendered = renderPromptFragments(fragments);
    const effectiveStablePrefixText = cfg.includeBaseSystemPromptInStableHash ? [event.systemPrompt, rendered.stableText].filter(Boolean).join("\n\n") : rendered.stableText;
    lastState = { effectiveStablePrefixText, effectiveStablePrefixHash: sha256(effectiveStablePrefixText), fragmentHashes: rendered.fragmentHashes, warnings: rendered.warnings };
    return { systemPrompt: [event.systemPrompt, rendered.stableText, rendered.semiStableText].filter(Boolean).join("\n\n") };
  });

  pi.on("context", async (event: any, ctx: any) => {
    const messages = event.messages ?? [];
    if (messageContainsDynamicMarker(messages)) return { messages };
    const fragments = await collectPromptFragments({ cwd: ctx?.cwd ?? process.cwd(), provider: modelProvider(ctx), model: modelId(ctx) });
    const rendered = renderPromptFragments(fragments);
    if (!rendered.dynamicText.trim()) return { messages };
    return { messages: [...messages, { role: "user", customType: "cache-friendly-dynamic-context", content: [{ type: "text", text: rendered.dynamicText }] }] };
  });

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    const finalText = extractTextFromProviderPayload(event?.payload);
    const warnings = [...(lastState?.warnings ?? []), ...inspectFinalPayloadText(finalText)];
    if (cfg.logRequests) {
      await appendCacheFriendlyLog(ctx?.cwd ?? process.cwd(), { timestamp: new Date().toISOString(), provider: modelProvider(ctx), model: modelId(ctx), stablePrefixHash: lastState?.effectiveStablePrefixHash ?? "", stablePrefixChars: lastState?.effectiveStablePrefixText.length ?? 0, stablePrefixTokenEstimate: estimateTokens(lastState?.effectiveStablePrefixText ?? ""), totalPromptChars: finalText.length, totalPromptTokenEstimate: estimateTokens(finalText), fragmentHashes: lastState?.fragmentHashes ?? [], warnings });
    }
    if (cfg.notifyOnWarnings && warnings.some((w) => w.severity === "error")) ctx?.ui?.notify?.("Cache-friendly prompt warnings detected", "warning");
    return undefined;
  });
}
