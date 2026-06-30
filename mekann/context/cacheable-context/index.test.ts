import { afterEach, describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import cacheableContextExtension from "./index.js";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";
import { buildCacheableContext, readManifest, type CacheableContextConfig } from "./builder.js";
import { getWorkspaceMekannSettingsPath, invalidateSettingsCache } from "../../settings/store.js";

async function tempRepo(): Promise<string> {
  const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "mekann-cacheable-context-"));
  await fsp.mkdir(path.join(cwd, "docs", "adr"), { recursive: true });
  await fsp.mkdir(path.join(cwd, "docs", "agents"), { recursive: true });
  await fsp.writeFile(path.join(cwd, "AGENTS.md"), "# Agent rules\n\n### Test\n- Follow repo rules.\n", "utf8");
  await fsp.writeFile(path.join(cwd, "docs", "agents", "domain.md"), "# Domain Docs\n\n## Use the glossary's vocabulary\nWhen your output names a domain concept, use CONTEXT.md.\n", "utf8");
  await fsp.writeFile(path.join(cwd, "CONTEXT.md"), "# Context\n\n## Language\n\n**Context ledger**:\nA working-memory event store.\n_Avoid_: raw logs\n", "utf8");
  await fsp.writeFile(path.join(cwd, "docs", "adr", "0001-test.md"), "# Test ADR\n\nStatus: Accepted\n", "utf8");
  return cwd;
}

async function writeWorkspaceSetting(cwd: string, feature: string, key: string, value: unknown): Promise<void> {
  const settingsPath = getWorkspaceMekannSettingsPath(cwd);
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify({ version: 1, features: { [feature]: { [key]: value } } }, null, 2), "utf8");
  invalidateSettingsCache(settingsPath);
}

afterEach(() => {
  clearPromptProvidersForTests();
});

describe("cacheable-context prompt surface", () => {
  it("defaults to a small locator instead of injecting generated context content", async () => {
    const cwd = await tempRepo();
    const pi = { on() {}, registerCommand() {} } as any;
    cacheableContextExtension(pi);

    const fragments = await collectPromptFragments({ cwd });

    expect(fragments).toHaveLength(1);
    expect(fragments[0].id).toBe("mekann-cacheable-context:locator");
    expect(fragments[0].content).toContain("agent-side retrieval");
    expect(fragments[0].content).toContain(".mekann/cacheable-context/manifest.json");
    expect(fragments[0].content).not.toContain("A working-memory event store");
    expect(fragments[0].content.length).toBeLessThan(1200);
  });

  it("builds CONTEXT.md as a term index by default and keeps ADR index ahead of it", async () => {
    const cwd = await tempRepo();
    const pi = { on() {}, registerCommand() {} } as any;
    cacheableContextExtension(pi);

    await collectPromptFragments({ cwd });
    const manifest = await readManifest(cwd);

    expect(manifest?.fragments.map((f) => f.id)).toEqual(["001-policy", "010-agents", "020-domain-docs", "040-adr-index", "030-context"]);
    const context = manifest?.fragments.find((f) => f.id === "030-context")?.content;
    expect(context).toContain("CONTEXT.md retrieval index");
    expect(context).toContain("- Context ledger");
    expect(context).toContain("rg -n");
    expect(context).not.toContain("A working-memory event store");
  });

  it("treats deprecated promptSurface \"full\" as locator so AGENTS.md/domain docs are not double-injected", async () => {
    const cwd = await tempRepo();
    await writeWorkspaceSetting(cwd, "cacheable-context", "promptSurface", "full");
    const pi = { on() {}, registerCommand() {} } as any;
    cacheableContextExtension(pi);

    const fragments = await collectPromptFragments({ cwd });

    // Only the small locator is surfaced; the generated fragment bodies
    // (e.g. the 010-agents summary) must NOT be injected, since the base
    // system already embeds AGENTS.md via <project_context>.
    expect(fragments).toHaveLength(1);
    expect(fragments[0].id).toBe("mekann-cacheable-context:locator");
    expect(fragments[0].content).not.toContain("Repository agent rules from AGENTS.md");
    expect(fragments[0].content).not.toContain("A working-memory event store");
    expect(fragments[0].content).toContain(".mekann/cacheable-context/manifest.json");
  });

  it("hashes sources at most once per cwd across repeated getFragments calls (issue #168 / IC-203)", async () => {
    const cwd = await tempRepo();
    const pi = { on() {}, registerCommand() {} } as any;
    cacheableContextExtension(pi);

    // ensureBuilt calls collectSourceHashes (reads every source file + sha256)
    // to decide freshness. Repeating it on every prompt-provider request added
    // jitter to the hot prompt path. The per-cwd guard must run it once for the
    // first getFragments and skip it on subsequent ones.
    const builder = await import("./builder.js");
    const spy = vi.spyOn(builder, "collectSourceHashes");

    await collectPromptFragments({ cwd });
    await collectPromptFragments({ cwd });
    await collectPromptFragments({ cwd });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

const minimalCfg: CacheableContextConfig = {
  contextMode: "off",
  includeAgents: true,
  includeDomainDocs: false,
  includeAdrIndex: true,
  includeCodeStructure: false,
  maxPrefixChars: 32000,
  maxContextTerms: 100,
  maxAdrEntries: 80,
};

async function buildAndRead(cwd: string) {
  await buildCacheableContext(cwd, minimalCfg);
  return await readManifest(cwd);
}

describe("cacheable-context builder i18n extraction (issue #162)", () => {
  it("IC-201: extracts structure from a Japanese AGENTS.md (not the slice fallback)", async () => {
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "mekann-ctx-ja-"));
    // `#`/`##` headings only — no `###`, no list markers, no English phrases.
    // The old `^###\s+` filter matched none of these and fell back to slice.
    await fsp.writeFile(
      path.join(cwd, "AGENTS.md"),
      [
        "# エージェントルール",
        "",
        "これは通常の説明文です。構造抽出の対象外となるべきプローズです。",
        "",
        "## イシュートラッカー",
        "GitHub Issues で管理する。",
        "",
        "## ワークフロー",
        "issue ブランチを使う。",
        "",
      ].join("\n"),
      "utf8",
    );

    const manifest = await buildAndRead(cwd);
    const agents = manifest?.fragments.find((f) => f.id === "010-agents")?.content;
    expect(agents).toBeTruthy();
    // Headings are captured …
    expect(agents).toContain("イシュートラッカー");
    expect(agents).toContain("ワークフロー");
    // … and the non-structural prose is excluded (proves it is not the slice fallback).
    expect(agents).not.toContain("構造抽出の対象外となるべきプローズです");
  });

  it("IC-206: reads MADR `* Status:` and State/Accepted/Decided forms", async () => {
    const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "mekann-ctx-adr-"));
    await fsp.mkdir(path.join(cwd, "docs", "adr"), { recursive: true });
    await fsp.writeFile(
      path.join(cwd, "docs", "adr", "0002-madr.md"),
      "# MADR example\n\n* Status: accepted\n* Decided: 2023-01-01\n",
      "utf8",
    );
    await fsp.writeFile(
      path.join(cwd, "docs", "adr", "0003-state.md"),
      "# State-form ADR\n\nState: superseded\n",
      "utf8",
    );

    const manifest = await buildAndRead(cwd);
    const adr = manifest?.fragments.find((f) => f.id === "040-adr-index")?.content;
    expect(adr).toBeTruthy();
    // MADR bulleted status is read (old `^Status:` missed the `* ` prefix).
    expect(adr).toContain("accepted");
    // The State: alias is read too.
    expect(adr).toContain("superseded");
  });
});

function baseCfg(overrides: Partial<CacheableContextConfig> = {}): CacheableContextConfig {
  return {
    contextMode: "distilled",
    includeAgents: true,
    includeDomainDocs: true,
    includeAdrIndex: true,
    includeCodeStructure: false,
    maxPrefixChars: 32000,
    maxContextTerms: 100,
    maxContextTermBytes: 1000,
    maxAdrEntries: 80,
    ...overrides,
  };
}

describe("cacheable-context glossary and prefix robustness (IC-202/205)", () => {
  it("distilled mode keeps a long Japanese definition and its _Avoid: line intact when under budget", async () => {
    const cwd = await tempRepo();
    // ~612 bytes, under the default 1000-byte per-term budget.
    const longDef = "これはプロジェクトの用語定義です。".repeat(12);
    await fsp.writeFile(
      path.join(cwd, "CONTEXT.md"),
      `# Context\n\n## Language\n\n**日本語用語**:\n${longDef}\n_Avoid_: 英語名, 別の呼び方\n`,
      "utf8",
    );

    await buildCacheableContext(cwd, baseCfg({ contextMode: "distilled" }));
    const manifest = await readManifest(cwd);
    const context = manifest?.fragments.find((f) => f.id === "030-context")?.content ?? "";

    expect(context).toContain("日本語用語");
    expect(context).toContain(longDef);
    expect(context).toContain("Avoid: 英語名, 別の呼び方");
    expect(context).not.toContain("[...]");
  });

  it("distilled mode truncates an over-budget definition byte-safely with [...] while keeping _Avoid:", async () => {
    const cwd = await tempRepo();
    // ~1530 bytes, over the default 1000-byte per-term budget.
    const longDef = "これはプロジェクトの用語定義です。".repeat(30);
    await fsp.writeFile(
      path.join(cwd, "CONTEXT.md"),
      `# Context\n\n## Language\n\n**長い用語**:\n${longDef}\n_Avoid_: 短縮名\n`,
      "utf8",
    );

    await buildCacheableContext(cwd, baseCfg({ contextMode: "distilled" }));
    const manifest = await readManifest(cwd);
    const context = manifest?.fragments.find((f) => f.id === "030-context")?.content ?? "";

    expect(context).toContain("長い用語");
    expect(context).toContain("[...]");
    // The forbidden-synonym line survives even though the definition was truncated.
    expect(context).toContain("Avoid: 短縮名");
    // Byte-safe cut: no stray replacement character from a mid-character split.
    expect(context).not.toContain("\uFFFD");
    const bodyMatch = context.match(/- 長い用語: ([\s\S]+?) \[\.\.\./);
    expect(bodyMatch).toBeTruthy();
    expect(Buffer.byteLength(bodyMatch![1], "utf8")).toBeLessThanOrEqual(1000);
  });

  it("prefix generation truncates the overflowing fragment in place instead of abandoning small remaining budget", async () => {
    const cwd = await tempRepo();
    const big = "Project context detail line that is fairly long. ".repeat(200);
    await fsp.writeFile(path.join(cwd, "CONTEXT.md"), `# Context\n\n${big}\n`, "utf8");

    // Only the policy fragment (~460 chars) precedes the large context fragment.
    // With maxPrefixChars just above the policy size, the context fragment
    // overflows with <200 chars remaining — exactly where the old code broke and
    // abandoned the remaining space.
    await buildCacheableContext(
      cwd,
      baseCfg({
        contextMode: "full",
        includeAgents: false,
        includeDomainDocs: false,
        includeAdrIndex: false,
        maxPrefixChars: 600,
      }),
    );
    const prefix = await fsp.readFile(path.join(cwd, ".mekann", "cacheable-context", "prefix.md"), "utf8");

    // The overflowing fragment is truncated in place with a marker so the
    // remaining budget is used; both fragments contribute content.
    expect(prefix).toContain("[Fragment truncated by maxPrefixChars]");
    expect(prefix).toContain("Mekann repository context policy");
    expect(prefix).toContain("Project context detail line");
    expect(prefix).not.toContain("\uFFFD");
    // Policy (~460) + join + truncated context tail => well above policy alone,
    // proving the remaining budget was filled rather than abandoned.
    expect(prefix.length).toBeGreaterThan(540);
  });
});
