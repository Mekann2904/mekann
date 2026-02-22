/**
 * tests/unit/lib/tui-utils.test.ts
 * TUIプレビュー整形とMarkdown判定の単体テストを提供する。
 * ストリーミング出力に制御文字が混在しても描画品質を維持するために存在する。
 * 関連ファイル: .pi/lib/tui/tui-utils.ts, .pi/extensions/subagents/live-monitor.ts, .pi/extensions/agent-teams/live-monitor.ts
 */

import { describe, expect, it } from "vitest";
import { visibleWidth } from "@mariozechner/pi-tui";

import {
  looksLikeMarkdown,
  pushWrappedLine,
  renderPreviewWithMarkdown,
} from "../../../.pi/lib/tui/tui-utils.js";

describe("tui-utils markdown preview", () => {
  it("looksLikeMarkdown_インデント見出しを検出", () => {
    const input = "   ## カテゴリ4: パフォーマンス問題\n本文";
    expect(looksLikeMarkdown(input)).toBe(true);
  });

  it("looksLikeMarkdown_ANSI混在でも検出", () => {
    const input = "\u001b[31m## 見出し\u001b[0m\n**太字**";
    expect(looksLikeMarkdown(input)).toBe(true);
  });

  it("renderPreviewWithMarkdown_ANSI混在Markdownを描画", () => {
    const input = "\u001b[32m## 見出し\u001b[0m\n- A\n- B";
    const result = renderPreviewWithMarkdown(input, 80, 10);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.join("\n")).not.toContain("\u001b[");
  });

  it("renderPreviewWithMarkdown_制御文字を除去してraw表示", () => {
    const input = "plain\u0000text";
    const result = renderPreviewWithMarkdown(input, 80, 10);
    expect(result.renderedAsMarkdown).toBe(false);
    expect(result.lines.join("\n")).toContain("plaintext");
  });

  it("renderPreviewWithMarkdown_日本語テキストを欠損させず保持する", () => {
    const input = "これは日本語の出力です。\n次の行も表示されます。";
    const result = renderPreviewWithMarkdown(input, 80, 10);
    expect(result.renderedAsMarkdown).toBe(false);
    expect(result.lines.join("\n")).toContain("これは日本語の出力です。");
    expect(result.lines.join("\n")).toContain("次の行も表示されます。");
  });

  it("pushWrappedLine_横幅を超える行を折り返す", () => {
    const out: string[] = [];
    pushWrappedLine(out, "abcdefghij", 4);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join("")).toBe("abcdefghij");
  });

  it("pushWrappedLine_改行を含む行を維持して折り返す", () => {
    const out: string[] = [];
    pushWrappedLine(out, "abcde\nfghij", 3);
    expect(out).toContain("abc");
    expect(out).toContain("fgh");
    expect(out.join("")).toContain("abcde");
    expect(out.join("")).toContain("fghij");
  });

  it("pushWrappedLine_OSC8混在でも幅超過しない", () => {
    const out: string[] = [];
    const osc8 = "\u001b]8;;\u0007";
    const input = `${osc8}ID1308|Automation\tboolean (ind${osc8}`;
    pushWrappedLine(out, input, 60);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(60);
    }
  });
});
