/**
 * path: tests/unit/lib/openai-embedding-provider.test.ts
 * role: OpenAI埋め込みプロバイダのAPIキー解決ロジックを検証する
 * why: auth.json由来の危険なキー解決や環境変数フォールバックの回帰を防ぐため
 * related: .pi/lib/embeddings/providers/openai.ts, tests/unit/lib/dynamic-tools-safety.test.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("openai key resolution", () => {
  let tempHome = "";
  let originalHome: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    originalHome = process.env.HOME;
    originalApiKey = process.env.OPENAI_API_KEY;
    tempHome = mkdtempSync(join(tmpdir(), "openai-key-test-"));
    process.env.HOME = tempHome;
    delete process.env.OPENAI_API_KEY;
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return {
        ...actual,
        homedir: () => tempHome,
      };
    });
  });

  afterEach(() => {
    vi.doUnmock("node:os");
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("disables shell command resolution from auth.json", async () => {
    const authDir = join(tempHome, ".pi", "agent");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      join(authDir, "auth.json"),
      JSON.stringify({
        openai: {
          type: "api_key",
          key: "!echo should-not-run",
        },
      }),
      "utf-8",
    );

    const { getOpenAIKey } = await import("../../../.pi/lib/embeddings/providers/openai.js");
    expect(getOpenAIKey()).toBeNull();
  });

  it("falls back to OPENAI_API_KEY when auth key is not usable", async () => {
    const authDir = join(tempHome, ".pi", "agent");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      join(authDir, "auth.json"),
      JSON.stringify({
        openai: {
          type: "api_key",
          key: "!echo should-not-run",
        },
      }),
      "utf-8",
    );
    process.env.OPENAI_API_KEY = "env-key";

    const { getOpenAIKey } = await import("../../../.pi/lib/embeddings/providers/openai.js");
    expect(getOpenAIKey()).toBe("env-key");
  });
});
