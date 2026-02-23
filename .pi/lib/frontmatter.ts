/**
 * @abdd.meta
 * path: .pi/lib/frontmatter.ts
 * role: MarkdownのYAML frontmatterを抽出・解析するユーティリティ
 * why: 非公開のParser APIへのランタイム依存を回避し、複数の拡張機能間でFrontmatter処理を共有するため
 * related: .pi/extensions/agent-teams/definition-loader.ts, .pi/extensions/skill-inspector.ts, .pi/lib/skill-registry.ts
 * public_api: parseFrontmatter
 * invariants: 戻り値は常にfrontmatterプロパティとbodyプロパティを持つオブジェクトである
 * side_effects: なし
 * failure_modes: YAML構文エラー発生時、frontmatterは空オブジェクト、bodyは本文として返される
 * @abdd.explain
 * overview: MarkdownテキストからYAML形式のFrontmatterを正規表現で抽出し、YAMLパーサーを用いて解析する関数を提供する
 * what_it_does:
 *   - 文字列先頭の `---` で囲まれた領域をFrontmatterとして抽出する
 *   - 抽出した文字列をYAMLとしてパースし、オブジェクトに変換する
 *   - Frontmatterが存在しない、またはパースに失敗した場合は空のオブジェクトと元の本文を返す
 *   - Frontmatter以降の文字列を本文として抽出する
 * why_it_exists:
 *   - 拡張機能ごとにYAML解析ロジックを実装すると重複や依存の不整合が生じるため
 *   - パースエラーによる処理の中断を防ぎ、呼び出し元で安全に継続させるため
 * scope:
 *   in: Markdown形式の文字列（YAML Frontmatterを含む場合と含まない場合がある）
 *   out: 解析されたFrontmatterオブジェクトと、Frontmatterを除いた本文を含む構造体
 */

/**
 * path: .pi/lib/frontmatter.ts
 * role: Markdown frontmatter parsing utility shared across extensions.
 * why: Avoid runtime dependency on non-exported parser APIs in pi-coding-agent.
 * related: .pi/extensions/agent-teams/definition-loader.ts, .pi/extensions/skill-inspector.ts, .pi/lib/skill-registry.ts
 */

import { parse as parseYaml } from "yaml";

/**
 * Parse YAML frontmatter from markdown text.
 *
 * If frontmatter is missing or invalid, returns an empty frontmatter object
 * and the original content as body so callers can continue safely.
 */
export function parseFrontmatter<TFrontmatter extends Record<string, unknown>>(
  content: string,
): { frontmatter: TFrontmatter; body: string } {
  const source = String(content ?? "");
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as TFrontmatter, body: source };
  }

  const frontmatterText = match[1];
  const body = match[2] ?? "";

  try {
    const parsed = parseYaml(frontmatterText);
    const frontmatter =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as TFrontmatter)
        : ({} as TFrontmatter);
    return { frontmatter, body };
  } catch {
    return { frontmatter: {} as TFrontmatter, body };
  }
}

