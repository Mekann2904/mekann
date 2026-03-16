/**
 * @abdd.meta
 * path: .pi/lib/context-summarizer.ts
 * role: DAGハンドオフ時のコンテキスト要約
 * why: 依存タスクからの大規模出力を要約し、後続タスクのトークン効率を向上させるため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts
 * public_api: SummarizerConfig, summarizeContext, extractKeyInformation
 * invariants: 要約は元の構造を保持、閾値以下はそのまま返す
 * side_effects: なし（純粋関数）
 * failure_modes: 不正な入力タイプ
 * @abdd.explain
 * overview: DAG実行時に依存タスクの出力を要約し、コンテキストサイズを削減する
 * what_it_does:
 *   - 大規模コンテキストの抽出要約
 *   - 構造マーカーの保持
 *   - 環境変数による設定制御
 * why_it_exists:
 *   - 深いDAGでのコンテキスト累積を防ぐ
 *   - 後続タスクのトークン消費を削減する
 * scope:
 *   in: コンテキストデータ、設定オプション
 *   out: 要約されたコンテキスト文字列
 */

// File: .pi/lib/context-summarizer.ts
// Description: Context summarization for DAG handoffs.
// Why: Reduces context size in deep DAGs by summarizing dependency outputs.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts

/**
 * コンテキスト要約の設定
 * @summary 要約設定
 */
export interface SummarizerConfig {
  /** 出力の最大サイズ（文字数） */
  maxOutputSize: number;
  /** 要約をトリガーする閾値（文字数） */
  summaryThreshold: number;
  /** JSON構造マーカーを保持するか */
  preserveStructure: boolean;
  /** セクションごとの最大行数 */
  maxLinesPerSection: number;
  /** コードブロックを短縮するか */
  truncateCodeBlocks: boolean;
}

/**
 * デフォルト設定
 * @summary デフォルト設定
 */
export const DEFAULT_SUMMARIZER_CONFIG: SummarizerConfig = {
  maxOutputSize: 4000, // ~1000 tokens
  summaryThreshold: 2000, // ~500 tokens
  preserveStructure: true,
  maxLinesPerSection: 10,
  truncateCodeBlocks: true,
};

const PRIORITY_LINE_PATTERNS: RegExp[] = [
  /^\s*(summary|claim|confidence|action|status|error|warning|result)\s*:/i,
  /^\s*(known_facts|open_questions|evidence_snippets|key_artifacts)\s*=/i,
  /^\s*(path|file|files|changed files?|stack|traceback)\s*:/i,
  /(^|\s)(todo|fixme|blocked|missing|regression|root cause|failure)(\s|:|$)/i,
  /(^|\s)(\/[\w./-]+|[A-Za-z0-9_.-]+\.(ts|tsx|js|jsx|py|go|rs|java|json|md|yml|yaml))(\s|:|$)/,
];

const ARTIFACT_LINE_PATTERNS: RegExp[] = [
  /^\s*(path|file|files|changed files?)\s*:/i,
  /(^|\s)(\/[\w./-]+|[A-Za-z0-9_.-]+\.(ts|tsx|js|jsx|py|go|rs|java|json|md|yml|yaml))(\s|:|$)/,
  /^\s*(function|class|interface|type|const|let|var|export)\b/,
  /^\s*[@#][A-Za-z0-9_.:/-]+/,
];

const OPEN_QUESTION_PATTERNS: RegExp[] = [
  /\?/,
  /(^|\s)(unknown|unclear|todo|follow up|investigate|verify|confirm|need to)(\s|:|$)/i,
];

const CODE_SIGNATURE_PATTERNS: RegExp[] = [
  /^\s*(export\s+)?(async\s+)?function\b/,
  /^\s*(export\s+)?class\b/,
  /^\s*(export\s+)?(const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(async\s*)?\(/,
  /^\s*(interface|type)\b/,
  /^\s*@/,
];

/**
 * 環境変数から設定を読み込む
 * @summary 環境変数設定
 */
export function createSummarizerConfigFromEnv(): SummarizerConfig {
  return {
    maxOutputSize: parseInt(process.env.PI_DAG_CONTEXT_MAX_SIZE || "4000", 10),
    summaryThreshold: parseInt(process.env.PI_DAG_SUMMARY_THRESHOLD || "2000", 10),
    preserveStructure: process.env.PI_DAG_PRESERVE_STRUCTURE !== "0",
    maxLinesPerSection: parseInt(process.env.PI_DAG_MAX_LINES_PER_SECTION || "10", 10),
    truncateCodeBlocks: process.env.PI_DAG_TRUNCATE_CODE_BLOCKS !== "0",
  };
}

/**
 * 大規模コンテキストを要約
 * @summary コンテキスト要約
 * @param context - 要約対象のコンテキスト
 * @param config - 要約設定
 * @returns 要約されたコンテキスト
 * @example
 * const summary = summarizeContext(largeOutput, { maxOutputSize: 4000 });
 */
export function summarizeContext(
  context: unknown,
  config: SummarizerConfig = DEFAULT_SUMMARIZER_CONFIG,
): string {
  // 入力を文字列化
  const raw = typeof context === "string"
    ? context
    : JSON.stringify(context, null, 2);

  // 閾値以下はそのまま返す
  if (raw.length <= config.summaryThreshold) {
    return raw;
  }

  // 抽出要約を実行
  const summary = extractKeyInformation(raw, config);

  // 構造マーカーを付与
  if (config.preserveStructure) {
    return `<!-- SUMMARIZED_CONTEXT -->\n${summary}\n<!-- END_SUMMARY -->`;
  }

  return summary;
}

/**
 * テキストからキー情報を抽出
 * @summary キー情報抽出
 * @param text - 対象テキスト
 * @param config - 設定
 * @returns 抽出されたテキスト
 */
export function extractKeyInformation(
  text: string,
  config: SummarizerConfig,
): string {
  // セクション分割（## ヘッダー基準）
  const sections = splitIntoSections(text);
  const summarizedSections: string[] = [];

  for (const section of sections) {
    const summarized = summarizeSection(section, config);
    summarizedSections.push(summarized);
  }

  let result = summarizedSections.join("\n\n");

  // 最終サイズチェック
  if (result.length > config.maxOutputSize) {
    result = truncateToSize(result, config.maxOutputSize);
  }

  return result;
}

/**
 * テキストをセクションに分割
 * @summary セクション分割
 * @param text - 対象テキスト
 * @returns セクション配列
 */
function splitIntoSections(text: string): string[] {
  // ## で始まるヘッダーでセクションを分割
  const lines = text.split("\n");
  const sections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") && currentSection.length > 0) {
      sections.push(currentSection.join("\n"));
      currentSection = [];
    }
    currentSection.push(line);
  }

  // 最後のセクションを追加
  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n"));
  }

  return sections.length > 0 ? sections : [text];
}

/**
 * セクションを要約
 * @summary セクション要約
 * @param section - セクションテキスト
 * @param config - 設定
 * @returns 要約されたセクション
 */
function summarizeSection(section: string, config: SummarizerConfig): string {
  const lines = section.split("\n");

  // 短いセクションはそのまま返す
  if (lines.length <= config.maxLinesPerSection) {
    return section;
  }

  // ヘッダー行を特定
  const headerIndex = lines.findIndex((l) => l.startsWith("## "));
  const header = headerIndex >= 0 ? lines[headerIndex] : "";
  const contentLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  // コードブロックを処理
  const processedLines = config.truncateCodeBlocks
    ? processCodeBlocks(contentLines)
    : contentLines;

  return buildContextPack(header, processedLines, config);
}

/**
 * コードブロックを処理
 * @summary コードブロック処理
 * @param lines - 行配列
 * @returns 処理された行配列
 */
function processCodeBlocks(lines: string[]): string[] {
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        // コードブロック開始
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockLines = [];
      } else {
        // コードブロック終了
        inCodeBlock = false;
        const summarized = summarizeCodeBlock(codeBlockLines, codeBlockLang);
        result.push(summarized);
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      result.push(line);
    }
  }

  // 閉じられていないコードブロックの処理
  if (inCodeBlock && codeBlockLines.length > 0) {
    const summarized = summarizeCodeBlock(codeBlockLines, codeBlockLang);
    result.push(summarized);
  }

  return result;
}

/**
 * コードブロックを要約
 * @summary コードブロック要約
 * @param lines - コード行
 * @param lang - 言語
 * @returns 要約されたコードブロック
 */
function summarizeCodeBlock(lines: string[], lang: string): string {
  if (lines.length <= 5) {
    return "```" + lang + "\n" + lines.join("\n") + "\n```";
  }

  const signatures = collectMatchingLines(lines, CODE_SIGNATURE_PATTERNS, 4);
  const first = lines.slice(0, 2);
  const last = lines.slice(-2);
  const body = dedupeLines([
    ...first,
    ...signatures,
    "// ... truncated ...",
    ...last,
  ]);

  const parts = ["```" + lang, ...body, "```"];
  return parts.join("\n");
}

/**
 * サイズに合わせて切り詰め
 * @summary サイズ切り詰め
 * @param text - テキスト
 * @param maxSize - 最大サイズ
 * @returns 切り詰められたテキスト
 */
function truncateToSize(text: string, maxSize: number): string {
  if (text.length <= maxSize) {
    return text;
  }

  // 文の境界で切ることを試みる
  const truncateAt = maxSize - 100; // マージン確保
  const truncated = text.slice(0, truncateAt);

  // 最後の改行位置を探す
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > truncateAt * 0.8) {
    return truncated.slice(0, lastNewline) + "\n\n... [TRUNCATED]";
  }

  return truncated + "\n\n... [TRUNCATED]";
}

function buildContextPack(
  header: string,
  lines: string[],
  config: SummarizerConfig,
): string {
  const evidenceBudget = Math.max(2, config.maxLinesPerSection - 5);
  const knownFacts = collectMatchingLines(lines, PRIORITY_LINE_PATTERNS, 4);
  const keyArtifacts = collectMatchingLines(lines, ARTIFACT_LINE_PATTERNS, 3);
  const openQuestions = collectMatchingLines(lines, OPEN_QUESTION_PATTERNS, 2);
  const evidence = buildEvidenceExcerpt(lines, evidenceBudget);

  const result: string[] = [];
  if (header) {
    result.push(header);
  }
  result.push("CONTEXT_PACK_V2");

  if (knownFacts.length > 0) {
    result.push("known_facts=");
    result.push(...knownFacts.map((line) => `- ${line}`));
  }

  if (keyArtifacts.length > 0) {
    result.push("key_artifacts=");
    result.push(...keyArtifacts.map((line) => `- ${line}`));
  }

  if (openQuestions.length > 0) {
    result.push("open_questions=");
    result.push(...openQuestions.map((line) => `- ${line}`));
  }

  if (evidence.length > 0) {
    result.push("evidence_snippets=");
    result.push(...evidence.map((line) => `- ${line}`));
  }

  return result.join("\n");
}

function buildEvidenceExcerpt(lines: string[], maxLines: number): string[] {
  const keepLines = Math.max(1, Math.floor(maxLines / 2));
  const first = lines.slice(0, keepLines);
  const last = lines.slice(-keepLines);
  const merged = dedupeLines([...first, "...", ...last]);
  return merged
    .filter((line) => line.trim().length > 0)
    .slice(0, Math.max(2, maxLines));
}

function collectMatchingLines(
  lines: string[],
  patterns: RegExp[],
  maxLines: number,
): string[] {
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (!patterns.some((pattern) => pattern.test(trimmed))) {
      continue;
    }
    collected.push(trimmed);
    if (collected.length >= maxLines) {
      break;
    }
  }
  return dedupeLines(collected);
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

/**
 * 複数のコンテキストを結合して要約
 * DAGの依存関係出力を一括処理する場合に使用
 * @summary 複数コンテキスト要約
 * @param contexts - コンテキストのマップ
 * @param config - 設定
 * @returns 結合・要約されたコンテキスト
 */
export function summarizeMultipleContexts(
  contexts: Map<string, unknown>,
  config: SummarizerConfig = DEFAULT_SUMMARIZER_CONFIG,
): string {
  const sections: string[] = [];

  Array.from(contexts.entries()).forEach(([id, context]) => {
    const summary = summarizeContext(context, config);
    sections.push(`## Context from ${id}\n${summary}`);
  });

  const combined = sections.join("\n\n");

  // 全体が大きすぎる場合はさらに要約
  if (combined.length > config.maxOutputSize * 2) {
    return extractKeyInformation(combined, config);
  }

  return combined;
}

/**
 * 要約が必要かどうかを判定
 * @summary 要約必要性判定
 * @param context - コンテキスト
 * @param config - 設定
 * @returns 要約が必要な場合はtrue
 */
export function needsSummarization(
  context: unknown,
  config: SummarizerConfig = DEFAULT_SUMMARIZER_CONFIG,
): boolean {
  const raw = typeof context === "string"
    ? context
    : JSON.stringify(context, null, 2);

  return raw.length > config.summaryThreshold;
}
