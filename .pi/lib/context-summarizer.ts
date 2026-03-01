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

  // 先頭と末尾を保持
  const keepLines = Math.floor(config.maxLinesPerSection / 2);
  const firstLines = processedLines.slice(0, keepLines);
  const lastLines = processedLines.slice(-keepLines);

  // 中間を省略
  const result: string[] = [];
  if (header) result.push(header);
  result.push(...firstLines);

  if (lastLines.length > 0 && processedLines.length > keepLines * 2) {
    result.push("...");
    result.push(...lastLines);
  }

  return result.join("\n");
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

  // シグネチャ（先頭）と末尾を保持
  const first = lines.slice(0, 3);
  const last = lines.slice(-2);

  const parts = ["```" + lang, ...first, "// ... truncated ...", ...last, "```"];
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
