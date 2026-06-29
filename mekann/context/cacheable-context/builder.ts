import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type CacheableContextConfig = {
  contextMode: "off" | "term-index" | "distilled" | "full";
  includeAgents: boolean;
  includeDomainDocs: boolean;
  includeAdrIndex: boolean;
  includeCodeStructure: boolean;
  maxPrefixChars: number;
  maxContextTerms: number;
  maxAdrEntries: number;
};

export type Fragment = { id: string; source: string; content: string; hash: string; chars: number; stability: "stable" | "semi-stable" };
export type Manifest = { version: 1; generatedAt: string; cwd: string; configHash: string; sourceHashes: Record<string, string>; prefixHash: string; prefixChars: number; fragments: Fragment[] };

const OUT_DIR = path.join(".mekann", "cacheable-context");

function sha256(text: string): string { return `sha256:${createHash("sha256").update(text).digest("hex")}`; }
async function exists(file: string): Promise<boolean> { try { await fs.access(file); return true; } catch { return false; } }
async function readIfExists(file: string): Promise<string | undefined> { return (await exists(file)) ? fs.readFile(file, "utf8") : undefined; }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function trimLines(text: string): string { return text.split(/\r?\n/).map((l) => l.trimEnd()).join("\n").trim() + "\n"; }

/**
 * Reads an ADR status from multiple template conventions (issue #162, IC-206).
 *
 * Supports `Status:`/`State:`/`Accepted:`/`Decided:` headers (MADR/Nygard/etc.),
 * including the `* Status:` / `- Status:` bulleted MADR form. The first key that
 * yields a non-empty value wins, in the order most likely to carry the status.
 */
const ADR_STATUS_PATTERNS: readonly RegExp[] = [
  /^(?:[-*]\s+)?Status\s*:\s*(.+)$/m,
  /^(?:[-*]\s+)?State\s*:\s*(.+)$/m,
  /^(?:[-*]\s+)?Accepted\s*:\s*(.+)$/m,
  /^(?:[-*]\s+)?Decided\s*:\s*(.+)$/m,
];
export function readAdrStatus(text: string): string | undefined {
  for (const re of ADR_STATUS_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

function fragment(id: string, source: string, content: string, stability: Fragment["stability"] = "stable"): Fragment {
  const normalized = trimLines(content);
  return { id, source, content: normalized, hash: sha256(normalized), chars: normalized.length, stability };
}

function policyFragment(): Fragment {
  return fragment("001-policy", "generated", `## Mekann repository context policy

For non-trivial Mekann work:
1. Use repository operating rules from AGENTS.md and docs/agents/ when present.
2. Use CONTEXT.md as project language when present.
3. Check relevant docs/adr entries before contradicting established design.
4. Then inspect implementation code.

Proceed silently when optional context files do not exist.
Do not scan vendor/oss unless the user explicitly asks about vendored external projects.`);
}

function summarizeAgents(text: string): string {
  // Keep structural markdown (any heading depth + list items) so a Japanese
  // AGENTS.md that uses `#`/`##` headings or list markers is not reduced to the
  // slice(0,1200) fallback. Language-agnostic (issue #162, IC-201).
  const lines = text.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return (
      /^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/.test(t) ||
      /^Issues and PRDs|^This repo uses|^.*See `/.test(t)
    );
  });
  const body = lines.length ? lines.join("\n") : text.slice(0, 1200);
  return `## Repository agent rules from AGENTS.md\n\n${body}`;
}

function summarizeDomain(text: string): string {
  const wanted = text.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return /^# |^## |^- \*\*|^- `|^If any of these|^When your output|^If your output|^> _Contradicts/.test(t);
  });
  return `## Domain docs rules from docs/agents/domain.md\n\n${(wanted.length ? wanted : text.split(/\r?\n/).slice(0, 40)).join("\n")}`;
}

function extractContextTerms(text: string, maxTerms: number): string[] {
  const terms: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
    if (!m) continue;
    const name = m[1].trim();
    if (name) terms.push(name);
    if (terms.length >= maxTerms) break;
  }
  return terms;
}

function parseContextTermIndex(text: string, maxTerms: number): string {
  const terms = extractContextTerms(text, maxTerms);
  const list = terms.length ? terms.map((name) => `- ${name}`).join("\n") : "- No `**Term**:` entries detected; read CONTEXT.md directly.";
  return `## CONTEXT.md retrieval index

CONTEXT.md is the authoritative project glossary. This fragment is only a retrieval index, not the definition source.

Search policy:
- Use the term list below to detect existing project language before naming concepts.
- Before relying on a term, read its definition in CONTEXT.md.
- Also read the nearby \`_Avoid_:\` line to avoid forbidden synonyms.
- Prefer exact term lookup: \`rg -n "^\\*\\*<term>\\*\\*:" CONTEXT.md\`
- If unsure which term applies, search likely words: \`rg -n "word1|word2|word3" CONTEXT.md\`

Defined terms:
${list}`;
}

function parseContextGlossary(text: string, maxTerms: number): string {
  const lines = text.split(/\r?\n/);
  const terms: string[] = [];
  for (let i = 0; i < lines.length && terms.length < maxTerms; i++) {
    const m = lines[i].match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
    if (!m) continue;
    const name = m[1].trim();
    const def: string[] = [];
    let avoid = "";
    if (m[2]?.trim()) def.push(m[2].trim());
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^\*\*([^*]+)\*\*:/.test(l) || /^#{1,3}\s+/.test(l)) break;
      const av = l.match(/^_Avoid_:\s*(.+)$/);
      if (av) { avoid = av[1].trim(); continue; }
      if (l.trim() && def.join(" ").length < 220) def.push(l.trim());
    }
    const one = def.join(" ").replace(/\s+/g, " ");
    terms.push(`- ${name}: ${one}${avoid ? ` Avoid: ${avoid}` : ""}`);
  }
  if (!terms.length) return `## Project language from CONTEXT.md\n\n${text.slice(0, 4000)}`;
  return `## Project language from CONTEXT.md\n\n${terms.join("\n")}`;
}

async function adrFragment(cwd: string, maxEntries: number): Promise<Fragment | undefined> {
  const dir = path.join(cwd, "docs", "adr");
  if (!(await exists(dir))) return undefined;
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md")).sort().slice(0, maxEntries);
  if (!names.length) return undefined;
  const entries: string[] = ["## ADR index", "", "Read the ADR file before relying on details or proposing a contradictory change.", ""];
  for (const name of names) {
    const p = path.join(dir, name);
    const text = await fs.readFile(p, "utf8");
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? name.replace(/\.md$/, "");
    const status = readAdrStatus(text);
    const id = name.match(/^(\d+)/)?.[1] ? `ADR-${name.match(/^(\d+)/)![1]}` : name.replace(/\.md$/, "");
    entries.push(`- ${id}${status ? ` ${status}` : ""}: ${title}`);
  }
  return fragment("040-adr-index", "docs/adr", entries.join("\n"));
}

async function codeStructureFragment(cwd: string): Promise<Fragment | undefined> {
  const present: string[] = [];
  for (const r of ["mekann", "src", ".pi/extensions", "docs"]) if (await exists(path.join(cwd, r))) present.push(r + "/");
  if (!present.length) return undefined;
  return fragment("050-code-structure", "generated", `## Lightweight code structure\n\nSource roots:\n${present.map((r) => `- ${r}`).join("\n")}\n\nUse this as a map only; inspect source files before editing.`, "semi-stable");
}

export function outputDir(cwd = process.cwd()): string { return path.join(cwd, OUT_DIR); }
export function prefixPath(cwd = process.cwd()): string { return path.join(outputDir(cwd), "prefix.md"); }
export function manifestPath(cwd = process.cwd()): string { return path.join(outputDir(cwd), "manifest.json"); }
export function configHash(cfg: CacheableContextConfig): string { return sha256(stableJson(cfg)); }

export async function collectSourceHashes(cwd: string, cfg: CacheableContextConfig): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function add(rel: string): Promise<void> {
    const text = await readIfExists(path.join(cwd, rel));
    if (text !== undefined) out[rel] = sha256(text);
  }
  if (cfg.includeAgents) await add("AGENTS.md");
  if (cfg.includeDomainDocs) await add(path.join("docs", "agents", "domain.md"));
  if (cfg.contextMode !== "off") await add("CONTEXT.md");
  if (cfg.includeAdrIndex) {
    const dir = path.join(cwd, "docs", "adr");
    if (await exists(dir)) {
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md")).sort().slice(0, cfg.maxAdrEntries);
      for (const name of names) await add(path.join("docs", "adr", name));
    }
  }
  return out;
}

export function isManifestFresh(manifest: Manifest | undefined, cfg: CacheableContextConfig, sourceHashes: Record<string, string>): boolean {
  return Boolean(manifest && manifest.configHash === configHash(cfg) && stableJson(manifest.sourceHashes) === stableJson(sourceHashes));
}

export async function buildCacheableContext(cwd: string, cfg: CacheableContextConfig): Promise<Manifest> {
  const fragments: Fragment[] = [policyFragment()];
  const agents = cfg.includeAgents ? await readIfExists(path.join(cwd, "AGENTS.md")) : undefined;
  if (agents) fragments.push(fragment("010-agents", "AGENTS.md", summarizeAgents(agents)));
  const domain = cfg.includeDomainDocs ? await readIfExists(path.join(cwd, "docs", "agents", "domain.md")) : undefined;
  if (domain) fragments.push(fragment("020-domain-docs", "docs/agents/domain.md", summarizeDomain(domain)));
  if (cfg.includeAdrIndex) { const adr = await adrFragment(cwd, cfg.maxAdrEntries); if (adr) fragments.push(adr); }
  const context = cfg.contextMode !== "off" ? await readIfExists(path.join(cwd, "CONTEXT.md")) : undefined;
  if (context) fragments.push(fragment("030-context", "CONTEXT.md", cfg.contextMode === "full" ? `## Project language from CONTEXT.md\n\n${context}` : cfg.contextMode === "distilled" ? parseContextGlossary(context, cfg.maxContextTerms) : parseContextTermIndex(context, cfg.maxContextTerms)));
  if (cfg.includeCodeStructure) { const cs = await codeStructureFragment(cwd); if (cs) fragments.push(cs); }

  let total = 0;
  const kept: Fragment[] = [];
  for (const f of fragments) {
    const remaining = cfg.maxPrefixChars - total;
    if (remaining <= 0) break;
    if (f.content.length > remaining) {
      if (remaining > 200) {
        const content = trimLines(`${f.content.slice(0, Math.max(0, remaining - 80))}\n\n[Fragment truncated by maxPrefixChars]`);
        kept.push({ ...f, content, hash: sha256(content), chars: content.length });
      }
      break;
    }
    kept.push(f); total += f.content.length;
  }
  const prefix = kept.map((f) => f.content).join("\n---\n\n").trim() + "\n";
  const out = outputDir(cwd);
  await fs.mkdir(path.join(out, "fragments"), { recursive: true });
  await fs.writeFile(path.join(out, "prefix.md"), prefix);
  for (const f of kept) await fs.writeFile(path.join(out, "fragments", `${f.id}.md`), f.content);
  const manifest: Manifest = { version: 1, generatedAt: new Date().toISOString(), cwd, configHash: configHash(cfg), sourceHashes: await collectSourceHashes(cwd, cfg), prefixHash: sha256(prefix), prefixChars: prefix.length, fragments: kept };
  await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export async function readPrefix(cwd: string): Promise<string | undefined> { return readIfExists(prefixPath(cwd)); }
export async function readManifest(cwd: string): Promise<Manifest | undefined> { const text = await readIfExists(manifestPath(cwd)); return text ? JSON.parse(text) : undefined; }
