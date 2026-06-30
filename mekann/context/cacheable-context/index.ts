import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { featureStringValue, isFeatureEnabled } from "../../settings/enabled.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { recordContextObservation } from "../observations.js";
import { normalizePromptSurface } from "../surface-policy.js";
import { buildCacheableContext, collectSourceHashes, isManifestFresh, readManifest, type CacheableContextConfig, type Manifest } from "./builder.js";

function cfg(): CacheableContextConfig {
  const c = featureConfig("cacheable-context");
  const mode = c.contextMode === "off" || c.contextMode === "term-index" || c.contextMode === "distilled" || c.contextMode === "full" ? c.contextMode : "term-index";
  return {
    contextMode: mode,
    includeAgents: c.includeAgents !== false,
    includeDomainDocs: c.includeDomainDocs !== false,
    includeAdrIndex: c.includeAdrIndex !== false,
    includeCodeStructure: c.includeCodeStructure === true,
    maxPrefixChars: Number(c.maxPrefixChars ?? 32000) || 32000,
    maxContextTerms: Number(c.maxContextTerms ?? 100) || 100,
    maxContextTermBytes: Number(c.maxContextTermBytes ?? 1000) || 1000,
    maxAdrEntries: Number(c.maxAdrEntries ?? 80) || 80,
  };
}

/**
 * Maximum number of distinct cwds whose last-tracked prefix hash we remember.
 * Bounds module-level memory in long-running processes that handle many cwds
 * (autopilot issue worktrees, subagents, …). FIFO eviction drops the oldest.
 * See issue #165 (IC-204).
 */
const MAX_TRACKED_CWDS = 256;

const lastTrackedPrefixByCwd = new Map<string, string>();

function trackCacheableContext(cwd: string, manifest: Manifest, currentCfg: CacheableContextConfig): void {
  if (!isFeatureEnabled("context-tracker")) return;
  const key = `${manifest.prefixHash}:${manifest.configHash}`;
  if (lastTrackedPrefixByCwd.get(cwd) === key) return;
  lastTrackedPrefixByCwd.set(cwd, key);
  while (lastTrackedPrefixByCwd.size > MAX_TRACKED_CWDS) {
    const oldest = lastTrackedPrefixByCwd.keys().next().value;
    if (oldest === undefined) break;
    lastTrackedPrefixByCwd.delete(oldest);
  }
  void recordContextObservation({
    cwd,
    phase: "cacheable_context",
    summary: {
      contextMode: currentCfg.contextMode,
      promptSurface: featureStringValue("cacheable-context", "promptSurface", "locator", cwd),
      prefixChars: manifest.prefixChars,
      maxPrefixChars: currentCfg.maxPrefixChars,
      prefixHash: manifest.prefixHash,
      configHash: manifest.configHash,
      fragmentCount: manifest.fragments.length,
      fragmentOrder: manifest.fragments.map((f) => f.id).join(" → "),
      hasAdrIndex: manifest.fragments.some((f) => f.id === "040-adr-index"),
      contextFragmentChars: manifest.fragments.find((f) => f.id === "030-context")?.chars ?? 0,
      fragments: manifest.fragments.map((f) => ({ id: f.id, source: f.source, chars: f.chars, stability: f.stability })),
    },
  });
}

async function ensureBuilt(cwd: string): Promise<void> {
  const currentCfg = cfg();
  const manifest = await readManifest(cwd);
  const sourceHashes = await collectSourceHashes(cwd, currentCfg);
  const fresh = isManifestFresh(manifest, currentCfg, sourceHashes);
  const current = fresh && manifest ? manifest : await buildCacheableContext(cwd, currentCfg);
  trackCacheableContext(cwd, current, currentCfg);
}

/**
 * Per-process, per-cwd "already ensured" guard (issue #168 / IC-203).
 *
 * `ensureBuilt` always re-hashes every source file (`collectSourceHashes`) to
 * decide freshness, so calling it on every prompt-provider `getFragments`
 * request added read-all-sources + sha256 jitter to a hot prompt path. The build
 * itself is effectively session-scoped — Mekann settings do not live-reload and
 * there is no fs.watch here — so we run the hash check at most once per cwd per
 * process. Subsequent `getFragments` calls read the already-built manifest from
 * disk (cheap) without re-hashing. The `mekann-context rebuild` command still
 * bypasses this guard because it calls `buildCacheableContext` directly.
 */
const ensuredCwds = new Set<string>();
async function ensureBuiltOnce(cwd: string): Promise<void> {
  if (ensuredCwds.has(cwd)) return;
  try {
    await ensureBuilt(cwd);
  } finally {
    // Mark ensured even on failure: a broken build should not turn every
    // subsequent prompt request into another full re-hash attempt. The manifest
    // read in getFragments degrades gracefully to "no fragments" on its own.
    ensuredCwds.add(cwd);
  }
}

function locatorContent(manifest: Manifest): string {
  const rows = manifest.fragments
    .map((fragment) => `- ${fragment.id}: ${fragment.source}, ${fragment.chars} chars, fragment .mekann/cacheable-context/fragments/${fragment.id}.md`)
    .join("\n");
  return `## Mekann cacheable context locator

Project context fragments are prebuilt for agent-side retrieval, not injected in full.
When terminology, architecture decisions, repository rules, or feature boundaries matter, search/read these files with normal file tools:
- manifest: .mekann/cacheable-context/manifest.json
- combined prefix: .mekann/cacheable-context/prefix.md
${rows}

Prefer targeted rg/read of the relevant source docs listed in the manifest before loading the combined prefix.`;
}

export default function cacheableContextExtension(pi: ExtensionAPI): void {
  if (featureValue("cacheable-context", "enabled") === false) return;

  pi.on("session_start", async (_event: any, ctx: any) => {
    const cwd = ctx?.cwd ?? process.cwd();
    try { await ensureBuiltOnce(cwd); } catch (error) { ctx?.ui?.notify?.(`Mekann cacheable context build failed: ${String(error)}`, "warn"); }
    const configuredSurface = featureStringValue("cacheable-context", "promptSurface", "locator", cwd);
    if (configuredSurface === "full") {
      ctx?.ui?.notify?.('cacheable-context: promptSurface "full" is deprecated and now behaves as "locator". The base system already injects AGENTS.md and domain docs, so "full" caused double injection. Set promptSurface to "locator" or "off".', "warn");
    }
  });

  registerPromptProvider({
    id: "mekann-cacheable-context",
    async getFragments(providerCtx: any) {
      const cwd = providerCtx?.cwd ?? process.cwd();
      await ensureBuiltOnce(cwd);
      const manifest = await readManifest(cwd);
      if (!manifest?.fragments.length) return [];
      const promptSurface = normalizePromptSurface(featureStringValue("cacheable-context", "promptSurface", "locator", cwd));
      if (promptSurface === "off") return [];
      // `full` is deprecated (it double-injected AGENTS.md/domain docs that the
      // base system already embeds). normalizePromptSurface maps it to `locator`,
      // so we always expose only the small retrieval locator here.
      return [{
        id: "mekann-cacheable-context:locator",
        source: ".mekann/cacheable-context/manifest.json",
        kind: "project_instruction" as const,
        stability: "stable" as const,
        scope: "global" as const,
        priority: 30,
        version: "v1",
        cacheIntent: "prefer_cache" as const,
        content: locatorContent(manifest),
      }];
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
