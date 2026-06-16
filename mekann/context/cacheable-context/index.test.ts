import { afterEach, describe, expect, it } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import cacheableContextExtension from "./index.js";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";
import { readManifest } from "./builder.js";
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
});
