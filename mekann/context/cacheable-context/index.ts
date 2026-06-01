import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { buildCacheableContext, collectSourceHashes, isManifestFresh, readManifest, type CacheableContextConfig } from "./builder.js";

function cfg(): CacheableContextConfig {
  const c = featureConfig("cacheable-context");
  const mode = c.contextMode === "off" || c.contextMode === "full" ? c.contextMode : "distilled";
  return {
    contextMode: mode,
    includeAgents: c.includeAgents !== false,
    includeDomainDocs: c.includeDomainDocs !== false,
    includeAdrIndex: c.includeAdrIndex !== false,
    includeCodeStructure: c.includeCodeStructure === true,
    maxPrefixChars: Number(c.maxPrefixChars ?? 32000) || 32000,
    maxContextTerms: Number(c.maxContextTerms ?? 100) || 100,
    maxAdrEntries: Number(c.maxAdrEntries ?? 80) || 80,
  };
}

async function ensureBuilt(cwd: string): Promise<void> {
  const currentCfg = cfg();
  const manifest = await readManifest(cwd);
  const sourceHashes = await collectSourceHashes(cwd, currentCfg);
  if (!isManifestFresh(manifest, currentCfg, sourceHashes)) await buildCacheableContext(cwd, currentCfg);
}

export default function cacheableContextExtension(pi: ExtensionAPI): void {
  if (featureValue("cacheable-context", "enabled") === false) return;

  pi.on("session_start", async (_event: any, ctx: any) => {
    try { await ensureBuilt(ctx?.cwd ?? process.cwd()); } catch (error) { ctx?.ui?.notify?.(`Mekann cacheable context build failed: ${String(error)}`, "warn"); }
  });

  registerPromptProvider({
    id: "mekann-cacheable-context",
    async getFragments(providerCtx: any) {
      const cwd = providerCtx?.cwd ?? process.cwd();
      await ensureBuilt(cwd);
      const manifest = await readManifest(cwd);
      if (!manifest?.fragments.length) return [];
      return manifest.fragments.map((fragment, index) => ({
        id: `mekann-cacheable-context:${fragment.id}`,
        source: fragment.source,
        kind: "project_instruction" as const,
        stability: fragment.stability === "semi-stable" ? "semi_stable" as const : "stable" as const,
        scope: "global" as const,
        priority: 30 + index,
        version: "v1",
        cacheIntent: "prefer_cache" as const,
        content: fragment.content,
      }));
    },
  });

  pi.registerCommand("mekann-context", {
    description: "Manage Mekann cacheable context prefix: status | rebuild | show",
    async handler(args: string | undefined, ctx: any) {
      const cwd = ctx?.cwd ?? process.cwd();
      const command = (args ?? "status").trim() || "status";
      if (command === "rebuild") {
        const manifest = await buildCacheableContext(cwd, cfg());
        ctx.ui.notify(`Mekann context rebuilt: ${manifest.fragments.length} fragments, ${manifest.prefixChars} chars, ${manifest.prefixHash.slice(0, 19)}…`, "info");
        return;
      }
      if (command === "show") {
        await ensureBuilt(cwd);
        const manifest = await readManifest(cwd);
        ctx.ui.notify(manifest?.fragments.map((f) => f.content).join("\n---\n\n") ?? "Mekann context prefix is empty", "info");
        return;
      }
      await ensureBuilt(cwd);
      const manifest = await readManifest(cwd);
      if (!manifest) {
        ctx.ui.notify("Mekann context prefix has not been built", "warn");
        return;
      }
      const lines = [
        `Mekann cacheable context: ${manifest.fragments.length} fragments, ${manifest.prefixChars} chars`,
        `Prefix hash: ${manifest.prefixHash}`,
        `Generated: ${manifest.generatedAt}`,
        ...manifest.fragments.map((f) => `- ${f.id} (${f.source}): ${f.chars} chars ${f.hash.slice(0, 19)}…`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
