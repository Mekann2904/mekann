import type { PromptFragment, PromptProvider, PromptProviderContext } from "./types.js";
const providers = new Map<string, PromptProvider>();
function errorMessage(e: unknown): string { return e instanceof Error ? e.message : String(e); }
export function registerPromptProvider(provider: PromptProvider): void { if (providers.has(provider.id)) providers.delete(provider.id); providers.set(provider.id, provider); }
export function unregisterPromptProvider(id: string): void { providers.delete(id); }
export function clearPromptProvidersForTests(): void { providers.clear(); }
export function listPromptProviders(): PromptProvider[] { return [...providers.values()]; }
export async function collectPromptFragments(ctx: PromptProviderContext): Promise<PromptFragment[]> {
  const out: PromptFragment[] = [];
  for (const provider of providers.values()) {
    try { out.push(...await provider.getFragments(ctx)); }
    catch (e) { out.push({ id: `prompt-provider-error:${provider.id}`, source: "prompt-core", kind: "unknown", stability: "dynamic", scope: "turn", priority: 9999, version: "v1", cacheIntent: "avoid_cache", content: `[Prompt provider error: ${provider.id}] ${errorMessage(e)}` }); }
  }
  return out;
}
