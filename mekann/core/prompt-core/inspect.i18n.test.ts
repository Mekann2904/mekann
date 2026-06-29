/**
 * inspect.i18n.test.ts — volatile 検出の i18n / クロスプラットフォーム対応 (issue #147)。
 *
 * - 英語中心の `volatileWarningTerms` が日本語「現在時刻」「最新の検索結果」
 *   「ツール結果」等を抜かす問題の網羅。
 * - macOS/Linux 専用だったパス検出が Windows(`C:\\Users\\`)/WSL(`/mnt/c/`)/
 *   Linux(`/home/`) を含むことの保証。
 */
import { describe, expect, it } from "vitest";
import {
  containsVolatileSignal,
  inspectBaseSystemPrompt,
  inspectFragments,
} from "./inspect.js";

const stable = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "s",
  kind: "coding_guidelines" as const,
  stability: "stable" as const,
  scope: "global" as const,
  priority: 1,
  version: "v1",
  content,
  ...extra,
});

describe("containsVolatileSignal: Japanese volatile terms (issue #147)", () => {
  it.each([
    ["現在時刻", "現在時刻を参照する"],
    ["現在日時", "現在日時: 2026-06-20"],
    ["最新の検索結果", "最新の検索結果を使う"],
    ["検索結果", "検索結果をまとめる"],
    ["ツール結果", "ツール結果を解析"],
    ["ツールの結果", "ツールの結果を見る"],
    ["診断", "診断結果を確認"],
    ["継続", "継続: turn 2"],
    ["現在のファイル", "現在のファイル: x.ts"],
    ["オープン中のファイル", "オープン中のファイル: a.ts"],
    ["最近のツール", "最近のツール呼び出し"],
  ])("detects Japanese volatile term: %s", (_label, text) => {
    expect(containsVolatileSignal(text)).toBe(true);
  });

  it("still detects English volatile terms (regression guard)", () => {
    expect(containsVolatileSignal("the current time is now")).toBe(true);
    expect(containsVolatileSignal("latest search results")).toBe(true);
    expect(containsVolatileSignal("tool result: xyz")).toBe(true);
  });

  it("does not flag unrelated Japanese prose", () => {
    expect(containsVolatileSignal("これは安定したポリシー文章です。")).toBe(false);
  });
});

describe("inspectFragments: flags Japanese volatile terms in stable fragments", () => {
  it("warns when a stable fragment contains 現在時刻", () => {
    const w = inspectFragments([stable("s1", "現在時刻をプロンプトに入れる")]);
    expect(w).toContainEqual(
      expect.objectContaining({ code: "VOLATILE_VALUE_IN_STABLE_FRAGMENT", fragmentId: "s1", severity: "warning" }),
    );
  });

  it("respects volatileTermsArePolicyReferences for Japanese prose too", () => {
    const w = inspectFragments([
      stable("s1", "現在時刻を聞かれたらコマンドを実行すること。", {
        source: "any-policy",
        metadata: { volatileTermsArePolicyReferences: true },
      }) as ReturnType<typeof stable>,
    ]);
    expect(w).toEqual([]);
  });
});

describe("containsVolatileSignal: cross-platform absolute paths (issue #147)", () => {
  it.each([
    ["macOS /Users", "/Users/me/project"],
    ["Linux /home", "/home/me/project"],
    ["Unix /tmp", "/tmp/abc/file"],
    ["WSL /mnt/c", "/mnt/c/Users/me"],
    ["Windows C:\\Users", "C:\\Users\\me\\project"],
    ["Windows D:\\ path", "D:\\code\\repo"],
  ])("detects absolute path: %s", (_label, text) => {
    expect(containsVolatileSignal(text)).toBe(true);
  });
});

describe("inspectBaseSystemPrompt: cross-platform absolute paths (issue #147)", () => {
  it.each([
    ["Windows C:\\Users", "Base C:\\Users\\me\\x"],
    ["WSL /mnt/c", "Base /mnt/c/Users/me/x"],
    ["Linux /home", "Base /home/me/x"],
  ])("flags BASE_SYSTEM_ABSOLUTE_PATH for %s", (_label, text) => {
    const w = inspectBaseSystemPrompt(text);
    expect(w.map((x) => x.code)).toContain("BASE_SYSTEM_ABSOLUTE_PATH");
  });

  it("still flags macOS /Users absolute path (regression guard)", () => {
    const w = inspectBaseSystemPrompt("Base /Users/me/x");
    expect(w.map((x) => x.code)).toContain("BASE_SYSTEM_ABSOLUTE_PATH");
  });
});
